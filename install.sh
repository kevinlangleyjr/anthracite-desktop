#!/usr/bin/env bash
# Anthracite installer
#
# Links the Hyprland/AGS config into ~/.config, installs the packages the
# session needs, and reports drift between the tracked etc/ copies and the
# live system files.
#
# Flags:
#   --no-bootstrap  skip package installation
#   --system        apply etc/ to /etc (sudo; backs up what it replaces)
#   -h, --help      this text
#
# Usage:  ./install.sh [--no-bootstrap] [--system]
set -euo pipefail

BOOTSTRAP=yes
APPLY_SYSTEM=no

for _arg in "$@"; do
	case "$_arg" in
		--no-bootstrap) BOOTSTRAP=no ;;
		--system) APPLY_SYSTEM=yes ;;
		-h | --help)
			sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "install: unknown flag $_arg (try --help)" >&2
			exit 1
			;;
	esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The system files this repo tracks, relative to both etc/ and /etc.
SYSTEM_FILES=(
	"greetd/config.toml"
	"pam.d/greetd"
	"pam.d/polkit-1"
	"udev/rules.d/99-fingerprint-no-autosuspend.rules"
)

# If a config dir already exists and is not already our symlink, move it aside
# as <name>.old rather than clobbering it.
move_existing_to_old() {
	local home_path=$1
	local repo_path=$2
	local name
	name=$(basename "$home_path")

	if [[ -L "$home_path" ]]; then
		local cur
		cur=$(readlink "$home_path")
		if [[ "$cur" == "$repo_path" ]]; then
			return 0
		fi
	fi
	if [[ ! -e "$home_path" && ! -L "$home_path" ]]; then
		return 0
	fi
	local bak="${home_path}.old"
	if [[ -e "$bak" || -L "$bak" ]]; then
		mv -f "$bak" "${bak}.bak"
		echo "install: existing ${name}.old moved to ${name}.old.bak" >&2
	fi
	mv "$home_path" "$bak"
	echo "install: previous ${name} moved to ${name}.old" >&2
}

if [[ "$(uname -s)" != Linux ]]; then
	echo "install: this is a Hyprland desktop; it only makes sense on Linux." >&2
	exit 1
fi

#---------------------------------------------------------------------------
# Packages
#---------------------------------------------------------------------------
# Repo packages first, then AUR. The AUR step is not optional in practice:
# aylurs-gtk-shell-git and libastal-meta have no repo equivalent, and without
# them the session comes up with no shell at all.
install_packages() {
	if ! command -v pacman >/dev/null 2>&1; then
		echo "install: not an Arch-based system; skipping packages. Needed:" >&2
		grep -vE '^\s*#|^\s*$' "$REPO_DIR/packages.txt" "$REPO_DIR/packages-aur.txt" \
			| sed 's/^[^:]*://' | sed 's/^/  - /' >&2
		return 0
	fi

	echo "install: installing repo packages..." >&2
	grep -vE '^\s*#|^\s*$' "$REPO_DIR/packages.txt" | sudo pacman -S --needed -

	local helper=""
	for h in paru yay; do
		if command -v "$h" >/dev/null 2>&1; then
			helper="$h"
			break
		fi
	done

	if [[ -z "$helper" ]]; then
		echo "install: no AUR helper (paru or yay) found. The shell will NOT work" >&2
		echo "install: without these — install one, then re-run:" >&2
		grep -vE '^\s*#|^\s*$' "$REPO_DIR/packages-aur.txt" | sed 's/^/  - /' >&2
		return 0
	fi

	echo "install: installing AUR packages with $helper..." >&2
	grep -vE '^\s*#|^\s*$' "$REPO_DIR/packages-aur.txt" | xargs -r "$helper" -S --needed
}

if [[ "$BOOTSTRAP" == "yes" ]]; then
	install_packages
fi

#---------------------------------------------------------------------------
# Config symlinks
#---------------------------------------------------------------------------
# Linked at the directory level so files added inside a config dir later are
# picked up without touching this script. -n stops ln from descending into an
# existing link.
mkdir -p "$HOME/.config"
for dir in "$REPO_DIR"/.config/*/; do
	[[ -d "$dir" ]] || continue
	dir=${dir%/}
	name=$(basename "$dir")
	move_existing_to_old "$HOME/.config/$name" "$dir"
	ln -sfn "$dir" "$HOME/.config/$name"
	echo "install: ~/.config/$name -> $name" >&2
done

# mimeapps.list is a file rather than a directory, so the loop above skips it.
# It is what makes Brave the http/https handler and sends screenshots to Loupe
# instead of whatever else claims image/png on a fresh machine.
if [[ -f "$REPO_DIR/.config/mimeapps.list" ]]; then
	move_existing_to_old "$HOME/.config/mimeapps.list" "$REPO_DIR/.config/mimeapps.list"
	ln -sf "$REPO_DIR/.config/mimeapps.list" "$HOME/.config/mimeapps.list"
	echo "install: ~/.config/mimeapps.list -> mimeapps.list" >&2
fi

#---------------------------------------------------------------------------
# Per-machine values
#---------------------------------------------------------------------------
# hyprland.lua loads local.lua via pcall(require, "local"), so a missing file
# is harmless — seed it anyway so a new machine starts from the commented
# template. It is gitignored, so it survives pulls and branch switches, which
# is what makes it safe to try a different desktop config on a branch.
if [[ -f "$REPO_DIR/.config/hypr/local.lua.example" && ! -e "$REPO_DIR/.config/hypr/local.lua" ]]; then
	cp "$REPO_DIR/.config/hypr/local.lua.example" "$REPO_DIR/.config/hypr/local.lua"
	echo "install: created .config/hypr/local.lua — set your monitors there" >&2
fi

#---------------------------------------------------------------------------
# Appearance
#---------------------------------------------------------------------------
# The GTK settings.ini files arrive via the symlinks above, but the preference
# apps actually query is the dconf one, which the portal re-exports as
# org.freedesktop.appearance. It is a binary store, so it cannot be symlinked
# and has to be set here. Qt reads the same value through the portal — see the
# QT_QPA_PLATFORMTHEME env in hyprland.lua.
#
# These names must match .config/gtk-3.0/settings.ini. GTK3 apps read the ini,
# but GTK4/libadwaita apps and the portal read dconf, so both have to agree or
# the desktop ends up half-themed.
if command -v gsettings >/dev/null 2>&1; then
	gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
	gsettings set org.gnome.desktop.interface gtk-theme 'WhiteSur-Dark'
	gsettings set org.gnome.desktop.interface icon-theme 'WhiteSur-dark'
	gsettings set org.gnome.desktop.interface cursor-theme 'WhiteSur-cursors'
	gsettings set org.gnome.desktop.interface cursor-size 24
	gsettings set org.gnome.desktop.interface font-name 'SF Pro Text 11'
	gsettings set org.gnome.desktop.interface monospace-font-name 'SF Mono 11'
	gsettings set org.gnome.desktop.interface document-font-name 'SF Pro Text 11'
	echo "install: appearance set (WhiteSur-Dark, WhiteSur icons/cursors, SF Pro)" >&2
fi

#---------------------------------------------------------------------------
# Default applications
#---------------------------------------------------------------------------
# "Open in Terminal" resolves through xdg-terminal-exec, which reads this list.
# Older callers still read the deprecated gsettings key, so set both — Nautilus
# in particular changed mechanism between releases.
if [[ ! -e "$HOME/.config/xdg-terminals.list" ]]; then
	printf 'com.mitchellh.ghostty.desktop\n' >"$HOME/.config/xdg-terminals.list"
	echo "install: default terminal -> ghostty" >&2
fi
if command -v gsettings >/dev/null 2>&1; then
	gsettings set org.gnome.desktop.default-applications.terminal exec 'ghostty' 2>/dev/null || true
	gsettings set org.gnome.desktop.default-applications.terminal exec-arg '-e' 2>/dev/null || true
fi

# Show dotfiles everywhere. A deliberate departure from macOS, which hides them
# until you press Cmd+Shift+period — but most of the interesting directories on
# this machine start with a dot.
#
# Three separate keys, because the file manager and the Open/Save dialogs do not
# share this preference, and the dialogs keep their own GTK3 and GTK4 copies.
# Setting only one of the three is what makes this look half-applied.
if command -v gsettings >/dev/null 2>&1; then
	gsettings set org.gnome.nautilus.preferences show-hidden-files true 2>/dev/null || true
	gsettings set org.gtk.Settings.FileChooser show-hidden true 2>/dev/null || true
	gsettings set org.gtk.gtk4.Settings.FileChooser show-hidden true 2>/dev/null || true
fi

#---------------------------------------------------------------------------
# System files
#---------------------------------------------------------------------------
# Reporting is the default and writing needs --system on purpose. Silently
# overwriting /etc/pam.d/* on a routine re-run is how you lock yourself out of
# a machine.
system_drift=0

for rel in "${SYSTEM_FILES[@]}"; do
	repo_file="$REPO_DIR/etc/$rel"
	live_file="/etc/$rel"

	if [[ ! -r "$live_file" ]]; then
		echo "install: /etc/$rel missing or unreadable" >&2
		system_drift=$((system_drift + 1))
		continue
	fi
	if cmp -s "$repo_file" "$live_file"; then
		continue
	fi
	system_drift=$((system_drift + 1))
	echo "install: /etc/$rel differs from the tracked copy" >&2
done

if [[ "$APPLY_SYSTEM" == "yes" ]]; then
	stamp=$(date +%Y%m%d%H%M%S)
	for rel in "${SYSTEM_FILES[@]}"; do
		repo_file="$REPO_DIR/etc/$rel"
		live_file="/etc/$rel"
		if cmp -s "$repo_file" "$live_file" 2>/dev/null; then
			continue
		fi
		sudo mkdir -p "$(dirname "$live_file")"
		if [[ -e "$live_file" ]]; then
			sudo cp -a "$live_file" "${live_file}.bak-${stamp}"
			echo "install: backed up /etc/$rel -> /etc/${rel}.bak-${stamp}" >&2
		fi
		sudo install -m 644 -o root -g root "$repo_file" "$live_file"
		echo "install: wrote /etc/$rel" >&2
	done
elif ((system_drift)); then
	echo "install: $system_drift system file(s) differ — re-run with --system to apply" >&2
fi

cat <<'EOF'

Anthracite linked.

Next:
  1. Set your monitors in .config/hypr/local.lua
  2. Enable the services (package install does not do this):
       sudo systemctl enable greetd NetworkManager NetworkManager-dispatcher \
           NetworkManager-wait-online power-profiles-daemon bluetooth
       sudo systemctl enable --now reflector.timer paccache.timer
  3. Reboot into the session, then run ./doctor.sh

Already inside a Hyprland session? `hyprctl reload` picks up config changes.
EOF
