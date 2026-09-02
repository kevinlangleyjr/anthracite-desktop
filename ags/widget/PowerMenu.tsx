import app from "ags/gtk4/app"
import { With, createState } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import Graphene from "gi://Graphene"

type Action = {
  icon: string
  label: string
  cmd: string
}

const ACTIONS: Action[] = [
  { icon: "weather-clear-night-symbolic", label: "Sleep", cmd: "systemctl suspend" },
  { icon: "system-reboot-symbolic", label: "Reboot", cmd: "systemctl reboot" },
  { icon: "system-log-out-symbolic", label: "Log Out", cmd: "hyprctl dispatch exit" },
  { icon: "system-shutdown-symbolic", label: "Shutdown", cmd: "systemctl poweroff" },
]

const [pending, setPending] = createState<Action | null>(null)

export function PowerMenu() {
  let win: Astal.Window
  let contentbox: Gtk.Box

  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  function choose(action: Action) {
    win.visible = false
    setPending(action)
    const verification = app.get_window("verification")
    if (verification) verification.visible = true
  }

  function onKey(
    _e: Gtk.EventControllerKey,
    keyval: number,
    _: number,
    __: number,
  ) {
    if (keyval === Gdk.KEY_Escape) win.visible = false
  }

  function onClick(_e: Gtk.GestureClick, _: number, x: number, y: number) {
    const [, rect] = contentbox.compute_bounds(win)
    if (!rect.contains_point(new Graphene.Point({ x, y }))) {
      win.visible = false
      return true
    }
  }

  return (
    <window
      $={(ref) => (win = ref)}
      visible={false}
      name="powermenu"
      namespace="powermenu"
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      application={app}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <Gtk.GestureClick onPressed={onClick} />
      <box
        $={(ref) => (contentbox = ref)}
        class="window-content"
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.CENTER}
        spacing={22}
      >
        {ACTIONS.map((action) => (
          <button onClicked={() => choose(action)}>
            <box orientation={Gtk.Orientation.VERTICAL} spacing={6}>
              <image iconName={action.icon} pixelSize={42} />
              <label label={action.label} />
            </box>
          </button>
        ))}
      </box>
    </window>
  )
}

export function Verification() {
  let win: Astal.Window
  let contentbox: Gtk.Box

  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  function confirm() {
    const action = pending.get()
    win.visible = false
    if (action) void execAsync(action.cmd).catch(console.error)
  }

  function onKey(
    _e: Gtk.EventControllerKey,
    keyval: number,
    _: number,
    __: number,
  ) {
    if (keyval === Gdk.KEY_Escape) win.visible = false
    if (keyval === Gdk.KEY_Return) confirm()
  }

  function onClick(_e: Gtk.GestureClick, _: number, x: number, y: number) {
    const [, rect] = contentbox.compute_bounds(win)
    if (!rect.contains_point(new Graphene.Point({ x, y }))) {
      win.visible = false
      return true
    }
  }

  return (
    <window
      $={(ref) => (win = ref)}
      visible={false}
      name="verification"
      namespace="verification"
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      application={app}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <Gtk.GestureClick onPressed={onClick} />
      <box
        $={(ref) => (contentbox = ref)}
        class="window-content"
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.CENTER}
        orientation={Gtk.Orientation.VERTICAL}
        spacing={11}
      >
        <box class="text-box" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
          <label
            class="title"
            label={pending((a) => (a ? `${a.label}?` : ""))}
          />
          <label class="desc" label="Are you sure?" />
        </box>
        <box class="buttons" spacing={11} homogeneous>
          <button onClicked={() => (win.visible = false)}>
            <label label="No" />
          </button>
          <button class="confirm" onClicked={confirm}>
            <label label="Yes" />
          </button>
        </box>
      </box>
    </window>
  )
}
