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
      // PERFIL
      // =========================

      perfil(
        token: string
      ): Promise<any>;

      editarPerfil(
        token: string,
        data: {
          nombre_completo: string;
          username: string;
        }
      ): Promise<any>;

      cambiarPassword(
        token: string,
        data: {
          password_actual: string;
          password_nueva: string;
        }
      ): Promise<any>;


      // =========================
      // ADMINISTRACIÓN DE USUARIOS
      // =========================

      usuarios(
        token: string
      ): Promise<any>;

      rolesUsuarios(
        token: string
      ): Promise<any>;

      crearUsuario(
        token: string,
        data: {
          nombre_completo: string;
          username: string;
          password: string;
          id_rol: number;
        }
      ): Promise<any>;

      editarUsuario(
        token: string,
        idUsuario: number,
        data: {
          nombre_completo: string;
          username: string;
          id_rol: number;
        }
      ): Promise<any>;

      cambiarEstadoUsuario(
        token: string,
        idUsuario: number,
        activo: number
      ): Promise<any>;

      restablecerPasswordUsuario(
        token: string,
        idUsuario: number,
        password: string
      ): Promise<any>;
      
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


      // =========================
      // MATERIALES
      // =========================

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
      // OPERADORES
      // =========================

      crearOperador(
        token: string,
        data: any
      ): Promise<any>;

      editarOperador(
        token: string,
        idOperador: number,
        data: any
      ): Promise<any>;

      cambiarEstadoOperador(
        token: string,
        idOperador: number,
        activo: number
      ): Promise<any>;


      // =========================
      // UNIDADES
      // =========================

      crearUnidad(
        token: string,
        data: any
      ): Promise<any>;

      editarUnidad(
        token: string,
        idUnidad: number,
        data: any
      ): Promise<any>;

      cambiarEstadoUnidad(
        token: string,
        idUnidad: number,
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