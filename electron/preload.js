const {
  contextBridge,
  ipcRenderer
} = require('electron');


contextBridge.exposeInMainWorld(
  'nvkAPI',
  {

    // =========================
    // AUTENTICACIÓN
    // =========================

    login: (
      username,
      password
    ) =>
      ipcRenderer.invoke(
        'auth:login',
        {
          username,
          password
        }
      ),


    logout: (
      token
    ) =>
      ipcRenderer.invoke(
        'auth:logout',
        token
      ),


    // =========================
    // DASHBOARD
    // =========================

    dashboard: (
      token
    ) =>
      ipcRenderer.invoke(
        'dashboard:get',
        token
      ),


    // =========================
    // VIAJES
    // =========================

    viajeOptions: (
      token
    ) =>
      ipcRenderer.invoke(
        'viajes:options',
        token
      ),


    createViaje: (
      token,
      input
    ) =>
      ipcRenderer.invoke(
        'viajes:create',
        token,
        input
      ),


    listViajes: (
      token,
      filters
    ) =>
      ipcRenderer.invoke(
        'viajes:list',
        token,
        filters
      ),


    // =========================
    // RESÚMENES
    // =========================

    resumen: (
      token,
      idMaterial
    ) =>
      ipcRenderer.invoke(
        'resumen:get',
        token,
        idMaterial
      ),


    // =========================
    // PAGOS Y SELLOS
    // =========================

    pagos: (
      token
    ) =>
      ipcRenderer.invoke(
        'pagos:list',
        token
      ),


    marcarSello: (
      token,
      idViaje
    ) =>
      ipcRenderer.invoke(
        'sellos:mark',
        token,
        idViaje
      ),


    pagarSaldo: (
      token,
      idViaje
    ) =>
      ipcRenderer.invoke(
        'pagos:payBalance',
        token,
        idViaje
      ),


    // =========================
    // CATÁLOGOS
    // =========================

    catalogos: (
      token
    ) =>
      ipcRenderer.invoke(
        'catalogos:get',
        token
      ),


    // =========================
    // MATERIALES
    // =========================

    crearMaterial: (
      token,
      data
    ) =>
      ipcRenderer.invoke(
        'catalogos:material:create',
        token,
        data
      ),


    editarMaterial: (
      token,
      idMaterial,
      data
    ) =>
      ipcRenderer.invoke(
        'catalogos:material:update',
        token,
        idMaterial,
        data
      ),


    cambiarEstadoMaterial: (
      token,
      idMaterial,
      activo
    ) =>
      ipcRenderer.invoke(
        'catalogos:material:status',
        token,
        idMaterial,
        activo
      ),


    // =========================
    // OPERADORES
    // =========================

    crearOperador: (
      token,
      data
    ) =>
      ipcRenderer.invoke(
        'catalogos:operador:create',
        token,
        data
      ),


    editarOperador: (
      token,
      idOperador,
      data
    ) =>
      ipcRenderer.invoke(
        'catalogos:operador:update',
        token,
        idOperador,
        data
      ),


    cambiarEstadoOperador: (
      token,
      idOperador,
      activo
    ) =>
      ipcRenderer.invoke(
        'catalogos:operador:status',
        token,
        idOperador,
        activo
      ),


    // =========================
    // UNIDADES
    // =========================

    crearUnidad: (
      token,
      data
    ) =>
      ipcRenderer.invoke(
        'catalogos:unidad:create',
        token,
        data
      ),


    editarUnidad: (
      token,
      idUnidad,
      data
    ) =>
      ipcRenderer.invoke(
        'catalogos:unidad:update',
        token,
        idUnidad,
        data
      ),


    cambiarEstadoUnidad: (
      token,
      idUnidad,
      activo
    ) =>
      ipcRenderer.invoke(
        'catalogos:unidad:status',
        token,
        idUnidad,
        activo
      ),


    // =========================
    // CORTE SEMANAL
    // =========================

    corte: (
      token
    ) =>
      ipcRenderer.invoke(
        'corte:get',
        token
      ),


    toggleSemana: (
      token,
      action
    ) =>
      ipcRenderer.invoke(
        'semana:toggle',
        token,
        action
      )

  }
);