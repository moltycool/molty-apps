import electron, { type BrowserWindow as BrowserWindowType, type Tray as TrayType } from "electron";
import electronUpdater from "electron-updater";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = electron;
const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: TrayType | null = null;
let mainWindow: BrowserWindowType | null = null;
const apiBase = app.isPackaged
  ? "https://wakawars.molty.app/wakawars/v0"
  : "http://localhost:3000/wakawars/v0";
let resolveApiBase: ((value: string) => void) | null = null;

const apiBaseReady = new Promise<string>((resolve) => {
  resolveApiBase = resolve;
});

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const createTrayIcon = () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7" fill="black" />
    </svg>
  `;

  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  );
  icon.setTemplateImage(true);
  return icon;
};


const createWindow = () => {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: "#0a0f17",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, "renderer", "index.html");
    mainWindow.loadURL(pathToFileURL(indexPath).toString());
  }

  mainWindow.on("blur", () => {
    if (!mainWindow?.webContents.isDevToolsOpened()) {
      mainWindow?.hide();
    }
  });

  return mainWindow;
};

const positionWindow = () => {
  if (!tray || !mainWindow) return;

  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 6);

  const minX = display.bounds.x + 8;
  const maxX = display.bounds.x + display.bounds.width - windowBounds.width - 8;
  const maxY = display.bounds.y + display.bounds.height - windowBounds.height - 8;

  const clampedX = Math.min(Math.max(x, minX), maxX);
  const clampedY = Math.min(y, maxY);

  mainWindow.setPosition(clampedX, clampedY, false);
};

const toggleWindow = () => {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  positionWindow();
  mainWindow.show();
  mainWindow.focus();
};

const createTray = () => {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("WakaWars");

  tray.on("click", toggleWindow);
  tray.on("right-click", () => {
    const menu = Menu.buildFromTemplate([
      { label: "Open", click: () => toggleWindow() },
      { type: "separator" },
      { role: "quit" }
    ]);
    tray?.popUpContextMenu(menu);
  });
};

const setupAutoUpdates = () => {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.on("error", (error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Auto update error:", error);
  });
  autoUpdater.checkForUpdatesAndNotify();
};

const resolveApiBaseReady = () => {
  resolveApiBase?.(apiBase);
};

ipcMain.handle("get-api-base", () => apiBaseReady);
ipcMain.handle("get-login-item-settings", () => app.getLoginItemSettings());
ipcMain.handle("set-login-item-settings", (_event, openAtLogin: boolean) => {
  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden: true
  });
  return app.getLoginItemSettings();
});

app.whenReady().then(async () => {
  app.setName("WakaWars");
  resolveApiBaseReady();
  createWindow();
  createTray();
  setupAutoUpdates();
  if (process.platform === "darwin") {
    app.dock.hide();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) {
    createWindow();
  }
});
