# Anthracite — AGS desktop shell

The macOS-shaped shell for [Anthracite](../../README.md), built on AGS v3 /
Astal / GTK4: menu bar, dock, Spotlight, Control Center,  menu, window
switcher, notification cards, volume OSD and a system stats readout.

Colours are Apple's dark-appearance system palette, in
[`style/_palette.scss`](style/_palette.scss). Every other partial consumes those
tokens, so recolouring the whole shell is that one file and nothing else.

## Install (Arch)

```sh
paru -S aylurs-gtk-shell-git libastal-meta dart-sass \
        apple-fonts ttf-jetbrains-mono-nerd brightnessctl
```

- `aylurs-gtk-shell-git` — the `ags` CLI and runtime (v3+)
- `libastal-meta` — the Astal service libraries every widget imports from
  (hyprland, battery, network, bluetooth, wireplumber, mpris, notifd, tray, apps)
- `dart-sass` — compiles `style.scss` at launch, so the shell starts unstyled
  without it
- `apple-fonts` — SF Pro Text, the UI face, and the SF glyph U+F8FF the  menu
  needs; no Nerd Font has it
- Nerd Font — the stats and dock glyphs
- `brightnessctl` — the Display slider in Control Center

The parent installer symlinks this directory to `~/.config/ags`, so:

```sh
ags run            # start the shell
ags quit           # stop it
ags bundle app.tsx /tmp/out   # typecheck without touching a running instance
ags types -u       # regenerate @girs types after an AGS upgrade
```

`ags bundle` is the only way to check a change compiles without restarting the
running shell — useful when the desktop you are editing is the one you are
using.

## Hyprland wiring

Autostart and binds live in [`../hypr/hyprland.lua`](../hypr/hyprland.lua):

```lua
hl.on("hyprland.start", function() hl.exec_cmd("ags run") end)

hl.bind(mainMod .. " + R", hl.dsp.exec_cmd("ags toggle launcher"))
hl.bind(mainMod .. " + A", hl.dsp.exec_cmd("ags toggle quicksettings"))
hl.bind(mainMod .. " + M", hl.dsp.exec_cmd("ags toggle powermenu"))
```

Every surface here is translucent and depends on the compositor blurring behind
it. `hyprland.lua` carries a `hl.layer_rule` per namespace; without them the
alpha reads as flat grey and you can see straight through the menu bar. The
`ignore_alpha` threshold matters as much as `blur` — the launcher is a
fullscreen layer with a transparent background, so blurring it unconditionally
frosts the entire desktop instead of the panel drawn on it.

## Toggleable windows

`ags toggle <name>` works for: `launcher`, `quicksettings`, `powermenu`,
`dock`, `bar`, `osd`, `notifications`.

## Tweaks

- Dock pins: `PINNED` in `widget/Dock.tsx` — desktop entry ids, not display
  names, since fuzzy-matching "files" or "brave" is ambiguous
- Dock magnification: `MAGNIFY` and the falloff radius in `widget/Dock.tsx`
- Workspace count: `WORKSPACE_COUNT` in `widget/Bar.tsx`
- Power actions: `ACTIONS` in `widget/PowerMenu.tsx`
- Stats poll rates: constants at the top of `widget/SystemStats.tsx`
- OSD segment count: `SEGMENTS` in `widget/OSD.tsx`

## Notes

- **The switcher orders by recency, not creation.** That is what makes
  press-and-release toggle between the last two windows. It also has to
  normalise addresses: hyprctl reports them bare, AstalHyprland includes the
  `0x` prefix, and unmatched addresses silently fall back to creation order.
- **GTK4 CSS has no `max-height`** and does not animate `pixelSize`. The dock's
  magnification is driven by a tick callback rather than a transition.
- **The  glyph is U+F8FF**, an Apple private-use codepoint present only in the
  SF faces, so it must not inherit the Nerd Font stack.

## Troubleshooting

- `ags run` in a terminal prints the TS/JSX errors the autostart swallows.
- If a window will not toggle, check `ags list` — it must be registered with
  its `name`.
- The bar expects Hyprland via AstalHyprland; it will not run under another
  compositor.
