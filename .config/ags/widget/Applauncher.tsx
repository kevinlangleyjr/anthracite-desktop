import app from "ags/gtk4/app"
import { For, createComputed, createState } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalApps from "gi://AstalApps"
import Graphene from "gi://Graphene"
import Pango from "gi://Pango"

const MAX_ITEMS = 8

// Spotlight is not vertically centred — it sits high, at roughly a fifth of the
// screen, so the results grow downward into empty space instead of pushing the
// field around.
const TOP_OFFSET = 0.18

export default function Applauncher() {
  let contentbox: Gtk.Box
  let searchentry: Gtk.Entry
  let win: Astal.Window

  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor
  const apps = new AstalApps.Apps()
  const [list, setList] = createState(new Array<AstalApps.Application>())
  const [selected, setSelected] = createState(0)

  function search(text: string) {
    setList(text === "" ? [] : apps.fuzzy_query(text).slice(0, MAX_ITEMS))
    // Any new query re-selects the top hit, which is what Enter should take.
    setSelected(0)
  }

  function launch(application?: AstalApps.Application) {
    if (application) {
      win.hide()
      application.launch()
    }
  }

  function move(delta: number) {
    const items = list.get()
    if (items.length === 0) return
    // Wraps, as Spotlight does at either end of the list.
    const next = (selected.get() + delta + items.length) % items.length
    setSelected(next)
  }

  function onKey(
    _e: Gtk.EventControllerKey,
    keyval: number,
    _: number,
    mod: number,
  ) {
    if (keyval === Gdk.KEY_Escape) {
      win.visible = false
      return
    }

    // Arrow keys walk the results. The entry keeps focus throughout, so typing
    // continues to refine the query without a focus round-trip.
    if (keyval === Gdk.KEY_Down) {
      move(1)
      return true
    }
    if (keyval === Gdk.KEY_Up) {
      move(-1)
      return true
    }

    if (mod === Gdk.ModifierType.ALT_MASK) {
      for (const i of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        if (keyval === Gdk[`KEY_${i}`]) {
          return launch(list.get()[i - 1])
        }
      }
    }
  }

  function onClick(_e: Gtk.GestureClick, _: number, x: number, y: number) {
    const [, rect] = contentbox.compute_bounds(win)
    const position = new Graphene.Point({ x, y })

    if (!rect.contains_point(position)) {
      win.visible = false
      return true
    }
  }

  return (
    <window
      $={(ref) => (win = ref)}
      visible={false}
      name="launcher"
      namespace="launcher"
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      application={app}
      onNotifyVisible={({ visible }) => {
        if (visible) {
          searchentry.grab_focus()
        } else {
          searchentry.set_text("")
          setSelected(0)
        }
      }}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <Gtk.GestureClick onPressed={onClick} />
      <box
        $={(ref) => (contentbox = ref)}
        name="launcher-content"
        valign={Gtk.Align.START}
        halign={Gtk.Align.CENTER}
        marginTop={Math.round(1200 * TOP_OFFSET)}
        orientation={Gtk.Orientation.VERTICAL}
      >
        <box class="search-field">
          <image class="search-icon" iconName="system-search-symbolic" />
          <entry
            $={(ref) => (searchentry = ref)}
            hexpand
            onNotifyText={({ text }) => search(text)}
            onActivate={() => launch(list.get()[selected.get()])}
            placeholderText="Spotlight Search"
          />
        </box>
        <Gtk.Separator visible={list((l) => l.length > 0)} />
        <box class="results" orientation={Gtk.Orientation.VERTICAL}>
          <For each={list}>
            {(application, index) => (
              <button
                class={createComputed([selected, index], (s, i) =>
                  s === i ? "app-item selected" : "app-item",
                )}
                onClicked={() => launch(application)}
              >
                <box>
                  <image iconName={application.iconName} pixelSize={32} />
                  <box
                    valign={Gtk.Align.CENTER}
                    orientation={Gtk.Orientation.VERTICAL}
                  >
                    <label
                      class="title"
                      xalign={0}
                      label={application.name}
                      maxWidthChars={40}
                      ellipsize={Pango.EllipsizeMode.END}
                    />
                    <label
                      class="subtitle"
                      xalign={0}
                      visible={!!application.description}
                      label={application.description ?? ""}
                      maxWidthChars={48}
                      ellipsize={Pango.EllipsizeMode.END}
                    />
                  </box>
                  <label
                    class="kind"
                    hexpand
                    halign={Gtk.Align.END}
                    label="Application"
                  />
                </box>
              </button>
            )}
          </For>
        </box>
      </box>
    </window>
  )
}
