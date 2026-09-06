#!/usr/bin/env bash
# doctor.sh — verify the Anthracite install is wired up correctly.
# Exits non-zero if any required check fails. Optional checks emit warnings.
#
# dotfiles-doctor calls this automatically when the repo is present.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

problems=0
warnings=0

if [[ -t 1 ]]; then
	OK=$'\033[32m✓\033[0m'
	WARN=$'\033[33m!\033[0m'
	FAIL=$'\033[31m✗\033[0m'
else
	OK="OK"
	WARN="WARN"
	FAIL="FAIL"
fi

ok()   { printf '  %s  %s\n' "$OK"   "$*"; }
warn() { printf '  %s  %s\n' "$WARN" "$*"; warnings=$((warnings + 1)); }
fail() { printf '  %s  %s\n' "$FAIL" "$*"; problems=$((problems + 1)); }

short() {
	case "$1" in
		"$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
		*)         printf '%s' "$1" ;;
	esac
}

echo "Repo"
if [[ -d "$REPO_DIR/.git" ]]; then
	ok "$(short "$REPO_DIR") is a git checkout"
else
	fail "$(short "$REPO_DIR") is not a git checkout"
fi

echo
echo "Config symlinks"
for dir in "$REPO_DIR"/.config/*/; do
	[[ -d "$dir" ]] || continue
	dir=${dir%/}
	name=$(basename "$dir")
	target="$HOME/.config/$name"
	if [[ -L "$target" ]] && [[ "$(readlink "$target")" == "$dir" ]]; then
		ok "$(short "$target") -> $name"
	elif [[ -e "$target" ]]; then
		fail "$(short "$target") exists but isn't a symlink into this repo"
	else
		fail "$(short "$target") missing — run ./install.sh"
	fi
done

echo
echo "Per-machine state"
if [[ -e "$REPO_DIR/.config/hypr/local.lua" ]]; then
	ok "local.lua present"
	# A monitor line is what makes the difference between a configured machine
	# and the untouched template, which leaves Hyprland to guess.
	if grep -qE '^\s*hl\.monitor\(' "$REPO_DIR/.config/hypr/local.lua"; then
		ok "local.lua defines at least one monitor"
	else
		warn "local.lua has no hl.monitor() call — Hyprland will autodetect"
	fi
else
	warn "local.lua missing — copy .config/hypr/local.lua.example"
fi

echo
echo "Commands the config invokes"
# Every one of these is called by name from hyprland.lua or a script beside
# it, and all of them fail silently when absent: a keybind that does nothing,
# a script that stops at its last step.
for cmd in ags hyprctl hyprpaper hypridle hyprlock hyprpicker \
	wl-paste wl-copy cliphist wofi grim slurp satty wf-recorder \
	notify-send wpctl playerctl brightnessctl bluetoothctl \
	kitty nautilus; do
	if command -v "$cmd" >/dev/null 2>&1; then
		ok "$cmd"
	else
		fail "$cmd not on PATH — see packages.txt"
	fi
done

echo
echo "Default applications"
# hyprland.lua launches ghostty by name, and mimeapps.list points http/https at
# brave. Both fail quietly: a keybind that does nothing, or a link that opens in
# whatever else claimed the scheme.
for pair in "ghostty:terminal" "brave:browser"; do
	cmd=${pair%%:*}; role=${pair##*:}
	if command -v "$cmd" >/dev/null 2>&1; then
		ok "$role -> $cmd"
	else
		fail "$cmd not on PATH — the $role keybind/handler will do nothing"
	fi
done
if [[ -L "$HOME/.config/mimeapps.list" ]]; then
	ok "mimeapps.list linked"
else
	warn "$(short "$HOME/.config/mimeapps.list") is not linked into this repo"
fi

echo
echo "System files"
for rel in "greetd/config.toml" "pam.d/greetd" "pam.d/polkit-1" "keyd/default.conf"; do
	repo_file="$REPO_DIR/etc/$rel"
	live_file="/etc/$rel"
	# The keyd layer is opt-in: until keyd is installed there is nothing to
	# apply the config to, so a missing file is expected rather than broken.
	if [[ "$rel" == keyd/* ]] && ! command -v keyd >/dev/null 2>&1; then
		warn "keyd not installed — the macOS key layer is not active"
		continue
	fi
	if [[ ! -r "$live_file" ]]; then
		fail "/etc/$rel missing or unreadable"
	elif cmp -s "$repo_file" "$live_file"; then
		ok "/etc/$rel matches the tracked copy"
	else
		warn "/etc/$rel differs from etc/$rel — ./install.sh --system to apply"
	fi
done

echo
echo "Services"
# Package installation does not enable any of these. greetd is the one that
# decides whether you get a session or a TTY.
for unit in greetd NetworkManager power-profiles-daemon bluetooth; do
	state=$(systemctl is-enabled "$unit" 2>/dev/null)
	case "$state" in
		enabled) ok "$unit enabled" ;;
		"")      fail "$unit not installed" ;;
		*)       fail "$unit is $state — sudo systemctl enable $unit" ;;
	esac
done
for unit in reflector.timer paccache.timer; do
	state=$(systemctl is-enabled "$unit" 2>/dev/null)
	case "$state" in
		enabled) ok "$unit enabled" ;;
		"")      warn "$unit not installed (optional)" ;;
		*)       warn "$unit is $state — sudo systemctl enable --now $unit" ;;
	esac
done

# Only meaningful inside a running Hyprland session; skipped elsewhere (a TTY,
# an SSH shell) so the doctor stays useful when run remotely.
if [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]]; then
	echo
	echo "Hyprland session"
	for conf in hyprlock.conf hypridle.conf hyprpaper.conf; do
		if [[ -f "$HOME/.config/hypr/$conf" ]]; then
			ok "$conf present"
		else
			fail "$(short "$HOME/.config/hypr/$conf") missing"
		fi
	done
	# Both are started from hyprland.lua and fail silently when absent: no idle
	# lock, and no dialog for anything asking for privileges. The polkit agent
	# is matched on the 15-char name the kernel stores in /proc/<pid>/comm,
	# since the real binary name is longer.
	if pgrep -x hypridle >/dev/null 2>&1; then
		ok "hypridle running"
	else
		fail "hypridle not running — nothing locks the screen on idle"
	fi
	if pgrep -x polkit-kde-auth >/dev/null 2>&1; then
		ok "polkit agent running"
	else
		fail "no polkit agent running — privilege prompts will never appear"
	fi
	if pgrep -x ags >/dev/null 2>&1; then
		ok "ags running"
	else
		fail "ags not running — no bar, dock or launcher"
	fi
fi

echo
if [[ $problems -eq 0 && $warnings -eq 0 ]]; then
	printf '%s  all checks passed\n' "$OK"
	exit 0
elif [[ $problems -eq 0 ]]; then
	printf '%s  %d warning(s), no failures\n' "$WARN" "$warnings"
	exit 0
else
	printf '%s  %d problem(s), %d warning(s)\n' "$FAIL" "$problems" "$warnings"
	exit 1
fi
