import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({selector:'app-bitacora-semanal',imports:[FormsModule,RouterLink],templateUrl:'./bitacora-semanal.html',styleUrl:'./bitacora-semanal.scss'})
export class BitacoraSemanal implements OnInit{
  readonly auth=inject(AuthService); readonly data=signal<any>(null); readonly search=signal(''); readonly material=signal('Todos'); readonly loading=signal(true);
  readonly rows=computed(()=>{const d=this.data();if(!d)return[];const q=this.search().trim().toLowerCase();return d.rows.filter((v:any)=>(this.material()==='Todos'||v.material===this.material())&&(!q||[v.fecha,v.hora,v.material,v.operador,v.unidad,v.folio_documento,v.referencia_salida].some((x:any)=>String(x).toLowerCase().includes(q))))});
  async ngOnInit(){this.data.set(await window.nvkAPI.listViajes(this.auth.token()));this.loading.set(false)}
  dupF(f:string){return this.data()?.dupFolios?.includes(f)} dupR(r:string){return this.data()?.dupRefs?.includes(r)}
}
