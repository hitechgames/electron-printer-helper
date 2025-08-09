const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const express = require('express');
const forge = require('node-forge');

let mainWindow;
let tray;
let jobs = [];
let jobSeq = 1;
let quitting = false;

function getIconPath() {
  const fs = require('fs');
  const localIconPath = path.join(__dirname, 'assets/icons/print.png');
  if (fs.existsSync(localIconPath)) return localIconPath;
  const projectIconPath = path.join(__dirname, '../storage/app/public/images/print.png');
  if (fs.existsSync(projectIconPath)) return projectIconPath;
  return null;
}

function createWindow() {
  const iconPath = getIconPath();
  mainWindow = new BrowserWindow({
    width: 600,
    height: 520,
    show: false, // avvio minimizzato
    autoHideMenuBar: true,
    // Su Win/Linux questa icona imposta taskbar/window icon
    icon: iconPath || undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Mostra solo su richiesta (tray)
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const fs = require('fs');
    const isMac = process.platform === 'darwin';

    // Icona locale del progetto Electron (inclusa nella build)
    const localIconPath = path.join(__dirname, 'assets/icons/print.png');
    let icon;
    if (fs.existsSync(localIconPath)) {
      icon = nativeImage.createFromPath(localIconPath);
    }

    // Fallback al vecchio percorso nel progetto Laravel se necessario
    if (!icon || icon.isEmpty()) {
      const projectIconPath = path.join(__dirname, '../storage/app/public/images/print.png');
      if (fs.existsSync(projectIconPath)) {
        icon = nativeImage.createFromPath(projectIconPath);
      }
    }

    // Fallback finale a base64
    if (!icon || icon.isEmpty()) {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAOUlEQVQ4T2NkoBAwUqifYbCxYcQwQwMDw4iJiSEwMDAgkE0wGkYgJgYGBkZGQqC0EwQG4yQJgJAAAszQkq1z6j9wAAAABJRU5ErkJggg==';
      icon = nativeImage.createFromDataURL(dataUrl);
    }

    icon = icon.resize({ width: isMac ? 18 : 16, height: isMac ? 18 : 16 });

    tray = new Tray(icon);
    tray.setToolTip('HiTech Printer Helper');
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Apri', click: () => { mainWindow.show(); mainWindow.focus(); } },
      { label: 'Nascondi', click: () => mainWindow.hide() },
      { type: 'separator' },
      { label: 'Esci', click: () => { quitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow.isVisible()) mainWindow.hide(); else { mainWindow.show(); mainWindow.focus(); }
    });
  } catch {}
}

function createCertificateIfMissing(storePath) {
  const pubPath = path.join(storePath, 'public.pem');
  const privPath = path.join(storePath, 'private.pem');
  const fs = require('fs');
  if (fs.existsSync(pubPath) && fs.existsSync(privPath)) {
    return { pubPath, privPath };
  }
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = new Date().getTime().toString();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);
  const attrs = [{ name: 'commonName', value: 'HiTech Printer Helper' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  const privPem = forge.pki.privateKeyToPem(keys.privateKey);
  fs.writeFileSync(pubPath, certPem);
  fs.writeFileSync(privPath, privPem);
  return { pubPath, privPath };
}

// ===== Autostart (opzionale) =====
function getAutoStartEnabled() {
  try {
    const platform = process.platform;
    if (platform === 'darwin' || platform === 'win32') {
      const s = app.getLoginItemSettings();
      return !!s.openAtLogin;
    }
    // Linux: non gestito nativamente qui (si può aggiungere in futuro)
    return false;
  } catch { return false; }
}

function setAutoStartEnabled(enabled) {
  try {
    const platform = process.platform;
    if (platform === 'darwin' || platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
      return true;
    }
    return false;
  } catch { return false; }
}

function startLocalServer() {
  const srv = express();
  srv.use(express.json({ limit: '5mb' }));

  // CORS + Private Network Access
  srv.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Printer-Token');
    // Consenti richieste da public a private network (Chrome PNA)
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const userData = app.getPath('userData');
  const { pubPath, privPath } = createCertificateIfMissing(userData);
  const fs = require('fs');
  const privateKeyPem = fs.readFileSync(privPath, 'utf8');
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const publicCert = fs.readFileSync(pubPath, 'utf8');

  // Healthcheck
  srv.get('/health', (req, res) => res.json({ ok: true }));

  // Autostart endpoints
  srv.get('/autostart', (req, res) => {
    res.json({ enabled: getAutoStartEnabled() });
  });
  srv.post('/autostart', (req, res) => {
    const enabled = !!(req.body && req.body.enabled);
    const ok = setAutoStartEnabled(enabled);
    res.json({ ok, enabled: getAutoStartEnabled() });
  });

  // Esponi il certificato pubblico
  srv.get('/cert', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('text/plain').send(publicCert);
  });

  // Firma payload (compatibile con QZ API style)
  srv.post('/sign', (req, res) => {
    try {
      const request = req.body?.request || '';
      const md = forge.md.sha512.create();
      md.update(request, 'utf8');
      const signature = forge.util.encode64(privateKey.sign(md));
      res.send(signature);
    } catch (e) {
      res.status(500).send('sign error');
    }
  });

  // Stampa: usa Chromium headless integrato di Electron
  srv.post('/print', async (req, res) => {
    try {
      const { base64pdf, printerName } = req.body || {};
      if (!base64pdf) return res.status(400).json({ error: 'base64pdf required' });

      const id = jobSeq++;
      const job = { id, time: new Date().toISOString(), printerName: printerName || null, status: 'pending' };
      jobs.unshift(job);
      jobs = jobs.slice(0, 100);

      const temp = path.join(app.getPath('temp'), `print_${Date.now()}.pdf`);
      const buf = Buffer.from(base64pdf, 'base64');
      require('fs').writeFileSync(temp, buf);

      const win = new BrowserWindow({ show: false });
      await win.loadURL('file://' + temp);

      const printOptions = {
        silent: true,
        deviceName: printerName || undefined,
        printBackground: true,
        margins: { marginType: 'none' },
      };

      win.webContents.print(printOptions, (success, failureReason) => {
        win.close();
        if (!success) {
          job.status = 'error';
          job.error = failureReason || 'print failed';
          return res.status(500).json({ error: job.error });
        }
        job.status = 'done';
        res.json({ ok: true, id });
      });
    } catch (e) {
      const id = jobSeq++;
      jobs.unshift({ id, time: new Date().toISOString(), printerName: null, status: 'error', error: 'print error' });
      jobs = jobs.slice(0, 100);
      res.status(500).json({ error: 'print error' });
    }
  });

  // Elenco lavori
  srv.get('/jobs', (req, res) => {
    res.json(jobs);
  });

  // Elenco stampanti (compatibile con Electron >= 26)
  srv.get('/printers', async (req, res) => {
    try {
      const w = BrowserWindow.getAllWindows()[0] || mainWindow;
      const wc = w && w.webContents ? w.webContents : null;
      if (!wc) return res.json([]);

      if (typeof wc.getPrintersAsync === 'function') {
        const list = await wc.getPrintersAsync();
        return res.json(list.map(p => p.name));
      }
      if (typeof wc.getPrinters === 'function') {
        const list = wc.getPrinters();
        return res.json(list.map(p => p.name));
      }
      return res.json([]);
    } catch (e) {
      return res.json([]);
    }
  });

  // Dettaglio stampanti completo per UI
  srv.get('/printers-full', async (req, res) => {
    try {
      const w = BrowserWindow.getAllWindows()[0] || mainWindow;
      const wc = w && w.webContents ? w.webContents : null;
      if (!wc) return res.json([]);

      if (typeof wc.getPrintersAsync === 'function') {
        const list = await wc.getPrintersAsync();
        return res.json(list);
      }
      if (typeof wc.getPrinters === 'function') {
        const list = wc.getPrinters();
        return res.json(list);
      }
      return res.json([]);
    } catch (e) {
      return res.json([]);
    }
  });

  const port = 17171; // porta locale
  srv.listen(port, () => {
    console.log(`Printer helper listening on http://127.0.0.1:${port}`);
  });
}

app.whenReady().then(() => {
  // Su macOS imposta la Dock icon esplicitamente
  const iconPath = getIconPath();
  if (process.platform === 'darwin' && iconPath) {
    try { app.dock.setIcon(nativeImage.createFromPath(iconPath)); } catch {}
  }

  createWindow();
  createTray();
  startLocalServer();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
