#!/usr/bin/env bash
# Clipboard history picker, bound to SUPER+SHIFT+V in hyprland.lua.
#
# cliphist keeps the history; the watchers that feed it are started from
# hyprland.lua's autostart. wofi is only the menu — cliphist list emits
# "<id>\t<preview>" lines, and decode maps the chosen line back to the full
# entry, so binary content (images) survives the round trip intact.
set -euo pipefail

choice=$(cliphist list | wofi --dmenu --prompt "Clipboard" --insensitive) || exit 0
[[ -n $choice ]] || exit 0

printf '%s' "$choice" | cliphist decode | wl-copy
