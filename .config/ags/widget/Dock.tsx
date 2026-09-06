import app from "ags/gtk4/app"
import { For, createBinding } from "ags"
import { createPoll } from "ags/time"
import GLib from "gi://GLib"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalApps from "gi://AstalApps"
import AstalHyprland from "gi://AstalHyprland"

// Pinned by desktop entry id rather than a display name. Fuzzy-matching "files"
// or "brave" is ambiguous — several entries match, and which one wins depends on
// the app database's ordering.
const PINNED = [
  "com.mitchellh.ghostty",
  "brave-browser",
  "org.gnome.Nautilus",
  "obsidian",
  "vscodium",
  "1password",
]

const ICON_SIZE = 40

// Hyprland has no minimise concept, so a minimised window is parked on this
// special workspace: still mapped and running, just not on any workspace you
// can navigate to. The dock is the only way back, which is exactly how the
// macOS Dock behaves.
const MINIMIZED_WS = "special:minimized"

// macOS magnifies the icon under the pointer and falls the effect off across
// its neighbours — that spreading is the part that reads as "the macOS dock"
// rather than a hover highlight.
const MAX_SCALE = 1.6

// The falloff is taken over the pixel distance between the pointer and an
// icon's centre, not over the difference of their indices: the row has to swell
// and relax while the pointer travels *within* one icon, not step between fixed
// sizes as it crosses item boundaries.
const INFLUENCE = ICON_SIZE * 2.5

// Time constant of the ease, in seconds. Every frame closes the same fraction
// of whatever distance is left, rather than running a fixed-duration transition
// per change — a fast sweep along the row would otherwise queue animations up
// behind the pointer and land them after it has gone.
const EASE = 0.055

// Under this the icon is within half a pixel of its target, so snapping ends the
// frame callback rather than letting it tick on down an exponential tail.
const SETTLED = 0.008

type Item = {
  slot: Gtk.Widget
  icon: Gtk.Image
  scale: number
  target: number
}

// A raised cosine over the influence radius: flat at the peak and flat where it
// meets rest size, so an icon neither snaps as the pointer crosses its centre
// nor visibly stops growing at the edge of the effect.
function scaleAt(distance: number) {
  const t = Math.min(Math.abs(distance) / INFLUENCE, 1)
  return 1 + (MAX_SCALE - 1) * 0.5 * (1 + Math.cos(Math.PI * t))
}

export default function Dock() {
  const hypr = AstalHyprland.get_default()
  const clients = createBinding(hypr, "clients")
  const apps = new AstalApps.Apps()

  // Resolve an entry id to an application, preferring an exact entry match and
  // only then falling back to search. Unresolved entries are dropped rather
  // than rendering a blank tile.
  const all: AstalApps.Application[] = (apps as any).list ?? []
  function resolve(id: string): AstalApps.Application | null {
    const exact = all.find(
      (a) => (a.entry ?? "").replace(/\.desktop$/, "") === id,
    )
    if (exact) return exact
    const [fuzzy] = apps.fuzzy_query(id.split(".").pop() ?? id)
    return fuzzy ?? null
  }

  const pinned = PINNED.map((id) => {
    const application = resolve(id)
    return application ? { id, app: application } : null
  }).filter((e) => e !== null)

  // Match a window class against a pin's entry id. The comparison has to run
  // both ways: "com.mitchellh.ghostty" contains "ghostty", but VSCodium reports
  // a class of "codium" which is *shorter* than the "vscodium" entry id, so a
  // one-directional check never matched it and it never showed a running dot.
  function matches(cls: string | null, id: string) {
    const key = (id.split(".").pop() ?? id).toLowerCase()
    const c = (cls ?? "").toLowerCase()
    if (!c) return false
    // The reverse direction needs a length floor, or a two-character class
    // would match almost any id.
    return c.includes(key) || (c.length > 2 && key.includes(c))
  }

  function isRunning(cs: AstalHyprland.Client[], id: string) {
    return cs.some((c) => matches(c.class, id))
  }

  // Minimised entries are windows, not pins, so their icon has to come from a
  // class rather than a desktop entry. Classes name icons inconsistently:
  // "kitty" is an icon-theme name as-is, "com.mitchellh.ghostty" needs its last
  // segment, and "codium" only resolves through the app database.
  let theme: Gtk.IconTheme | null = null
  function iconForClass(cls: string | null) {
    theme ??= Gtk.IconTheme.get_for_display(Gdk.Display.get_default()!)
    const raw = cls ?? ""
    for (const name of [raw, raw.split(".").pop() ?? raw, raw.split("-")[0]]) {
      for (const candidate of [name, name.toLowerCase()]) {
        if (candidate && theme.has_icon(candidate)) return candidate
      }
      const [match] = apps.fuzzy_query(name)
      if (match?.iconName) return match.iconName
    }
    return "application-x-executable"
  }

  // Windows parked on the minimised workspace.
  //
  // Polled rather than derived from the clients binding: minimising does not
  // add or remove a client, it changes one client's workspace, and the list
  // binding only fires when the list itself changes. The previous array is
  // returned unchanged when the set is the same, so <For> is not torn down and
  // rebuilt four times a second.
  let lastKey = ""
  let lastList: AstalHyprland.Client[] = []
  const minimized = createPoll(lastList, 400, () => {
    const list = hypr
      .get_clients()
      .filter((c) => c.workspace?.name === MINIMIZED_WS)
    const key = list.map((c) => c.address).join(",")
    if (key === lastKey) return lastList
    lastKey = key
    lastList = list
    return list
  })

  // Bring a minimised window back to whichever workspace is in front now,
  // rather than the one it was minimised from — the window follows you, which
  // is what clicking a Dock icon does on macOS.
  function restore(client: AstalHyprland.Client) {
    const ws = hypr.focusedWorkspace?.id
    const addr = client.address.startsWith("0x")
      ? client.address
      : `0x${client.address}`
    if (ws !== undefined) {
      hypr.message(
        `dispatch hl.dsp.window.move({ workspace = ${ws}, window = "address:${addr}" })`,
      )
    }
    hypr.message(`dispatch hl.dsp.focus({ window = "address:${addr}" })`)
  }

  // Clicking a dock icon focuses the app's most recently used window, and only
  // launches when it has none — the macOS behaviour. Recency comes from
  // Hyprland's own focus history, so this widget does not have to track focus
  // changes the way the switcher does. Read through hyprctl's JSON because it
  // is a single consistent snapshot; the same value is on the GObject as
  // focus-history-id if a binding is ever wanted instead.
  function activate(id: string, application: AstalApps.Application) {
    let windows: any[] = []
    try {
      windows = JSON.parse(hypr.message("j/clients"))
        .filter((c: any) => c.mapped && !c.hidden && matches(c.class, id))
        .sort((a: any, b: any) => a.focusHistoryID - b.focusHistoryID)
    } catch (e) {
      console.error(e)
    }

    const top = windows[0]
    if (!top) {
      application.launch()
      return
    }

    const addr = top.address.startsWith("0x") ? top.address : `0x${top.address}`
    // Hyprland 0.56 parses dispatch payloads as Lua, so the bare
    // `focuswindow address:…` form silently does nothing. Focusing a window on
    // another workspace switches to it, which is what the dock should do.
    hypr.message(`dispatch hl.dsp.focus({ window = "address:${addr}" })`)
  }

  const items: Item[] = []
  let root: Gtk.Widget | null = null
  let reserve: Gtk.Widget | null = null
  let centers: number[] | null = null
  let tick = 0
  let last = 0
  let relax = 0

  // The widest the row can get, which is not the sum of six magnified icons: the
  // falloff only ever lifts the two or three under the pointer.
  function widest(rest: number[]) {
    const from = rest[0] - INFLUENCE
    const to = rest[rest.length - 1] + INFLUENCE
    let most = 0
    for (let x = from; x <= to; x += 2) {
      let sum = 0
      for (const center of rest) sum += scaleAt(x - center) - 1
      most = Math.max(most, sum)
    }
    // One pixel per icon covers the rounding to whole pixel sizes.
    return Math.ceil(most * ICON_SIZE) + rest.length
  }

  // Taken once, on the first pointer event, while every icon is still at rest —
  // re-measuring later would read the spread layout and make the geometry an
  // input to itself.
  function measure() {
    if (centers || !root || !reserve) return
    const width = root.get_width()
    if (width <= 0) return

    const rest = items.map((item) => {
      const [ok, rect] = item.slot.compute_bounds(root!)
      return ok ? rect.origin.x + rect.size.width / 2 : NaN
    })
    if (rest.some(Number.isNaN)) return

    // Hold the window at the widest the row will ever be. A layer surface that
    // resizes under the pointer gets its motion coordinates remapped a frame
    // late by Hyprland — tens of pixels out — and takes a leave/enter pair on
    // every width change, which reads as the row stuttering back toward rest.
    const grow = 2 * Math.ceil(widest(rest) / 2)
    reserve.widthRequest = width + grow
    centers = rest.map((center) => center + grow / 2)
  }

  function animate() {
    if (tick || !root) return
    last = 0
    tick = root.add_tick_callback((_, clock) => {
      const now = clock.get_frame_time()
      const dt = last ? Math.min((now - last) / 1e6, 0.1) : 1 / 60
      last = now

      const step = 1 - Math.exp(-dt / EASE)
      let moving = false

      for (const item of items) {
        const remaining = item.target - item.scale
        if (Math.abs(remaining) < SETTLED) {
          item.scale = item.target
        } else {
          item.scale += remaining * step
          moving = true
        }

        // pixelSize rather than a css transform: the icon is re-rendered at
        // every size instead of a 40px raster being stretched, which is the
        // difference between crisp and soft at 1.6x.
        const size = Math.round(ICON_SIZE * item.scale)
        if (item.icon.pixelSize !== size) item.icon.pixelSize = size
        if (item.slot.widthRequest !== size) item.slot.widthRequest = size
      }

      if (moving) return GLib.SOURCE_CONTINUE
      tick = 0
      return GLib.SOURCE_REMOVE
    })
  }

  // The row's geometry is measured once while everything is at rest. Anything
  // that changes the row's width — a window being minimised or restored —
  // invalidates that, and re-measuring the already-spread layout would feed the
  // geometry back into itself. So reset to rest first, then let the next
  // pointer event measure again.
  function invalidate() {
    centers = null
    if (reserve) reserve.widthRequest = -1
    for (const item of items) {
      item.scale = 1
      item.target = 1
      if (item.icon) item.icon.pixelSize = ICON_SIZE
      if (item.slot) item.slot.widthRequest = ICON_SIZE
    }
  }

  function track(x: number | null) {
    if (relax) {
      GLib.source_remove(relax)
      relax = 0
    }
    measure()
    for (const [i, item] of items.entries()) {
      item.target = x === null || !centers ? 1 : scaleAt(x - centers[i])
    }
    animate()
  }

  return (
    <window
      visible
      name="dock"
      namespace="dock"
      anchor={Astal.WindowAnchor.BOTTOM}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
      $={(self: Astal.Window) => {
        root = self
        // GTK4 has no :hover-with-neighbours selector, so the pointer has to be
        // tracked explicitly for the falloff to be computable. The controller
        // sits on the window rather than on the items because the window also
        // covers the space the magnified icons rise into; an icon that lifted
        // out from under the pointer would otherwise drop, re-enter, and lift.
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", (_, x) => track(x))
        motion.connect("motion", (_, x) => track(x))
        motion.connect("leave", () => {
          // A popup mapping under the pointer — the tooltip — arrives as a
          // leave and an enter in the same frame. Relaxing the moment the leave
          // lands would drop the whole row a quarter of the way to rest and
          // pull it straight back, which reads as a twitch.
          if (relax) return
          relax = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            relax = 0
            track(null)
            return GLib.SOURCE_REMOVE
          })
        })
        self.add_controller(motion)
      }}
    >
      <box $={(self: Gtk.Box) => (reserve = self)}>
        <box class="dock" spacing={4} halign={Gtk.Align.CENTER}>
          {pinned.map(({ id, app: application }) => {
            const item: Item = { slot: null!, icon: null!, scale: 1, target: 1 }
            items.push(item)

            return (
              <button
                class="dock-item"
                tooltipText={application.name}
                onClicked={() => activate(id, application)}
              >
                <box orientation={Gtk.Orientation.VERTICAL}>
                  {/* The icon overlays a slot rather than being laid out
                      directly: an overlay child is allocated its natural size
                      outside the overlay's bounds, so the slot holds the row's
                      height while the icon grows up out of the slab. */}
                  <overlay class="icon-slot">
                    <box
                      $={(self: Gtk.Box) => (item.slot = self)}
                      widthRequest={ICON_SIZE}
                      heightRequest={ICON_SIZE}
                    />
                    <image
                      $type="overlay"
                      $={(self: Gtk.Image) => (item.icon = self)}
                      valign={Gtk.Align.END}
                      halign={Gtk.Align.CENTER}
                      iconName={application.iconName}
                      pixelSize={ICON_SIZE}
                    />
                  </overlay>
                  <box
                    halign={Gtk.Align.CENTER}
                    class={clients((cs) =>
                      isRunning(cs, id) ? "indicator running" : "indicator",
                    )}
                  />
                </box>
              </button>
            )
          })}

          {/* macOS keeps minimised windows at the far end of the Dock behind a
              separator. These deliberately do not magnify: the pinned row's
              falloff is computed from centres measured once, and a section that
              changes length would have to re-measure mid-gesture. */}
          <box
            class="dock-separator"
            visible={minimized((ms) => ms.length > 0)}
          />
          <box spacing={4} $={() => invalidate()}>
            <For each={minimized}>
              {(client) => (
                <button
                  class="dock-item minimized"
                  tooltipText={createBinding(client, "title")((t) => t ?? "")}
                  onClicked={() => restore(client)}
                >
                  <box orientation={Gtk.Orientation.VERTICAL}>
                    <overlay class="icon-slot">
                      <box
                        widthRequest={ICON_SIZE}
                        heightRequest={ICON_SIZE}
                      />
                      <image
                        $type="overlay"
                        valign={Gtk.Align.END}
                        halign={Gtk.Align.CENTER}
                        iconName={iconForClass(client.class)}
                        pixelSize={ICON_SIZE}
                      />
                    </overlay>
                    <box halign={Gtk.Align.CENTER} class="indicator minimized" />
                  </box>
                </button>
              )}
            </For>
          </box>
        </box>
      </box>
    </window>
  )
}
