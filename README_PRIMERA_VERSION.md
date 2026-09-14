# Control de Cortes NVK — Prototipo V1

Primera versión de interfaz para validar el flujo del Sistema de Control de Cortes antes de conectar Electron, SQLite y ExcelJS.

## Incluye

- Login de demostración.
- Layout empresarial con menú lateral y barra superior.
- Dashboard con indicadores de la semana 03–09 de agosto de 2026.
- Los 42 viajes del archivo real `CONTROL CORTES.xlsx` precargados como datos demo.
- Detección visual de cartas porte y órdenes de salida repetidas.
- Formulario de alta de viaje con cálculo automático de volumen, precio, IVA, retención y total.
- Bloqueo de folios duplicados y advertencia para órdenes repetidas.
- Bitácora semanal unificada con búsqueda y filtro por material.
- Persistencia temporal en `localStorage` para probar altas sin base de datos.
- Botón "Restaurar demo" para volver a los 42 registros originales.

## Ejecutar en Windows

Desde la carpeta del proyecto:

```bash
npm install
ng serve
```

Abrir:

`http://localhost:4200`

En el prototipo cualquier usuario y contraseña no vacíos permiten entrar.

## Importante

Esta V1 todavía NO incluye:

- SQLite.
- Electron / instalador EXE.
- Usuarios reales y permisos persistentes.
- Registro real de sellos y pagos.
- Cierre de semanas.
- Exportación con ExcelJS.
- Respaldos automáticos.

Esos módulos se integrarán después de validar la interfaz y las reglas de negocio.

## Regla fiscal de internos

La V1 muestra de forma provisional el cálculo usado en `CORTE TOTAL` (IVA 16% y retención 4%) para los viajes internos. Debe confirmarse con el área antes de implementar la lógica definitiva.
