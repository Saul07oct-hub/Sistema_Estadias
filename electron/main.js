const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

let db;
const sessions = new Map();

function dbPath() {
  return path.join(__dirname, '..', 'database', 'NVK_Control_Cortes.db');
}

function openDb() {
  db = new Database(dbPath());
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  console.log('SQLite:', dbPath());
  console.log(
    'Viajes:',
    db.prepare("SELECT COUNT(*) total FROM viajes WHERE estado='ACTIVO'").get().total
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'ControlCortesNvk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.NVK_DEV_URL || 'http://localhost:4200';

  win.loadURL(devUrl).catch(() => {
    const prodIndex = path.join(
      __dirname,
      '..',
      'dist',
      'control-cortes-nvk',
      'browser',
      'index.html'
    );

    win.loadFile(prodIndex);
  });
}

function verifyPassword(password, saltHex, storedHex, iterations) {
  const digest = crypto.pbkdf2Sync(
    password,
    Buffer.from(saltHex, 'hex'),
    iterations,
    32,
    'sha256'
  );

  const stored = Buffer.from(storedHex, 'hex');

  return (
    digest.length === stored.length &&
    crypto.timingSafeEqual(digest, stored)
  );
}

function permissionsForRole(idRol) {
  return db.prepare(`
    SELECT p.codigo
    FROM roles_permisos rp
    JOIN permisos p ON p.id_permiso = rp.id_permiso
    WHERE rp.id_rol = ?
    ORDER BY p.codigo
  `)
  .all(idRol)
  .map((r) => r.codigo);
}

function requireSession(token, permission) {
  const session = sessions.get(String(token || ''));

  if (!session) {
    throw new Error('Sesión inválida o vencida.');
  }

  if (permission && !session.permissions.includes(permission)) {
    const error = new Error(
      'No tienes permiso para realizar esta acción.'
    );

    error.code = 'FORBIDDEN';
    throw error;
  }

  return session;
}

function latestWeek() {
  return db.prepare(`
    SELECT *
    FROM semanas
    ORDER BY fecha_inicio DESC, id_semana DESC
    LIMIT 1
  `).get();
}

function money(x10000) {
  return Number(x10000 || 0) / 10000;
}

function volume(x1000) {
  return Number(x1000 || 0) / 1000;
}

function audit(userId, action, entity, entityId, detail) {
  db.prepare(`
    INSERT INTO auditoria(
      id_usuario,
      accion,
      entidad,
      entidad_id,
      detalle
    )
    VALUES(?,?,?,?,?)
  `).run(
    userId || null,
    action,
    entity,
    entityId || null,
    detail || null
  );
}

/* =========================================================
   LOGIN
========================================================= */

ipcMain.handle('auth:login', async (_e, data) => {
  try {
    const username = String(data?.username || '').trim();
    const password = String(data?.password || '');

    if (!username || !password) {
      return {
        ok: false,
        mensaje: 'Ingresa usuario y contraseña.'
      };
    }

    const u = db.prepare(`
      SELECT
        u.*,
        r.codigo AS rol_codigo,
        r.nombre AS rol_nombre
      FROM usuarios u
      JOIN roles r ON r.id_rol = u.id_rol
      WHERE lower(u.username) = lower(?)
      LIMIT 1
    `).get(username);

    if (!u || u.activo !== 1) {
      return {
        ok: false,
        mensaje: 'Usuario o contraseña incorrectos.'
      };
    }

    if (u.bloqueado_hasta) {
      const until = new Date(
        String(u.bloqueado_hasta).replace(' ', 'T') + 'Z'
      );

      if (
        !Number.isNaN(until.getTime()) &&
        until > new Date()
      ) {
        return {
          ok: false,
          mensaje: 'Usuario bloqueado temporalmente.'
        };
      }
    }

    const ok =
      u.password_algoritmo === 'PBKDF2-SHA256' &&
      verifyPassword(
        password,
        u.password_salt,
        u.password_hash,
        u.password_iteraciones
      );

    if (!ok) {
      const attempts =
        Number(u.intentos_fallidos || 0) + 1;

      if (attempts >= 5) {
        db.prepare(`
          UPDATE usuarios
          SET
            intentos_fallidos = ?,
            bloqueado_hasta = datetime('now','+15 minutes'),
            actualizado_en = datetime('now')
          WHERE id_usuario = ?
        `).run(attempts, u.id_usuario);

        return {
          ok: false,
          mensaje:
            'Demasiados intentos. Usuario bloqueado durante 15 minutos.'
        };
      }

      db.prepare(`
        UPDATE usuarios
        SET
          intentos_fallidos = ?,
          actualizado_en = datetime('now')
        WHERE id_usuario = ?
      `).run(attempts, u.id_usuario);

      return {
        ok: false,
        mensaje: 'Usuario o contraseña incorrectos.'
      };
    }

    db.prepare(`
      UPDATE usuarios
      SET
        intentos_fallidos = 0,
        bloqueado_hasta = NULL,
        ultimo_acceso = datetime('now'),
        actualizado_en = datetime('now')
      WHERE id_usuario = ?
    `).run(u.id_usuario);

    const permissions =
      permissionsForRole(u.id_rol);

    const token =
      crypto.randomBytes(32).toString('hex');

    sessions.set(token, {
      idUsuario: u.id_usuario,
      idRol: u.id_rol,
      permissions,
      username: u.username
    });

    return {
      ok: true,
      token,
      usuario: {
        id_usuario: u.id_usuario,
        username: u.username,
        nombre_completo: u.nombre_completo,

        rol: {
          id_rol: u.id_rol,
          codigo: u.rol_codigo,
          nombre: u.rol_nombre
        },

        permisos: permissions,
        debe_cambiar_password:
          u.debe_cambiar_password === 1
      }
    };

  } catch (error) {
    console.error(error);

    return {
      ok: false,
      mensaje: 'Error interno al iniciar sesión.'
    };
  }
});

ipcMain.handle('auth:logout', async (_e, token) => {
  sessions.delete(String(token || ''));

  return {
    ok: true
  };
});

/* =========================================================
   DASHBOARD
========================================================= */

ipcMain.handle('dashboard:get', async (_e, token) => {
  requireSession(token, 'dashboard.ver');

  const week = latestWeek();

  if (!week) {
    return {
      ok: true,
      week: null
    };
  }

  const kpi = db.prepare(`
    SELECT
      COUNT(*) AS total_viajes,
      SUM(v.importe_fuente_x10000) AS total_fletes_x10000,
      SUM(
        CASE
          WHEN sr.id_sello IS NULL THEN 1
          ELSE 0
        END
      ) AS sin_sello
    FROM viajes v
    LEFT JOIN sellos_recepcion sr
      ON sr.id_viaje = v.id_viaje
    WHERE
      v.id_semana = ?
      AND v.estado = 'ACTIVO'
  `).get(week.id_semana);

  const saldo = db.prepare(`
    SELECT COALESCE(SUM(saldo_x10000),0) AS x
    FROM vw_saldos_viaje
    WHERE id_semana = ?
  `).get(week.id_semana).x;

  const corte = db.prepare(`
    SELECT total_x10000
    FROM cortes
    WHERE id_semana = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(week.id_semana);

  const materials = db.prepare(`
    SELECT
      material,
      viajes,
      volumen_total_x1000,
      importe_fuente_total_x10000
    FROM vw_resumen_material_semana
    WHERE id_semana = ?
    ORDER BY id_material
  `)
  .all(week.id_semana)
  .map(r => ({
    material: r.material,
    viajes: r.viajes,
    volumen: volume(r.volumen_total_x1000),
    total: money(r.importe_fuente_total_x10000)
  }));

  const dupFolios = db.prepare(`
    SELECT
      folio_documento AS folio,
      repeticiones
    FROM vw_duplicados_folio
  `).all();

  const dupRefs = db.prepare(`
    SELECT
      referencia_salida AS referencia,
      repeticiones
    FROM vw_duplicados_referencia
  `).all();

  const fiscal = db.prepare(`
    SELECT COUNT(*) AS n
    FROM incidencias_datos
    WHERE
      tipo = 'REGLA_FISCAL_INTERNOS'
      AND resuelta = 0
  `).get().n > 0;

  /*
    IMPORTANTE:
    Los últimos viajes se ordenan por ID.
    El viaje más nuevo siempre queda arriba.
  */
  const recientes = db.prepare(`
    SELECT
      vd.*,

      CASE
        WHEN sr.id_sello IS NULL THEN 0
        ELSE 1
      END AS sello_recibido,

      COALESCE(
        sv.pagado_x10000,
        0
      ) AS pagado_x10000,

      COALESCE(
        sv.saldo_x10000,
        0
      ) AS saldo_x10000

    FROM vw_viajes_detalle vd

    LEFT JOIN sellos_recepcion sr
      ON sr.id_viaje = vd.id_viaje

    LEFT JOIN vw_saldos_viaje sv
      ON sv.id_viaje = vd.id_viaje

    WHERE
      vd.id_semana = ?
      AND vd.estado = 'ACTIVO'

    ORDER BY CAST(vd.id_viaje AS INTEGER) DESC

    LIMIT 8
  `)
  .all(week.id_semana)
  .map(r => ({
    ...r,
    volumen: volume(
      r.volumen_aplicado_x1000
    ),
    precio: money(
      r.precio_unitario_aplicado_x10000
    ),
    importe: money(
      r.importe_fuente_x10000
    ),
    pagado: money(
      r.pagado_x10000
    ),
    saldo: money(
      r.saldo_x10000
    )
  }));

  return {
    ok: true,
    week,

    kpis: {
      viajes: kpi.total_viajes,

      totalCorte: corte
        ? money(corte.total_x10000)
        : money(kpi.total_fletes_x10000),

      saldo: money(saldo),
      sinSello: kpi.sin_sello
    },

    materials,

    alerts: {
      dupFolios,
      dupRefs,
      fiscal
    },

    recientes
  };
});

/* =========================================================
   OPCIONES PARA CAPTURAR VIAJE
========================================================= */

ipcMain.handle(
  'viajes:options',
  async (_e, token) => {

    requireSession(
      token,
      'viajes.crear'
    );

    const week = latestWeek();

    const materials = db.prepare(`
      SELECT
        m.*,
        tm.id_tarifa_material,
        tm.precio_unitario_x10000,
        tm.iva_bps,
        tm.retencion_bps,
        tm.estado_regla_fiscal

      FROM materiales m

      LEFT JOIN tarifas_materiales tm
        ON tm.id_tarifa_material = (

          SELECT
            t2.id_tarifa_material

          FROM tarifas_materiales t2

          WHERE
            t2.id_material = m.id_material

          ORDER BY
            t2.vigencia_desde DESC,
            t2.id_tarifa_material DESC

          LIMIT 1
        )

      WHERE m.activo = 1

      ORDER BY m.id_material
    `)
    .all()
    .map(r => ({
      ...r,

      volumen:
        volume(
          r.volumen_default_x1000
        ),

      precio:
        money(
          r.precio_unitario_x10000
        ),

      ivaPct:
        Number(r.iva_bps || 0) / 100,

      retencionPct:
        Number(
          r.retencion_bps || 0
        ) / 100
    }));

    return {
      ok: true,
      week,
      materials,

      operators: db.prepare(`
        SELECT *
        FROM operadores
        WHERE activo = 1
        ORDER BY nombre
      `).all(),

      units: db.prepare(`
        SELECT *
        FROM unidades
        WHERE activo = 1
        ORDER BY clave
      `).all(),

      suggested: db.prepare(`
        SELECT *
        FROM vw_siguiente_folio_sugerido
      `).all()
    };
  }
);

/* =========================================================
   CREAR VIAJE
========================================================= */

ipcMain.handle(
  'viajes:create',
  async (_e, token, input) => {

    const session =
      requireSession(
        token,
        'viajes.crear'
      );

    const week = db.prepare(`
      SELECT *
      FROM semanas
      WHERE id_semana = ?
    `).get(input.id_semana);

    if (!week) {
      return {
        ok: false,
        mensaje:
          'Semana no encontrada.'
      };
    }

    if (week.estado !== 'ABIERTA') {
      return {
        ok: false,
        mensaje:
          'La semana está cerrada. Un administrador debe reabrirla antes de capturar.'
      };
    }

    const material = db.prepare(`
      SELECT *
      FROM materiales
      WHERE
        id_material = ?
        AND activo = 1
    `).get(input.id_material);

    const tarifa = db.prepare(`
      SELECT *
      FROM tarifas_materiales

      WHERE
        id_material = ?
        AND vigencia_desde <= ?
        AND (
          vigencia_hasta IS NULL
          OR vigencia_hasta >= ?
        )

      ORDER BY
        vigencia_desde DESC

      LIMIT 1
    `).get(
      input.id_material,
      input.fecha,
      input.fecha
    );

    if (!material || !tarifa) {
      return {
        ok: false,
        mensaje:
          'No existe material/tarifa vigente para la fecha.'
      };
    }

    const folio =
      String(
        input.folio_documento || ''
      )
      .trim()
      .toUpperCase();

    const ref =
      String(
        input.referencia_salida || ''
      ).trim();

    if (!folio || !ref) {
      return {
        ok: false,
        mensaje:
          'Folio y referencia son obligatorios.'
      };
    }

    const dup = db.prepare(`
      SELECT 1
      FROM viajes
      WHERE
        upper(folio_documento) = upper(?)
        AND estado = 'ACTIVO'
      LIMIT 1
    `).get(folio);

    if (dup) {
      return {
        ok: false,
        mensaje:
          'El folio del documento ya existe.'
      };
    }

    const base =
      Number(
        tarifa.precio_unitario_x10000
      );

    const factor =
      1 +
      Number(
        tarifa.iva_bps || 0
      ) / 10000 -
      Number(
        tarifa.retencion_bps || 0
      ) / 10000;

    const importe =
      Math.round(
        base * factor
      );

    try {
      const info = db.prepare(`
        INSERT INTO viajes(
          id_semana,
          id_material,
          id_operador,
          id_unidad,
          fecha,
          hora,
          tipo_documento,
          folio_documento,
          tipo_referencia,
          referencia_salida,
          volumen_aplicado_x1000,
          precio_unitario_aplicado_x10000,
          iva_bps_aplicado,
          retencion_bps_aplicado,
          importe_fuente_x10000,
          regla_fiscal_origen,
          estado,
          es_historico,
          origen,
          creado_por,
          actualizado_por
        )

        VALUES(
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,
          'ACTIVO',
          0,
          'SISTEMA',
          ?,?
        )
      `).run(
        week.id_semana,
        material.id_material,
        input.id_operador,
        input.id_unidad,
        input.fecha,
        input.hora,

        material.tipo_documento_default,
        folio,

        material.tipo_referencia_default,
        ref,

        material.volumen_default_x1000,
        tarifa.precio_unitario_x10000,
        tarifa.iva_bps,
        tarifa.retencion_bps,

        importe,
        tarifa.estado_regla_fiscal,

        session.idUsuario,
        session.idUsuario
      );

      audit(
        session.idUsuario,
        'CREAR',
        'viajes',
        info.lastInsertRowid,
        `Folio ${folio}`
      );

      const repeated = db.prepare(`
        SELECT COUNT(*) AS n
        FROM viajes
        WHERE
          referencia_salida = ?
          AND estado = 'ACTIVO'
      `).get(ref).n > 1;

      return {
        ok: true,
        id_viaje:
          Number(info.lastInsertRowid),
        referenciaRepetida:
          repeated
      };

    } catch (error) {
      return {
        ok: false,
        mensaje: error.message
      };
    }
  }
);

/* =========================================================
   BITÁCORA SEMANAL
========================================================= */

ipcMain.handle(
  'viajes:list',
  async (_e, token, filters = {}) => {

    requireSession(
      token,
      'viajes.ver'
    );

    const week =
      latestWeek();

    if (!week) {
      return {
        ok: true,
        rows: [],
        materials: []
      };
    }

    /*
      ORDEN DE LA BITÁCORA:

      44
      43
      42
      41
      ...
      2
      1

      Cuando se registre el siguiente:
      45 aparecerá hasta arriba.
    */

    const rows = db.prepare(`
      SELECT
        vd.*,

        CASE
          WHEN sr.id_sello IS NULL
          THEN 0
          ELSE 1
        END AS sello_recibido,

        COALESCE(
          sv.pagado_x10000,
          0
        ) AS pagado_x10000,

        COALESCE(
          sv.saldo_x10000,
          0
        ) AS saldo_x10000

      FROM vw_viajes_detalle vd

      LEFT JOIN sellos_recepcion sr
        ON sr.id_viaje = vd.id_viaje

      LEFT JOIN vw_saldos_viaje sv
        ON sv.id_viaje = vd.id_viaje

      WHERE
        vd.id_semana = ?
        AND vd.estado = 'ACTIVO'

      ORDER BY
        CAST(vd.id_viaje AS INTEGER) DESC
    `)
    .all(week.id_semana)
    .map(r => ({
      ...r,

      volumen:
        volume(
          r.volumen_aplicado_x1000
        ),

      precio:
        money(
          r.precio_unitario_aplicado_x10000
        ),

      importe:
        money(
          r.importe_fuente_x10000
        ),

      pagado:
        money(
          r.pagado_x10000
        ),

      saldo:
        money(
          r.saldo_x10000
        )
    }));

    return {
      ok: true,
      week,
      rows,

      dupFolios:
        db.prepare(`
          SELECT
            folio_documento AS folio
          FROM vw_duplicados_folio
        `)
        .all()
        .map(x => x.folio),

      dupRefs:
        db.prepare(`
          SELECT
            referencia_salida AS referencia
          FROM vw_duplicados_referencia
        `)
        .all()
        .map(x => x.referencia),

      materials:
        db.prepare(`
          SELECT
            id_material,
            nombre
          FROM materiales
          WHERE activo = 1
          ORDER BY id_material
        `).all()
    };
  }
);

/* =========================================================
   RESÚMENES
========================================================= */

ipcMain.handle(
  'resumen:get',
  async (_e, token, idMaterial) => {

    requireSession(
      token,
      'resumenes.ver'
    );

    const week =
      latestWeek();

    const materials =
      db.prepare(`
        SELECT
          id_material,
          nombre,
          codigo,
          tipo_operacion
        FROM materiales
        WHERE activo = 1
        ORDER BY id_material
      `).all();

    const chosen =
      Number(
        idMaterial ||
        materials[0]?.id_material ||
        0
      );

    const summary =
      db.prepare(`
        SELECT *
        FROM vw_resumen_material_semana
        WHERE
          id_semana = ?
          AND id_material = ?
      `).get(
        week.id_semana,
        chosen
      );

    const rows =
      db.prepare(`
        SELECT
          vd.*,

          CASE
            WHEN sr.id_sello IS NULL
            THEN 0
            ELSE 1
          END AS sello_recibido,

          COALESCE(
            sv.pagado_x10000,
            0
          ) AS pagado_x10000,

          COALESCE(
            sv.saldo_x10000,
            0
          ) AS saldo_x10000

        FROM vw_viajes_detalle vd

        JOIN materiales m
          ON m.codigo =
             vd.material_codigo

        LEFT JOIN sellos_recepcion sr
          ON sr.id_viaje =
             vd.id_viaje

        LEFT JOIN vw_saldos_viaje sv
          ON sv.id_viaje =
             vd.id_viaje

        WHERE
          vd.id_semana = ?
          AND m.id_material = ?
          AND vd.estado = 'ACTIVO'

        ORDER BY
          vd.fecha,
          vd.hora
      `)
      .all(
        week.id_semana,
        chosen
      )
      .map(r => ({
        ...r,

        volumen:
          volume(
            r.volumen_aplicado_x1000
          ),

        precio:
          money(
            r.precio_unitario_aplicado_x10000
          ),

        importe:
          money(
            r.importe_fuente_x10000
          ),

        pagado:
          money(
            r.pagado_x10000
          ),

        saldo:
          money(
            r.saldo_x10000
          )
      }));

    return {
      ok: true,
      week,
      materials,
      selected: chosen,

      summary: summary
        ? {
            ...summary,

            volumen:
              volume(
                summary.volumen_total_x1000
              ),

            importe:
              money(
                summary.importe_fuente_total_x10000
              ),

            pagado:
              money(
                summary.pagado_total_x10000
              ),

            saldo:
              money(
                summary.saldo_total_x10000
              )
          }
        : null,

      rows
    };
  }
);

/* =========================================================
   PAGOS
========================================================= */

ipcMain.handle(
  'pagos:list',
  async (_e, token) => {

    requireSession(
      token,
      'pagos.registrar'
    );

    const week =
      latestWeek();

    const rows =
      db.prepare(`
        SELECT
          vd.id_viaje,
          vd.fecha,
          vd.material,
          vd.operador,
          vd.folio_documento,
          vd.referencia_salida,
          vd.importe_fuente_x10000,

          CASE
            WHEN sr.id_sello IS NULL
            THEN 0
            ELSE 1
          END AS sello_recibido,

          COALESCE(
            sv.pagado_x10000,
            0
          ) AS pagado_x10000,

          COALESCE(
            sv.saldo_x10000,
            0
          ) AS saldo_x10000

        FROM vw_viajes_detalle vd

        LEFT JOIN sellos_recepcion sr
          ON sr.id_viaje =
             vd.id_viaje

        LEFT JOIN vw_saldos_viaje sv
          ON sv.id_viaje =
             vd.id_viaje

        WHERE
          vd.id_semana = ?
          AND vd.estado = 'ACTIVO'

        ORDER BY
          vd.fecha DESC,
          vd.hora DESC
      `)
      .all(week.id_semana)
      .map(r => ({
        ...r,

        importe:
          money(
            r.importe_fuente_x10000
          ),

        pagado:
          money(
            r.pagado_x10000
          ),

        saldo:
          money(
            r.saldo_x10000
          )
      }));

    return {
      ok: true,
      week,
      rows
    };
  }
);

/* =========================================================
   SELLOS
========================================================= */

ipcMain.handle(
  'sellos:mark',
  async (_e, token, idViaje) => {

    const s =
      requireSession(
        token,
        'sellos.registrar'
      );

    try {
      db.prepare(`
        INSERT INTO sellos_recepcion(
          id_viaje,
          fecha_sello,
          registrado_por,
          origen
        )

        VALUES(
          ?,
          date('now'),
          ?,
          'SISTEMA'
        )

        ON CONFLICT(id_viaje)
        DO NOTHING
      `).run(
        idViaje,
        s.idUsuario
      );

      audit(
        s.idUsuario,
        'REGISTRAR_SELLO',
        'viajes',
        idViaje,
        'Sello recibido'
      );

      return {
        ok: true
      };

    } catch (error) {
      return {
        ok: false,
        mensaje:
          error.message
      };
    }
  }
);

/* =========================================================
   PAGAR SALDO
========================================================= */

ipcMain.handle(
  'pagos:payBalance',
  async (_e, token, idViaje) => {

    const s =
      requireSession(
        token,
        'pagos.registrar'
      );

    const row =
      db.prepare(`
        SELECT saldo_x10000
        FROM vw_saldos_viaje
        WHERE id_viaje = ?
      `).get(idViaje);

    if (
      !row ||
      row.saldo_x10000 <= 0
    ) {
      return {
        ok: false,
        mensaje:
          'El viaje no tiene saldo pendiente.'
      };
    }

    db.prepare(`
      INSERT INTO pagos(
        id_viaje,
        fecha_pago,
        monto_x10000,
        estado,
        registrado_por
      )

      VALUES(
        ?,
        date('now'),
        ?,
        'APLICADO',
        ?
      )
    `).run(
      idViaje,
      row.saldo_x10000,
      s.idUsuario
    );

    audit(
      s.idUsuario,
      'REGISTRAR_PAGO',
      'viajes',
      idViaje,
      `Pago saldo ${row.saldo_x10000}`
    );

    return {
      ok: true
    };
  }
);

/* =========================================================
   CATÁLOGOS
========================================================= */

ipcMain.handle(
  'catalogos:get',
  async (_e, token) => {

    requireSession(
      token,
      'catalogos.ver'
    );

    const materials =
      db.prepare(`
        SELECT
          m.*,
          tm.precio_unitario_x10000,
          tm.iva_bps,
          tm.retencion_bps,
          tm.estado_regla_fiscal,
          tm.vigencia_desde,
          tm.vigencia_hasta

        FROM materiales m

        LEFT JOIN tarifas_materiales tm
          ON tm.id_tarifa_material = (

            SELECT
              t.id_tarifa_material

            FROM tarifas_materiales t

            WHERE
              t.id_material =
              m.id_material

            ORDER BY
              t.vigencia_desde DESC,
              t.id_tarifa_material DESC

            LIMIT 1
          )

        ORDER BY
          m.id_material
      `)
      .all()
      .map(r => ({
        ...r,

        volumen:
          volume(
            r.volumen_default_x1000
          ),

        precio:
          money(
            r.precio_unitario_x10000
          )
      }));

    return {
      ok: true,
      materials,

      operators:
        db.prepare(`
          SELECT *
          FROM operadores
          ORDER BY nombre
        `).all(),

      units:
        db.prepare(`
          SELECT *
          FROM unidades
          ORDER BY clave
        `).all()
    };
  }
);
/* =========================================================
   ADMINISTRACIÓN DE MATERIALES
========================================================= */

/*
  IMPORTANTE:
  Estas acciones requieren el permiso catalogos.editar.

  Los materiales NO se eliminan físicamente.
  Solo cambian entre:
    activo = 1  -> ACTIVO
    activo = 0  -> INACTIVO
*/

/* =========================================================
   CREAR MATERIAL
========================================================= */

ipcMain.handle(
  'catalogos:material:create',
  async (_e, token, input) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {

      const nombre =
        String(input?.nombre || '')
          .trim();

      const codigo =
        String(input?.codigo || '')
          .trim()
          .toUpperCase();

      const tipoOperacion =
        String(input?.tipo_operacion || '')
          .trim()
          .toUpperCase();

      const tipoDocumento =
        String(input?.tipo_documento_default || '')
          .trim()
          .toUpperCase();

      const tipoReferencia =
        String(
          input?.tipo_referencia_default ||
          'REFERENCIA'
        )
          .trim()
          .toUpperCase();

      const volumen =
        Number(input?.volumen);

      const precio =
        Number(input?.precio);

      const activo =
        Number(input?.activo) === 0
          ? 0
          : 1;

      /* =========================
         VALIDACIONES
      ========================= */

      if (!nombre) {
        return {
          ok: false,
          mensaje:
            'El nombre del material es obligatorio.'
        };
      }

      if (!codigo) {
        return {
          ok: false,
          mensaje:
            'El código del material es obligatorio.'
        };
      }

      if (
        tipoOperacion !== 'INTERNO' &&
        tipoOperacion !== 'EXTERNO'
      ) {
        return {
          ok: false,
          mensaje:
            'El tipo debe ser INTERNO o EXTERNO.'
        };
      }

      if (!tipoDocumento) {
        return {
          ok: false,
          mensaje:
            'El tipo de documento es obligatorio.'
        };
      }

      if (
        !Number.isFinite(volumen) ||
        volumen <= 0
      ) {
        return {
          ok: false,
          mensaje:
            'El volumen debe ser mayor a 0.'
        };
      }

      if (
        !Number.isFinite(precio) ||
        precio < 0
      ) {
        return {
          ok: false,
          mensaje:
            'El precio unitario no es válido.'
        };
      }

      /* =========================
         EVITAR DUPLICADOS
      ========================= */

      const duplicateCode =
        db.prepare(`
          SELECT id_material
          FROM materiales
          WHERE upper(codigo) = upper(?)
          LIMIT 1
        `).get(codigo);

      if (duplicateCode) {
        return {
          ok: false,
          mensaje:
            'Ya existe un material con ese código.'
        };
      }

      const duplicateName =
        db.prepare(`
          SELECT id_material
          FROM materiales
          WHERE lower(nombre) = lower(?)
          LIMIT 1
        `).get(nombre);

      if (duplicateName) {
        return {
          ok: false,
          mensaje:
            'Ya existe un material con ese nombre.'
        };
      }

      /*
        Convertimos:
        14 m³       -> 14000
        $1,553.36   -> 15533600
      */

      const volumenX1000 =
        Math.round(volumen * 1000);

      const precioX10000 =
        Math.round(precio * 10000);

      /*
        Usamos una transacción porque necesitamos crear:

        1. Material
        2. Tarifa inicial

        Si algo falla, no queda información incompleta.
      */

      const crearMaterial =
        db.transaction(() => {

          const info =
            db.prepare(`
              INSERT INTO materiales(
                codigo,
                nombre,
                tipo_operacion,
                volumen_default_x1000,
                tipo_documento_default,
                tipo_referencia_default,
                activo
              )

              VALUES(
                ?,?,?,?,?,?,?
              )
            `).run(
              codigo,
              nombre,
              tipoOperacion,
              volumenX1000,
              tipoDocumento,
              tipoReferencia,
              activo
            );

          const idMaterial =
            Number(info.lastInsertRowid);

          /*
            Creamos la primera tarifa.

            IVA y retención empiezan en 0.
            Si después quieres administrarlos desde
            Catálogos también, lo agregamos.
          */

          db.prepare(`
            INSERT INTO tarifas_materiales(
              id_material,
              precio_unitario_x10000,
              iva_bps,
              retencion_bps,
              estado_regla_fiscal,
              vigencia_desde,
              vigencia_hasta
            )

            VALUES(
              ?,
              ?,
              0,
              0,
              'DEFINIDA',
              date('now'),
              NULL
            )
          `).run(
            idMaterial,
            precioX10000
          );

          audit(
            s.idUsuario,
            'CREAR',
            'materiales',
            idMaterial,
            `Material ${nombre}`
          );

          return idMaterial;
        });

      const idMaterial =
        crearMaterial();

      return {
        ok: true,
        id_material: idMaterial,
        mensaje:
          'Material agregado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error creando material:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo crear el material.'
      };
    }
  }
);


/* =========================================================
   EDITAR MATERIAL
========================================================= */

ipcMain.handle(
  'catalogos:material:update',
  async (_e, token, idMaterial, input) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {

      const id =
        Number(idMaterial);

      if (!id) {
        return {
          ok: false,
          mensaje:
            'Material no válido.'
        };
      }

      const actual =
        db.prepare(`
          SELECT *
          FROM materiales
          WHERE id_material = ?
        `).get(id);

      if (!actual) {
        return {
          ok: false,
          mensaje:
            'El material no existe.'
        };
      }

      const nombre =
        String(input?.nombre || '')
          .trim();

      const codigo =
        String(input?.codigo || '')
          .trim()
          .toUpperCase();

      const tipoOperacion =
        String(input?.tipo_operacion || '')
          .trim()
          .toUpperCase();

      const tipoDocumento =
        String(input?.tipo_documento_default || '')
          .trim()
          .toUpperCase();

      const tipoReferencia =
        String(
          input?.tipo_referencia_default ||
          actual.tipo_referencia_default ||
          'REFERENCIA'
        )
          .trim()
          .toUpperCase();

      const volumen =
        Number(input?.volumen);

      const precio =
        Number(input?.precio);

      /* =========================
         VALIDACIONES
      ========================= */

      if (!nombre) {
        return {
          ok: false,
          mensaje:
            'El nombre del material es obligatorio.'
        };
      }

      if (!codigo) {
        return {
          ok: false,
          mensaje:
            'El código del material es obligatorio.'
        };
      }

      if (
        tipoOperacion !== 'INTERNO' &&
        tipoOperacion !== 'EXTERNO'
      ) {
        return {
          ok: false,
          mensaje:
            'El tipo debe ser INTERNO o EXTERNO.'
        };
      }

      if (!tipoDocumento) {
        return {
          ok: false,
          mensaje:
            'El documento es obligatorio.'
        };
      }

      if (
        !Number.isFinite(volumen) ||
        volumen <= 0
      ) {
        return {
          ok: false,
          mensaje:
            'El volumen debe ser mayor a 0.'
        };
      }

      if (
        !Number.isFinite(precio) ||
        precio < 0
      ) {
        return {
          ok: false,
          mensaje:
            'El precio unitario no es válido.'
        };
      }

      /* =========================
         VALIDAR DUPLICADOS
      ========================= */

      const duplicateCode =
        db.prepare(`
          SELECT id_material
          FROM materiales

          WHERE
            upper(codigo) = upper(?)
            AND id_material <> ?

          LIMIT 1
        `).get(
          codigo,
          id
        );

      if (duplicateCode) {
        return {
          ok: false,
          mensaje:
            'Ya existe otro material con ese código.'
        };
      }

      const duplicateName =
        db.prepare(`
          SELECT id_material
          FROM materiales

          WHERE
            lower(nombre) = lower(?)
            AND id_material <> ?

          LIMIT 1
        `).get(
          nombre,
          id
        );

      if (duplicateName) {
        return {
          ok: false,
          mensaje:
            'Ya existe otro material con ese nombre.'
        };
      }

      const volumenX1000 =
        Math.round(
          volumen * 1000
        );

      const precioX10000 =
        Math.round(
          precio * 10000
        );

      const editar =
        db.transaction(() => {

          /* =========================
             ACTUALIZAR MATERIAL
          ========================= */

          db.prepare(`
            UPDATE materiales

            SET
              codigo = ?,
              nombre = ?,
              tipo_operacion = ?,
              volumen_default_x1000 = ?,
              tipo_documento_default = ?,
              tipo_referencia_default = ?

            WHERE id_material = ?
          `).run(
            codigo,
            nombre,
            tipoOperacion,
            volumenX1000,
            tipoDocumento,
            tipoReferencia,
            id
          );

          /*
            Buscamos la tarifa vigente/más reciente.
          */

          const tarifaActual =
            db.prepare(`
              SELECT *
              FROM tarifas_materiales

              WHERE id_material = ?

              ORDER BY
                vigencia_desde DESC,
                id_tarifa_material DESC

              LIMIT 1
            `).get(id);

          /*
            Si cambió el precio, NO modificamos
            la tarifa histórica.

            Cerramos la anterior y creamos
            una tarifa nueva.
          */

          if (
            !tarifaActual ||
            Number(
              tarifaActual
                .precio_unitario_x10000
            ) !== precioX10000
          ) {

            if (tarifaActual) {

              db.prepare(`
                UPDATE tarifas_materiales

                SET vigencia_hasta =
                  date('now','-1 day')

                WHERE id_tarifa_material = ?
              `).run(
                tarifaActual
                  .id_tarifa_material
              );
            }

            db.prepare(`
              INSERT INTO tarifas_materiales(
                id_material,
                precio_unitario_x10000,
                iva_bps,
                retencion_bps,
                estado_regla_fiscal,
                vigencia_desde,
                vigencia_hasta
              )

              VALUES(
                ?,?,?,?,?,date('now'),NULL
              )
            `).run(
              id,
              precioX10000,

              tarifaActual
                ? Number(
                    tarifaActual.iva_bps || 0
                  )
                : 0,

              tarifaActual
                ? Number(
                    tarifaActual.retencion_bps || 0
                  )
                : 0,

              tarifaActual
                ?.estado_regla_fiscal ||
                'DEFINIDA'
            );
          }

          audit(
            s.idUsuario,
            'EDITAR',
            'materiales',
            id,
            `Material ${nombre}`
          );
        });

      editar();

      return {
        ok: true,
        mensaje:
          'Material actualizado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error actualizando material:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo actualizar el material.'
      };
    }
  }
);


/* =========================================================
   ACTIVAR / DESACTIVAR MATERIAL
========================================================= */

ipcMain.handle(
  'catalogos:material:status',
  async (_e, token, idMaterial, activo) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {

      const id =
        Number(idMaterial);

      const nuevoEstado =
        Number(activo) === 1
          ? 1
          : 0;

      const material =
        db.prepare(`
          SELECT *
          FROM materiales
          WHERE id_material = ?
        `).get(id);

      if (!material) {
        return {
          ok: false,
          mensaje:
            'El material no existe.'
        };
      }

      db.prepare(`
        UPDATE materiales
        SET activo = ?
        WHERE id_material = ?
      `).run(
        nuevoEstado,
        id
      );

      audit(
        s.idUsuario,
        nuevoEstado === 1
          ? 'ACTIVAR'
          : 'DESACTIVAR',
        'materiales',
        id,
        material.nombre
      );

      return {
        ok: true,

        activo:
          nuevoEstado === 1,

        mensaje:
          nuevoEstado === 1
            ? 'Material activado correctamente.'
            : 'Material desactivado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error cambiando estado del material:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo cambiar el estado del material.'
      };
    }
  }
);

/* =========================================================
   CORTE SEMANAL
========================================================= */

ipcMain.handle(
  'corte:get',
  async (_e, token) => {

    requireSession(
      token,
      'cortes.ver'
    );

    const week =
      latestWeek();

    const corte =
      db.prepare(`
        SELECT *
        FROM cortes
        WHERE id_semana = ?
        ORDER BY version DESC
        LIMIT 1
      `).get(
        week.id_semana
      );

    const details =
      corte
        ? db.prepare(`
            SELECT *
            FROM corte_detalles
            WHERE id_corte = ?
            ORDER BY
              seccion,
              orden,
              id_corte_detalle
          `)
          .all(corte.id_corte)
          .map(r => ({
            ...r,

            precio:
              money(
                r.precio_unitario_x10000
              ),

            subtotal:
              money(
                r.subtotal_x10000
              ),

            iva:
              money(
                r.iva_x10000
              ),

            retencion:
              money(
                r.retencion_x10000
              ),

            total:
              money(
                r.total_x10000
              )
          }))
        : [];

    return {
      ok: true,
      week,

      corte: corte
        ? {
            ...corte,
            total:
              money(
                corte.total_x10000
              )
          }
        : null,

      details
    };
  }
);

/* =========================================================
   ABRIR / CERRAR SEMANA
========================================================= */

ipcMain.handle(
  'semana:toggle',
  async (_e, token, action) => {

    const permission =
      action === 'reabrir'
        ? 'semanas.reabrir'
        : 'semanas.cerrar';

    const s =
      requireSession(
        token,
        permission
      );

    const week =
      latestWeek();

    if (action === 'reabrir') {

      db.prepare(`
        UPDATE semanas
        SET
          estado = 'ABIERTA',
          cerrada_en = NULL,
          cerrada_por = NULL
        WHERE id_semana = ?
      `).run(
        week.id_semana
      );

      audit(
        s.idUsuario,
        'REABRIR',
        'semanas',
        week.id_semana,
        null
      );

    } else {

      db.prepare(`
        UPDATE semanas
        SET
          estado = 'CERRADA',
          cerrada_en = datetime('now'),
          cerrada_por = ?
        WHERE id_semana = ?
      `).run(
        s.idUsuario,
        week.id_semana
      );

      audit(
        s.idUsuario,
        'CERRAR',
        'semanas',
        week.id_semana,
        null
      );
    }

    return {
      ok: true
    };
  }
);

/* =========================================================
   ELECTRON
========================================================= */

app.whenReady().then(() => {
  openDb();
  createWindow();
});

app.on('activate', () => {
  if (
    BrowserWindow.getAllWindows().length === 0
  ) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
    db = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});