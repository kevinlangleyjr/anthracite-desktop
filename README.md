# Slatewave Desktop

A Hyprland desktop: the compositor config, the AGS shell that draws the bar,
launcher and dock, and the system-level files that make a session actually
start. Split out of [dotfiles](https://github.com/kevinlangleyjr/dotfiles),
which clones this repo on Linux desktops and leaves it alone everywhere else.

Shell components and theming are documented separately in
[`.config/ags/README.md`](.config/ags/README.md).

## What's in here

| Path | What it is |
| --- | --- |
| `.config/hypr/` | `hyprland.lua` (binds, rules, autostart), hyprlock, hypridle, hyprpaper, and the screenshot / record / clipboard scripts |
| `.config/ags/` | The AGS v3 shell — bar, launcher, quick settings, power menu, OSD, dock, notifications |
| `.config/gtk-3.0/`, `.config/gtk-4.0/` | GTK dark-mode settings, paired with the `gsettings` keys the installer sets |
| `etc/` | Tracked copies of the system files a session depends on — see [System files](#system-files) |
| `packages.txt` | Repo packages, installed with `pacman` |
| `packages-aur.txt` | AUR packages, installed with `paru` or `yay` |
| `install.sh` | Symlinks the config dirs, seeds `local.lua`, sets dark mode |
| `doctor.sh` | Health check; also called by `dotfiles-doctor` |

## Requirements

Arch (or an Arch derivative) and an AUR helper — `aylurs-gtk-shell-git` has no
repo package, and without it there is no shell. Everything else comes from the
official repos.

The dotfiles repo is not required. This installs standalone; dotfiles just
knows how to clone it.

## Install

```sh
git clone git@github.com:kevinlangleyjr/slatewave-desktop.git ~/.slatewave-desktop
~/.slatewave-desktop/install.sh
```

Then set your monitors in `.config/hypr/local.lua` (see
[Per-machine values](#per-machine-values)) and reboot into the session.

### What the installer does

1. Installs `packages.txt` via `pacman --needed`, then `packages-aur.txt` via
   whichever of `paru` / `yay` is present.
2. Symlinks each `.config/<name>` to `~/.config/<name>`, moving anything
   already there aside as `<name>.old`.
3. Seeds `.config/hypr/local.lua` from `local.lua.example` if absent. That file
   is gitignored, so per-machine monitor config survives pulls and branch
   switches.
4. Sets the dconf dark-mode keys (`color-scheme`, `gtk-theme`). GTK reads the
   `settings.ini` files linked in step 2; Qt reads the same preference through
   `xdg-desktop-portal`, which is why `hyprland.lua` sets
   `QT_QPA_PLATFORMTHEME=xdgdesktopportal`.
5. Reports drift between `etc/` and the live system files. It does **not**
   write to `/etc` unless you pass `--system`.

## System files

Three files outside `$HOME` are part of this setup. Two are package files that
have been modified; one is owned by no package at all, so a fresh install would
silently lose it.

| Tracked copy | Installed to | Why it matters |
| --- | --- | --- |
| `etc/greetd/config.toml` | `/etc/greetd/config.toml` | The `tuigreet --cmd start-hyprland` line. This is how the session launches at all. |
| `etc/pam.d/greetd` | `/etc/pam.d/greetd` | Adds the two `pam_gnome_keyring` lines. Without them the keyring never unlocks, and anything using the Secret Service — 1Password's two-factor token, NetworkManager's saved Wi-Fi passwords — fails. |
| `etc/pam.d/polkit-1` | `/etc/pam.d/polkit-1` | Owned by no package. Puts `pam_fprintd.so` ahead of the normal stack, which is what lets polkit prompt for a fingerprint. A plain package reinstall does not recreate this. |

`install.sh` diffs these and reports, but writes only under `--system`:

```sh
./install.sh --system     # sudo; backs up each file as <name>.bak-<timestamp>
```

Overwriting `/etc/pam.d/*` on a routine re-run is how you lock yourself out of a
machine, hence the flag.

Everything else outside `$HOME` is stock and comes back with its package —
`/etc/pam.d/hyprlock`, the `wayland-sessions` desktop files,
`/etc/xdg/reflector/reflector.conf`, `/etc/environment`, `/etc/security/*`.
`/etc/udev/rules.d/` is empty and needs nothing: this `brightnessctl` build
writes brightness through logind's D-Bus `SetBrightness`, not sysfs.

### Units to enable

Package installation does not enable these:

```sh
sudo systemctl enable greetd NetworkManager NetworkManager-dispatcher \
    NetworkManager-wait-online power-profiles-daemon bluetooth
sudo systemctl enable --now reflector.timer paccache.timer
```

`greetd` is the one that matters — without it you boot to a TTY.

### Groups

The login user needs `wheel` and nothing else. Device access comes from
logind's per-session ACLs, so `video` / `input` / `seat` group membership is
neither needed nor helpful. Don't add them.

## Per-machine values

`.config/hypr/local.lua` is gitignored and seeded from `local.lua.example`.
Monitors, scale and host-specific env go there — never in `hyprland.lua`:

```lua
hl.monitor({ output = "eDP-1", mode = "1920x1200@60", position = "0x0", scale = 1 })
```

`hyprland.lua` loads it with `pcall(require, "local")`, so a missing file is
harmless.

## Keybindings

`SUPER` is the mod.

| Key | Action |
| --- | --- |
| `SUPER` + `C` / `E` / `R` | Terminal (kitty) / files (nautilus) / app launcher |
| `SUPER` + `Q` | Close window |
| `SUPER` + `F` | Snap to work area — full width, under the bar, above the dock. Press again to restore. |
| `SUPER` + `V` | Toggle floating (everything floats by default) |
| `SUPER` + `J` / `P` | Toggle split / pseudotile |
| `ALT` + `Tab` | Window switcher (AGS overlay; commits when Alt is released) |
| `SUPER` + `A` / `M` / `L` | Quick settings / power menu / lock |
| `SUPER` + arrows | Move focus |
| `SUPER` + `SHIFT` + arrows | Move window |
| `SUPER` + `CTRL` + arrows | Resize window |
| `SUPER` + `1`–`0` | Switch workspace (add `SHIFT` to move the window there) |
| `SUPER` + `S` / `SHIFT` + `S` | Toggle scratchpad / move window to it |
| `SUPER` + scroll | Cycle workspaces |
| `SUPER` + drag LMB / RMB | Move / resize window |
| `Print` | Screenshot — full screen |
| `SHIFT` / `ALT` / `CTRL` + `Print` | Region / window / region-then-annotate |
| `SUPER` + `SHIFT` + `V` / `C` | Clipboard history / colour picker |
| `SUPER` + `SHIFT` + `R` | Record screen (`CTRL` + `SHIFT` + `R` for a region) |

Screenshots land in `~/Pictures/Screenshots` and are copied to the clipboard.

## Health check

```sh
./doctor.sh
```

Checks the symlinks, the per-machine file, that `hypridle` and a polkit agent
are actually running, and that the `etc/` copies match what's installed. When
the dotfiles repo is present, `dotfiles-doctor` calls this automatically.

## AGS versions

The `ags` and `gnim` entries in `.config/ags/package.json` are `"*"` on
purpose, and there is deliberately no lockfile. AGS's bundler aliases both
names to `/usr/share/ags/js`, so the code that actually runs always comes from
the installed `aylurs-gtk-shell-git` build regardless of what npm resolves —
and the npm package named `ags` is an unrelated, defunct one that `npm install`
would choke on.

The version that matters is therefore the AUR build. Last tested against
`aylurs-gtk-shell-git 3.1.2.r0.gbbee2f1-2`. After upgrading it, run
`ags types -u` to resync the generated typings.

## Troubleshooting

**Booted to a TTY.** `systemctl status greetd`. Usually greetd isn't enabled,
or `/etc/greetd/config.toml` is missing the `start-hyprland` command.

**No fingerprint prompt on privilege dialogs.** Check `/etc/pam.d/polkit-1`
against `etc/pam.d/polkit-1`. PAM parse errors show up in
`journalctl -b -u polkit`.

**Bar or dock missing.** `ags list` shows registered windows; `ags run` in a
terminal prints the TS/JSX errors that `hyprland.lua`'s autostart swallows.

**Screen never locks.** `pgrep hypridle`. It's started from `hyprland.lua`, and
fails silently if the binary is absent.

**Nothing prompts for privileges.** `pgrep -x polkit-kde-auth`. Same cause.
