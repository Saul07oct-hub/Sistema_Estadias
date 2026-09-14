import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({ selector:'app-dashboard', imports:[CurrencyPipe,DecimalPipe,RouterLink], templateUrl:'./dashboard.html', styleUrl:'./dashboard.scss' })
export class Dashboard implements OnInit {
  readonly auth = inject(AuthService);
  readonly loading = signal(true);
  readonly data = signal<any>(null);
  readonly error = signal('');
  async ngOnInit(){ try { const r=await window.nvkAPI.dashboard(this.auth.token()); if(r.ok)this.data.set(r); else this.error.set(r.mensaje||'Error'); } catch(e){this.error.set(String(e));} finally{this.loading.set(false);} }
  has(p:string){ return this.auth.has(p); }
}
