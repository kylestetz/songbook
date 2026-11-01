import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import welcome from '../../resources/welcome.md?raw';
import { buildMenu } from './menu';
import { NotesStore } from './notes-store';

protocol.registerSchemesAsPrivileged([
  { scheme: 'mn-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

interface Config {
  folder?: string;
}

const configPath = () => path.join(app.getPath('userData'), 'config.json');

async function readConfig(): Promise<Config> {
  try {
    return JSON.parse(await fs.readFile(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

async function writeConfig(c: Config) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(c, null, 2));
}

let mainWindow: BrowserWindow | null = null;
let store: NotesStore;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Music Notes',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#fcfcfb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Links open in the default browser; the app window never navigates away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  mainWindow.on('closed', () => (mainWindow = null));
}

async function chooseFolder(): Promise<string | null> {
  const res = await dialog.showOpenDialog({
    title: 'Choose a folder for your notes',
    defaultPath: store.folder,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  await store.setFolder(res.filePaths[0]);
  await writeConfig({ ...(await readConfig()), folder: res.filePaths[0] });
  mainWindow?.webContents.send('menu', 'folder-changed');
  return res.filePaths[0];
}

function registerIpc() {
  ipcMain.handle('notes:folder', () => store.folder);
  ipcMain.handle('notes:choose-folder', () => chooseFolder());
  ipcMain.handle('notes:list', () => store.list());
  ipcMain.handle('notes:read', (_e, id: string) => store.read(id));
  ipcMain.handle('notes:save', async (_e, id: string, content: string) => ({ id: await store.save(id, content) }));
  ipcMain.handle('notes:create', (_e, content?: string) => store.create(content ?? ''));
  ipcMain.handle('notes:delete', (_e, id: string) => store.remove(id, (p) => shell.trashItem(p)));
  ipcMain.handle('notes:reveal', (_e, id: string) => shell.showItemInFolder(store.resolve(id)));
  ipcMain.handle('assets:save', (_e, _noteId: string, name: string, data: ArrayBuffer) => store.saveAsset(name, data));
  ipcMain.handle('assets:data-url', (_e, src: string) => store.assetDataUrl(src));
  ipcMain.handle('export:html', async (_e, suggestedName: string, html: string) => {
    const res = await dialog.showSaveDialog({
      title: 'Export as HTML',
      defaultPath: path.join(app.getPath('documents'), `${suggestedName}.html`),
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (res.canceled || !res.filePath) return null;
    await fs.writeFile(res.filePath, html, 'utf8');
    return res.filePath;
  });
  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (/^https?:|^mailto:/.test(url)) return shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  app.setName('Music Notes');
  const config = await readConfig();
  const folder = config.folder ?? path.join(app.getPath('documents'), 'Music Notes');
  store = new NotesStore(folder);
  await store.init();

  // First run: seed the folder with a welcome note that shows off the widgets
  if (!config.folder) {
    const existing = await store.list().catch(() => []);
    if (!existing.length) await store.create(welcome);
    await writeConfig({ ...config, folder });
  }

  store.onChange(() => mainWindow?.webContents.send('notes:changed'));

  protocol.handle('mn-asset', (req) => {
    const url = new URL(req.url);
    try {
      const full = store.resolve(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
      return net.fetch(pathToFileURL(full).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  registerIpc();
  buildMenu(() => mainWindow, { chooseFolder: () => void chooseFolder() });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
