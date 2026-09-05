// Tailscale indicator and toggle.
//
// Reading `tailscale status --json` is unprivileged. Bringing the tailnet up or
// down normally is not, so this expects the one-time
//
//     sudo tailscale set --operator=$USER
//
// which lets that user drive tailscaled without sudo. Without it the click
// still works, it just reports the access error instead of toggling.
import { createComputed, createState } from "ags"
import { interval } from "ags/time"
import { execAsync } from "ags/process"

const POLL = 5000
const SETTLE = 700 // let tailscaled land on its new state before re-reading

type State = "running" | "stopped" | "login" | "down"

type Tailnet = {
  state: State
  host: string
  ip: string
  exitNode: string | null
  online: number
}

const DOWN: Tailnet = {
  state: "down",
  host: "",
  ip: "",
  exitNode: null,
  online: 0,
}

// "archlinux.tail6e8607.ts.net." → "archlinux"
const shortName = (dns: unknown) =>
  typeof dns === "string" ? dns.replace(/\.$/, "").split(".")[0] : ""

function parse(stdout: string): Tailnet {
  const s = JSON.parse(stdout)
  const peers: any[] = Object.values(s.Peer ?? {})
  const exit = peers.find((p) => p.ExitNode)

  return {
    state:
      s.BackendState === "Running"
        ? "running"
        : s.BackendState === "NeedsLogin" || s.BackendState === "NeedsMachineAuth"
          ? "login"
          : "stopped",
    host: shortName(s.Self?.DNSName),
    ip: s.TailscaleIPs?.[0] ?? "",
    exitNode: exit ? shortName(exit.DNSName) : null,
    online: peers.filter((p) => p.Online).length,
  }
}

const [tailnet, setTailnet] = createState<Tailnet>(DOWN)
const [busy, setBusy] = createState(false)

// A stopped tailscaled exits non-zero, as does a missing binary; both read as
// "down" rather than throwing out of the poll.
async function refresh() {
  try {
    setTailnet(parse(await execAsync(["tailscale", "status", "--json"])))
  } catch {
    setTailnet(DOWN)
  }
}

interval(POLL, refresh) // fires immediately, then every POLL

function notify(body: string) {
  execAsync([
    "notify-send",
    "-a", "Tailscale",
    "-i", "network-vpn-symbolic",
    "Tailscale",
    body,
  ]).catch(() => {})
}

async function toggle() {
  if (busy.get()) return
  const { state } = tailnet.get()
  if (state === "down") return notify("tailscaled is not running.")

  setBusy(true)
  try {
    await execAsync(
      state === "running"
        ? ["tailscale", "down"]
        : ["tailscale", "up", "--timeout=30s"],
    )
  } catch (e) {
    notify(String(e).trim() || "Could not change the tailnet state.")
  } finally {
    await new Promise((r) => setTimeout(r, SETTLE))
    await refresh()
    setBusy(false)
  }
}

function tooltip(t: Tailnet): string {
  switch (t.state) {
    case "running": {
      const lines = [`Tailscale · ${t.host}`, t.ip, `${t.online} peers online`]
      if (t.exitNode) lines.push(`exit node: ${t.exitNode}`)
      return `${lines.filter(Boolean).join("\n")}\n\nClick to disconnect`
    }
    case "login":
      return "Tailscale — not logged in\n\nRun: tailscale login"
    case "stopped":
      return "Tailscale — disconnected\n\nClick to connect"
    case "down":
      return "tailscaled is not running"
  }
}

export default function Tailscale() {
  return (
    <button
      class="panel-button tailscale"
      tooltipText={tailnet(tooltip)}
      sensitive={busy((b) => !b)}
      onClicked={toggle}
    >
      <box spacing={6}>
        <label
          class={createComputed(
            () => `nerd-icon ${busy() ? "busy" : tailnet().state}`,
          )}
          label={"\u{f0582}"}
        />
        <label
          class="exit-node"
          visible={tailnet((t) => !!t.exitNode)}
          label={tailnet((t) => t.exitNode ?? "")}
        />
      </box>
    </button>
  )
}
