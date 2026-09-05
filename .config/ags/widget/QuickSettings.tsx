import app from "ags/gtk4/app"
import { For, With, createBinding } from "ags"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { exec, execAsync } from "ags/process"
import Pango from "gi://Pango"
import Graphene from "gi://Graphene"
import AstalWp from "gi://AstalWp"
import AstalNetwork from "gi://AstalNetwork"
import AstalBluetooth from "gi://AstalBluetooth"
import AstalNotifd from "gi://AstalNotifd"
import AstalMpris from "gi://AstalMpris"

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

// A circular icon button with its label beside it — Control Center's
// connectivity rows. The circle carries the on/off state; the label never
// changes colour, so the eye reads state from one place.
function ToggleRow({
  icon,
  label,
  state,
  detail,
  onToggle,
}: {
  icon: any
  label: string
  state: any
  detail?: any
  onToggle: () => void
}) {
  return (
    <button class="cc-row" vexpand onClicked={onToggle}>
      <box spacing={10}>
        <box class={state((on: boolean) => (on ? "cc-circle on" : "cc-circle"))}>
          <image iconName={icon} />
        </box>
        <box
          valign={Gtk.Align.CENTER}
          orientation={Gtk.Orientation.VERTICAL}
          hexpand
        >
          <label class="cc-label" xalign={0} label={label} />
          <label
            class="cc-detail"
            xalign={0}
            visible={!!detail}
            maxWidthChars={18}
            ellipsize={Pango.EllipsizeMode.END}
            label={detail ?? ""}
          />
        </box>
      </box>
    </button>
  )
}

// The square modules on the right: a circle above its name, as Focus and
// Screen Mirroring are drawn in Control Center.
function ToggleTile({
  icon,
  label,
  state,
  onToggle,
}: {
  icon: string
  label: string
  state: any
  onToggle: () => void
}) {
  return (
    <button class="cc-tile cc-square" onClicked={onToggle}>
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={6}
        halign={Gtk.Align.CENTER}
      >
        <box class={state((on: boolean) => (on ? "cc-circle on" : "cc-circle"))}>
          <image iconName={icon} />
        </box>
        <label class="cc-label" label={label} />
      </box>
    </button>
  )
}

function Connectivity() {
  const network = AstalNetwork.get_default()
  const wifi = createBinding(network, "wifi")
  const bluetooth = AstalBluetooth.get_default()
  const btPowered = createBinding(bluetooth, "isPowered")

  return (
    <box
      class="cc-tile connectivity"
      orientation={Gtk.Orientation.VERTICAL}
      hexpand
    >
      <With value={wifi}>
        {(w) =>
          w && (
            <ToggleRow
              icon={createBinding(w, "iconName")}
              label="Wi-Fi"
              state={createBinding(w, "enabled")}
              detail={createBinding(w, "ssid")((s) => s ?? "Off")}
              onToggle={() => w.set_enabled(!w.enabled)}
            />
          )
        }
      </With>
      <ToggleRow
        icon="bluetooth-symbolic"
        label="Bluetooth"
        state={btPowered}
        detail={btPowered((on: boolean) => (on ? "On" : "Off"))}
        onToggle={() =>
          void execAsync(
            `bluetoothctl power ${bluetooth.isPowered ? "off" : "on"}`,
          ).catch(console.error)
        }
      />
    </box>
  )
}

// Display and Sound are full-width slider modules, each labelled above its
// track rather than beside it.
function SliderTile({
  label,
  icon,
  value,
  onChange,
  visible,
}: {
  label: string
  icon: any
  value: any
  onChange: (v: number) => void
  visible?: any
}) {
  return (
    <box
      class="cc-tile slider-tile"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={6}
      visible={visible ?? true}
    >
      <label class="cc-label" xalign={0} label={label} />
      <box class="slider-track">
        <image class="slider-glyph" iconName={icon} />
        <slider
          hexpand
          onChangeValue={({ value: v }) => onChange(v)}
          value={value}
        />
      </box>
    </box>
  )
}

function NowPlaying() {
  const mpris = AstalMpris.get_default()
  const players = createBinding(mpris, "players")

  return (
    <box
      class="now-playing"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={10}
      visible={players((ps) => ps.some((p) => !!p.title))}
    >
      <For each={players}>
        {(player) => (
          <box
            class="cc-tile player"
            spacing={10}
            visible={createBinding(player, "title")((t) => !!t)}
          >
            <box overflow={Gtk.Overflow.HIDDEN} class="cover">
              <image pixelSize={48} file={createBinding(player, "coverArt")} />
            </box>
            <box
              valign={Gtk.Align.CENTER}
              orientation={Gtk.Orientation.VERTICAL}
            >
              <label
                class="cc-label"
                xalign={0}
                maxWidthChars={18}
                ellipsize={Pango.EllipsizeMode.END}
                label={createBinding(player, "title")((t) => t ?? "")}
              />
              <label
                class="cc-detail"
                xalign={0}
                maxWidthChars={18}
                ellipsize={Pango.EllipsizeMode.END}
                label={createBinding(player, "artist")((a) => a ?? "")}
              />
            </box>
            <box hexpand halign={Gtk.Align.END} class="player-controls">
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
  const { defaultSpeaker: speaker } = AstalWp.get_default()!
  const { defaultMicrophone: mic } = AstalWp.get_default()!
  const notifd = AstalNotifd.get_default()
  const brightness = createPoll(-1, 5000, getBrightness)

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
        class="control-center"
        valign={Gtk.Align.START}
        halign={Gtk.Align.END}
        orientation={Gtk.Orientation.VERTICAL}
        spacing={10}
      >
        <box spacing={10}>
          <Connectivity />
          <box orientation={Gtk.Orientation.VERTICAL} spacing={10}>
            <ToggleTile
              icon="notifications-disabled-symbolic"
              label="Focus"
              state={createBinding(notifd, "dontDisturb")}
              onToggle={() => notifd.set_dont_disturb(!notifd.dontDisturb)}
            />
            <ToggleTile
              icon="microphone-disabled-symbolic"
              label="Mic"
              state={createBinding(mic, "mute")((m) => !m)}
              onToggle={() => mic.set_mute(!mic.mute)}
            />
          </box>
        </box>
        <SliderTile
          label="Display"
          icon="display-brightness-high-symbolic"
          value={brightness}
          visible={brightness((b) => b >= 0)}
          onChange={(v) =>
            void execAsync(
              `brightnessctl set ${Math.max(1, Math.round(v * 100))}% -q`,
            ).catch(console.error)
          }
        />
        <SliderTile
          label="Sound"
          icon={createBinding(speaker, "volumeIcon")}
          value={createBinding(speaker, "volume")}
          onChange={(v) => speaker.set_volume(v)}
        />
        <NowPlaying />
      </box>
    </window>
  )
}
