"use strict";

const { app, BrowserWindow, protocol, net, session, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

// The web build, verbatim. Packaged it lands in resources/game via
// extraResources; running from source it is the same www/ folder the Android
// build is synced from, so the desktop edition can never drift from the others.
const GAME_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "game")
  : path.join(__dirname, "..", "www");

const GAME_SCHEME = "game";
const GAME_ORIGIN = `${GAME_SCHEME}://app`;
const ONLINE_HOST = "dustanddead.duckdns.org";

// A file:// page has the opaque origin "null": localStorage is unreliable on it
// and the matchmaking server would see a literal "null" Origin header. Serving
// the very same files over a private scheme gives the game a stable, secure
// origin, which is what saves and settings are keyed on.
protocol.registerSchemesAsPrivileged([
  {
    scheme: GAME_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const stateFile = path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      width: Math.max(1024, Math.min(7680, Math.round(width))),
      height: Math.max(576, Math.min(4320, Math.round(height))),
      maximized: !!raw.maximized,
      fullScreen: !!raw.fullScreen,
    };
  } catch (error) {
    return null;
  }
}

function writeWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    // Never persist the maximized/fullscreen frame as the restore size, or the
    // window can only ever grow.
    const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(stateFile, JSON.stringify({
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
    }));
  } catch (error) {
    // A read-only profile directory must not stop the game from closing.
  }
}

function serveGameFiles() {
  protocol.handle(GAME_SCHEME, async (request) => {
    let relative;
    try {
      relative = decodeURIComponent(new URL(request.url).pathname);
    } catch (error) {
      return new Response("Bad request", { status: 400 });
    }
    relative = relative.replace(/^[/\\]+/, "");
    if (!relative) relative = "index.html";
    const resolved = path.resolve(GAME_ROOT, relative);
    // Containment check: a crafted game://app/../../ path must not read the
    // rest of the user's disk.
    const rootWithSep = GAME_ROOT.endsWith(path.sep) ? GAME_ROOT : GAME_ROOT + path.sep;
    if (resolved !== GAME_ROOT && !resolved.startsWith(rootWithSep)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

function hardenSession() {
  // The desktop build is a native client, not a browser sitting on a website.
  // Its Origin would be this app's private scheme, which the server's allowlist
  // has never heard of; dropping the header entirely puts it on the same
  // admission path the server already reserves for non-browser clients.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
    let host = "";
    try {
      host = new URL(details.url).hostname;
    } catch (error) {
      host = "";
    }
    if (host !== ONLINE_HOST) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    const headers = {};
    for (const key of Object.keys(details.requestHeaders)) {
      if (key.toLowerCase() === "origin") continue;
      headers[key] = details.requestHeaders[key];
    }
    callback({ requestHeaders: headers });
  });

  // Nothing in this game asks for a camera, a microphone or a location.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false);
  });
}

function createWindow() {
  const saved = readWindowState();
  const win = new BrowserWindow({
    width: saved ? saved.width : 1600,
    height: saved ? saved.height : 900,
    minWidth: 1024,
    minHeight: 576,
    show: false,
    title: "Dust & Dead",
    // The loading frame is dark desert brown rather than the default white, so
    // launching does not flash a white rectangle before the first frame.
    backgroundColor: "#2A0E04",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  // The page sets its own <title>; the window keeps the game's name.
  win.on("page-title-updated", (event) => event.preventDefault());

  if (saved && saved.maximized) win.maximize();
  if (saved && saved.fullScreen) win.setFullScreen(true);

  win.once("ready-to-show", () => win.show());
  win.on("close", () => writeWindowState(win));

  // A game window is not a browser tab: no navigating away, and any real link
  // opens in the user's own browser instead of hijacking the game.
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(GAME_ORIGIN)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // F11 toggles fullscreen. Reload and devtools shortcuts are swallowed in a
  // shipped build — Ctrl+R in the middle of a run would look like a crash.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    if (key === "f11") {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
      return;
    }
    if (!app.isPackaged) return;
    const blocked =
      (input.control || input.meta) && (key === "r" || key === "+" || key === "-" || key === "0");
    if (blocked || key === "f5" || key === "f12") event.preventDefault();
  });

  win.loadURL(`${GAME_ORIGIN}/index.html`);
  return win;
}

// A second launch focuses the running game rather than starting a rival copy
// that would fight it over the same save file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId("com.gigagaystudios.dustanddead");

  let mainWindow = null;

  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    serveGameFiles();
    hardenSession();
    mainWindow = createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
