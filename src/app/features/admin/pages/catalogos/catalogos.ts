import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';


/* =========================================================
   INTERFACES
========================================================= */

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

interface OperatorForm {
  id_operador: number | null;
  nombre: string;
  activo: number;
}

interface UnitForm {
  id_unidad: number | null;
  clave: string;
  activo: number;
}


/* =========================================================
   COMPONENTE
========================================================= */

@Component({
  selector: 'app-catalogos',
  imports: [CurrencyPipe],
  templateUrl: './catalogos.html',
  styleUrl: './catalogos.scss'
})
export class Catalogos implements OnInit {

  readonly auth = inject(AuthService);


  /* =======================================================
     ESTADO GENERAL
  ======================================================= */

  readonly data = signal<any>(null);

  readonly loading = signal(true);

  readonly saving = signal(false);

  readonly error = signal('');

  readonly message = signal('');


  /* =======================================================
     ESTADO MODAL MATERIAL
  ======================================================= */

  readonly materialModalOpen = signal(false);

  readonly editingMaterial = signal(false);

  readonly materialForm = signal<MaterialForm>(
    this.emptyMaterial()
  );


  /* =======================================================
     ESTADO MODAL OPERADOR
  ======================================================= */

  readonly operatorModalOpen = signal(false);

  readonly editingOperator = signal(false);

  readonly operatorForm = signal<OperatorForm>(
    this.emptyOperator()
  );


  /* =======================================================
     ESTADO MODAL UNIDAD
  ======================================================= */

  readonly unitModalOpen = signal(false);

  readonly editingUnit = signal(false);

  readonly unitForm = signal<UnitForm>(
    this.emptyUnit()
  );


  /* =======================================================
     INICIO
  ======================================================= */

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

      const response =
        await window.nvkAPI.catalogos(
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
     FORMULARIOS VACÍOS
  ======================================================= */

  private emptyMaterial(): MaterialForm {

    return {

      id_material: null,

      codigo: '',

      nombre: '',

      tipo_operacion: 'EXTERNO',

      volumen: 14,

      tipo_documento_default:
        'CARTA_PORTE',

      tipo_referencia_default:
        'REFERENCIA',

      precio: 0,

      activo: 1

    };
  }


  private emptyOperator(): OperatorForm {

    return {

      id_operador: null,

      nombre: '',

      activo: 1

    };
  }


  private emptyUnit(): UnitForm {

    return {

      id_unidad: null,

      clave: '',

      activo: 1

    };
  }


  /* =======================================================
     MATERIAL - NUEVO
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
     MATERIAL - EDITAR
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
     MATERIAL - CERRAR MODAL
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
     MATERIAL - ACTUALIZAR CAMPO
  ======================================================= */

  setMaterialField(
    field: keyof MaterialForm,
    value: any
  ): void {

    this.materialForm.update(
      current => ({
        ...current,
        [field]: value
      })
    );

  }


  /* =======================================================
     MATERIAL - GUARDAR
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
       VALIDACIONES
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
     MATERIAL - ACTIVAR / DESACTIVAR
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


    const nuevoEstado =
      Number(material.activo) === 1
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


  /* =======================================================
     OPERADOR - NUEVO
  ======================================================= */

  nuevoOperador(): void {

    if (!this.canEdit()) {
      return;
    }

    this.error.set('');

    this.message.set('');

    this.editingOperator.set(false);

    this.operatorForm.set(
      this.emptyOperator()
    );

    this.operatorModalOpen.set(true);

  }


  /* =======================================================
     OPERADOR - EDITAR
  ======================================================= */

  editarOperador(
    operador: any
  ): void {

    if (!this.canEdit()) {
      return;
    }


    this.error.set('');

    this.message.set('');

    this.editingOperator.set(true);


    this.operatorForm.set({

      id_operador:
        Number(operador.id_operador),

      nombre:
        String(operador.nombre || ''),

      activo:
        Number(operador.activo) === 0
          ? 0
          : 1

    });


    this.operatorModalOpen.set(true);

  }


  /* =======================================================
     OPERADOR - CERRAR MODAL
  ======================================================= */

  cerrarOperatorModal(): void {

    if (this.saving()) {
      return;
    }


    this.operatorModalOpen.set(false);

    this.editingOperator.set(false);

    this.operatorForm.set(
      this.emptyOperator()
    );

  }


  /* =======================================================
     OPERADOR - ACTUALIZAR CAMPO
  ======================================================= */

  setOperatorField(
    field: keyof OperatorForm,
    value: any
  ): void {

    this.operatorForm.update(
      current => ({
        ...current,
        [field]: value
      })
    );

  }


  /* =======================================================
     OPERADOR - GUARDAR
  ======================================================= */

  async guardarOperador(): Promise<void> {

    if (
      !this.canEdit() ||
      this.saving()
    ) {
      return;
    }


    const form =
      this.operatorForm();


    const nombre =
      form.nombre
        .trim()
        .toUpperCase();


    /* =========================
       VALIDACIÓN
    ========================= */

    if (!nombre) {

      this.error.set(
        'Escribe el nombre del operador.'
      );

      return;
    }


    const payload = {

      nombre,

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
        this.editingOperator() &&
        form.id_operador
      ) {

        response =
          await window.nvkAPI.editarOperador(
            this.auth.token(),
            form.id_operador,
            payload
          );

      }

      /* =========================
         CREAR
      ========================= */

      else {

        response =
          await window.nvkAPI.crearOperador(
            this.auth.token(),
            payload
          );

      }


      if (!response?.ok) {

        this.error.set(
          response?.mensaje ||
          'No se pudo guardar el operador.'
        );

        return;
      }


      this.operatorModalOpen.set(false);

      this.editingOperator.set(false);


      this.message.set(
        response?.mensaje ||
        (
          this.editingOperator()
            ? 'Operador actualizado correctamente.'
            : 'Operador agregado correctamente.'
        )
      );


      await this.reload();


    } catch (error) {

      console.error(error);

      this.error.set(
        'Ocurrió un error al guardar el operador.'
      );

    } finally {

      this.saving.set(false);

    }
  }


  /* =======================================================
     OPERADOR - ACTIVAR / DESACTIVAR
  ======================================================= */

  async cambiarEstadoOperador(
    operador: any
  ): Promise<void> {

    if (
      !this.canEdit() ||
      this.saving()
    ) {
      return;
    }


    const nuevoEstado =
      Number(operador.activo) === 1
        ? 0
        : 1;


    try {

      this.saving.set(true);

      this.error.set('');

      this.message.set('');


      const response =
        await window.nvkAPI.cambiarEstadoOperador(
          this.auth.token(),
          Number(operador.id_operador),
          nuevoEstado
        );


      if (!response?.ok) {

        this.error.set(
          response?.mensaje ||
          'No se pudo cambiar el estado del operador.'
        );

        return;
      }


      this.message.set(
        response?.mensaje ||
        (
          nuevoEstado === 1
            ? 'Operador activado.'
            : 'Operador desactivado.'
        )
      );


      await this.reload();


    } catch (error) {

      console.error(error);

      this.error.set(
        'Ocurrió un error al cambiar el estado del operador.'
      );

    } finally {

      this.saving.set(false);

    }
  }


  /* =======================================================
     UNIDAD - NUEVA
  ======================================================= */

  nuevaUnidad(): void {

    if (!this.canEdit()) {
      return;
    }


    this.error.set('');

    this.message.set('');

    this.editingUnit.set(false);

    this.unitForm.set(
      this.emptyUnit()
    );

    this.unitModalOpen.set(true);

  }


  /* =======================================================
     UNIDAD - EDITAR
  ======================================================= */

  editarUnidad(
    unidad: any
  ): void {

    if (!this.canEdit()) {
      return;
    }


    this.error.set('');

    this.message.set('');

    this.editingUnit.set(true);


    this.unitForm.set({

      id_unidad:
        Number(unidad.id_unidad),

      clave:
        String(unidad.clave || ''),

      activo:
        Number(unidad.activo) === 0
          ? 0
          : 1

    });


    this.unitModalOpen.set(true);

  }


  /* =======================================================
     UNIDAD - CERRAR MODAL
  ======================================================= */

  cerrarUnitModal(): void {

    if (this.saving()) {
      return;
    }


    this.unitModalOpen.set(false);

    this.editingUnit.set(false);

    this.unitForm.set(
      this.emptyUnit()
    );

  }


  /* =======================================================
     UNIDAD - ACTUALIZAR CAMPO
  ======================================================= */

  setUnitField(
    field: keyof UnitForm,
    value: any
  ): void {

    this.unitForm.update(
      current => ({
        ...current,
        [field]: value
      })
    );

  }


  /* =======================================================
     UNIDAD - GUARDAR
  ======================================================= */

  async guardarUnidad(): Promise<void> {

    if (
      !this.canEdit() ||
      this.saving()
    ) {
      return;
    }


    const form =
      this.unitForm();


    const clave =
      form.clave
        .trim()
        .toUpperCase();


    /* =========================
       VALIDACIÓN
    ========================= */

    if (!clave) {

      this.error.set(
        'Escribe la clave de la unidad.'
      );

      return;
    }


    const payload = {

      clave,

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
        this.editingUnit() &&
        form.id_unidad
      ) {

        response =
          await window.nvkAPI.editarUnidad(
            this.auth.token(),
            form.id_unidad,
            payload
          );

      }

      /* =========================
         CREAR
      ========================= */

      else {

        response =
          await window.nvkAPI.crearUnidad(
            this.auth.token(),
            payload
          );

      }


      if (!response?.ok) {

        this.error.set(
          response?.mensaje ||
          'No se pudo guardar la unidad.'
        );

        return;
      }


      this.unitModalOpen.set(false);

      this.editingUnit.set(false);


      this.message.set(
        response?.mensaje ||
        'Unidad guardada correctamente.'
      );


      await this.reload();


    } catch (error) {

      console.error(error);

      this.error.set(
        'Ocurrió un error al guardar la unidad.'
      );

    } finally {

      this.saving.set(false);

    }
  }


  /* =======================================================
     UNIDAD - ACTIVAR / DESACTIVAR
  ======================================================= */

  async cambiarEstadoUnidad(
    unidad: any
  ): Promise<void> {

    if (
      !this.canEdit() ||
      this.saving()
    ) {
      return;
    }


    const nuevoEstado =
      Number(unidad.activo) === 1
        ? 0
        : 1;


    try {

      this.saving.set(true);

      this.error.set('');

      this.message.set('');


      const response =
        await window.nvkAPI.cambiarEstadoUnidad(
          this.auth.token(),
          Number(unidad.id_unidad),
          nuevoEstado
        );


      if (!response?.ok) {

        this.error.set(
          response?.mensaje ||
          'No se pudo cambiar el estado de la unidad.'
        );

        return;
      }


      this.message.set(
        response?.mensaje ||
        (
          nuevoEstado === 1
            ? 'Unidad activada.'
            : 'Unidad desactivada.'
        )
      );


      await this.reload();


    } catch (error) {

      console.error(error);

      this.error.set(
        'Ocurrió un error al cambiar el estado de la unidad.'
      );

    } finally {

      this.saving.set(false);

    }
  }

}