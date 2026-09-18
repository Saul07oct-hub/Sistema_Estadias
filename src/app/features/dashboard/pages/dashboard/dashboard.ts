import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {

  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly data = signal<any>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly reopening = signal(false);

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.error.set('');

      const r = await window.nvkAPI.dashboard(
        this.auth.token()
      );

      if (r.ok) {
        this.data.set(r);
      } else {
        this.error.set(r.mensaje || 'Error');
      }

    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async reabrirSemana() {

    if (this.reopening()) return;

    try {

      this.reopening.set(true);
      this.error.set('');
      this.message.set('');

      const r = await window.nvkAPI.toggleSemana(
        this.auth.token(),
        'reabrir'
      );

      if (!r?.ok) {
        this.error.set(
          r?.mensaje || 'No se pudo reabrir la semana.'
        );
        return;
      }

      // Actualizamos los datos del Inicio
      await this.reload();

      this.message.set(
        'Semana reabierta correctamente.'
      );

      // Actualizamos también el estado de la barra superior
      window.dispatchEvent(
        new CustomEvent('nvk:week-updated')
      );

    } catch (e) {

      this.error.set(String(e));

    } finally {

      this.reopening.set(false);

    }
  }

  has(p: string) {
    return this.auth.has(p);
  }
}