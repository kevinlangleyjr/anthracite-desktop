#!/usr/bin/env bash
# Screen recording toggle, bound to SUPER+SHIFT+R (screen) and
# SUPER+CTRL+SHIFT+R (region) in hyprland.lua.
#
# One bind starts and stops: if wf-recorder is already running, the first job
# is to stop it. wf-recorder only finalises the container on SIGINT, so a kill
# -9 here would leave an unplayable file.
set -euo pipefail

dir="${XDG_VIDEOS_DIR:-$HOME/Videos}/Recordings"
mode=${1:-screen}

if pgrep -x wf-recorder >/dev/null 2>&1; then
	pkill -INT -x wf-recorder
	# Wait for the file to be finalised rather than notifying over the top of a
	# still-writing muxer.
	for _ in $(seq 20); do
		pgrep -x wf-recorder >/dev/null 2>&1 || break
		sleep 0.25
	done
	latest=$(ls -t "$dir"/*.mp4 2>/dev/null | head -1 || true)
	notify-send -a screenshot -i media-record "Recording stopped" \
		"${latest/#"$HOME"/\~}"
	exit 0
fi

mkdir -p "$dir"
file="$dir/$(date +%Y-%m-%d_%H-%M-%S).mp4"

case "$mode" in
screen)
	output=$(hyprctl monitors -j | jq -r 'first(.[] | select(.focused)) | .name')
	set -- -o "$output"
	;;
region)
	geometry=$(slurp) || exit 0
	set -- -g "$geometry"
	;;
*)
	echo "usage: ${0##*/} [screen|region]" >&2
	exit 2
	;;
esac

notify-send -a screenshot -i media-record "Recording started" \
	"$mode — press the bind again to stop"

# Detached so the keybind returns; wf-recorder then owns the session until the
# next invocation signals it.
setsid wf-recorder "$@" -f "$file" >/dev/null 2>&1 &
