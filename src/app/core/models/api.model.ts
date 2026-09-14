export interface NvkUser {
  id_usuario: number;
  username: string;
  nombre_completo: string;
  rol: { id_rol: number; codigo: string; nombre: string };
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
      login(username: string, password: string): Promise<LoginResult>;
      logout(token: string): Promise<any>;
      dashboard(token: string): Promise<any>;
      viajeOptions(token: string): Promise<any>;
      createViaje(token: string, input: any): Promise<any>;
      listViajes(token: string, filters?: any): Promise<any>;
      resumen(token: string, idMaterial?: number): Promise<any>;
      pagos(token: string): Promise<any>;
      marcarSello(token: string, idViaje: number): Promise<any>;
      pagarSaldo(token: string, idViaje: number): Promise<any>;
      catalogos(token: string): Promise<any>;
      corte(token: string): Promise<any>;
      toggleSemana(token: string, action: 'reabrir'|'cerrar'): Promise<any>;
    };
  }
}
export {};
