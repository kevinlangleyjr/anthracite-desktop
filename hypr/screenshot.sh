#!/usr/bin/env bash
# Screenshot helper for the Print Screen binds in hyprland.lua.
#
#   screenshot.sh screen    focused monitor
#   screenshot.sh region    drag a selection (Esc cancels)
#   screenshot.sh window    the active window
#   screenshot.sh annotate  drag a selection, then mark it up in satty
#
# Every shot is written to ~/Pictures/Screenshots and copied to the clipboard,
# then announced through the AGS notification popup.
set -euo pipefail

mode=${1:-screen}

dir="${XDG_PICTURES_DIR:-$HOME/Pictures}/Screenshots"
mkdir -p "$dir"
file="$dir/$(date +%Y-%m-%d_%H-%M-%S).png"

case "$mode" in
screen)
	output=$(hyprctl monitors -j | jq -r 'first(.[] | select(.focused)) | .name')
	grim -o "$output" "$file"
	;;
region)
	# slurp exits non-zero when the selection is cancelled — that is a normal
	# way to back out, so leave without writing a file or notifying.
	geometry=$(slurp) || exit 0
	grim -g "$geometry" "$file"
	;;
window)
	geometry=$(hyprctl activewindow -j |
		jq -r '"\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"')
	grim -g "$geometry" "$file"
	;;
annotate)
	geometry=$(slurp) || exit 0
	# satty owns the rest: it saves to $file on Ctrl+S and copies on Ctrl+C.
	# Enter copies and exits, Escape throws the shot away — so there is nothing
	# to save or notify about here, and we are done either way.
	grim -g "$geometry" - | satty --filename - \
		--output-filename "$file" \
		--early-exit \
		--actions-on-enter save-to-clipboard \
		--copy-command wl-copy \
		--initial-tool arrow
	exit 0
	;;
*)
	echo "usage: ${0##*/} [screen|region|window|annotate]" >&2
	exit 2
	;;
esac

wl-copy <"$file"

# -i with the shot itself gives the popup a thumbnail of what was captured.
# --action implies --wait, so notify-send lives as long as the popup and prints
# the invoked action; detach it so the bind returns immediately. "default" is
# the freedesktop key for "the body of the notification was clicked".
(
	if [[ $(notify-send -a screenshot -i "$file" \
		--action=default=Open \
		"Screenshot saved" "${file/#"$HOME"/\~}") == default ]]; then
		xdg-open "$file"
	fi
) >/dev/null 2>&1 &
disown
