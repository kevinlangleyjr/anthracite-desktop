# Slatewave Space — AGS desktop shell

A recreation of the layout from [Aylur's ags-pre-ts "Space" theme](https://github.com/Aylur/dotfiles/tree/ags-pre-ts)
on the current, maintained stack (AGS v3 / Astal / GTK4), themed with the
Slatewave palette. Components: top bar, app launcher, quick settings, power
menu with confirmation, notification popups, volume OSD, and a bottom dock.

The Slatewave color tokens live in `style/_palette.scss`. The wallpaper
(`assets/slatewave-space.png`, source SVG alongside) is a custom flat space
scene in the same palette.

## Install (Arch)

```sh
paru -S aylurs-gtk-shell-git libastal-meta dart-sass \
        brightnessctl ttf-jetbrains-mono-nerd
```

- `aylurs-gtk-shell-git` — the `ags` CLI/runtime (v3+ required)
- `libastal-meta` — Astal service libraries (hyprland, battery, network,
  bluetooth, wireplumber, mpris, notifd, tray, apps)
- `dart-sass` — compiles `style.scss` at launch
- `brightnessctl` — brightness slider in quick settings
- Nerd Font — the launcher glyph in the bar

This directory is symlinked to `~/.config/ags` by the dotfiles installer, so:

```sh
ags run            # start the shell
ags quit           # stop it
ags types          # (optional) generate @girs types for editor support
```

## Hyprland wiring (hyprland.lua)

```lua
hl.on("hyprland.start", function()
    hl.exec_cmd("ags run")
    hl.exec_cmd("hyprpaper")
end)

hl.bind(mainMod .. " + R", hl.dsp.exec_cmd("ags toggle launcher"))
hl.bind(mainMod .. " + S", hl.dsp.exec_cmd("ags toggle quicksettings"))
hl.bind(mainMod .. " + Escape", hl.dsp.exec_cmd("ags toggle powermenu"))
```

Wallpaper — `~/.config/hypr/hyprpaper.conf`:

```
preload = ~/.config/ags/assets/slatewave-space.png
wallpaper = , ~/.config/ags/assets/slatewave-space.png
```

Since the shell draws its own bar, disable waybar's `exec-once` if present.

## Toggleable windows

`ags toggle <name>` works for: `launcher`, `quicksettings`, `powermenu`,
`dock`, `bar`, `osd`, `notifications`.

## Tweaks

- Dock pinned apps: `PINNED` in `widget/Dock.tsx`
- Workspace count: `WORKSPACE_COUNT` in `widget/Bar.tsx`
- Power actions: `ACTIONS` in `widget/PowerMenu.tsx`
- All colors: `style/_palette.scss`

## Troubleshooting (first boot)

This config was written against the AGS v3.1 API without a live test
environment, so expect the possibility of small API drift:

- `ags run` prints TS/JSX errors with file:line — most likely suspects are
  property names on Astal service objects. `ags types` regenerates GIR
  typings; the [AGS docs](https://aylur.github.io/ags/) and
  `/usr/share/ags` examples are the reference.
- If a window doesn't toggle, check `ags list` (window must be registered
  with its `name` and `application`).
- Bluetooth toggle shells out to `bluetoothctl`; make sure `bluez` and
  `bluez-utils` are installed and the service is enabled.
- The bar expects Hyprland (AstalHyprland); it won't run under another
  compositor.
