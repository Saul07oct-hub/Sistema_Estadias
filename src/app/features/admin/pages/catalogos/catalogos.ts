import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';

interface MaterialForm {
  id_material: number | null;
  codigo: string;
  nombre: string;
  tipo_operacion: 'EXTERNO' | 'INTERNO';
  volumen: number;
  tipo_documento_default: string;
  tipo_referencia_default: string;
  precio: number;
  activo: number;
}

@Component({
  selector: 'app-catalogos',
  imports: [CurrencyPipe],
  templateUrl: './catalogos.html',
  styleUrl: './catalogos.scss'
})
export class Catalogos implements OnInit {

  readonly auth = inject(AuthService);

  readonly data = signal<any>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly error = signal('');
  readonly message = signal('');

  readonly materialModalOpen = signal(false);
  readonly editingMaterial = signal(false);

  readonly materialForm = signal<MaterialForm>(
    this.emptyMaterial()
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /* =======================================================
     CARGAR CATÁLOGOS
  ======================================================= */

  async reload(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set('');

      const response = await window.nvkAPI.catalogos(
        this.auth.token()
      );

      if (!response?.ok) {
        this.error.set(
          response?.mensaje ||
          'No se pudieron cargar los catálogos.'
        );
        return;
      }

      this.data.set(response);

    } catch (error) {
      console.error(error);

      this.error.set(
        'Ocurrió un error al cargar los catálogos.'
      );

    } finally {
      this.loading.set(false);
    }
  }

  /* =======================================================
     PERMISOS
  ======================================================= */

  has(permission: string): boolean {
    return this.auth.has(permission);
  }

  canEdit(): boolean {
    return this.has('catalogos.editar');
  }

  /* =======================================================
     FORMULARIO VACÍO
  ======================================================= */

  private emptyMaterial(): MaterialForm {
    return {
      id_material: null,
      codigo: '',
      nombre: '',
      tipo_operacion: 'EXTERNO',
      volumen: 14,
      tipo_documento_default: 'CARTA_PORTE',
      tipo_referencia_default: 'REFERENCIA',
      precio: 0,
      activo: 1
    };
  }

  /* =======================================================
     NUEVO MATERIAL
  ======================================================= */

  nuevoMaterial(): void {

    if (!this.canEdit()) {
      return;
    }

    this.error.set('');
    this.message.set('');

    this.editingMaterial.set(false);

    this.materialForm.set(
      this.emptyMaterial()
    );

    this.materialModalOpen.set(true);
  }

  /* =======================================================
     EDITAR MATERIAL
  ======================================================= */

  editarMaterial(material: any): void {

    if (!this.canEdit()) {
      return;
    }

    this.error.set('');
    this.message.set('');

    this.editingMaterial.set(true);

    this.materialForm.set({
      id_material:
        Number(material.id_material),

      codigo:
        String(material.codigo || ''),

      nombre:
        String(material.nombre || ''),

      tipo_operacion:
        material.tipo_operacion === 'INTERNO'
          ? 'INTERNO'
          : 'EXTERNO',

      volumen:
        Number(material.volumen || 0),

      tipo_documento_default:
        String(
          material.tipo_documento_default ||
          'CARTA_PORTE'
        ),

      tipo_referencia_default:
        String(
          material.tipo_referencia_default ||
          'REFERENCIA'
        ),

      precio:
        Number(material.precio || 0),

      activo:
        Number(material.activo) === 0
          ? 0
          : 1
    });

    this.materialModalOpen.set(true);
  }

  /* =======================================================
     CERRAR FORMULARIO
  ======================================================= */

  cerrarMaterialModal(): void {

    if (this.saving()) {
      return;
    }

    this.materialModalOpen.set(false);
    this.editingMaterial.set(false);

    this.materialForm.set(
      this.emptyMaterial()
    );
  }

  /* =======================================================
     ACTUALIZAR CAMPOS DEL FORMULARIO
  ======================================================= */

  setMaterialField(
    field: keyof MaterialForm,
    value: any
  ): void {

    this.materialForm.update(current => ({
      ...current,
      [field]: value
    }));
  }

  /* =======================================================
     GUARDAR MATERIAL
  ======================================================= */

  async guardarMaterial(): Promise<void> {

    if (
      !this.canEdit() ||
      this.saving()
    ) {
      return;
    }

    const form =
      this.materialForm();

    const nombre =
      form.nombre.trim();

    const codigo =
      form.codigo
        .trim()
        .toUpperCase();

    const volumen =
      Number(form.volumen);

    const precio =
      Number(form.precio);

    /* =========================
       VALIDACIÓN FRONTEND
    ========================= */

    if (!nombre) {
      this.error.set(
        'Escribe el nombre del material.'
      );
      return;
    }

    if (!codigo) {
      this.error.set(
        'Escribe el código del material.'
      );
      return;
    }

    if (
      !Number.isFinite(volumen) ||
      volumen <= 0
    ) {
      this.error.set(
        'El volumen debe ser mayor a 0.'
      );
      return;
    }

    if (
      !Number.isFinite(precio) ||
      precio < 0
    ) {
      this.error.set(
        'El precio unitario no es válido.'
      );
      return;
    }

    const payload = {
      codigo,
      nombre,

      tipo_operacion:
        form.tipo_operacion,

      volumen,

      tipo_documento_default:
        form.tipo_documento_default,

      tipo_referencia_default:
        form.tipo_referencia_default,

      precio,

      activo:
        form.activo
    };

    try {

      this.saving.set(true);
      this.error.set('');
      this.message.set('');

      let response: any;

      /* =========================
         EDITAR
      ========================= */

      if (
        this.editingMaterial() &&
        form.id_material
      ) {

        response =
          await window.nvkAPI.editarMaterial(
            this.auth.token(),
            form.id_material,
            payload
          );

      /* =========================
         CREAR
      ========================= */

      } else {

        response =
          await window.nvkAPI.crearMaterial(
            this.auth.token(),
            payload
          );
      }

      if (!response?.ok) {
        this.error.set(
          response?.mensaje ||
          'No se pudo guardar el material.'
        );
        return;
      }

      this.materialModalOpen.set(false);
      this.editingMaterial.set(false);

      this.message.set(
        response?.mensaje ||
        'Material guardado correctamente.'
      );

      await this.reload();

    } catch (error) {

      console.error(error);

      this.error.set(
        'Ocurrió un error al guardar el material.'
      );

    } finally {
      this.saving.set(false);
    }
  }

  /* =======================================================
     ACTIVAR / DESACTIVAR
  ======================================================= */

  async cambiarEstadoMaterial(
    material: any
  ): Promise<void> {

    if (
      !this.canEdit() ||
      this.saving()
    ) {
      return;
    }

    const actualmenteActivo =
      Number(material.activo) === 1;

    const nuevoEstado =
      actualmenteActivo
        ? 0
        : 1;

    try {

      this.saving.set(true);
      this.error.set('');
      this.message.set('');

      const response =
        await window.nvkAPI.cambiarEstadoMaterial(
          this.auth.token(),
          Number(material.id_material),
          nuevoEstado
        );

      if (!response?.ok) {
        this.error.set(
          response?.mensaje ||
          'No se pudo cambiar el estado.'
        );
        return;
      }

      this.message.set(
        response?.mensaje ||
        (
          nuevoEstado === 1
            ? 'Material activado.'
            : 'Material desactivado.'
        )
      );

      await this.reload();

    } catch (error) {

      console.error(error);

      this.error.set(
        'Ocurrió un error al cambiar el estado del material.'
      );

    } finally {
      this.saving.set(false);
    }
  }
}