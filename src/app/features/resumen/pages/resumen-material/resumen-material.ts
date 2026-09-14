import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
@Component({selector:'app-resumen-material',imports:[FormsModule,CurrencyPipe,DecimalPipe],templateUrl:'./resumen-material.html',styleUrl:'./resumen-material.scss'})
export class ResumenMaterial implements OnInit{readonly auth=inject(AuthService);readonly data=signal<any>(null);selected=0;async ngOnInit(){await this.load()}async load(id?:number){const r=await window.nvkAPI.resumen(this.auth.token(),id);this.data.set(r);this.selected=r.selected}async change(){await this.load(this.selected)}}
