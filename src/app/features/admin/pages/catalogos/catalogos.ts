import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
@Component({selector:'app-catalogos',imports:[CurrencyPipe],templateUrl:'./catalogos.html',styleUrl:'./catalogos.scss'})
export class Catalogos implements OnInit{readonly auth=inject(AuthService);readonly data=signal<any>(null);async ngOnInit(){this.data.set(await window.nvkAPI.catalogos(this.auth.token()))}}
