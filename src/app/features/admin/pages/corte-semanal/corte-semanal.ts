import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-corte-semanal',
  imports: [CurrencyPipe],
  templateUrl: './corte-semanal.html',
  styleUrl: './corte-semanal.scss'
})
export class CorteSemanal implements OnInit {

  readonly auth = inject(AuthService);
  readonly data = signal<any>(null);
  readonly msg = signal('');

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.data.set(
      await window.nvkAPI.corte(
        this.auth.token()
      )
    );
  }

  async toggle() {

    const a =
      this.data().week.estado === 'ABIERTA'
        ? 'cerrar'
        : 'reabrir';

    const r =
      await window.nvkAPI.toggleSemana(
        this.auth.token(),
        a
      );

    this.msg.set(
      r.ok
        ? `Semana ${
            a === 'cerrar'
              ? 'cerrada'
              : 'reabierta'
          } correctamente.`
        : r.mensaje
    );

    await this.reload();

    if (r.ok) {
      window.dispatchEvent(
        new CustomEvent('nvk:week-updated')
      );
    }
  }
}