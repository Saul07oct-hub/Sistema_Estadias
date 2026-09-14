export type MaterialNombre =
  | 'Cerámica'
  | 'Yeso'
  | 'Lodo cribas'
  | 'Lodo Novaceramic'
  | 'Cerámica interno'
  | 'Lodo pastas interno';

export type TipoDocumento = 'Carta Porte' | 'Manifiesto';

export interface Viaje {
  id: number;
  fecha: string;
  hora: string;
  material: MaterialNombre;
  operador: string;
  unidad: string;
  tipoDocumento: TipoDocumento;
  folio: string;
  ordenSalida: string;
  volumen: number;
  precioUnitario: number;
  iva: number;
  retencion: number;
  total: number;
  selloRecibido: boolean;
  pagado: number;
}

export interface MaterialConfig {
  nombre: MaterialNombre;
  volumen: number;
  precio: number;
  documento: TipoDocumento;
  interno: boolean;
}
