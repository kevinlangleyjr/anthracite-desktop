import app from "ags/gtk4/app"
import { createBinding, createState } from "ags"
import { Astal, Gtk } from "ags/gtk4"
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

// macOS magnifies the icon under the pointer and falls the effect off across
// its neighbours — that spreading is the part that reads as "the macOS dock"
// rather than a hover highlight. Index 0 is the hovered icon.
const MAGNIFY = [1.6, 1.3, 1.1]

export default function Dock() {
  const hypr = AstalHyprland.get_default()
  const clients = createBinding(hypr, "clients")
  const apps = new AstalApps.Apps()
  const [hovered, setHovered] = createState(-1)

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

  // Hyprland reports a window class; match it loosely against the entry id so
  // "brave-browser" still matches a "Brave-browser" client.
  function isRunning(cs: AstalHyprland.Client[], id: string) {
    const key = (id.split(".").pop() ?? id).toLowerCase()
    return cs.some((c) => (c.class ?? "").toLowerCase().includes(key))
  }

  return (
    <window
      visible
      name="dock"
      namespace="dock"
      anchor={Astal.WindowAnchor.BOTTOM}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
    >
      <box class="dock" spacing={4}>
        {pinned.map(({ id, app: application }, index) => (
          <button
            class="dock-item"
            tooltipText={application.name}
            onClicked={() => application.launch()}
            $={(self: Gtk.Widget) => {
              // GTK4 has no :hover-with-neighbours selector, so the pointer has
              // to be tracked explicitly for the falloff to be computable.
              const motion = new Gtk.EventControllerMotion()
              motion.connect("enter", () => setHovered(index))
              motion.connect("leave", () => setHovered(-1))
              self.add_controller(motion)
            }}
          >
            <box orientation={Gtk.Orientation.VERTICAL}>
              <image
                iconName={application.iconName}
                pixelSize={hovered((h) => {
                  if (h < 0) return ICON_SIZE
                  const scale = MAGNIFY[Math.abs(h - index)] ?? 1
                  return Math.round(ICON_SIZE * scale)
                })}
              />
              <box
                halign={Gtk.Align.CENTER}
                class={clients((cs) =>
                  isRunning(cs, id) ? "indicator running" : "indicator",
                )}
              />
            </box>
          </button>
        ))}
      </box>
    </window>
  )
}
