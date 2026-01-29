import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'Морской Сапёр',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  const isDev = !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist-web/index.html'));
  }

  // Показываем окно когда готово
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Открываем DevTools в режиме разработки
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Когда Electron готов
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Закрытие приложения
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC обработчики для связи с renderer
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
