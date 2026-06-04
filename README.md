# Dust and Dead

A small top-down western shooter with blocky 3D graphics. You play as a cowboy holding off zombie waves in a desert town.

## Features

- Revolver, Winchester, and grenade launcher with separate ammo pools.
- Finite ammo with reloads and arcade-style cartridge HUD animations.
- Ammo crates spawn during combat and refill only weapons you already own.
- Touch controls and forced landscape-friendly layout for mobile.

## Run

Open `index.html` in a browser. The game is fully static and does not need a local server.

For Android debug APK packaging notes, see `APK_BUILD.md`.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Left mouse button: shoot
- `1`, `2`, `3`: switch weapons
- `F`: fullscreen
- `R`: restart after death

Touch controls are enabled on mobile devices. The game is designed for landscape orientation.

## Notes

The repository contains only the browser game source and the vendored Three.js build needed for offline-friendly `file://` launch. APK files, Android build output, local toolchains, screenshots, and other generated artifacts are intentionally excluded.
