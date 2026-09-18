export interface NvkUser {
  id_usuario: number;
  username: string;
  nombre_completo: string;
  rol: {
    id_rol: number;
    codigo: string;
    nombre: string;
  };
  permisos: string[];
  debe_cambiar_password: boolean;
}

export interface LoginResult {
  ok: boolean;
  mensaje?: string;
  token?: string;
  usuario?: NvkUser;
}

declare global {
  interface Window {
    nvkAPI: {

      // =========================
      // AUTENTICACIÓN
      // =========================

      login(
        username: string,
        password: string
      ): Promise<LoginResult>;

      logout(
        token: string
      ): Promise<any>;

      // =========================
      // DASHBOARD
      // =========================

      dashboard(
        token: string
      ): Promise<any>;

      // =========================
      // VIAJES
      // =========================

      viajeOptions(
        token: string
      ): Promise<any>;

      createViaje(
        token: string,
        input: any
      ): Promise<any>;

      listViajes(
        token: string,
        filters?: any
      ): Promise<any>;

      // =========================
      // RESÚMENES
      // =========================

      resumen(
        token: string,
        idMaterial?: number
      ): Promise<any>;

      // =========================
      // PAGOS / SELLOS
      // =========================

      pagos(
        token: string
      ): Promise<any>;

      marcarSello(
        token: string,
        idViaje: number
      ): Promise<any>;

      pagarSaldo(
        token: string,
        idViaje: number
      ): Promise<any>;

      // =========================
      // CATÁLOGOS
      // =========================

      catalogos(
        token: string
      ): Promise<any>;

      // ----- MATERIALES -----

      crearMaterial(
        token: string,
        data: any
      ): Promise<any>;

      editarMaterial(
        token: string,
        idMaterial: number,
        data: any
      ): Promise<any>;

      cambiarEstadoMaterial(
        token: string,
        idMaterial: number,
        activo: number
      ): Promise<any>;

      // =========================
      // CORTE SEMANAL
      // =========================

      corte(
        token: string
      ): Promise<any>;

      toggleSemana(
        token: string,
        action: 'reabrir' | 'cerrar'
      ): Promise<any>;
    };
  }
}

export {};