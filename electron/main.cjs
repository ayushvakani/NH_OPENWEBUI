const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let backendProcess;
let currentBackendPort = 8000;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/icon.icns'),
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3001');
  } else {
    // In packaged apps, load the built frontend from extraResources
    const indexPath = path.join(process.resourcesPath, 'dist', 'index.html');
    console.log('Loading frontend from:', indexPath);
    console.log('Resources path:', process.resourcesPath);
    console.log('App path:', app.getAppPath());
    console.log('File exists check:', require('fs').existsSync(indexPath));
    
    // Verify the file exists before trying to load it
    if (!require('fs').existsSync(indexPath)) {
      console.error('Frontend index.html not found at:', indexPath);
      // Try alternative path - check if it's in the app.asar
      const altIndexPath = path.join(__dirname, '..', 'Resources', 'dist', 'index.html');
      console.log('Trying alternative path:', altIndexPath);
      
      if (require('fs').existsSync(altIndexPath)) {
        console.log('Using alternative path for frontend');
        mainWindow.loadFile(altIndexPath);
      } else {
        console.error('Neither path contains index.html. Frontend loading will fail.');
        // Still try to load the original path to see what happens
        mainWindow.loadFile(indexPath);
      }
    } else {
      mainWindow.loadFile(indexPath);
    }
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on the window
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle SPA routing - redirect all navigation to index.html for React Router
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      console.log('Navigation attempt:', navigationUrl);
      
      // Allow external URLs and dev server URLs
      if (navigationUrl.includes('http') || 
          navigationUrl.includes('localhost') || 
          navigationUrl.includes('127.0.0.1')) {
        return;
      }
      
      // Only handle file:// URLs for SPA routing
      if (navigationUrl.startsWith('file://')) {
        const url = new URL(navigationUrl);
        
        // Allow root and index.html, prevent other routes
        if (url.pathname !== '/' && url.pathname !== '/index.html') {
          event.preventDefault();
          console.log('Redirecting SPA route to index.html:', url.pathname);
          
          // Use a simple redirect approach to avoid memory issues
          try {
            // Preserve the hash fragment for React Router HashRouter
            const targetUrl = `file://${path.join(process.resourcesPath, 'dist', 'index.html')}${url.hash}`;
            mainWindow.loadURL(targetUrl);
          } catch (error) {
            console.error('Error redirecting to index.html:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error in will-navigate handler:', error);
      // Don't prevent navigation on errors to avoid crashes
    }
  });

  // Handle window open attempts
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      console.log('Window open attempt:', url);
      
      // Allow external URLs
      if (url.includes('http') || url.includes('mailto:')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      
      // Prevent new windows for SPA routes, but don't crash
      if (url.startsWith('file://')) {
        const parsedUrl = new URL(url);
        
        // If it's not the root or index.html, deny and let main window handle it
        if (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '/index.html') {
          console.log('Denying new window for SPA route:', parsedUrl.pathname);
          return { action: 'deny' };
        }
      }
      
      // Default behavior
      return { action: 'allow' };
    } catch (error) {
      console.error('Error in setWindowOpenHandler:', error);
      return { action: 'allow' };
    }
  });
}

// Find Python executable - check common macOS locations
function findPythonPath() {
  const possiblePaths = [
    '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    'python3'
  ];
  
  const fs = require('fs');
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (e) {
      // Continue to next path
    }
  }
  
  return 'python3'; // Fallback to PATH lookup
}

// Check if backend is ready by polling the health endpoint
async function waitForBackend(port, maxAttempts = 30, interval = 200) {
  const http = require('http');
  
  console.log(`⏳ Waiting for backend to be ready on port ${port}...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            reject(new Error('Backend not ready'));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });
      
      console.log(`✅ Backend is ready on port ${port} (attempt ${attempt + 1}/${maxAttempts})`);
      return true;
    } catch (error) {
      // Backend not ready yet, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }
  
  console.error('⚠️ Backend failed to start within timeout');
  return false;
}

async function startBackend() {
  console.log('🚀 Starting Python backend...');
  
  // Use full path to Python to avoid PATH issues in app bundle
  const pythonPath = findPythonPath();
  console.log('Using Python at:', pythonPath);
  
  // Use app.getAppPath() for packaged apps, __dirname for development
  const backendDir = app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, '../backend');
  const backendScript = path.join(backendDir, 'main.py');
  
  // For packaged apps, copy frontend dist to backend location so backend can serve it
  if (app.isPackaged) {
    const frontendDistTarget = path.join(backendDir, 'dist');
    
    if (!require('fs').existsSync(frontendDistTarget)) {
      console.log('Setting up frontend dist for backend...');
      try {
        // Copy the entire dist directory to backend location
        const sourceDistPath = path.join(process.resourcesPath, 'dist');
        if (require('fs').existsSync(sourceDistPath)) {
          require('fs').cpSync(sourceDistPath, frontendDistTarget, { recursive: true });
          console.log('Frontend dist copied to backend successfully');
        } else {
          console.log('Warning: Frontend dist not found in resources');
        }
      } catch (error) {
        console.log('Error copying frontend dist:', error.message);
      }
    }
  }
  
  console.log('Backend path:', backendScript);
  console.log('Backend dir:', backendDir);
  
  // Find available port to avoid conflicts
  const net = require('net');
  function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(startPort, (err) => {
        if (err) reject(err);
        else {
          const port = server.address().port;
          server.close(() => resolve(port));
        }
      });
      server.on('error', () => resolve(findAvailablePort(startPort + 1)));
    });
  }
  
  try {
    // Get available port and start backend
    const availablePort = await findAvailablePort(8000);
    console.log(`📡 Using port ${availablePort} for backend`);
    
    // Update the global port for frontend to use
    currentBackendPort = availablePort;
    
    backendProcess = spawn(pythonPath, [backendScript], {
      cwd: backendDir,
      env: { ...process.env, DESKTOP_MODE: '1', PORT: availablePort.toString() },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    backendProcess.stdout.on('data', (data) => {
      console.log('Backend:', data.toString());
    });

    backendProcess.stderr.on('data', (data) => {
      console.error('Backend Error:', data.toString());
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });
    
    // Wait for backend to be ready before continuing
    const isReady = await waitForBackend(availablePort);
    if (!isReady) {
      console.error('❌ Backend failed to start properly');
      // Show error dialog to user
      if (mainWindow) {
        dialog.showErrorBox('Backend Error', 'Failed to start the backend server. The application may not work correctly. Please try restarting.');
      }
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to start backend:', error);
    return false;
  }
}

function stopBackend() {
  if (backendProcess) {
    console.log('🛑 Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

function createMenu() {
  const template = [
    {
      label: 'NemhemAI',
      submenu: [
        {
          label: 'About NemhemAI',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About NemhemAI',
              message: 'NemhemAI',
              detail: 'AI Chat Assistant for Desktop\n\nBuilt with Electron and React'
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            // Open preferences window
            const prefsWindow = new BrowserWindow({
              width: 600,
              height: 400,
              parent: mainWindow,
              modal: true,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.cjs')
              }
            });
            prefsWindow.loadURL(`http://localhost:${currentBackendPort}#/preferences`);
          }
        },
        { type: 'separator' },
        {
          label: 'Hide NemhemAI',
          accelerator: 'CmdOrCtrl+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'CmdOrCtrl+Alt+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            BrowserWindow.getFocusedWindow().reload();
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            BrowserWindow.getFocusedWindow().reloadIgnoringCache();
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            BrowserWindow.getFocusedWindow().toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            BrowserWindow.getFocusedWindow().webContents.setZoomLevel(0);
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = BrowserWindow.getFocusedWindow().webContents.getZoomLevel();
            BrowserWindow.getFocusedWindow().webContents.setZoomLevel(currentZoom + 0.5);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = BrowserWindow.getFocusedWindow().webContents.getZoomLevel();
            BrowserWindow.getFocusedWindow().webContents.setZoomLevel(currentZoom - 0.5);
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            BrowserWindow.getFocusedWindow().setFullScreen(!BrowserWindow.getFocusedWindow().isFullScreen());
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'NemhemAI Website',
          click: () => {
            shell.openExternal('https://github.com/yourusername/nemhemai');
          }
        },
        {
          label: 'Report Issues',
          click: () => {
            shell.openExternal('https://github.com/yourusername/nemhemai/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ==================== AUTO-UPDATE CONFIGURATION ====================
// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

function checkForUpdates() {
  if (isDev) {
    console.log('Skipping update check in development mode');
    return;
  }

  console.log('Checking for updates...');
  autoUpdater.checkForUpdates();
}

// Auto-updater event listeners
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', 'checking');
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  
  if (mainWindow) {
    mainWindow.webContents.send('update-status', 'available', info);
    
    // Show dialog to user
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        // User clicked "Download"
        autoUpdater.downloadUpdate();
        
        // Show progress notification
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Downloading Update',
          message: 'The update is downloading in the background.',
          detail: 'You will be notified when it\'s ready to install.',
          buttons: ['OK']
        });
      }
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('No updates available');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', 'not-available');
  }
});

autoUpdater.on('error', (err) => {
  console.error('Error in auto-updater:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', 'error', err.message);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
  logMessage += ` - Downloaded ${progressObj.percent}%`;
  logMessage += ` (${progressObj.transferred}/${progressObj.total})`;
  console.log(logMessage);
  
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  
  if (mainWindow) {
    mainWindow.webContents.send('update-status', 'downloaded', info);
    
    // Show dialog to install now or later
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update has been downloaded.',
      detail: 'The application will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        // User clicked "Restart Now"
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }
});

// IPC handler for manual update check
ipcMain.handle('check-for-updates', () => {
  if (!isDev) {
    checkForUpdates();
    return { success: true };
  }
  return { success: false, message: 'Updates not available in development mode' };
});

// ==================== END AUTO-UPDATE CONFIGURATION ====================

// App event handlers
app.whenReady().then(async () => {
  createWindow();
  createMenu();
  
  if (!isDev) {
    // Wait for backend to be ready before showing window
    await startBackend();
    // Check for updates in production
    checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', async () => {
  if (isDev) {
    await startBackend();
  }
});

// IPC handlers
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});
