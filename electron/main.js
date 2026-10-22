const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

// ------------------------------------------------------------------------------
// APPLICATION CONFIGURATION
// ------------------------------------------------------------------------------
const APP_NAME = 'MetaCRM';
const APP_VERSION = '2.0.0';
const DEFAULT_BACKEND_URL = 'https://crm-beta-three-36.vercel.app';
const UPDATE_FEED_URL = 'https://api.github.com/repos/jibanxd2007/crm/releases/latest';

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--debug');

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Windows App User Model ID for native taskbar grouping & notifications
if (process.platform === 'win32') {
  app.setAppUserModelId('nz.co.novaautos.metacrm');
}

// ------------------------------------------------------------------------------
// TOKEN & CREDENTIAL SECURE STORAGE (Windows DPAPI safeStorage)
// ------------------------------------------------------------------------------
const SECURE_STORE_PATH = path.join(app.getPath('userData'), 'secure_auth.dat');

function saveEncryptedToken(token) {
  try {
    if (!token) {
      if (fs.existsSync(SECURE_STORE_PATH)) fs.unlinkSync(SECURE_STORE_PATH);
      return true;
    }
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      fs.writeFileSync(SECURE_STORE_PATH, encrypted);
      return true;
    } else {
      // Fallback machine-keyed encryption if DPAPI unavailable
      const key = crypto.createHash('sha256').update(app.getPath('userData')).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const payload = Buffer.concat([iv, tag, enc]);
      fs.writeFileSync(SECURE_STORE_PATH, payload);
      return true;
    }
  } catch (err) {
    console.error('[SecureStorage Error]:', err.message);
    return false;
  }
}

function loadEncryptedToken() {
  try {
    if (!fs.existsSync(SECURE_STORE_PATH)) return null;
    const data = fs.readFileSync(SECURE_STORE_PATH);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(data);
    } else {
      const key = crypto.createHash('sha256').update(app.getPath('userData')).digest();
      const iv = data.subarray(0, 16);
      const tag = data.subarray(16, 32);
      const enc = data.subarray(32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    }
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------------------------
// MAIN APPLICATION WINDOW
// ------------------------------------------------------------------------------
function createMainWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngIconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    title: 'MetaCRM — Nova Autos',
    width: 1366,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    icon: fs.existsSync(iconPath) ? iconPath : (fs.existsSync(pngIconPath) ? pngIconPath : undefined),
    backgroundColor: '#0F1113',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev
    }
  });

  // Native Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://crm-beta-three-36.vercel.app https://fonts.googleapis.com https://fonts.gstatic.com data: blob:;"
        ]
      }
    });
  });

  // Prevent Navigation to Untrusted Third-Party Domains
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:' || parsed.host.includes('vercel.app')) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });

  // Open all new-window targets in external system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Smooth Reveal after DOM content ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Determine App Root File
  const appHtmlPath = path.join(__dirname, '../public/index.html');
  const fallbackHtmlPath = path.join(__dirname, '../index.html');
  const targetHtml = fs.existsSync(appHtmlPath) ? appHtmlPath : fallbackHtmlPath;

  mainWindow.loadFile(targetHtml);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupNativeMenu();
}

// ------------------------------------------------------------------------------
// NATIVE APPLICATION MENU
// ------------------------------------------------------------------------------
function setupNativeMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForAppUpdates(true)
        },
        {
          label: 'Reload Application',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload()
        },
        { type: 'separator' },
        {
          label: 'Sign Out & Clear Session',
          click: () => {
            saveEncryptedToken(null);
            mainWindow?.webContents.send('auth:logout-requested');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit MetaCRM',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Online Portal',
          click: () => shell.openExternal(DEFAULT_BACKEND_URL)
        },
        {
          label: 'Download Web Page',
          click: () => shell.openExternal(`${DEFAULT_BACKEND_URL}/download.html`)
        },
        { type: 'separator' },
        {
          label: `About ${APP_NAME}`,
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: `${APP_NAME} Desktop Edition\nVersion ${APP_VERSION}`,
              detail: 'Nova Autos Centralized Lead & Messaging CRM.\nConnected to production cloud infrastructure.\nCopyright © 2026 Nova Autos.'
            });
          }
        }
      ]
    }
  ];

  if (isDev) {
    template[2].submenu.push({ type: 'separator' }, { role: 'toggleDevTools' });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ------------------------------------------------------------------------------
// IPC HANDLERS (Preload Interface)
// ------------------------------------------------------------------------------
ipcMain.handle('app:get-info', () => {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    platform: process.platform,
    arch: process.arch,
    backendUrl: DEFAULT_BACKEND_URL
  };
});

ipcMain.handle('auth:store-token', (_event, token) => {
  return saveEncryptedToken(token);
});

ipcMain.handle('auth:get-token', () => {
  return loadEncryptedToken();
});

ipcMain.handle('auth:clear-token', () => {
  return saveEncryptedToken(null);
});

ipcMain.handle('notify:show', (_event, payload = {}) => {
  if (Notification.isSupported()) {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const notif = new Notification({
      title: payload.title || APP_NAME,
      body: payload.body || '',
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      silent: Boolean(payload.silent)
    });
    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    notif.show();
    return true;
  }
  return false;
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() || false);

ipcMain.handle('shell:open-external', (_event, url) => {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      shell.openExternal(url);
      return true;
    }
  } catch (e) {}
  return false;
});

ipcMain.handle('net:check-connection', async (_event, customUrl) => {
  const target = customUrl || `${DEFAULT_BACKEND_URL}/api/staff?action=session`;
  return new Promise((resolve) => {
    try {
      const parsed = new URL(target);
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          timeout: 5000
        },
        (res) => {
          resolve({ online: true, statusCode: res.statusCode });
        }
      );
      req.on('error', (err) => resolve({ online: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ online: false, error: 'Connection timed out' });
      });
      req.end();
    } catch (err) {
      resolve({ online: false, error: err.message });
    }
  });
});

ipcMain.handle('update:check', () => {
  checkForAppUpdates(false);
});

// ------------------------------------------------------------------------------
// AUTOMATIC UPDATE NOTIFICATION
// ------------------------------------------------------------------------------
function checkForAppUpdates(userTriggered = false) {
  const req = https.request(
    UPDATE_FEED_URL,
    {
      headers: { 'User-Agent': `MetaCRM-Desktop/${APP_VERSION}` },
      timeout: 6000
    },
    (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const release = JSON.parse(data);
            const latestTag = (release.tag_name || '').replace(/^v/, '');
            if (latestTag && latestTag !== APP_VERSION) {
              mainWindow?.webContents.send('update:status', {
                available: true,
                currentVersion: APP_VERSION,
                latestVersion: latestTag,
                downloadUrl: release.html_url
              });
              if (userTriggered) {
                const { dialog } = require('electron');
                dialog
                  .showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Update Available',
                    message: `A new version of MetaCRM is available (${latestTag}).`,
                    detail: 'Would you like to open the release download page?',
                    buttons: ['Open Download Page', 'Later'],
                    defaultId: 0
                  })
                  .then(({ response }) => {
                    if (response === 0 && release.html_url) {
                      shell.openExternal(release.html_url);
                    }
                  });
              }
              return;
            }
          }
          if (userTriggered) {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Up to Date',
              message: `You are running the latest version of MetaCRM (${APP_VERSION}).`
            });
          }
        } catch (e) {}
      });
    }
  );
  req.on('error', () => {
    if (userTriggered) {
      const { dialog } = require('electron');
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Check Failed',
        message: 'Could not connect to update server. Please check your internet connection.'
      });
    }
  });
  req.end();
}

// ------------------------------------------------------------------------------
// APP LIFECYCLE
// ------------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
