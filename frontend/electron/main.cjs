const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
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
  if (!backendProcess) return;
  console.log('[*] Encerrando processo do Backend (PID:', backendProcess.pid, ')...');

  if (process.platform === 'win32') {
    exec(`taskkill /F /T /PID ${backendProcess.pid}`, (err) => {
      if (err) console.error('[!] Erro ao executar taskkill:', err.message);
    });
  } else {
    backendProcess.kill('SIGTERM');
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
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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

app.on('window-all-closed', () => {
  killBackendProcess();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
