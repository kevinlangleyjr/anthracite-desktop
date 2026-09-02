import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import Pango from "gi://Pango"
import AstalBattery from "gi://AstalBattery"
import AstalWp from "gi://AstalWp"
import AstalNetwork from "gi://AstalNetwork"
import AstalTray from "gi://AstalTray"
import AstalMpris from "gi://AstalMpris"
import AstalApps from "gi://AstalApps"
import AstalHyprland from "gi://AstalHyprland"
import AstalNotifd from "gi://AstalNotifd"
import { For, With, createBinding, onCleanup } from "ags"
import { createPoll } from "ags/time"
import SystemStats from "./SystemStats"

const WORKSPACE_COUNT = 5

function LauncherButton() {
  return (
    <button
      class="panel-button launcher"
      onClicked={() => app.toggle_window("launcher")}
    >
      <label class="nerd-icon" label="󰀘" />
    </button>
  )
}

function Workspaces() {
  const hypr = AstalHyprland.get_default()
  const workspaces = createBinding(hypr, "workspaces")
  const focused = createBinding(hypr, "focusedWorkspace")

  return (
    <box class="workspaces">
      {Array.from({ length: WORKSPACE_COUNT }, (_, i) => i + 1).map((id) => (
        <button
          class={focused((fw) => (fw?.id === id ? "active" : ""))}
          onClicked={() => hypr.dispatch("workspace", `${id}`)}
        >
          <box
            class={workspaces((ws) =>
              ws.some((w) => w.id === id) ? "indicator occupied" : "indicator",
            )}
          />
        </button>
      ))}
    </box>
  )
}

function FocusedClient() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedClient")

  return (
    <box class="panel-button focused-client">
      <With value={focused}>
        {(client) =>
          client && (
            <label
              label={createBinding(client, "title")((t) => t ?? "")}
              maxWidthChars={40}
              ellipsize={Pango.EllipsizeMode.END}
            />
          )
        }
      </With>
    </box>
  )
}

function DateButton() {
  const notifd = AstalNotifd.get_default()
  const time = createPoll(
    "",
    1000,
    () => GLib.DateTime.new_now_local().format("%H:%M — %a %e.")!,
  )
  const hasNotifs = createBinding(
    notifd,
    "notifications",
  )((ns) => ns.length > 0)

  return (
    <menubutton class="panel-button date">
      <box spacing={6}>
        <image
          class="bell"
          iconName="preferences-system-notifications-symbolic"
          visible={hasNotifs}
        />
        <label label={time} />
      </box>
      <popover>
        <Gtk.Calendar />
      </popover>
    </menubutton>
  )
}

function Media() {
  const mpris = AstalMpris.get_default()
  const apps = new AstalApps.Apps()
  const players = createBinding(mpris, "players")

  return (
    <menubutton
      class="panel-button media"
      visible={players((ps) => ps.length > 0)}
    >
      <box>
        <For each={players}>
          {(player) => {
            const [entry] = apps.exact_query(player.entry ?? "")
            return (
              <image
                class="player-icon"
                visible={!!entry?.iconName}
                iconName={entry?.iconName}
              />
            )
          }}
        </For>
      </box>
      <popover>
        <box spacing={8} orientation={Gtk.Orientation.VERTICAL}>
          <For each={players}>
            {(player) => (
              <box spacing={8} widthRequest={220}>
                <box overflow={Gtk.Overflow.HIDDEN} css="border-radius: 8px;">
                  <image
                    pixelSize={64}
                    file={createBinding(player, "coverArt")}
                  />
                </box>
                <box
                  valign={Gtk.Align.CENTER}
                  orientation={Gtk.Orientation.VERTICAL}
                >
                  <label
                    xalign={0}
                    maxWidthChars={24}
                    ellipsize={Pango.EllipsizeMode.END}
                    label={createBinding(player, "title")((t) => t ?? "")}
                  />
                  <label
                    xalign={0}
                    maxWidthChars={24}
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
      </popover>
    </menubutton>
  )
}

function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items")

  const init = (btn: Gtk.MenuButton, item: AstalTray.TrayItem) => {
    btn.menuModel = item.menuModel
    btn.insert_action_group("dbusmenu", item.actionGroup)
    item.connect("notify::action-group", () => {
      btn.insert_action_group("dbusmenu", item.actionGroup)
    })
  }

  return (
    <box>
      <For each={items}>
        {(item) => (
          <menubutton class="tray-item" $={(self) => init(self, item)}>
            <image gicon={createBinding(item, "gicon")} />
          </menubutton>
        )}
      </For>
    </box>
  )
}

function SystemButton() {
  const network = AstalNetwork.get_default()
  const wifi = createBinding(network, "wifi")
  const { defaultSpeaker: speaker } = AstalWp.get_default()!

  return (
    <button
      class="panel-button quicksettings"
      onClicked={() => app.toggle_window("quicksettings")}
    >
      <box spacing={8}>
        <With value={wifi}>
          {(w) => w && <image iconName={createBinding(w, "iconName")} />}
        </With>
        <image iconName={createBinding(speaker, "volumeIcon")} />
      </box>
    </button>
  )
}

function BatteryPill() {
  const battery = AstalBattery.get_default()
  const percent = createBinding(battery, "percentage")

  return (
    <button
      class={percent((p) =>
        p < 0.25 ? "panel-button battery-pill low" : "panel-button battery-pill",
      )}
      visible={createBinding(battery, "isPresent")}
      onClicked={() => app.toggle_window("quicksettings")}
    >
      <box spacing={6}>
        <image iconName={createBinding(battery, "iconName")} />
        <Gtk.LevelBar
          valign={Gtk.Align.CENTER}
          widthRequest={36}
          maxValue={1}
          value={percent}
        />
        <label label={percent((p) => `${Math.floor(p * 100)}%`)} />
      </box>
    </button>
  )
}

function PowerButton() {
  return (
    <button
      class="panel-button powermenu"
      onClicked={() => app.toggle_window("powermenu")}
    >
      <image iconName="system-shutdown-symbolic" />
    </button>
  )
}

export default function Bar({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  let win: Astal.Window
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  onCleanup(() => {
    win.destroy()
  })

  return (
    <window
      $={(self) => (win = self)}
      visible
      name="bar"
      namespace="bar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox class="panel">
        <box $type="start">
          <LauncherButton />
          <Workspaces />
          <FocusedClient />
        </box>
        <box $type="center">
          <DateButton />
          <Media />
        </box>
        <box $type="end">
          <SystemStats />
          <Tray />
          <SystemButton />
          <BatteryPill />
          <PowerButton />
        </box>
      </centerbox>
    </window>
  )
}
