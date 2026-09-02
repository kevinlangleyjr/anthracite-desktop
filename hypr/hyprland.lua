-- Hyprland config — Slatewave Space
-- Based on the Hyprland 0.56 shipped example, wired for the AGS shell in
-- ~/.config/ags (bar, launcher, quicksettings, powermenu, OSD, dock).
-- Per-machine values (monitors, host env) live in local.lua — see the end.

---------------------
---- MY PROGRAMS ----
---------------------

local terminal    = "kitty"
local fileManager = "nautilus"
local menu        = "ags toggle launcher"


-------------------
---- AUTOSTART ----
-------------------

hl.on("hyprland.start", function()
    hl.exec_cmd("ags run")
    hl.exec_cmd("hyprpaper")
    -- Idle ladder + lock (see hypridle.conf / hyprlock.conf).
    hl.exec_cmd("hypridle")
    -- polkit's *agent* is what draws the authentication dialog; polkitd alone
    -- just answers on D-Bus. Without this, anything asking for privileges
    -- (mounting a disk in Nautilus, say) fails with no prompt at all.
    hl.exec_cmd("/usr/lib/polkit-kde-authentication-agent-1")
    -- Clipboard history. Two watchers: wl-paste only reports one MIME class per
    -- --watch, so text and images each need their own.
    hl.exec_cmd("wl-paste --type text --watch cliphist store")
    hl.exec_cmd("wl-paste --type image --watch cliphist store")
end)


-------------------------------
---- ENVIRONMENT VARIABLES ----
-------------------------------

hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")


-----------------------
---- LOOK AND FEEL ----
-----------------------

hl.config({
    general = {
        gaps_in  = 5,
        gaps_out = 20,

        border_size = 2,

        -- Slatewave: teal→sky gradient on focus, slate line when inactive
        col = {
            active_border   = { colors = {"rgba(5eead4ee)", "rgba(38bdf8ee)"}, angle = 45 },
            inactive_border = "rgba(475569aa)",
        },

        resize_on_border = false,
        allow_tearing = false,

        layout = "dwindle",
    },

    decoration = {
        rounding       = 12, -- match the AGS shell's radii token
        rounding_power = 2,

        active_opacity   = 1.0,
        inactive_opacity = 1.0,

        shadow = {
            enabled      = true,
            range        = 4,
            render_power = 3,
            color        = 0xee1a1a1a,
        },

        blur = {
            enabled   = true,
            size      = 3,
            passes    = 1,
            vibrancy  = 0.1696,
        },
    },

    animations = {
        enabled = true,
    },

    dwindle = {
        preserve_split = true,
    },

    master = {
        new_status = "master",
    },

    misc = {
        -- the AGS shell + hyprpaper own the desktop; kill the default art
        force_default_wallpaper = 0,
        disable_hyprland_logo   = true,
    },
})


---------------
---- INPUT ----
---------------

hl.config({
    input = {
        kb_layout = "us",

        follow_mouse = 1,
        sensitivity = 0,

        touchpad = {
            natural_scroll = false,
        },
    },
})

hl.gesture({
    fingers = 3,
    direction = "horizontal",
    action = "workspace",
})


---------------------
---- KEYBINDINGS ----
---------------------

local mainMod = "SUPER"

hl.bind(mainMod .. " + Q", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + C", hl.dsp.window.close())
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(fileManager))
hl.bind(mainMod .. " + V", hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + P", hl.dsp.window.pseudo())
hl.bind(mainMod .. " + J", hl.dsp.layout("togglesplit"))
-- Maximize, not true fullscreen: mode 1 fills the monitor minus reserved
-- space and stays below the top layer, so the AGS bar and dock keep drawing.
hl.bind(mainMod .. " + F", hl.dsp.window.fullscreen({ mode = 1 }))

-- Alt+Tab window switching, drawn by the AGS "switcher" overlay. AGS owns the
-- list and the selection; these binds only nudge it. Nothing is focused until
-- Alt comes back up, so the list can't reorder underneath the walk — which is
-- what made cycling over Hyprland's own window list ping-pong.
local switching = false

local function switcher(action)
    hl.exec_cmd("ags request 'switcher " .. action .. "'")
end

hl.bind("ALT + Tab",         function() switching = true; switcher("next") end)
hl.bind("ALT + SHIFT + Tab", function() switching = true; switcher("prev") end)

-- Commit when Alt comes back up. Release *binds* never fire in 0.56 — a
-- release bind on Alt_L logged nothing across a whole session of Alt+Tab
-- presses, while the raw key events for those same presses came through
-- fine — so watch the key stream instead. Keycodes are XKB (evdev + 8):
-- 64 = Alt_L, 108 = Alt_R; state 0 is a release. The `switching` guard keeps
-- this from spawning a request on every unrelated Alt release.
hl.on("input.keyboard.key", function(keycode, _timestamp, state)
    if switching and state == 0 and (keycode == 64 or keycode == 108) then
        switching = false
        switcher("commit")
    end
end)

-- AGS shell windows (SUPER+M replaces the example's raw exit — the
-- powermenu's Log Out does the same via confirmation)
hl.bind(mainMod .. " + A", hl.dsp.exec_cmd("ags toggle quicksettings"))
hl.bind(mainMod .. " + M", hl.dsp.exec_cmd("ags toggle powermenu"))
hl.bind(mainMod .. " + L", hl.dsp.exec_cmd("loginctl lock-session"))

-- Move focus with mainMod + arrow keys
hl.bind(mainMod .. " + left",  hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + right", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + up",    hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + down",  hl.dsp.focus({ direction = "down" }))

-- Move windows with mainMod + SHIFT + arrows (swaps tiled, nudges floating)
hl.bind(mainMod .. " + SHIFT + left",  hl.dsp.window.move({ direction = "left" }))
hl.bind(mainMod .. " + SHIFT + right", hl.dsp.window.move({ direction = "right" }))
hl.bind(mainMod .. " + SHIFT + up",    hl.dsp.window.move({ direction = "up" }))
hl.bind(mainMod .. " + SHIFT + down",  hl.dsp.window.move({ direction = "down" }))

-- Resize windows with mainMod + CTRL + arrows (split ratio tiled, size floating)
hl.bind(mainMod .. " + CTRL + right", hl.dsp.window.resize({ x =  40, y =   0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + left",  hl.dsp.window.resize({ x = -40, y =   0, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + down",  hl.dsp.window.resize({ x =   0, y =  40, relative = true }), { repeating = true })
hl.bind(mainMod .. " + CTRL + up",    hl.dsp.window.resize({ x =   0, y = -40, relative = true }), { repeating = true })

-- Workspaces: mainMod + [0-9] to switch, + SHIFT to move the window
for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key,         hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
end

-- Scratchpad
hl.bind(mainMod .. " + S",         hl.dsp.workspace.toggle_special("magic"))
hl.bind(mainMod .. " + SHIFT + S", hl.dsp.window.move({ workspace = "special:magic" }))

-- Scroll through workspaces with mainMod + scroll
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "e+1" }))
hl.bind(mainMod .. " + mouse_up",   hl.dsp.focus({ workspace = "e-1" }))

-- Move/resize windows with mainMod + LMB/RMB drag
hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Screenshots. screenshot.sh saves to ~/Pictures/Screenshots, copies to the
-- clipboard, and notifies; region mode exits quietly if the selection is
-- cancelled. Built from os.getenv so the path does not depend on exec_cmd
-- running through a shell that would expand ~.
local screenshot = (os.getenv("HOME") or "") .. "/.config/hypr/screenshot.sh"

hl.bind("Print",         hl.dsp.exec_cmd(screenshot .. " screen"))
hl.bind("SHIFT + Print", hl.dsp.exec_cmd(screenshot .. " region"))
hl.bind("ALT + Print",   hl.dsp.exec_cmd(screenshot .. " window"))
hl.bind("CTRL + Print",  hl.dsp.exec_cmd(screenshot .. " annotate"))

-- Clipboard history picker, colour picker, and screen recording. The two
-- scripts live beside this config; hyprpicker needs no wrapper since -a copies
-- and -n notifies on its own.
local home = os.getenv("HOME") or ""

hl.bind(mainMod .. " + SHIFT + V", hl.dsp.exec_cmd(home .. "/.config/hypr/clipboard.sh"))
hl.bind(mainMod .. " + SHIFT + C", hl.dsp.exec_cmd("hyprpicker -a -n -f hex"))

hl.bind(mainMod .. " + SHIFT + R",        hl.dsp.exec_cmd(home .. "/.config/hypr/record.sh screen"))
hl.bind(mainMod .. " + CTRL + SHIFT + R", hl.dsp.exec_cmd(home .. "/.config/hypr/record.sh region"))

-- Laptop multimedia keys (the AGS OSD reacts to these via wireplumber)
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"),      { locked = true, repeating = true })
hl.bind("XF86AudioMute",        hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"),     { locked = true, repeating = true })
hl.bind("XF86AudioMicMute",     hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle"),   { locked = true, repeating = true })
hl.bind("XF86MonBrightnessUp",  hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%+"),                  { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown",hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%-"),                  { locked = true, repeating = true })

-- Media control (requires playerctl)
hl.bind("XF86AudioNext",  hl.dsp.exec_cmd("playerctl next"),       { locked = true })
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPlay",  hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPrev",  hl.dsp.exec_cmd("playerctl previous"),   { locked = true })


--------------------------------
---- WINDOWS AND WORKSPACES ----
--------------------------------

hl.window_rule({
    name  = "suppress-maximize-events",
    match = { class = ".*" },
    suppress_event = "maximize",
})

-- Everything floats. Hyprland renders tiled windows in a pass below floating
-- ones, so a tiled window can never be raised above a floating neighbour — the
-- switcher would move focus to it correctly and still leave it buried. With a
-- single z-order stack the raise-on-focus hook below always works. SUPER+V
-- still toggles an individual window back to tiled.
hl.window_rule({
    name  = "float-by-default",
    match = { class = ".*" },
    float = true,
})

hl.window_rule({
    name  = "float-file-dialogs",
    match = { title = "^(Open File|Open Files|Save File|Save Files|File Upload|Select a File)" },
    float = true,
})

-- Always-float pattern for specific apps, e.g.:
-- hl.window_rule({ name = "float-pavucontrol", match = { class = "org.pulseaudio.pavucontrol" }, float = true })

hl.window_rule({
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})


-- Focused floating windows come to the front. Floats already render above
-- tiled windows, but among themselves Hyprland only reshuffles the stack on
-- click — focusing one by keybind or follow_mouse leaves it buried.
hl.on("window.active", function()
    local w = hl.get_active_window()
    if not w then return end

    -- A maximized or fullscreen window renders above its neighbours, so
    -- focusing something underneath it hands over the keyboard while leaving
    -- the window buried. misc:on_focus_under_fullscreen already handles this,
    -- but only for *tiled* windows — everything here floats, so drop the other
    -- window out of fullscreen ourselves. Guarded on w.fullscreen == 0 so
    -- focusing the fullscreen window itself doesn't cancel it.
    local ws = w.workspace
    if ws and w.fullscreen == 0 then
        local top = ws.fullscreen_window
        if top and top.address ~= w.address then
            hl.dispatch(hl.dsp.window.fullscreen_state({
                internal = 0,
                client   = 0,
                window   = "address:" .. top.address,
            }))
        end
    end

    if w.floating then
        hl.dispatch(hl.dsp.window.bring_to_top())
    end
end)


---------------------
---- PER-MACHINE ----
---------------------

-- local.lua is seeded from local.lua.example by install.sh and gitignored;
-- monitors and host-specific env go there. pcall keeps a missing file
-- from breaking the session.
pcall(require, "local")
