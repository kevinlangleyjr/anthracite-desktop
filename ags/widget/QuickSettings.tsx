import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import { For, With, createBinding, createState } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { exec, execAsync } from "ags/process"
import Pango from "gi://Pango"
import Graphene from "gi://Graphene"
import AstalBattery from "gi://AstalBattery"
import AstalWp from "gi://AstalWp"
import AstalNetwork from "gi://AstalNetwork"
import AstalBluetooth from "gi://AstalBluetooth"
import AstalNotifd from "gi://AstalNotifd"
import AstalMpris from "gi://AstalMpris"

function uptime(): string {
  try {
    const [ok, bytes] = GLib.file_get_contents("/proc/uptime")
    if (!ok) return ""
    const seconds = parseFloat(new TextDecoder().decode(bytes).split(" ")[0])
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `up ${h}h ${m}m` : `up ${m}m`
  } catch {
    return ""
  }
}

// brightnessctl -m => device,class,current,percent%,max
function getBrightness(): number {
  try {
    const out = exec("brightnessctl -m")
    const parts = out.trim().split(",")
    return parseInt(parts[2], 10) / parseInt(parts[4], 10)
  } catch {
    return -1
  }
}

function Header({ onPower }: { onPower: () => void }) {
  const battery = AstalBattery.get_default()
  const percent = createBinding(
    battery,
    "percentage",
  )((p) => `${Math.floor(p * 100)}%`)
  const up = createPoll("", 60_000, uptime)

  return (
    <box class="header" spacing={11}>
      <label class="user" label={GLib.get_user_name()} />
      <label class="uptime" label={up} />
      <box hexpand />
      <box class="battery" visible={createBinding(battery, "isPresent")}>
        <image iconName={createBinding(battery, "iconName")} />
        <label label={percent} />
      </box>
      <button class="power" onClicked={onPower}>
        <image iconName="system-shutdown-symbolic" />
      </button>
    </box>
  )
}

function Sliders() {
  const { defaultSpeaker: speaker } = AstalWp.get_default()!
  const brightness = createPoll(-1, 5000, getBrightness)

  return (
    <box class="sliders-box" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
      <box spacing={6}>
        <button onClicked={() => speaker.set_mute(!speaker.mute)}>
          <image iconName={createBinding(speaker, "volumeIcon")} />
        </button>
        <slider
          hexpand
          onChangeValue={({ value }) => speaker.set_volume(value)}
          value={createBinding(speaker, "volume")}
        />
      </box>
      <box spacing={6} visible={brightness((b) => b >= 0)}>
        <button>
          <image iconName="display-brightness-symbolic" />
        </button>
        <slider
          hexpand
          onChangeValue={({ value }) =>
            void execAsync(
              `brightnessctl set ${Math.max(1, Math.round(value * 100))}% -q`,
            ).catch(console.error)
          }
          value={brightness}
        />
      </box>
    </box>
  )
}

function Toggles() {
  const network = AstalNetwork.get_default()
  const wifi = createBinding(network, "wifi")
  const bluetooth = AstalBluetooth.get_default()
  const btPowered = createBinding(bluetooth, "isPowered")
  const notifd = AstalNotifd.get_default()
  const dnd = createBinding(notifd, "dontDisturb")
  const { defaultMicrophone: mic } = AstalWp.get_default()!
  const micMuted = createBinding(mic, "mute")

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={11}>
      <box spacing={11} homogeneous>
        <With value={wifi}>
          {(w) =>
            w && (
              <button
                class={createBinding(w, "enabled")((on) =>
                  on ? "simple-toggle active" : "simple-toggle",
                )}
                onClicked={() => w.set_enabled(!w.enabled)}
              >
                <box spacing={6}>
                  <image iconName={createBinding(w, "iconName")} />
                  <label label="Wi-Fi" />
                  <label
                    class="state"
                    hexpand
                    halign={Gtk.Align.END}
                    maxWidthChars={12}
                    ellipsize={Pango.EllipsizeMode.END}
                    label={createBinding(w, "ssid")((s) => s ?? "")}
                  />
                </box>
              </button>
            )
          }
        </With>
        <button
          class={btPowered((on) =>
            on ? "simple-toggle active" : "simple-toggle",
          )}
          onClicked={() =>
            void execAsync(
              `bluetoothctl power ${bluetooth.isPowered ? "off" : "on"}`,
            ).catch(console.error)
          }
        >
          <box spacing={6}>
            <image iconName="bluetooth-symbolic" />
            <label label="Bluetooth" />
          </box>
        </button>
      </box>
      <box spacing={11} homogeneous>
        <button
          class={dnd((on) => (on ? "simple-toggle active" : "simple-toggle"))}
          onClicked={() => notifd.set_dont_disturb(!notifd.dontDisturb)}
        >
          <box spacing={6}>
            <image iconName="notifications-disabled-symbolic" />
            <label label="Do Not Disturb" />
          </box>
        </button>
        <button
          class={micMuted((m) => (m ? "simple-toggle active" : "simple-toggle"))}
          onClicked={() => mic.set_mute(!mic.mute)}
        >
          <box spacing={6}>
            <image iconName="microphone-disabled-symbolic" />
            <label label="Mute Mic" />
          </box>
        </button>
      </box>
    </box>
  )
}

function Media() {
  const mpris = AstalMpris.get_default()
  const players = createBinding(mpris, "players")

  return (
    <box class="media" orientation={Gtk.Orientation.VERTICAL} spacing={11}>
      <For each={players}>
        {(player) => (
          <box class="player" spacing={11}>
            <box overflow={Gtk.Overflow.HIDDEN} class="cover">
              <image pixelSize={64} file={createBinding(player, "coverArt")} />
            </box>
            <box
              valign={Gtk.Align.CENTER}
              orientation={Gtk.Orientation.VERTICAL}
            >
              <label
                class="title"
                xalign={0}
                maxWidthChars={22}
                ellipsize={Pango.EllipsizeMode.END}
                label={createBinding(player, "title")((t) => t ?? "")}
              />
              <label
                class="artist"
                xalign={0}
                maxWidthChars={22}
                ellipsize={Pango.EllipsizeMode.END}
                label={createBinding(player, "artist")((a) => a ?? "")}
              />
            </box>
            <box hexpand halign={Gtk.Align.END}>
              <button
                onClicked={() => player.previous()}
                visible={createBinding(player, "canGoPrevious")}
              >
                <image iconName="media-seek-backward-symbolic" />
              </button>
              <button
                onClicked={() => player.play_pause()}
                visible={createBinding(player, "canControl")}
              >
                <box>
                  <image
                    iconName="media-playback-start-symbolic"
                    visible={createBinding(
                      player,
                      "playbackStatus",
                    )((s) => s !== AstalMpris.PlaybackStatus.PLAYING)}
                  />
                  <image
                    iconName="media-playback-pause-symbolic"
                    visible={createBinding(
                      player,
                      "playbackStatus",
                    )((s) => s === AstalMpris.PlaybackStatus.PLAYING)}
                  />
                </box>
              </button>
              <button
                onClicked={() => player.next()}
                visible={createBinding(player, "canGoNext")}
              >
                <image iconName="media-seek-forward-symbolic" />
              </button>
            </box>
          </box>
        )}
      </For>
    </box>
  )
}

export default function QuickSettings() {
  let win: Astal.Window
  let contentbox: Gtk.Box

  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

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
      name="quicksettings"
      namespace="quicksettings"
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <Gtk.GestureClick onPressed={onClick} />
      <box
        $={(ref) => (contentbox = ref)}
        class="window-content"
        valign={Gtk.Align.START}
        halign={Gtk.Align.END}
        orientation={Gtk.Orientation.VERTICAL}
        spacing={11}
      >
        <Header
          onPower={() => {
            win.visible = false
            app.toggle_window("powermenu")
          }}
        />
        <Sliders />
        <Toggles />
        <Media />
      </box>
    </window>
  )
}
