const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  downloadImage: (imageUrl, filename) => ipcRenderer.invoke('download-image', imageUrl, filename),
  downloadImages: (images) => ipcRenderer.invoke('download-images', images),
  getImagesFromPage: () => ipcRenderer.invoke('get-images-from-page'),
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  toggleAdBlocker: (enabled) => ipcRenderer.invoke('toggle-adblocker', enabled),
  getAdBlockerStatus: () => ipcRenderer.invoke('get-adblocker-status')
});
