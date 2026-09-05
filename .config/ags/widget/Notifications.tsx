import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import Pango from "gi://Pango"
import AstalNotifd from "gi://AstalNotifd"
import { For, createState, onCleanup } from "ags"

function isIcon(icon?: string | null) {
  const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default()!)
  return !!icon && iconTheme.has_icon(icon)
}

function fileExists(path: string) {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

function formatTime(time: number, format = "%H:%M") {
  return GLib.DateTime.new_from_unix_local(time).format(format)!
}

function urgency(n: AstalNotifd.Notification) {
  const { LOW, CRITICAL } = AstalNotifd.Urgency
  switch (n.urgency) {
    case LOW:
      return "low"
    case CRITICAL:
      return "critical"
    default:
      return "normal"
  }
}

function Notification({ notification: n }: { notification: AstalNotifd.Notification }) {
  // Freedesktop convention: an action keyed "default" is the one clicking the
  // body of a notification invokes, so it takes the whole popup rather than
  // getting a button of its own.
  const defaultAction = n.actions.find(({ id }) => id === "default")
  const buttonActions = n.actions.filter(({ id }) => id !== "default")

  let root: Gtk.Box
  let closeButton: Gtk.Button
  let actionsBox: Gtk.Box | undefined

  // Clicks landing on the close button or an action button belong to those
  // widgets, so bail out rather than also firing the default action.
  function onPressed(_g: Gtk.GestureClick, _n: number, x: number, y: number) {
    if (!defaultAction) return
    const point = new Graphene.Point({ x, y })
    for (const widget of [closeButton, actionsBox]) {
      if (!widget) continue
      const [ok, rect] = widget.compute_bounds(root)
      if (ok && rect.contains_point(point)) return
    }
    n.invoke(defaultAction.id)
  }

  return (
    <box
      $={(ref) => (root = ref)}
      class={`notification ${urgency(n)}${defaultAction ? " clickable" : ""}`}
    >
      {defaultAction && <Gtk.GestureClick onPressed={onPressed} />}
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={6}
        widthRequest={380}
      >
        <box spacing={6}>
          {(n.image && fileExists(n.image) && (
            <image valign={Gtk.Align.START} class="icon" file={n.image} pixelSize={48} />
          )) ||
            (n.image && isIcon(n.image) && (
              <image valign={Gtk.Align.START} class="icon" iconName={n.image} pixelSize={48} />
            )) ||
            (isIcon(n.appIcon || n.desktopEntry) && (
              <image
                valign={Gtk.Align.START}
                class="icon"
                iconName={n.appIcon || n.desktopEntry}
                pixelSize={48}
              />
            ))}
          <box orientation={Gtk.Orientation.VERTICAL} hexpand>
            <box spacing={6}>
              <label
                class="title"
                halign={Gtk.Align.START}
                xalign={0}
                hexpand
                ellipsize={Pango.EllipsizeMode.END}
                label={n.summary || n.appName || "Notification"}
              />
              <label class="time" label={formatTime(n.time)} />
              <button
                $={(ref) => (closeButton = ref)}
                class="close-button"
                onClicked={() => n.dismiss()}
              >
                <image iconName="window-close-symbolic" />
              </button>
            </box>
            {n.body && (
              <label
                class="description"
                wrap
                useMarkup
                halign={Gtk.Align.START}
                xalign={0}
                maxWidthChars={40}
                label={n.body}
              />
            )}
          </box>
        </box>
        {buttonActions.length > 0 && (
          <box $={(ref) => (actionsBox = ref)} class="actions" spacing={6}>
            {buttonActions.map(({ label, id }) => (
              <button hexpand onClicked={() => n.invoke(id)}>
                <label label={label} halign={Gtk.Align.CENTER} hexpand />
              </button>
            ))}
          </box>
        )}
      </box>
    </box>
  )
}

export default function NotificationPopups() {
  const notifd = AstalNotifd.get_default()

  const [notifications, setNotifications] = createState(
    new Array<AstalNotifd.Notification>(),
  )

  const notifiedHandler = notifd.connect("notified", (_, id, replaced) => {
    const notification = notifd.get_notification(id)

    if (replaced && notifications.get().some((n) => n.id === id)) {
      setNotifications((ns) => ns.map((n) => (n.id === id ? notification : n)))
    } else {
      setNotifications((ns) => [notification, ...ns])
    }
  })

  const resolvedHandler = notifd.connect("resolved", (_, id) => {
    setNotifications((ns) => ns.filter((n) => n.id !== id))
  })

  onCleanup(() => {
    notifd.disconnect(notifiedHandler)
    notifd.disconnect(resolvedHandler)
  })

  return (
    <window
      name="notifications"
      namespace="notifications"
      visible={notifications((ns) => ns.length > 0)}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL}>
        <For each={notifications}>
          {(notification) => <Notification notification={notification} />}
        </For>
      </box>
    </window>
  )
}
