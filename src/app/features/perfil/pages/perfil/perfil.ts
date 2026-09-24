import {
  Component,
  inject,
  OnInit,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss'
})
export class Perfil implements OnInit {

  readonly auth = inject(AuthService);

  // =========================
  // DATOS
  // =========================

  readonly perfil = signal<any>(null);
  readonly usuarios = signal<any[]>([]);
  readonly roles = signal<any[]>([]);

  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly mensaje = signal('');
  readonly error = signal('');


  // =========================
  // MODALES
  // =========================

  readonly modalPerfil = signal(false);
  readonly modalPassword = signal(false);
  readonly modalUsuario = signal(false);
  readonly modalResetPassword = signal(false);


  // =========================
  // FORMULARIO MI PERFIL
  // =========================

  nombrePerfil = '';
  usernamePerfil = '';


  // =========================
  // CAMBIAR MI CONTRASEÑA
  // =========================

  passwordActual = '';
  passwordNueva = '';
  passwordConfirmar = '';


  // =========================
  // CREAR / EDITAR USUARIO
  // =========================

  usuarioEditando: any = null;

  usuarioForm = {
    nombre_completo: '',
    username: '',
    id_rol: 2,
    password: ''
  };


  // =========================
  // RESET PASSWORD
  // =========================

  usuarioPassword: any = null;

  passwordTemporal = '';
  passwordTemporalConfirmar = '';


  // =========================
  // INICIO
  // =========================

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }


  // =========================
  // PERMISOS
  // =========================

  esAdministrador(): boolean {
    return this.auth.has(
      'usuarios.gestionar'
    );
  }


  // =========================
  // CARGAR DATOS
  // =========================

  async cargar(): Promise<void> {

    this.error.set('');

    try {

      this.loading.set(true);

      const token =
        this.auth.token();

      if (
        !token ||
        !window.nvkAPI
      ) {
        this.error.set(
          'No existe una sesión válida.'
        );

        return;
      }


      // =========================
      // MI PERFIL
      // =========================

      const perfilResult =
        await window.nvkAPI.perfil(
          token
        );

      if (!perfilResult?.ok) {
        this.error.set(
          perfilResult?.mensaje ||
          'No se pudo cargar el perfil.'
        );

        return;
      }

      this.perfil.set(
        perfilResult.usuario
      );


      // =========================
      // SOLO ADMINISTRADOR
      // =========================

      if (this.esAdministrador()) {

        const [
          usuariosResult,
          rolesResult
        ] = await Promise.all([

          window.nvkAPI.usuarios(
            token
          ),

          window.nvkAPI.rolesUsuarios(
            token
          )

        ]);

        if (usuariosResult?.ok) {
          this.usuarios.set(
            usuariosResult.usuarios || []
          );
        }

        if (rolesResult?.ok) {
          this.roles.set(
            rolesResult.roles || []
          );
        }
      }

    } catch (error) {

      console.error(
        'Error cargando perfil:',
        error
      );

      this.error.set(
        'Ocurrió un error al cargar el perfil.'
      );

    } finally {

      this.loading.set(false);

    }
  }


  // =========================
  // INICIALES
  // =========================

  iniciales(
    nombre?: string
  ): string {

    if (!nombre) {
      return 'NV';
    }

    const partes =
      nombre
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!partes.length) {
      return 'NV';
    }

    if (partes.length === 1) {
      return partes[0]
        .substring(0, 2)
        .toUpperCase();
    }

    return (
      partes[0][0] +
      partes[1][0]
    ).toUpperCase();
  }


  // =========================
  // MENSAJES
  // =========================

  limpiarMensajes(): void {
    this.mensaje.set('');
    this.error.set('');
  }


  // =========================
  // MODAL EDITAR PERFIL
  // =========================

  abrirEditarPerfil(): void {

    this.limpiarMensajes();

    const p =
      this.perfil();

    if (!p) {
      return;
    }

    this.nombrePerfil =
      p.nombre_completo || '';

    this.usernamePerfil =
      p.username || '';

    this.modalPerfil.set(true);
  }


  cerrarEditarPerfil(): void {
    this.modalPerfil.set(false);
  }


  async guardarPerfil(): Promise<void> {

    this.limpiarMensajes();

    const nombre =
      this.nombrePerfil.trim();

    const username =
      this.usernamePerfil.trim();

    if (!nombre) {
      this.error.set(
        'Ingresa tu nombre completo.'
      );

      return;
    }

    if (username.length < 3) {
      this.error.set(
        'El usuario debe tener al menos 3 caracteres.'
      );

      return;
    }

    try {

      this.saving.set(true);

      const result =
        await window.nvkAPI.editarPerfil(
          this.auth.token(),
          {
            nombre_completo: nombre,
            username
          }
        );

      if (!result?.ok) {

        this.error.set(
          result?.mensaje ||
          'No se pudo actualizar el perfil.'
        );

        return;
      }

      this.modalPerfil.set(false);

      this.mensaje.set(
        result.mensaje ||
        'Perfil actualizado correctamente.'
      );

      await this.cargar();

    } catch (error) {

      console.error(error);

      this.error.set(
        'No se pudo actualizar el perfil.'
      );

    } finally {

      this.saving.set(false);

    }
  }


  // =========================
  // MODAL CAMBIAR PASSWORD
  // =========================

  abrirPassword(): void {

    this.limpiarMensajes();

    this.passwordActual = '';
    this.passwordNueva = '';
    this.passwordConfirmar = '';

    this.modalPassword.set(true);
  }


  cerrarPassword(): void {
    this.modalPassword.set(false);
  }


  async guardarPassword(): Promise<void> {

    this.limpiarMensajes();

    if (
      !this.passwordActual ||
      !this.passwordNueva
    ) {
      this.error.set(
        'Completa todos los campos.'
      );

      return;
    }

    if (
      this.passwordNueva.length < 8
    ) {
      this.error.set(
        'La nueva contraseña debe tener al menos 8 caracteres.'
      );

      return;
    }

    if (
      this.passwordNueva !==
      this.passwordConfirmar
    ) {
      this.error.set(
        'Las contraseñas nuevas no coinciden.'
      );

      return;
    }

    try {

      this.saving.set(true);

      const result =
        await window.nvkAPI.cambiarPassword(
          this.auth.token(),
          {
            password_actual:
              this.passwordActual,

            password_nueva:
              this.passwordNueva
          }
        );

      if (!result?.ok) {

        this.error.set(
          result?.mensaje ||
          'No se pudo cambiar la contraseña.'
        );

        return;
      }

      this.modalPassword.set(false);

      this.mensaje.set(
        result.mensaje ||
        'Contraseña actualizada correctamente.'
      );

    } catch (error) {

      console.error(error);

      this.error.set(
        'No se pudo cambiar la contraseña.'
      );

    } finally {

      this.saving.set(false);

    }
  }


  // =========================
  // NUEVO USUARIO
  // =========================

  abrirNuevoUsuario(): void {

    this.limpiarMensajes();

    this.usuarioEditando = null;

    this.usuarioForm = {
      nombre_completo: '',
      username: '',
      id_rol:
        this.roles()[0]?.id_rol || 2,
      password: ''
    };

    this.modalUsuario.set(true);
  }


  // =========================
  // EDITAR USUARIO
  // =========================

  abrirEditarUsuario(
    usuario: any
  ): void {

    this.limpiarMensajes();

    this.usuarioEditando =
      usuario;

    this.usuarioForm = {
      nombre_completo:
        usuario.nombre_completo || '',

      username:
        usuario.username || '',

      id_rol:
        Number(usuario.id_rol),

      password: ''
    };

    this.modalUsuario.set(true);
  }


  cerrarUsuario(): void {

    this.modalUsuario.set(false);
    this.usuarioEditando = null;

  }


  // =========================
  // GUARDAR USUARIO
  // =========================

  async guardarUsuario(): Promise<void> {

    this.limpiarMensajes();

    const nombre =
      this.usuarioForm
        .nombre_completo
        .trim();

    const username =
      this.usuarioForm
        .username
        .trim();

    const idRol =
      Number(
        this.usuarioForm.id_rol
      );

    if (!nombre) {

      this.error.set(
        'El nombre es obligatorio.'
      );

      return;
    }

    if (username.length < 3) {

      this.error.set(
        'El usuario debe tener al menos 3 caracteres.'
      );

      return;
    }

    if (!idRol) {

      this.error.set(
        'Selecciona un rol.'
      );

      return;
    }


    try {

      this.saving.set(true);

      let result: any;


      // =========================
      // EDITAR
      // =========================

      if (this.usuarioEditando) {

        result =
          await window.nvkAPI.editarUsuario(
            this.auth.token(),
            this.usuarioEditando.id_usuario,
            {
              nombre_completo: nombre,
              username,
              id_rol: idRol
            }
          );

      }


      // =========================
      // CREAR
      // =========================

      else {

        if (
          this.usuarioForm.password.length < 8
        ) {

          this.error.set(
            'La contraseña temporal debe tener al menos 8 caracteres.'
          );

          return;
        }

        result =
          await window.nvkAPI.crearUsuario(
            this.auth.token(),
            {
              nombre_completo: nombre,
              username,
              id_rol: idRol,
              password:
                this.usuarioForm.password
            }
          );
      }


      if (!result?.ok) {

        this.error.set(
          result?.mensaje ||
          'No se pudo guardar el usuario.'
        );

        return;
      }

      this.modalUsuario.set(false);
      this.usuarioEditando = null;

      this.mensaje.set(
        result.mensaje ||
        'Usuario guardado correctamente.'
      );

      await this.cargar();

    } catch (error) {

      console.error(error);

      this.error.set(
        'No se pudo guardar el usuario.'
      );

    } finally {

      this.saving.set(false);

    }
  }


  // =========================
  // ACTIVAR / DESACTIVAR
  // =========================

  async cambiarEstado(
    usuario: any
  ): Promise<void> {

    this.limpiarMensajes();

    const nuevoEstado =
      Number(usuario.activo) === 1
        ? 0
        : 1;

    const accion =
      nuevoEstado === 1
        ? 'activar'
        : 'desactivar';

    const confirmar =
      window.confirm(
        `¿Deseas ${accion} a ${usuario.nombre_completo}?`
      );

    if (!confirmar) {
      return;
    }

    try {

      const result =
        await window.nvkAPI
          .cambiarEstadoUsuario(
            this.auth.token(),
            usuario.id_usuario,
            nuevoEstado
          );

      if (!result?.ok) {

        this.error.set(
          result?.mensaje ||
          'No se pudo cambiar el estado.'
        );

        return;
      }

      this.mensaje.set(
        result.mensaje
      );

      await this.cargar();

    } catch (error) {

      console.error(error);

      this.error.set(
        'No se pudo cambiar el estado.'
      );
    }
  }


  // =========================
  // RESTABLECER PASSWORD
  // =========================

  abrirResetPassword(
    usuario: any
  ): void {

    this.limpiarMensajes();

    this.usuarioPassword =
      usuario;

    this.passwordTemporal = '';
    this.passwordTemporalConfirmar = '';

    this.modalResetPassword.set(true);
  }


  cerrarResetPassword(): void {

    this.modalResetPassword.set(false);
    this.usuarioPassword = null;

  }


  async guardarResetPassword(): Promise<void> {

    this.limpiarMensajes();

    if (!this.usuarioPassword) {
      return;
    }

    if (
      this.passwordTemporal.length < 8
    ) {

      this.error.set(
        'La contraseña debe tener al menos 8 caracteres.'
      );

      return;
    }

    if (
      this.passwordTemporal !==
      this.passwordTemporalConfirmar
    ) {

      this.error.set(
        'Las contraseñas no coinciden.'
      );

      return;
    }

    try {

      this.saving.set(true);

      const result =
        await window.nvkAPI
          .restablecerPasswordUsuario(
            this.auth.token(),
            this.usuarioPassword.id_usuario,
            this.passwordTemporal
          );

      if (!result?.ok) {

        this.error.set(
          result?.mensaje ||
          'No se pudo restablecer la contraseña.'
        );

        return;
      }

      this.modalResetPassword.set(false);
      this.usuarioPassword = null;

      this.mensaje.set(
        result.mensaje ||
        'Contraseña restablecida correctamente.'
      );

      await this.cargar();

    } catch (error) {

      console.error(error);

      this.error.set(
        'No se pudo restablecer la contraseña.'
      );

    } finally {

      this.saving.set(false);

    }
  }
}