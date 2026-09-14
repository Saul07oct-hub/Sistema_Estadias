import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  usuario = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  async entrar(): Promise<void> {
    this.error.set('');
    if (!this.usuario.trim() || !this.password) {
      this.error.set('Ingresa usuario y contraseña.');
      return;
    }
    if (!window.nvkAPI) {
      this.error.set('Abre el sistema desde Electron para iniciar sesión.');
      return;
    }
    try {
      this.loading.set(true);
      const result = await window.nvkAPI.login(this.usuario.trim(), this.password);
      if (!result.ok || !result.usuario || !result.token) {
        this.error.set(result.mensaje || 'No fue posible iniciar sesión.');
        return;
      }
      this.auth.setSession(result.usuario, result.token);
      this.password = '';
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      console.error(error);
      this.error.set('Error al iniciar sesión.');
    } finally {
      this.loading.set(false);
    }
  }
}
