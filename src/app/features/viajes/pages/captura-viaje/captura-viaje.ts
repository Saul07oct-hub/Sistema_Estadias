import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({selector:'app-captura-viaje',imports:[FormsModule,CurrencyPipe,RouterLink],templateUrl:'./captura-viaje.html',styleUrl:'./captura-viaje.scss'})
export class CapturaViaje implements OnInit{
  readonly auth=inject(AuthService); readonly data=signal<any>(null); readonly loading=signal(true); readonly saving=signal(false); readonly message=signal(''); readonly error=signal('');
  form:any={fecha:'',hora:'08:00',id_material:0,id_operador:0,id_unidad:0,folio_documento:'',referencia_salida:''};
  async ngOnInit(){try{const r=await window.nvkAPI.viajeOptions(this.auth.token());this.data.set(r);if(r.week){this.form.fecha=r.week.fecha_fin;}if(r.materials?.length)this.form.id_material=r.materials[0].id_material;if(r.operators?.length)this.form.id_operador=r.operators[0].id_operador;if(r.units?.length)this.form.id_unidad=r.units[0].id_unidad;this.useSuggested();}catch(e){this.error.set(String(e));}finally{this.loading.set(false)}}
  get material(){return this.data()?.materials?.find((m:any)=>m.id_material==this.form.id_material)}
  get total(){const m=this.material;if(!m)return 0;return m.precio*(1+(m.ivaPct||0)/100-(m.retencionPct||0)/100)}
  useSuggested(){const s=this.data()?.suggested||[];const m=this.material;const doc=s.find((x:any)=>x.tipo==='DOCUMENTO_A');const ref=s.find((x:any)=>x.tipo===m?.tipo_referencia_default);if(!this.form.folio_documento&&doc)this.form.folio_documento=doc.valor_sugerido;if(!this.form.referencia_salida&&ref)this.form.referencia_salida=ref.valor_sugerido}
  async guardar(){this.message.set('');this.error.set('');if(!this.data()?.week||this.data().week.estado!=='ABIERTA'){this.error.set('La semana está cerrada. Un administrador debe reabrirla desde Corte semanal.');return;}try{this.saving.set(true);const r=await window.nvkAPI.createViaje(this.auth.token(),{...this.form,id_semana:this.data().week.id_semana});if(!r.ok){this.error.set(r.mensaje||'No fue posible guardar.');return;}this.message.set(r.referenciaRepetida?'Viaje guardado. Advertencia: la orden/referencia ya existía.':'Viaje guardado correctamente.');this.form.folio_documento='';this.form.referencia_salida='';const fresh=await window.nvkAPI.viajeOptions(this.auth.token());this.data.set(fresh);this.useSuggested();}catch(e){this.error.set(String(e));}finally{this.saving.set(false)}}
}
