import app from "ags/gtk4/app"
import { With, createState } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import Graphene from "gi://Graphene"

type Action = {
  label: string
  cmd: string
  // macOS suffixes a menu item with an ellipsis when choosing it opens a
  // confirmation rather than acting immediately, so this drives both the
  // dialog and the label.
  confirm: boolean
  question?: string
}

// Ordered as the  menu orders them: the power group, a separator, then the
// session group.
const ACTIONS: Action[] = [
  { label: "Sleep", cmd: "systemctl suspend", confirm: false },
  {
    label: "Restart",
    cmd: "systemctl reboot",
    confirm: true,
    question: "Are you sure you want to restart your computer now?",
  },
  {
    label: "Shut Down",
    cmd: "systemctl poweroff",
    confirm: true,
    question: "Are you sure you want to shut down your computer now?",
  },
  { label: "SEPARATOR", cmd: "", confirm: false },
  { label: "Lock Screen", cmd: "loginctl lock-session", confirm: false },
  {
    label: "Log Out",
    // `hyprctl dispatch exit` is what this used to run, and it silently did
    // nothing: this Hyprland parses dispatch payloads as Lua, so a bare `exit`
    // resolves to nil rather than the dispatcher.
    cmd: "hyprctl dispatch hl.dsp.exit()",
    confirm: true,
    question: "Are you sure you want to quit all applications and log out now?",
  },
]

const [pending, setPending] = createState<Action | null>(null)

export function PowerMenu() {
  let win: Astal.Window
  let contentbox: Gtk.Box

  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  function run(action: Action) {
    void execAsync(action.cmd).catch(console.error)
  }

  function choose(action: Action) {
    win.visible = false
    if (!action.confirm) {
      run(action)
      return
    }
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
      {/* Drops from under the  glyph at the left end of the menu bar, rather
          than floating in the middle of the screen. */}
      <box
        $={(ref) => (contentbox = ref)}
        class="apple-menu-popup"
        valign={Gtk.Align.START}
        halign={Gtk.Align.START}
        orientation={Gtk.Orientation.VERTICAL}
      >
        {ACTIONS.map((action) =>
          action.label === "SEPARATOR" ? (
            <box class="menu-separator" />
          ) : (
            <button class="menu-item" onClicked={() => choose(action)}>
              <label
                xalign={0}
                label={action.confirm ? `${action.label}…` : action.label}
              />
            </button>
          ),
        )}
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
        class="confirm-dialog"
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.CENTER}
        orientation={Gtk.Orientation.VERTICAL}
        spacing={16}
      >
        <label
          class="question"
          wrap
          maxWidthChars={38}
          xalign={0}
          label={pending((a) => a?.question ?? "")}
        />
        {/* macOS right-aligns dialog buttons with the default action last. */}
        <box class="dialog-buttons" spacing={10} halign={Gtk.Align.END}>
          <button onClicked={() => (win.visible = false)}>
            <label label="Cancel" />
          </button>
          <button class="default" onClicked={confirm}>
            <label label={pending((a) => a?.label ?? "")} />
          </button>
        </box>
      </box>
    </window>
  )
}
