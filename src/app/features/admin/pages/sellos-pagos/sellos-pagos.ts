import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
@Component({selector:'app-sellos-pagos',imports:[FormsModule,CurrencyPipe],templateUrl:'./sellos-pagos.html',styleUrl:'./sellos-pagos.scss'})
export class SellosPagos implements OnInit{
  readonly auth=inject(AuthService); readonly data=signal<any>(null); readonly q=signal(''); readonly msg=signal('');
  readonly rows=computed(()=>{const q=this.q().toLowerCase();return(this.data()?.rows||[]).filter((r:any)=>!q||[r.folio_documento,r.material,r.operador,r.referencia_salida].some((x:any)=>String(x).toLowerCase().includes(q)))});
  readonly sellosRecibidos=computed(()=> (this.data()?.rows||[]).filter((x:any)=>!!x.sello_recibido).length);
  readonly sellosPendientes=computed(()=> (this.data()?.rows||[]).filter((x:any)=>!x.sello_recibido).length);
  readonly saldoPendiente=computed(()=> (this.data()?.rows||[]).reduce((a:number,x:any)=>a+Number(x.saldo||0),0));
  async ngOnInit(){await this.reload()} async reload(){this.data.set(await window.nvkAPI.pagos(this.auth.token()))}
  async sello(id:number){const r=await window.nvkAPI.marcarSello(this.auth.token(),id);this.msg.set(r.ok?'Sello registrado.':r.mensaje);await this.reload()}
  async pagar(id:number){const r=await window.nvkAPI.pagarSaldo(this.auth.token(),id);this.msg.set(r.ok?'Pago aplicado al saldo pendiente.':r.mensaje);await this.reload()}
}
