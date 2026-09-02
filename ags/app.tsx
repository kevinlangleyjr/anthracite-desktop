import app from "ags/gtk4/app"
import { For, This, createBinding } from "ags"
import style from "./style.scss"
import Bar from "./widget/Bar"
import Applauncher from "./widget/Applauncher"
import QuickSettings from "./widget/QuickSettings"
import { PowerMenu, Verification } from "./widget/PowerMenu"
import OSD from "./widget/OSD"
import Dock from "./widget/Dock"
import NotificationPopups from "./widget/Notifications"

app.start({
  css: style,
  gtkTheme: "Adwaita",
  main() {
    // Singleton windows (toggle with `ags toggle <name>`)
    Applauncher()
    QuickSettings()
    PowerMenu()
    Verification()
    OSD()
    Dock()
    NotificationPopups()

    // One bar per monitor, kept in sync with hotplug
    const monitors = createBinding(app, "monitors")
    return (
      <For each={monitors}>
        {(monitor) => (
          <This this={app}>
            <Bar gdkmonitor={monitor} />
          </This>
        )}
      </For>
    )
  },
})
