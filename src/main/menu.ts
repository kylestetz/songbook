import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { WIDGETS } from '../core/widgets/registry-meta';

/** "Show in Finder" on macOS, with the platform's own file manager name elsewhere. */
export function revealLabel() {
  if (process.platform === 'darwin') return 'Show in Finder';
  if (process.platform === 'win32') return 'Show in Explorer';
  return 'Show in File Manager';
}

export function buildMenu(getWindow: () => BrowserWindow | null, actions: { chooseFolder: () => void }) {
  const send = (command: string, arg?: unknown) => () => getWindow()?.webContents.send('menu', command, arg);
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: send('new-note') },
        { type: 'separator' },
        { label: 'Open Notes Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: actions.chooseFolder },
        { label: revealLabel().replace(/^Show/, 'Show Note'), click: send('reveal-note') },
        { label: 'Duplicate Note', click: send('duplicate-note') },
        { type: 'separator' },
        { label: 'Export as HTML…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-html') },
        { type: 'separator' },
        { label: 'Move Note to Trash…', click: send('delete-note') },
        ...(isMac ? [] : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
      ],
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
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find Note…', accelerator: 'CmdOrCtrl+P', click: send('find-note') },
      ],
    },
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', registerAccelerator: false, click: send('format', 'strong') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', registerAccelerator: false, click: send('format', 'em') },
        { label: 'Strikethrough', accelerator: 'CmdOrCtrl+Shift+X', registerAccelerator: false, click: send('format', 'strike') },
        { label: 'Code', accelerator: 'CmdOrCtrl+E', registerAccelerator: false, click: send('format', 'code') },
        { label: 'Link…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: send('format', 'link') },
        { type: 'separator' },
        { label: 'Heading 1', accelerator: 'CmdOrCtrl+Alt+1', registerAccelerator: false, click: send('format', 'h1') },
        { label: 'Heading 2', accelerator: 'CmdOrCtrl+Alt+2', registerAccelerator: false, click: send('format', 'h2') },
        { label: 'Heading 3', accelerator: 'CmdOrCtrl+Alt+3', registerAccelerator: false, click: send('format', 'h3') },
        { label: 'Body Text', accelerator: 'CmdOrCtrl+Alt+0', registerAccelerator: false, click: send('format', 'paragraph') },
        { type: 'separator' },
        { label: 'Bulleted List', click: send('format', 'bullet_list') },
        { label: 'Numbered List', click: send('format', 'ordered_list') },
        { label: 'Quote', click: send('format', 'blockquote') },
        { label: 'Code Block', click: send('format', 'code_block') },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        { label: 'Widget…', accelerator: 'CmdOrCtrl+Shift+K', click: send('insert-widget') },
        { type: 'separator' },
        ...WIDGETS.map((w) => ({ label: w.title, click: send('insert-widget', w.name) })),
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: send('toggle-sidebar') },
        { label: 'Document Settings…', accelerator: 'CmdOrCtrl+,', click: send('document-settings') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
