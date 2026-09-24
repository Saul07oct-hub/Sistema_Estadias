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

function hashPassword(password, iterations = 310000) {
  const salt = crypto.randomBytes(32);

  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    32,
    'sha256'
  );

  return {
    hash: hash.toString('hex'),
    salt: salt.toString('hex'),
    iterations
  };
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
   ADMINISTRACIÓN DE OPERADORES
========================================================= */

ipcMain.handle(
  'catalogos:operador:create',
  async (_e, token, input) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {
      const nombre = String(
        input?.nombre || ''
      ).trim();

      if (!nombre) {
        return {
          ok: false,
          mensaje: 'El nombre del operador es obligatorio.'
        };
      }

      const existente = db.prepare(`
        SELECT id_operador
        FROM operadores
        WHERE lower(nombre) = lower(?)
        LIMIT 1
      `).get(nombre);

      if (existente) {
        return {
          ok: false,
          mensaje: 'Ya existe un operador con ese nombre.'
        };
      }

      const info = db.prepare(`
        INSERT INTO operadores(
          nombre,
          activo
        )
        VALUES(?, 1)
      `).run(nombre);

      const idOperador = Number(
        info.lastInsertRowid
      );

      audit(
        s.idUsuario,
        'CREAR',
        'operadores',
        idOperador,
        `Operador ${nombre}`
      );

      return {
        ok: true,
        id_operador: idOperador,
        mensaje: 'Operador agregado correctamente.'
      };

    } catch (error) {
      console.error(
        'Error creando operador:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo crear el operador.'
      };
    }
  }
);


/* =========================================================
   EDITAR OPERADOR
========================================================= */

ipcMain.handle(
  'catalogos:operador:update',
  async (_e, token, idOperador, input) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {
      const id = Number(idOperador);

      const nombre = String(
        input?.nombre || ''
      ).trim();

      if (!id) {
        return {
          ok: false,
          mensaje: 'Operador no válido.'
        };
      }

      if (!nombre) {
        return {
          ok: false,
          mensaje: 'El nombre del operador es obligatorio.'
        };
      }

      const operador = db.prepare(`
        SELECT *
        FROM operadores
        WHERE id_operador = ?
      `).get(id);

      if (!operador) {
        return {
          ok: false,
          mensaje: 'El operador no existe.'
        };
      }

      const duplicado = db.prepare(`
        SELECT id_operador
        FROM operadores
        WHERE
          lower(nombre) = lower(?)
          AND id_operador <> ?
        LIMIT 1
      `).get(nombre, id);

      if (duplicado) {
        return {
          ok: false,
          mensaje: 'Ya existe otro operador con ese nombre.'
        };
      }

      db.prepare(`
        UPDATE operadores
        SET nombre = ?
        WHERE id_operador = ?
      `).run(nombre, id);

      audit(
        s.idUsuario,
        'EDITAR',
        'operadores',
        id,
        `Operador ${nombre}`
      );

      return {
        ok: true,
        mensaje: 'Operador actualizado correctamente.'
      };

    } catch (error) {
      console.error(
        'Error actualizando operador:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo actualizar el operador.'
      };
    }
  }
);


/* =========================================================
   ACTIVAR / DESACTIVAR OPERADOR
========================================================= */

ipcMain.handle(
  'catalogos:operador:status',
  async (_e, token, idOperador, activo) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {
      const id = Number(idOperador);

      const nuevoEstado =
        Number(activo) === 1 ? 1 : 0;

      const operador = db.prepare(`
        SELECT *
        FROM operadores
        WHERE id_operador = ?
      `).get(id);

      if (!operador) {
        return {
          ok: false,
          mensaje: 'El operador no existe.'
        };
      }

      db.prepare(`
        UPDATE operadores
        SET activo = ?
        WHERE id_operador = ?
      `).run(nuevoEstado, id);

      audit(
        s.idUsuario,
        nuevoEstado === 1
          ? 'ACTIVAR'
          : 'DESACTIVAR',
        'operadores',
        id,
        operador.nombre
      );

      return {
        ok: true,
        activo: nuevoEstado === 1,
        mensaje:
          nuevoEstado === 1
            ? 'Operador activado correctamente.'
            : 'Operador desactivado correctamente.'
      };

    } catch (error) {
      console.error(
        'Error cambiando estado del operador:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo cambiar el estado del operador.'
      };
    }
  }
);


/* =========================================================
   ADMINISTRACIÓN DE UNIDADES
========================================================= */

ipcMain.handle(
  'catalogos:unidad:create',
  async (_e, token, input) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {
      const clave = String(
        input?.clave || ''
      )
        .trim()
        .toUpperCase();

      if (!clave) {
        return {
          ok: false,
          mensaje: 'La clave de la unidad es obligatoria.'
        };
      }

      const existente = db.prepare(`
        SELECT id_unidad
        FROM unidades
        WHERE upper(clave) = upper(?)
        LIMIT 1
      `).get(clave);

      if (existente) {
        return {
          ok: false,
          mensaje: 'Ya existe una unidad con esa clave.'
        };
      }

      const info = db.prepare(`
        INSERT INTO unidades(
          clave,
          activo
        )
        VALUES(?, 1)
      `).run(clave);

      const idUnidad = Number(
        info.lastInsertRowid
      );

      audit(
        s.idUsuario,
        'CREAR',
        'unidades',
        idUnidad,
        `Unidad ${clave}`
      );

      return {
        ok: true,
        id_unidad: idUnidad,
        mensaje: 'Unidad agregada correctamente.'
      };

    } catch (error) {
      console.error(
        'Error creando unidad:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo crear la unidad.'
      };
    }
  }
);


/* =========================================================
   EDITAR UNIDAD
========================================================= */

ipcMain.handle(
  'catalogos:unidad:update',
  async (_e, token, idUnidad, input) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {
      const id = Number(idUnidad);

      const clave = String(
        input?.clave || ''
      )
        .trim()
        .toUpperCase();

      if (!id) {
        return {
          ok: false,
          mensaje: 'Unidad no válida.'
        };
      }

      if (!clave) {
        return {
          ok: false,
          mensaje: 'La clave de la unidad es obligatoria.'
        };
      }

      const unidad = db.prepare(`
        SELECT *
        FROM unidades
        WHERE id_unidad = ?
      `).get(id);

      if (!unidad) {
        return {
          ok: false,
          mensaje: 'La unidad no existe.'
        };
      }

      const duplicada = db.prepare(`
        SELECT id_unidad
        FROM unidades
        WHERE
          upper(clave) = upper(?)
          AND id_unidad <> ?
        LIMIT 1
      `).get(clave, id);

      if (duplicada) {
        return {
          ok: false,
          mensaje: 'Ya existe otra unidad con esa clave.'
        };
      }

      db.prepare(`
        UPDATE unidades
        SET clave = ?
        WHERE id_unidad = ?
      `).run(clave, id);

      audit(
        s.idUsuario,
        'EDITAR',
        'unidades',
        id,
        `Unidad ${clave}`
      );

      return {
        ok: true,
        mensaje: 'Unidad actualizada correctamente.'
      };

    } catch (error) {
      console.error(
        'Error actualizando unidad:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo actualizar la unidad.'
      };
    }
  }
);


/* =========================================================
   ACTIVAR / DESACTIVAR UNIDAD
========================================================= */

ipcMain.handle(
  'catalogos:unidad:status',
  async (_e, token, idUnidad, activo) => {

    const s = requireSession(
      token,
      'catalogos.editar'
    );

    try {
      const id = Number(idUnidad);

      const nuevoEstado =
        Number(activo) === 1 ? 1 : 0;

      const unidad = db.prepare(`
        SELECT *
        FROM unidades
        WHERE id_unidad = ?
      `).get(id);

      if (!unidad) {
        return {
          ok: false,
          mensaje: 'La unidad no existe.'
        };
      }

      db.prepare(`
        UPDATE unidades
        SET activo = ?
        WHERE id_unidad = ?
      `).run(nuevoEstado, id);

      audit(
        s.idUsuario,
        nuevoEstado === 1
          ? 'ACTIVAR'
          : 'DESACTIVAR',
        'unidades',
        id,
        unidad.clave
      );

      return {
        ok: true,
        activo: nuevoEstado === 1,
        mensaje:
          nuevoEstado === 1
            ? 'Unidad activada correctamente.'
            : 'Unidad desactivada correctamente.'
      };

    } catch (error) {
      console.error(
        'Error cambiando estado de la unidad:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo cambiar el estado de la unidad.'
      };
    }
  }
);
/* =========================================================
   PERFIL Y USUARIOS
========================================================= */

/* =========================================================
   OBTENER MI PERFIL
========================================================= */

ipcMain.handle(
  'perfil:get',
  async (_e, token) => {

    try {
      const s = requireSession(token);

      const usuario = db.prepare(`
        SELECT
          u.id_usuario,
          u.username,
          u.nombre_completo,
          u.activo,
          u.debe_cambiar_password,
          u.ultimo_acceso,
          u.creado_en,
          u.actualizado_en,
         

          r.id_rol,
          r.codigo AS rol_codigo,
          r.nombre AS rol_nombre

        FROM usuarios u

        JOIN roles r
          ON r.id_rol = u.id_rol

        WHERE u.id_usuario = ?
      `).get(s.idUsuario);

      if (!usuario) {
        return {
          ok: false,
          mensaje: 'Usuario no encontrado.'
        };
      }

      return {
        ok: true,
        usuario
      };

    } catch (error) {

      console.error(
        'Error obteniendo perfil:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo obtener el perfil.'
      };
    }
  }
);


/* =========================================================
   EDITAR MI PERFIL
========================================================= */

ipcMain.handle(
  'perfil:update',
  async (_e, token, input) => {

    try {
      const s = requireSession(token);

      const nombre = String(
        input?.nombre_completo || ''
      ).trim();

      const username = String(
        input?.username || ''
      ).trim();

      if (!nombre) {
        return {
          ok: false,
          mensaje:
            'El nombre es obligatorio.'
        };
      }

      if (!username) {
        return {
          ok: false,
          mensaje:
            'El usuario es obligatorio.'
        };
      }

      if (username.length < 3) {
        return {
          ok: false,
          mensaje:
            'El usuario debe tener al menos 3 caracteres.'
        };
      }

      const duplicado = db.prepare(`
        SELECT id_usuario
        FROM usuarios

        WHERE
          lower(username) = lower(?)
          AND id_usuario <> ?

        LIMIT 1
      `).get(
        username,
        s.idUsuario
      );

      if (duplicado) {
        return {
          ok: false,
          mensaje:
            'Ese nombre de usuario ya está registrado.'
        };
      }

      db.prepare(`
        UPDATE usuarios

        SET
          nombre_completo = ?,
          username = ?,
          actualizado_en = datetime('now')

        WHERE id_usuario = ?
      `).run(
        nombre,
        username,
        s.idUsuario
      );

      /*
        También actualizamos el username
        almacenado en la sesión actual.
      */

      const session =
        sessions.get(String(token));

      if (session) {
        session.username = username;
      }

      audit(
        s.idUsuario,
        'EDITAR_PERFIL',
        'usuarios',
        s.idUsuario,
        `Usuario ${username}`
      );

      return {
        ok: true,
        mensaje:
          'Perfil actualizado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error actualizando perfil:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo actualizar el perfil.'
      };
    }
  }
);


/* =========================================================
   CAMBIAR MI CONTRASEÑA
========================================================= */

ipcMain.handle(
  'perfil:password',
  async (_e, token, input) => {

    try {
      const s = requireSession(token);

      const actual =
        String(
          input?.password_actual || ''
        );

      const nueva =
        String(
          input?.password_nueva || ''
        );

      if (!actual || !nueva) {
        return {
          ok: false,
          mensaje:
            'Ingresa la contraseña actual y la nueva.'
        };
      }

      if (nueva.length < 8) {
        return {
          ok: false,
          mensaje:
            'La nueva contraseña debe tener al menos 8 caracteres.'
        };
      }

      const usuario = db.prepare(`
        SELECT *
        FROM usuarios
        WHERE id_usuario = ?
      `).get(s.idUsuario);

      if (!usuario) {
        return {
          ok: false,
          mensaje:
            'Usuario no encontrado.'
        };
      }

      const correcta =
        verifyPassword(
          actual,
          usuario.password_salt,
          usuario.password_hash,
          usuario.password_iteraciones
        );

      if (!correcta) {
        return {
          ok: false,
          mensaje:
            'La contraseña actual es incorrecta.'
        };
      }

      const password =
        hashPassword(nueva);

      db.prepare(`
        UPDATE usuarios

        SET
          password_hash = ?,
          password_salt = ?,
          password_algoritmo = 'PBKDF2-SHA256',
          password_iteraciones = ?,
          debe_cambiar_password = 0,
          intentos_fallidos = 0,
          bloqueado_hasta = NULL,
          actualizado_en = datetime('now')

        WHERE id_usuario = ?
      `).run(
        password.hash,
        password.salt,
        password.iterations,
        s.idUsuario
      );

      audit(
        s.idUsuario,
        'CAMBIAR_PASSWORD',
        'usuarios',
        s.idUsuario,
        'Cambio de contraseña propia'
      );

      return {
        ok: true,
        mensaje:
          'Contraseña actualizada correctamente.'
      };

    } catch (error) {

      console.error(
        'Error cambiando contraseña:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo cambiar la contraseña.'
      };
    }
  }
);


/* =========================================================
   ADMIN - LISTAR USUARIOS
========================================================= */

ipcMain.handle(
  'usuarios:list',
  async (_e, token) => {

    try {
      requireSession(
        token,
        'usuarios.gestionar'
      );

      const usuarios = db.prepare(`
        SELECT
          u.id_usuario,
          u.username,
          u.nombre_completo,
          u.activo,
          u.debe_cambiar_password,
          u.intentos_fallidos,
          u.bloqueado_hasta,
          u.ultimo_acceso,
          u.creado_en,
          u.actualizado_en,
          

          r.id_rol,
          r.codigo AS rol_codigo,
          r.nombre AS rol_nombre

        FROM usuarios u

        JOIN roles r
          ON r.id_rol = u.id_rol

        ORDER BY
          u.activo DESC,
          u.nombre_completo ASC
      `).all();

      return {
        ok: true,
        usuarios
      };

    } catch (error) {

      console.error(
        'Error listando usuarios:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudieron obtener los usuarios.'
      };
    }
  }
);


/* =========================================================
   ADMIN - CREAR USUARIO
========================================================= */

ipcMain.handle(
  'usuarios:create',
  async (_e, token, input) => {

    try {
      const s = requireSession(
        token,
        'usuarios.gestionar'
      );

      const nombre = String(
        input?.nombre_completo || ''
      ).trim();

      const username = String(
        input?.username || ''
      ).trim();

      const passwordPlano = String(
        input?.password || ''
      );

      const idRol = Number(
        input?.id_rol
      );

      if (!nombre) {
        return {
          ok: false,
          mensaje:
            'El nombre es obligatorio.'
        };
      }

      if (!username) {
        return {
          ok: false,
          mensaje:
            'El usuario es obligatorio.'
        };
      }

      if (username.length < 3) {
        return {
          ok: false,
          mensaje:
            'El usuario debe tener al menos 3 caracteres.'
        };
      }

      if (passwordPlano.length < 8) {
        return {
          ok: false,
          mensaje:
            'La contraseña debe tener al menos 8 caracteres.'
        };
      }

      if (!idRol) {
        return {
          ok: false,
          mensaje:
            'Selecciona un rol.'
        };
      }

      const rol = db.prepare(`
        SELECT *
        FROM roles
        WHERE id_rol = ?
      `).get(idRol);

      if (!rol) {
        return {
          ok: false,
          mensaje:
            'El rol seleccionado no existe.'
        };
      }

      const existente = db.prepare(`
        SELECT id_usuario
        FROM usuarios
        WHERE lower(username) = lower(?)
        LIMIT 1
      `).get(username);

      if (existente) {
        return {
          ok: false,
          mensaje:
            'Ese nombre de usuario ya existe.'
        };
      }

      const password =
        hashPassword(passwordPlano);

      const info = db.prepare(`
        INSERT INTO usuarios(
          id_rol,
          username,
          nombre_completo,
          password_hash,
          password_salt,
          password_algoritmo,
          password_iteraciones,
          debe_cambiar_password,
          activo,
          intentos_fallidos,
          creado_en,
          actualizado_en
        )

        VALUES(
          ?,?,?,?,?,
          'PBKDF2-SHA256',
          ?,
          1,
          1,
          0,
          datetime('now'),
          datetime('now')
        )
      `).run(
        idRol,
        username,
        nombre,
        password.hash,
        password.salt,
        password.iterations
      );

      const idUsuario =
        Number(info.lastInsertRowid);

      audit(
        s.idUsuario,
        'CREAR',
        'usuarios',
        idUsuario,
        `${nombre} (${username})`
      );

      return {
        ok: true,
        id_usuario: idUsuario,
        mensaje:
          'Usuario creado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error creando usuario:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo crear el usuario.'
      };
    }
  }
);


/* =========================================================
   ADMIN - EDITAR USUARIO
========================================================= */

ipcMain.handle(
  'usuarios:update',
  async (_e, token, idUsuario, input) => {

    try {
      const s = requireSession(
        token,
        'usuarios.gestionar'
      );

      const id =
        Number(idUsuario);

      const nombre =
        String(
          input?.nombre_completo || ''
        ).trim();

      const username =
        String(
          input?.username || ''
        ).trim();

      const idRol =
        Number(input?.id_rol);

      if (!id) {
        return {
          ok: false,
          mensaje:
            'Usuario no válido.'
        };
      }

      if (!nombre || !username || !idRol) {
        return {
          ok: false,
          mensaje:
            'Completa todos los datos.'
        };
      }

      const usuario = db.prepare(`
        SELECT *
        FROM usuarios
        WHERE id_usuario = ?
      `).get(id);

      if (!usuario) {
        return {
          ok: false,
          mensaje:
            'El usuario no existe.'
        };
      }

      const rol = db.prepare(`
        SELECT *
        FROM roles
        WHERE id_rol = ?
      `).get(idRol);

      if (!rol) {
        return {
          ok: false,
          mensaje:
            'El rol no existe.'
        };
      }

      const duplicado = db.prepare(`
        SELECT id_usuario
        FROM usuarios

        WHERE
          lower(username) = lower(?)
          AND id_usuario <> ?

        LIMIT 1
      `).get(
        username,
        id
      );

      if (duplicado) {
        return {
          ok: false,
          mensaje:
            'Ese nombre de usuario ya está ocupado.'
        };
      }

      db.prepare(`
        UPDATE usuarios

        SET
          nombre_completo = ?,
          username = ?,
          id_rol = ?,
          actualizado_en = datetime('now')

        WHERE id_usuario = ?
      `).run(
        nombre,
        username,
        idRol,
        id
      );

      /*
        Cerramos cualquier sesión del usuario
        editado para que vuelva a cargar rol,
        username y permisos.
      */

      for (
        const [sessionToken, session]
        of sessions.entries()
      ) {
        if (
          session.idUsuario === id &&
          sessionToken !== String(token)
        ) {
          sessions.delete(sessionToken);
        }
      }

      /*
        Si el administrador se editó a sí mismo,
        actualizamos su sesión actual.
      */

      if (id === s.idUsuario) {

        const current =
          sessions.get(String(token));

        if (current) {
          current.username = username;
          current.idRol = idRol;
          current.permissions =
            permissionsForRole(idRol);
        }
      }

      audit(
        s.idUsuario,
        'EDITAR',
        'usuarios',
        id,
        `${nombre} (${username})`
      );

      return {
        ok: true,
        mensaje:
          'Usuario actualizado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error actualizando usuario:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo actualizar el usuario.'
      };
    }
  }
);


/* =========================================================
   ADMIN - ACTIVAR / DESACTIVAR USUARIO
========================================================= */

ipcMain.handle(
  'usuarios:status',
  async (_e, token, idUsuario, activo) => {

    try {
      const s = requireSession(
        token,
        'usuarios.gestionar'
      );

      const id =
        Number(idUsuario);

      const nuevoEstado =
        Number(activo) === 1
          ? 1
          : 0;

      if (id === s.idUsuario && nuevoEstado === 0) {
        return {
          ok: false,
          mensaje:
            'No puedes desactivar tu propia cuenta.'
        };
      }

      const usuario = db.prepare(`
        SELECT *
        FROM usuarios
        WHERE id_usuario = ?
      `).get(id);

      if (!usuario) {
        return {
          ok: false,
          mensaje:
            'El usuario no existe.'
        };
      }

      db.prepare(`
        UPDATE usuarios

        SET
          activo = ?,
          intentos_fallidos = 0,
          bloqueado_hasta = NULL,
          actualizado_en = datetime('now')

        WHERE id_usuario = ?
      `).run(
        nuevoEstado,
        id
      );

      /*
        Si se desactiva:
        eliminamos inmediatamente todas
        sus sesiones abiertas.
      */

      if (nuevoEstado === 0) {

        for (
          const [sessionToken, session]
          of sessions.entries()
        ) {
          if (session.idUsuario === id) {
            sessions.delete(sessionToken);
          }
        }
      }

      audit(
        s.idUsuario,
        nuevoEstado === 1
          ? 'ACTIVAR'
          : 'DESACTIVAR',
        'usuarios',
        id,
        usuario.username
      );

      return {
        ok: true,

        activo:
          nuevoEstado === 1,

        mensaje:
          nuevoEstado === 1
            ? 'Usuario activado correctamente.'
            : 'Usuario desactivado correctamente.'
      };

    } catch (error) {

      console.error(
        'Error cambiando estado del usuario:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo cambiar el estado.'
      };
    }
  }
);


/* =========================================================
   ADMIN - RESTABLECER CONTRASEÑA
========================================================= */

ipcMain.handle(
  'usuarios:resetPassword',
  async (_e, token, idUsuario, nuevaPassword) => {

    try {
      const s = requireSession(
        token,
        'usuarios.gestionar'
      );

      const id =
        Number(idUsuario);

      const nueva =
        String(
          nuevaPassword || ''
        );

      if (nueva.length < 8) {
        return {
          ok: false,
          mensaje:
            'La contraseña debe tener al menos 8 caracteres.'
        };
      }

      const usuario = db.prepare(`
        SELECT *
        FROM usuarios
        WHERE id_usuario = ?
      `).get(id);

      if (!usuario) {
        return {
          ok: false,
          mensaje:
            'El usuario no existe.'
        };
      }

      const password =
        hashPassword(nueva);

      db.prepare(`
        UPDATE usuarios

        SET
          password_hash = ?,
          password_salt = ?,
          password_algoritmo = 'PBKDF2-SHA256',
          password_iteraciones = ?,
          debe_cambiar_password = 1,
          intentos_fallidos = 0,
          bloqueado_hasta = NULL,
          actualizado_en = datetime('now')

        WHERE id_usuario = ?
      `).run(
        password.hash,
        password.salt,
        password.iterations,
        id
      );

      /*
        Cerramos sesiones abiertas del usuario.
      */

      for (
        const [sessionToken, session]
        of sessions.entries()
      ) {
        if (session.idUsuario === id) {
          sessions.delete(sessionToken);
        }
      }

      audit(
        s.idUsuario,
        'RESET_PASSWORD',
        'usuarios',
        id,
        `Contraseña restablecida para ${usuario.username}`
      );

      return {
        ok: true,
        mensaje:
          'Contraseña restablecida correctamente.'
      };

    } catch (error) {

      console.error(
        'Error restableciendo contraseña:',
        error
      );

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudo restablecer la contraseña.'
      };
    }
  }
);


/* =========================================================
   ROLES DISPONIBLES
========================================================= */

ipcMain.handle(
  'usuarios:roles',
  async (_e, token) => {

    try {
      requireSession(
        token,
        'usuarios.gestionar'
      );

      const roles = db.prepare(`
        SELECT
          id_rol,
          codigo,
          nombre

        FROM roles

        ORDER BY id_rol
      `).all();

      return {
        ok: true,
        roles
      };

    } catch (error) {

      return {
        ok: false,
        mensaje:
          error.message ||
          'No se pudieron obtener los roles.'
      };
    }
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
