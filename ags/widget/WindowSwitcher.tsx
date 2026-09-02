import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import { With, createState } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalApps from "gi://AstalApps"
import AstalHyprland from "gi://AstalHyprland"

// If Hyprland never reports the Alt release — the release bind is missing, or
// a fullscreen client grabbed the key — the overlay would sit on screen for
// good. Commit on our own after this long without a Tab press.
const STUCK_COMMIT_MS = 4000

type Entry = { address: string; cls: string; title: string; icon: string }
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

    const list = clients
      .filter((c: any) => c.mapped && !c.hidden && c.workspace?.id === workspace)
      .sort((a: any, b: any) => stableId(a) - stableId(b))

    entries = list.map((c: any) => ({
      address: c.address,
      cls: c.initialClass || c.class || "window",
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
            <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
              {v.entries.map((entry, i) => (
                <box
                  class={
                    i === v.index ? "switcher-entry selected" : "switcher-entry"
                  }
                  spacing={12}
                >
                  <image iconName={entry.icon} pixelSize={40} />
                  <box
                    orientation={Gtk.Orientation.VERTICAL}
                    valign={Gtk.Align.CENTER}
                    hexpand
                  >
                    <label class="switcher-class" xalign={0} label={entry.cls} />
                    <label
                      class="switcher-title"
                      xalign={0}
                      maxWidthChars={44}
                      ellipsize={Pango.EllipsizeMode.END}
                      label={entry.title}
                    />
                  </box>
                </box>
              ))}
            </box>
          )}
        </With>
      </box>
    </window>
  )
}
