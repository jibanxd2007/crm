const { contextBridge, ipcRenderer } = require('electron');

/**
 * MetaCRM Secure Preload Script
 * Exposes a strictly validated, isolated API bridge to the renderer process.
 * Security guarantees:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - No arbitrary Node/Electron primitives leaked to the window object
 */

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,

  // App & Environment Metadata
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  // Secure Credential Management (Windows DPAPI safeStorage)
  storeToken: (token) => ipcRenderer.invoke('auth:store-token', token),
  getToken: () => ipcRenderer.invoke('auth:get-token'),
  clearToken: () => ipcRenderer.invoke('auth:clear-token'),

  // Native Windows Desktop Notifications
  showNotification: (payload) => ipcRenderer.invoke('notify:show', payload),

  // Native Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Safe External Navigation (opens in default Windows web browser)
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Centralized Backend Connectivity & Health
  checkConnection: (url) => ipcRenderer.invoke('net:check-connection', url),

  // Automatic Updates
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },

  // Network State Change Listener
  onNetworkChange: (callback) => {
    const handler = (_event, isOnline) => callback(isOnline);
    ipcRenderer.on('net:status-change', handler);
    return () => ipcRenderer.removeListener('net:status-change', handler);
  }
});
