import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Gtk from "gi://Gtk?version=4.0"
import Pango from "gi://Pango"
import { Accessor, createState } from "ags"
import { createPoll } from "ags/time"
import { readFile } from "ags/file"
import { exec } from "ags/process"

const POLL = 2000 // bar stats
const PROC_POLL = 3000 // process table, only while the popover is open
const DISK_POLL = 30_000
const TOP_PROCS = 5
const PAGE_SIZE = 4096 // getpagesize(); 4K on every arch we run on

// User_HZ, the unit of the utime/stime fields in /proc/<pid>/stat.
const CLK_TCK = (() => {
  try {
    return parseInt(exec("getconf CLK_TCK").trim(), 10) || 100
  } catch {
    return 100
  }
})()

function read(path: string): string {
  try {
    return readFile(path)
  } catch {
    return ""
  }
}

function listDir(path: string): string[] {
  const names: string[] = []
  try {
    const dir = GLib.Dir.open(path, 0)
    let name: string | null
    while ((name = dir.read_name()) !== null) names.push(name)
    dir.close()
  } catch {
    /* unreadable — treated as empty */
  }
  return names
}

// ─── formatting ──────────────────────────────────────────────────────────────

const pct = (f: number) => `${Math.round(f * 100)}%`

function bytes(n: number): string {
  const units = ["B", "K", "M", "G", "T"]
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i > 1 ? 1 : 0)}${units[i]}`
}

// ─── CPU ─────────────────────────────────────────────────────────────────────

type CpuTimes = { total: number; idle: number }

// /proc/stat: "cpu" aggregate first, then one "cpuN" line per logical core.
function cpuTimes(): CpuTimes[] {
  return read("/proc/stat")
    .split("\n")
    .filter((line) => line.startsWith("cpu"))
    .map((line) => {
      const v = line.split(/\s+/).slice(1).map(Number)
      return {
        total: v.reduce((a, b) => a + (b || 0), 0),
        idle: (v[3] || 0) + (v[4] || 0), // idle + iowait
      }
    })
}

export const CPU_COUNT = Math.max(cpuTimes().length - 1, 1)

let prevCpu = cpuTimes()

// [aggregate, core0, core1, …] as busy fractions since the previous sample.
function cpuUsage(): number[] {
  const now = cpuTimes()
  const usage = now.map((s, i) => {
    const prev = prevCpu[i]
    if (!prev) return 0
    const total = s.total - prev.total
    const idle = s.idle - prev.idle
    return total > 0 ? Math.min(1, Math.max(0, (total - idle) / total)) : 0
  })
  prevCpu = now
  return usage
}

// ─── memory ──────────────────────────────────────────────────────────────────

type Memory = {
  used: number
  total: number
  fraction: number
  swapUsed: number
  swapTotal: number
  swapFraction: number
}

function memory(): Memory {
  const info: Record<string, number> = {}
  for (const line of read("/proc/meminfo").split("\n")) {
    const [key, value] = line.split(":")
    if (value) info[key] = parseInt(value.trim(), 10) * 1024
  }
  const total = info.MemTotal || 0
  const used = total - (info.MemAvailable || 0)
  const swapTotal = info.SwapTotal || 0
  const swapUsed = swapTotal - (info.SwapFree || 0)
  return {
    used,
    total,
    fraction: total > 0 ? used / total : 0,
    swapUsed,
    swapTotal,
    swapFraction: swapTotal > 0 ? swapUsed / swapTotal : 0,
  }
}

// ─── temperature ─────────────────────────────────────────────────────────────

// Package/die sensor of the first CPU hwmon we recognise, resolved once.
const TEMP_PATH = (() => {
  const root = "/sys/class/hwmon"
  const drivers = ["coretemp", "k10temp", "zenpower"]
  const hwmons = listDir(root)
    .map((name) => `${root}/${name}`)
    .filter((path) => drivers.includes(read(`${path}/name`).trim()))
    .sort()

  for (const hwmon of hwmons) {
    for (const label of listDir(hwmon).filter((f) => f.endsWith("_label")).sort()) {
      if (/Package id 0|Tctl|Tdie/.test(read(`${hwmon}/${label}`))) {
        return `${hwmon}/${label.replace("_label", "_input")}`
      }
    }
    if (read(`${hwmon}/temp1_input`)) return `${hwmon}/temp1_input`
  }
  return null
})()

function temperature(): number | null {
  if (!TEMP_PATH) return null
  const raw = parseInt(read(TEMP_PATH), 10)
  return Number.isFinite(raw) ? raw / 1000 : null
}

// ─── network ─────────────────────────────────────────────────────────────────

type Net = { down: number; up: number }

let prevNet: { rx: number; tx: number; at: number } | null = null

function network(): Net {
  let rx = 0
  let tx = 0
  for (const line of read("/proc/net/dev").split("\n").slice(2)) {
    const [name, data] = line.split(":")
    if (!data) continue
    const iface = name.trim()
    if (iface === "lo" || /^(docker|veth|br-|virbr|tun|tap)/.test(iface)) continue
    const fields = data.trim().split(/\s+/).map(Number)
    rx += fields[0] || 0
    tx += fields[8] || 0
  }

  const at = GLib.get_monotonic_time() / 1e6
  const prev = prevNet
  prevNet = { rx, tx, at }
  if (!prev || at <= prev.at) return { down: 0, up: 0 }
  const seconds = at - prev.at
  return {
    down: Math.max(0, (rx - prev.rx) / seconds),
    up: Math.max(0, (tx - prev.tx) / seconds),
  }
}

// ─── disk ────────────────────────────────────────────────────────────────────

type Disk = { used: number; total: number; fraction: number }

function disk(path = "/"): Disk {
  try {
    const info = Gio.File.new_for_path(path).query_filesystem_info(
      "filesystem::size,filesystem::used",
      null,
    )
    const total = info.get_attribute_uint64("filesystem::size")
    const used = info.get_attribute_uint64("filesystem::used")
    return { used, total, fraction: total > 0 ? used / total : 0 }
  } catch {
    return { used: 0, total: 0, fraction: 0 }
  }
}

// ─── processes ───────────────────────────────────────────────────────────────

type Proc = { name: string; cpu: number; mem: number }

let prevProcTicks = new Map<string, number>()
let prevProcAt = 0

// Instantaneous per-process CPU, top-style: 1.0 == one core saturated.
function processes(count: number): Proc[] {
  const at = GLib.get_monotonic_time() / 1e6
  const seconds = prevProcAt ? at - prevProcAt : 0
  const ticks = new Map<string, number>()
  const procs: Proc[] = []

  for (const pid of listDir("/proc")) {
    if (!/^\d+$/.test(pid)) continue
    const stat = read(`/proc/${pid}/stat`)
    if (!stat) continue

    // comm (field 2) is parenthesised and may contain spaces; fields 3+ follow
    // the last ')', so field N lands at rest[N - 3].
    const close = stat.lastIndexOf(")")
    if (close < 0) continue
    const name = stat.slice(stat.indexOf("(") + 1, close)
    const rest = stat.slice(close + 2).split(" ")
    const used = (Number(rest[11]) || 0) + (Number(rest[12]) || 0) // utime + stime
    ticks.set(pid, used)

    const prev = prevProcTicks.get(pid)
    const cpu =
      seconds > 0 && prev !== undefined
        ? Math.max(0, (used - prev) / CLK_TCK / seconds)
        : 0
    const rss = Number(read(`/proc/${pid}/statm`).split(" ")[1]) || 0
    procs.push({ name, cpu, mem: rss * PAGE_SIZE })
  }

  prevProcTicks = ticks
  prevProcAt = at
  return procs.sort((a, b) => b.cpu - a.cpu).slice(0, count)
}

// ─── polls (module-level: shared by every monitor's bar) ──────────────────────

type Stats = {
  cpu: number[]
  mem: Memory
  temp: number | null
  net: Net
  load: number[]
}

const stats = createPoll<Stats>(
  {
    cpu: [],
    mem: memory(),
    temp: temperature(),
    net: { down: 0, up: 0 },
    load: [0, 0, 0],
  },
  POLL,
  () => ({
    cpu: cpuUsage(),
    mem: memory(),
    temp: temperature(),
    net: network(),
    load: read("/proc/loadavg").split(" ").slice(0, 3).map(Number),
  }),
)

const diskUsage = createPoll<Disk>(disk(), DISK_POLL, () => disk())

const [popoverOpen, setPopoverOpen] = createState(false)

// Walking /proc is only worth it while someone is looking at the list.
const topProcs = createPoll<Proc[]>([], PROC_POLL, (prev) =>
  popoverOpen.get() ? processes(TOP_PROCS) : prev,
)

const cpuTotal = stats((s) => s.cpu[0] ?? 0)

// ─── widgets ─────────────────────────────────────────────────────────────────

function StatBar({
  value,
  klass = "",
}: {
  value: Accessor<number>
  klass?: string
}) {
  return (
    <Gtk.LevelBar
      class={["stat-bar", klass].filter(Boolean).join(" ")}
      valign={Gtk.Align.CENTER}
      hexpand
      maxValue={1}
      value={value}
    />
  )
}

function Row({ label, value }: { label: string; value: Accessor<string> }) {
  return (
    <box class="row">
      <label class="key" xalign={0} label={label} />
      <box hexpand />
      <label class="value" xalign={1} label={value} />
    </box>
  )
}

function CoreGrid() {
  return (
    <box class="cores" spacing={3} homogeneous>
      {Array.from({ length: CPU_COUNT }, (_, i) => (
        <Gtk.LevelBar
          class="core-bar"
          orientation={Gtk.Orientation.VERTICAL}
          inverted
          heightRequest={26}
          maxValue={1}
          value={stats((s) => s.cpu[i + 1] ?? 0)}
        />
      ))}
    </box>
  )
}

function ProcRow({ index }: { index: number }) {
  const proc = topProcs((p) => p[index])

  return (
    <box class="proc" visible={proc((p) => !!p)} spacing={8}>
      <label
        class="name"
        xalign={0}
        hexpand
        maxWidthChars={18}
        ellipsize={Pango.EllipsizeMode.END}
        label={proc((p) => p?.name ?? "")}
      />
      <label class="proc-mem" label={proc((p) => (p ? bytes(p.mem) : ""))} />
      <label class="proc-cpu" label={proc((p) => (p ? pct(p.cpu) : ""))} />
    </box>
  )
}

function StatsPopover() {
  return (
    <box class="stats-popover" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
      <box class="section" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <Row label="CPU" value={cpuTotal(pct)} />
        <StatBar value={cpuTotal} />
        <CoreGrid />
        <label
          class="detail"
          xalign={0}
          label={stats(
            (s) =>
              `${CPU_COUNT} threads · load ${s.load.map((l) => l.toFixed(2)).join(" ")}` +
              (s.temp === null ? "" : ` · ${Math.round(s.temp)}°C`),
          )}
        />
      </box>

      <box class="section" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <Row
          label="Memory"
          value={stats((s) => `${bytes(s.mem.used)} / ${bytes(s.mem.total)}`)}
        />
        <StatBar value={stats((s) => s.mem.fraction)} />
        <box visible={stats((s) => s.mem.swapTotal > 0)} orientation={Gtk.Orientation.VERTICAL} spacing={6}>
          <Row
            label="Swap"
            value={stats((s) => `${bytes(s.mem.swapUsed)} / ${bytes(s.mem.swapTotal)}`)}
          />
          <StatBar value={stats((s) => s.mem.swapFraction)} klass="swap" />
        </box>
      </box>

      <box class="section" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <Row
          label="Disk /"
          value={diskUsage((d) => `${bytes(d.used)} / ${bytes(d.total)}`)}
        />
        <StatBar value={diskUsage((d) => d.fraction)} />
      </box>

      <box class="section network" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
        <Row
          label="Network"
          value={stats((s) => `↓ ${bytes(s.net.down)}/s   ↑ ${bytes(s.net.up)}/s`)}
        />
      </box>

      <box class="section procs" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        <label class="key" xalign={0} label="Top processes" />
        {Array.from({ length: TOP_PROCS }, (_, i) => (
          <ProcRow index={i} />
        ))}
      </box>
    </box>
  )
}

export default function SystemStats() {
  return (
    <menubutton class="panel-button stats">
      <box spacing={10}>
        <box class="stat cpu" spacing={5}>
          <label class="nerd-icon" label={"\u{f4bc}"} />
          <label
            class={cpuTotal((c) => (c > 0.8 ? "value high" : "value"))}
            label={cpuTotal(pct)}
          />
        </box>
        <box class="stat ram" spacing={5}>
          <label class="nerd-icon" label={"\u{efc5}"} />
          <label
            class={stats((s) => (s.mem.fraction > 0.85 ? "value high" : "value"))}
            label={stats((s) => pct(s.mem.fraction))}
          />
        </box>
        <box class="stat temp" spacing={5} visible={!!TEMP_PATH}>
          <label class="nerd-icon" label={"\u{f2c9}"} />
          <label
            class={stats((s) =>
              (s.temp ?? 0) > 80 ? "value high" : (s.temp ?? 0) > 65 ? "value warm" : "value",
            )}
            label={stats((s) => (s.temp === null ? "—" : `${Math.round(s.temp)}°`))}
          />
        </box>
      </box>

      <popover
        $={(self) =>
          self.connect("notify::visible", () => {
            // Re-baseline on open so the first sampled tick reports CPU over a
            // fresh window rather than the whole time the popover was closed.
            if (self.visible) processes(0)
            setPopoverOpen(self.visible)
          })
        }
      >
        <StatsPopover />
      </popover>
    </menubutton>
  )
}
