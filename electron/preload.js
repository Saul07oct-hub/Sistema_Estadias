const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nvkAPI', {
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: (token) => ipcRenderer.invoke('auth:logout', token),
  dashboard: (token) => ipcRenderer.invoke('dashboard:get', token),
  viajeOptions: (token) => ipcRenderer.invoke('viajes:options', token),
  createViaje: (token, input) => ipcRenderer.invoke('viajes:create', token, input),
  listViajes: (token, filters) => ipcRenderer.invoke('viajes:list', token, filters),
  resumen: (token, idMaterial) => ipcRenderer.invoke('resumen:get', token, idMaterial),
  pagos: (token) => ipcRenderer.invoke('pagos:list', token),
  marcarSello: (token, idViaje) => ipcRenderer.invoke('sellos:mark', token, idViaje),
  pagarSaldo: (token, idViaje) => ipcRenderer.invoke('pagos:payBalance', token, idViaje),
  catalogos: (token) => ipcRenderer.invoke('catalogos:get', token),
  corte: (token) => ipcRenderer.invoke('corte:get', token),
  toggleSemana: (token, action) => ipcRenderer.invoke('semana:toggle', token, action),
});
