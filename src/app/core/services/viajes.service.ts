import { Injectable, computed, signal } from '@angular/core';
import { VIAJES_DEMO } from '../data/viajes-demo';
import { MaterialConfig, MaterialNombre, Viaje } from '../models/viaje.model';

@Injectable({ providedIn: 'root' })
export class ViajesService {
  private readonly storageKey = 'nvk-control-cortes-v1-demo';

  readonly materiales: MaterialConfig[] = [
    { nombre: 'Cerámica', volumen: 14, precio: 1553.36, documento: 'Carta Porte', interno: false },
    { nombre: 'Yeso', volumen: 30, precio: 3106.72, documento: 'Carta Porte', interno: false },
    { nombre: 'Lodo cribas', volumen: 7, precio: 1434.55, documento: 'Carta Porte', interno: false },
    { nombre: 'Lodo Novaceramic', volumen: 14, precio: 2247.81, documento: 'Carta Porte', interno: false },
    { nombre: 'Cerámica interno', volumen: 14, precio: 1941.71, documento: 'Manifiesto', interno: true },
    { nombre: 'Lodo pastas interno', volumen: 14, precio: 1553.36, documento: 'Manifiesto', interno: true },
  ];

  private readonly _viajes = signal<Viaje[]>(this.loadInitialData());
  readonly viajes = this._viajes.asReadonly();

  readonly totalViajes = computed(() => this._viajes().length);
  readonly sinSello = computed(() => this._viajes().filter((viaje) => !viaje.selloRecibido).length);
  readonly totalFletes = computed(() => this.round(this.rawFletes()));
  readonly saldoPendiente = computed(() =>
    this.round(this._viajes().reduce((acc, viaje) => {
      const totalExacto = viaje.precioUnitario * 1.12;
      return acc + Math.max(totalExacto - viaje.pagado, 0);
    }, 0)),
  );

  readonly totalServicios = computed(() => this.round(this.rawServicios()));

  // Se redondea al final para coincidir con el CORTE TOTAL del Excel real.
  readonly totalSemana = computed(() => this.round(this.rawFletes() + this.rawServicios()));

  readonly materialResumen = computed(() =>
    this.materiales.map((material) => {
      const viajes = this._viajes().filter((viaje) => viaje.material === material.nombre);
      return {
        material: material.nombre,
        viajes: viajes.length,
        volumen: viajes.reduce((acc, viaje) => acc + viaje.volumen, 0),
        total: this.round(viajes.reduce((acc, viaje) => acc + viaje.total, 0)),
      };
    }),
  );

  getMaterial(nombre: MaterialNombre): MaterialConfig {
    return this.materiales.find((material) => material.nombre === nombre) ?? this.materiales[0];
  }

  isFolioDuplicate(folio: string, excludeId?: number): boolean {
    const normalized = folio.trim().toUpperCase();
    if (!normalized) return false;
    return this._viajes().some(
      (viaje) => viaje.id !== excludeId && viaje.folio.trim().toUpperCase() === normalized,
    );
  }

  isOrderDuplicate(ordenSalida: string, excludeId?: number): boolean {
    const normalized = ordenSalida.trim();
    if (!normalized) return false;
    return this._viajes().some(
      (viaje) => viaje.id !== excludeId && viaje.ordenSalida.trim() === normalized,
    );
  }

  duplicateFolios(): string[] {
    return this.findDuplicates(this._viajes().map((viaje) => viaje.folio));
  }

  duplicateOrders(): string[] {
    return this.findDuplicates(this._viajes().map((viaje) => viaje.ordenSalida));
  }

  addViaje(input: Omit<Viaje, 'id' | 'iva' | 'retencion' | 'total' | 'selloRecibido' | 'pagado'>): Viaje {
    const iva = this.round(input.precioUnitario * 0.16);
    const retencion = this.round(input.precioUnitario * 0.04);
    const total = this.round(input.precioUnitario + iva - retencion);
    const viaje: Viaje = {
      ...input,
      id: Math.max(0, ...this._viajes().map((item) => item.id)) + 1,
      iva,
      retencion,
      total,
      selloRecibido: false,
      pagado: 0,
    };

    this._viajes.update((viajes) => [viaje, ...viajes]);
    this.persist();
    return viaje;
  }

  resetDemo(): void {
    this._viajes.set(structuredClone(VIAJES_DEMO));
    this.persist();
  }


  private rawFletes(): number {
    return this._viajes().reduce((acc, viaje) => acc + viaje.precioUnitario * 1.12, 0);
  }

  private rawServicios(): number {
    const counts = this.materialCounts();
    const destruccionCeramica = (counts['Cerámica'] ?? 0) * 1175.58 * 1.16;
    const destruccionYeso = (counts['Yeso'] ?? 0) * 2351.56 * 1.16;
    const pesajeYeso = (counts['Yeso'] ?? 0) * 139.96 * 1.16;
    const pesajeCeramica = (counts['Cerámica'] ?? 0) * 87.47 * 1.16;
    const pesajeCribas = (counts['Lodo cribas'] ?? 0) * 87.47 * 1.16;
    return destruccionCeramica + destruccionYeso + pesajeYeso + pesajeCeramica + pesajeCribas;
  }

  private materialCounts(): Record<string, number> {
    return this._viajes().reduce<Record<string, number>>((acc, viaje) => {
      acc[viaje.material] = (acc[viaje.material] ?? 0) + 1;
      return acc;
    }, {});
  }

  private findDuplicates(values: string[]): string[] {
    const counts = new Map<string, number>();
    values.filter(Boolean).forEach((value) => {
      const normalized = value.trim().toUpperCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  }

  private loadInitialData(): Viaje[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) return JSON.parse(stored) as Viaje[];
    } catch {
      // En modo demo, si localStorage no está disponible se usan los datos base.
    }
    return structuredClone(VIAJES_DEMO);
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this._viajes()));
    } catch {
      // La persistencia real se implementará con SQLite en la fase de escritorio.
    }
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
