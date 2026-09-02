import app from "ags/gtk4/app"
import { createBinding } from "ags"
import { Astal, Gtk } from "ags/gtk4"
import AstalApps from "gi://AstalApps"
import AstalHyprland from "gi://AstalHyprland"

// Apps pinned to the dock, matched with fuzzy search against the app
// database. Edit to taste — entries that don't resolve are skipped.
const PINNED = ["kitty", "brave", "files", "obsidian"]

export default function Dock() {
  const hypr = AstalHyprland.get_default()
  const clients = createBinding(hypr, "clients")
  const apps = new AstalApps.Apps()

  const pinned = PINNED.map((name) => {
    const [match] = apps.fuzzy_query(name)
    return match ? { name, app: match } : null
  }).filter((e) => e !== null)

  function isRunning(cs: AstalHyprland.Client[], name: string) {
    return cs.some((c) => c.class?.toLowerCase().includes(name.toLowerCase()))
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
      <box class="dock" spacing={2}>
        {pinned.map(({ name, app: application }) => (
          <button
            tooltipText={application.name}
            onClicked={() => application.launch()}
          >
            <box orientation={Gtk.Orientation.VERTICAL}>
              <image iconName={application.iconName} pixelSize={40} />
              <box
                halign={Gtk.Align.CENTER}
                class={clients((cs) =>
                  isRunning(cs, name) ? "indicator running" : "indicator",
                )}
              />
            </box>
          </button>
        ))}
      </box>
    </window>
  )
}
