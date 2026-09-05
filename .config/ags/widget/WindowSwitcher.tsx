import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import { With, createState } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalApps from "gi://AstalApps"
import AstalHyprland from "gi://AstalHyprland"

// Safety net only: hyprland.lua watches the key stream and commits the moment
// Alt comes back up, so this just stops the overlay sticking around if that
// release is ever missed. Keep it comfortably longer than a pause spent
// reading the list — the clock restarts on every Tab press.
const STUCK_COMMIT_MS = 3000

type Entry = { address: string; cls: string; name: string; title: string; icon: string }
type View = { entries: Entry[]; index: number }

// Assigned when the widget is constructed so app.tsx's requestHandler can
// drive the switcher without reaching into its internals.
let handle: (action: string) => boolean = () => false

export function switcherRequest(action: string) {
  return handle(action)
}

export default function WindowSwitcher() {
  const hypr = AstalHyprland.get_default()
  const apps = new AstalApps.Apps()

  const [view, setView] = createState<View>({ entries: [], index: 0 })
  const [visible, setVisible] = createState(false)

  // Most-recently-used order, most recent first. This is the whole reason
  // Cmd+Tab toggles: with recency ordering the current window is index 0 and
  // the one you came from is index 1, so a press-and-release lands on it, and
  // repeating the gesture lands back where you started. Creation order cannot
  // do that -- it walks the same direction every time.
  const mru: string[] = []

  // hyprctl reports addresses bare ("5a1b2c3d") while AstalHyprland includes
  // the 0x prefix, so both have to be normalised or the two never match.
  const key = (address?: string | null) =>
    (address ?? "").replace(/^0x/, "").toLowerCase()

  function touch(address?: string | null) {
    const k = key(address)
    if (!k) return
    const at = mru.indexOf(k)
    if (at !== -1) mru.splice(at, 1)
    mru.unshift(k)
  }

  touch(hypr.get_focused_client()?.address)
  hypr.connect("notify::focused-client", () => {
    // Nothing is focused while the overlay is walking -- commit() is what moves
    // focus -- but guard anyway so a stray focus event cannot reorder the list
    // underneath an open walk.
    if (open) return
    touch(hypr.get_focused_client()?.address)
  })

  // The frozen list the overlay is walking. Snapshotting on open is what makes
  // the cycle stable: focus never moves until commit, so nothing reorders
  // underneath us mid-walk.
  let entries: Entry[] = []
  let index = 0
  let open = false
  let stuckToken = 0

  // Window classes name icons inconsistently: "com.mitchellh.ghostty" and
  // "kitty" are icon-theme names as-is, while "brave-browser" and "codium"
  // only resolve through the app database. Try the theme first, then fall
  // back to a fuzzy desktop-entry match on the trimmed class.
  let theme: Gtk.IconTheme | null = null
  // The class is a machine name ("com.mitchellh.ghostty", "Brave-browser");
  // macOS shows the application's display name. Classes split on both dots and
  // dashes, so try each form against the app database before giving up and
  // prettifying the class itself — otherwise Brave reads as "Brave-browser".
  function nameFor(cls: string) {
    const base = cls.split(".").pop() || cls
    const head = base.split("-")[0]
    for (const candidate of [cls, base, head]) {
      if (!candidate) continue
      const [match] = apps.fuzzy_query(candidate)
      if (match?.name) return match.name
    }
    return head.replace(/^./, (c) => c.toUpperCase())
  }

  function iconFor(cls: string) {
    theme ??= Gtk.IconTheme.get_for_display(Gdk.Display.get_default()!)

    const base = cls.split(".").pop() || cls // com.mitchellh.ghostty -> ghostty
    const head = cls.split("-")[0] // brave-browser -> brave
    const names = [cls, base, head]

    for (const n of names) {
      for (const c of [n, n.toLowerCase()]) {
        if (c && theme.has_icon(c)) return c
      }
    }
    for (const n of names) {
      const [match] = apps.fuzzy_query(n)
      if (match?.iconName) return match.iconName
    }
    return "application-x-executable"
  }

  // Read through hyprctl's JSON rather than AstalHyprland's client objects:
  // we need stableId (not exposed on the GObject) to order the cycle the same
  // way hyprland.lua does.
  function snapshot() {
    const clients = JSON.parse(hypr.message("j/clients"))
    const active = JSON.parse(hypr.message("j/activewindow"))
    const workspace = active?.workspace?.id

    // hyprctl reports stableId as a hex *string* ("1800000c"), so subtracting
    // them directly yields NaN and leaves the order arbitrary. Lua's
    // window.stable_id is a plain integer, hence hyprland.lua can sort as-is.
    const stableId = (c: any) =>
      typeof c.stableId === "number" ? c.stableId : parseInt(c.stableId, 16)

    const visible = clients.filter(
      (c: any) => c.mapped && !c.hidden && c.workspace?.id === workspace,
    )

    // Drop addresses for windows that have since closed, so the list cannot
    // grow without bound over a session.
    const live = new Set(clients.map((c: any) => key(c.address)))
    for (let i = mru.length - 1; i >= 0; i--) {
      if (!live.has(mru[i])) mru.splice(i, 1)
    }

    const list = visible.sort((a: any, b: any) => {
      const ia = mru.indexOf(key(a.address))
      const ib = mru.indexOf(key(b.address))
      // A window that has never held focus has no recency, so it sorts after
      // everything that does, keeping creation order among themselves.
      if (ia === -1 && ib === -1) return stableId(a) - stableId(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

    entries = list.map((c: any) => ({
      address: c.address,
      cls: c.initialClass || c.class || "window",
      name: nameFor(c.initialClass || c.class || "window"),
      title: c.title || c.class || "",
      icon: iconFor(c.initialClass || c.class || ""),
    }))

    const at = list.findIndex((c: any) => c.address === active?.address)
    index = at < 0 ? 0 : at
  }

  function armStuckTimer() {
    const token = ++stuckToken
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, STUCK_COMMIT_MS, () => {
      if (token === stuckToken && open) commit()
      return GLib.SOURCE_REMOVE
    })
  }

  function step(delta: number) {
    if (!open) {
      snapshot()
      if (entries.length < 2) return
      open = true
    }
    index = (index + delta + entries.length) % entries.length
    setView({ entries, index })
    setVisible(true)
    armStuckTimer()
  }

  function commit() {
    if (!open) return
    open = false
    stuckToken++
    setVisible(false)

    const target = entries[index]
    if (!target) return
    const addr = target.address.startsWith("0x")
      ? target.address
      : `0x${target.address}`
    // Hyprland 0.56 parses dispatch payloads as Lua; the old
    // `dispatch focuswindow address:…` form (what client.focus() sends)
    // silently does nothing.
    hypr.message(`dispatch hl.dsp.focus({ window = "address:${addr}" })`)
  }

  handle = (action: string) => {
    if (action === "next") return step(1), true
    if (action === "prev") return step(-1), true
    if (action === "commit") return commit(), true
    return false
  }

  return (
    <window
      visible={visible}
      name="switcher"
      namespace="switcher"
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.OVERLAY}
      application={app}
    >
      <box
        class="switcher"
        orientation={Gtk.Orientation.VERTICAL}
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.CENTER}
      >
        <With value={view}>
          {(v) => (
            <box orientation={Gtk.Orientation.VERTICAL}>
              <box class="switcher-row" spacing={6} halign={Gtk.Align.CENTER}>
                {v.entries.map((entry, i) => (
                  <box
                    class={
                      i === v.index ? "switcher-tile selected" : "switcher-tile"
                    }
                  >
                    <image iconName={entry.icon} pixelSize={64} />
                  </box>
                ))}
              </box>
              {/* macOS names only the highlighted app, centred beneath the row.
                  The window title is kept as a second line because this list is
                  per-window, so two windows of one app are otherwise identical
                  tiles with no way to tell them apart. */}
              <label
                class="switcher-name"
                halign={Gtk.Align.CENTER}
                label={v.entries[v.index]?.name ?? ""}
              />
              <label
                class="switcher-title"
                halign={Gtk.Align.CENTER}
                maxWidthChars={54}
                ellipsize={Pango.EllipsizeMode.END}
                visible={
                  (v.entries[v.index]?.title ?? "") !==
                  (v.entries[v.index]?.name ?? "")
                }
                label={v.entries[v.index]?.title ?? ""}
              />
            </box>
          )}
        </With>
      </box>
    </window>
  )
}
