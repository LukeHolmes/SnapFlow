import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron';
import { checkForUpdatesFromMenu } from './update/install';

export function installAppMenu(opts?: { showAbout?: () => void }): void {
  const showAbout = opts?.showAbout;
  const isMac = process.platform === 'darwin';
  const updateItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    enabled: app.isPackaged,
    click: () => checkForUpdatesFromMenu(),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        ...(showAbout ? [{ label: 'About SnapFlow', click: showAbout }] : []),
        updateItem,
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ] satisfies MenuItemConstructorOptions[],
    } satisfies MenuItemConstructorOptions] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        ...(isMac ? [] : [updateItem, { type: 'separator' as const }]),
        ...(showAbout ? [{ label: 'About SnapFlow', click: showAbout }] : []),
        {
          label: 'SnapFlow on GitHub',
          click: () => { void shell.openExternal('https://github.com/LukeHolmes/SnapFlow'); },
        },
      ] satisfies MenuItemConstructorOptions[],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
