# NVK Control de Cortes — versión funcional SQLite + Electron

Esta entrega parte del prototipo visual de NVK y conecta las pantallas a `database/NVK_Control_Cortes.db` mediante Electron + `better-sqlite3`.

## Incluye
- Login real PBKDF2-SHA256.
- Sesión temporal administrada por Electron.
- Menú y rutas según permisos del usuario.
- Dashboard conectado a SQLite.
- Captura de viaje con catálogos, tarifa y cálculo automático.
- Bitácora semanal con búsqueda y alertas de duplicados.
- Resumen por material.
- Sellos y pagos (permiso administrativo).
- Corte semanal con cierre/reapertura según permisos.
- Catálogos conectados a SQLite.
- Base histórica de 42 viajes incluida.

## Usuarios iniciales
- Administrador: `admin` / `NVK.Admin2026!`
- Empleado: `empleado` / `NVK.Empleado2026!`

## Instalación
Desde la raíz del proyecto:

```bash
npm install
```

> En algunas versiones recientes de npm puede aparecer una advertencia sobre scripts nativos de `better-sqlite3`. Si npm solicita autorizar scripts de instalación, usa el mecanismo de aprobación que muestre tu versión de npm y vuelve a ejecutar `npm install`.

## Desarrollo
Terminal 1:
```bash
npm start
```

Terminal 2:
```bash
npm run electron
```

Electron carga `http://localhost:4200` y abre la misma base incluida en `database/NVK_Control_Cortes.db`.

## Permisos
El renderer Angular no decide por sí solo si una operación está autorizada. Las operaciones sensibles vuelven a validar el token de sesión y el permiso en `electron/main.js`.

- Administrador: 20 permisos en la base incluida.
- Empleado: 10 permisos en la base incluida.

El empleado puede consultar dashboard, capturar/consultar viajes, ver resúmenes y consultar módulos para los que tenga permiso. No puede registrar pagos/sellos ni cerrar/reabrir semanas.

## Nota sobre la semana histórica
La semana del 03 al 09 de agosto de 2026 se conserva como `CERRADA`, porque es histórico importado. Para probar una captura sobre esa misma semana, inicia como Administrador, entra a **Corte semanal** y usa **Reabrir semana**. Después de las pruebas puedes volver a cerrarla.

## Estructura importante
- `electron/main.js`: acceso a SQLite, sesión, consultas y validación de permisos.
- `electron/preload.js`: puente seguro IPC expuesto a Angular.
- `database/NVK_Control_Cortes.db`: base SQLite.
- `src/app/core/services/auth.service.ts`: estado de sesión en Angular.
- `src/app/core/guards/auth.guard.ts`: guards por sesión/permisos.
- `src/app/features/...`: pantallas.

## Producción
Esta entrega está preparada para desarrollo Electron + Angular. Antes de distribuir un instalador final conviene agregar `electron-builder`, ruta de datos en `app.getPath('userData')`, migraciones de base y estrategia de respaldo.
