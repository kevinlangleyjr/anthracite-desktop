import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import { createState } from "ags"
import { Astal, Gtk } from "ags/gtk4"
import AstalWp from "gi://AstalWp"

const HIDE_DELAY_MS = 1500

export default function OSD() {
  const { defaultSpeaker: speaker } = AstalWp.get_default()!

  const [visible, setVisible] = createState(false)
  const [value, setValue] = createState(0)
  const [icon, setIcon] = createState("audio-volume-high-symbolic")

  // Debounced auto-hide: each change bumps a counter; only the last
  // scheduled timeout actually hides the window.
  let pending = 0
  // Skip the initial property notifications fired while wireplumber syncs
  // state at startup.
  let ready = false
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    ready = true
    return GLib.SOURCE_REMOVE
  })

  function show() {
    if (!ready) return
    setValue(speaker.mute ? 0 : speaker.volume)
    setIcon(speaker.volumeIcon)
    setVisible(true)
    pending++
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
      if (--pending === 0) setVisible(false)
      return GLib.SOURCE_REMOVE
    })
  }

  speaker.connect("notify::volume", show)
  speaker.connect("notify::mute", show)

  return (
    <window
      visible={visible}
      name="osd"
      namespace="osd"
      anchor={Astal.WindowAnchor.BOTTOM}
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.OVERLAY}
      application={app}
    >
      <box class="osd" valign={Gtk.Align.CENTER}>
        <image iconName={icon} pixelSize={24} />
        <Gtk.LevelBar
          valign={Gtk.Align.CENTER}
          widthRequest={260}
          maxValue={1}
          value={value}
        />
      </box>
    </window>
  )
}
