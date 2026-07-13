const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const http = require('http');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 8000;
const BACKEND_HOST = '127.0.0.1';

function getBackendBinaryPath() {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'rathena-sde-backend.exe' : 'rathena-sde-backend';

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', binName);
  } else {
    return path.join(__dirname, '..', '..', 'backend', 'dist', binName);
  }
}

function killBackendProcess() {
  console.log('[*] Encerrando processos do Backend...');

  if (backendProcess && backendProcess.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${backendProcess.pid}`, { stdio: 'ignore' });
      } else {
        backendProcess.kill('SIGKILL');
      }
    } catch (err) {
      // Processo já encerrado
    }
  }

  // Fallback para evitar processos zumbis na porta 8000 (Errno 10048)
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM "rathena-sde-backend.exe"', { stdio: 'ignore' });
    } else {
      execSync('pkill -f rathena-sde-backend', { stdio: 'ignore' });
    }
  } catch (err) {
    // Nenhum processo remanescente encontrado
  }

  backendProcess = null;
}

function waitForBackendReady(maxRetries = 50, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      retries++;
      const req = http.get(`http://${BACKEND_HOST}:${BACKEND_PORT}/api/status`, (res) => {
        if (res.statusCode === 200) {
          console.log('[+] Backend respondendo com sucesso na porta', BACKEND_PORT);
          resolve(true);
        } else {
          retryOrReject();
        }
      });

      req.on('error', () => retryOrReject());
      req.end();
    };

    const retryOrReject = () => {
      if (retries >= maxRetries) {
        reject(new Error('Tempo limite esgotado aguardando inicialização do Backend.'));
      } else {
        setTimeout(check, intervalMs);
      }
    };

    check();
  });
}

function startBackendServer() {
  // Limpa processos zumbis anteriores antes de iniciar novo servidor na porta 8000
  killBackendProcess();

  const binaryPath = getBackendBinaryPath();
  const fs = require('fs');

  if (!fs.existsSync(binaryPath)) {
    console.warn(`[!] Binário do Backend não encontrado em: ${binaryPath}`);
    console.warn('[!] O app assumirá que o servidor Backend já está rodando externamente na porta 8000.');
    return;
  }

  console.log(`[*] Iniciando Backend em background: ${binaryPath}`);
  backendProcess = spawn(binaryPath, ['--host', BACKEND_HOST, '--port', String(BACKEND_PORT)], {
    stdio: 'pipe',
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend STDOUT] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend STDERR] ${data.toString().trim()}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`[*] Processo Backend encerrado com código ${code}`);
    backendProcess = null;
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'rAthena Web Editor — Desktop Edition',
    icon: path.join(__dirname, '..', 'favicon.png'),
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  ipcMain.removeHandler('dialog:openDirectory');
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.removeHandler('dialog:openFile');
  ipcMain.handle('dialog:openFile', async (event, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || []
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  const fs = require('fs');
  const distHtmlPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (app.isPackaged || (!process.env.VITE_DEV_SERVER_URL && fs.existsSync(distHtmlPath))) {
    await mainWindow.loadFile(distHtmlPath);
  } else {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startBackendServer();

  try {
    await waitForBackendReady();
  } catch (err) {
    console.error('[!] Erro ao aguardar backend:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  killBackendProcess();
});

app.on('will-quit', () => {
  killBackendProcess();
});

app.on('window-all-closed', () => {
  killBackendProcess();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
