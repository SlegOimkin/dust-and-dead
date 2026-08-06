# Dust & Dead — desktop edition

An Electron shell around the exact same web build the browser and Android
editions ship. It adds no game code: `main.js` opens a window and serves
`../www` — the folder `scripts/sync-android.ps1` produces — so the desktop build
can never drift from the others.

## Building

```
cd desktop
npm install
npx electron-builder --win --publish never
```

Output lands in `../dist-desktop/`:

| File | What it is |
| --- | --- |
| `DustAndDead-Setup-<version>.exe` | NSIS installer: Start-menu and desktop shortcuts, entry in Add/Remove Programs, per-user so it needs no administrator |
| `DustAndDead-<version>-portable.exe` | Single file, runs from anywhere, installs nothing |
| `win-unpacked/` | The unpacked app, useful for debugging a packaging problem |

Run `npm start` to launch straight from source without packaging.

Keep the version in `package.json` in step with `android/app/build.gradle`;
they are separate numbers with no automatic link.

## Two things that are not obvious

**Windows symlink permissions break the first build.** electron-builder
downloads `winCodeSign`, whose archive contains macOS symlinks
(`libcrypto.dylib`, `libssl.dylib`). Extracting them needs privileges an
ordinary account does not have, and the build fails four times over with
`Cannot create symbolic link` — even though nothing is being signed and no
macOS file is ever used on Windows. Either enable Developer Mode, or populate
the cache by hand, skipping the part that cannot be extracted:

```
7za x <cache>\winCodeSign\<downloaded>.7z -o<cache>\winCodeSign\winCodeSign-2.6.0 -xr!darwin -y
```

where `<cache>` is `%LOCALAPPDATA%\electron-builder\Cache`. Delete the numeric
scratch folders next to it afterwards, or the build re-downloads over them.

**The game is served over a private scheme, not `file://`.** A `file://` page
has the opaque origin `null`, which makes `localStorage` unreliable — the game
would silently lose every save — and would send the matchmaking server a literal
`Origin: null`, which its allowlist rejects. `main.js` registers `game://` as a
standard secure scheme and serves `www` through it, so saves are keyed to a
stable origin. The Origin header is then stripped from requests to the game
server, which puts the desktop build on the same admission path the server
already reserves for non-browser clients. Both are verified end to end: the
packaged app connects to the live server from origin `game://app`, which appears
on no allowlist anywhere.

## Signing

The binaries are unsigned, so SmartScreen shows "Windows protected your PC" on
first run until the download builds reputation. Fixing that needs a real code
signing certificate; point `CSC_LINK` and `CSC_KEY_PASSWORD` at one and
electron-builder signs during the same build.
