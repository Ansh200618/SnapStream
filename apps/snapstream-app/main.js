const { app, BrowserWindow, Menu, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');

let mainWindow;
let browserWindow;
let blocker;

async function initializeAdBlocker() {
  try {
    // Initialize the adblocker with EasyList and EasyPrivacy filters (similar to uBlock Origin)
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    
    // Enable blocker on the session
    blocker.enableBlockingInSession(session.defaultSession);
    
    console.log('Ad blocker initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize ad blocker:', error);
    return false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    },
    icon: path.join(__dirname, '../../images/icon_128.png'),
    title: 'SnapStream Desktop'
  });

  mainWindow.loadFile('index.html');

  // Create application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Browser Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow.webContents.send('new-tab');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
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
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
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
          label: 'About SnapStream',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SnapStream Desktop',
              message: 'SnapStream Desktop v1.0.0',
              detail: 'Effortlessly discover, filter, and download images from any website.\n\nBuilt with Electron\nCopyright © 2026 Ansh200618'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle download requests from renderer
ipcMain.handle('download-image', async (event, imageUrl, filename) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
      ]
    });

    if (!canceled && filePath) {
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
});

// Handle multiple image downloads
ipcMain.handle('download-images', async (event, images) => {
  try {
    const { canceled, filePath } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Download Location'
    });

    if (!canceled && filePath) {
      return { success: true, directory: filePath[0] };
    }
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
});

// Get images from webview
ipcMain.handle('get-images-from-page', async (event) => {
  return { success: true };
});

// Toggle ad blocker
ipcMain.handle('toggle-adblocker', async (event, enabled) => {
  try {
    if (blocker) {
      if (enabled) {
        blocker.enableBlockingInSession(session.defaultSession);
      } else {
        blocker.disableBlockingInSession(session.defaultSession);
      }
      return { success: true, enabled };
    }
    return { success: false, error: 'Ad blocker not initialized' };
  } catch (error) {
    console.error('Toggle ad blocker error:', error);
    return { success: false, error: error.message };
  }
});

// Get ad blocker status
ipcMain.handle('get-adblocker-status', async () => {
  return { enabled: blocker ? blocker.isBlockingEnabled(session.defaultSession) : false };
});

app.whenReady().then(async () => {
  // Initialize ad blocker before creating window
  await initializeAdBlocker();
  
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
