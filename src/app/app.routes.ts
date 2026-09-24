import { Routes } from '@angular/router';

import { Login } from './features/auth/pages/login/login';
import { Dashboard } from './features/dashboard/pages/dashboard/dashboard';
import { BitacoraSemanal } from './features/viajes/pages/bitacora-semanal/bitacora-semanal';
import { CapturaViaje } from './features/viajes/pages/captura-viaje/captura-viaje';
import { ResumenMaterial } from './features/resumen/pages/resumen-material/resumen-material';
import { SellosPagos } from './features/admin/pages/sellos-pagos/sellos-pagos';
import { Catalogos } from './features/admin/pages/catalogos/catalogos';
import { CorteSemanal } from './features/admin/pages/corte-semanal/corte-semanal';
import { Perfil } from './features/perfil/pages/perfil/perfil';

import { MainLayout } from './layout/main-layout/main-layout';

import {
  authGuard,
  permissionGuard
} from './core/guards/auth.guard';


export const routes: Routes = [

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  {
    path: 'login',
    component: Login
  },

  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],

    children: [

      {
        path: 'dashboard',
        component: Dashboard,
        canActivate: [
          permissionGuard('dashboard.ver')
        ]
      },

      {
        path: 'viajes/nuevo',
        component: CapturaViaje,
        canActivate: [
          permissionGuard('viajes.crear')
        ]
      },

      {
        path: 'viajes/bitacora',
        component: BitacoraSemanal,
        canActivate: [
          permissionGuard('viajes.ver')
        ]
      },

      {
        path: 'resumenes',
        component: ResumenMaterial,
        canActivate: [
          permissionGuard('resumenes.ver')
        ]
      },

      {
        path: 'pagos',
        component: SellosPagos,
        canActivate: [
          permissionGuard('pagos.registrar')
        ]
      },

      {
        path: 'corte',
        component: CorteSemanal,
        canActivate: [
          permissionGuard('cortes.ver')
        ]
      },

      {
        path: 'catalogos',
        component: Catalogos,
        canActivate: [
          permissionGuard('catalogos.ver')
        ]
      },

      {
        path: 'perfil',
        component: Perfil
      },

      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }

    ]
  },

  {
    path: '**',
    redirectTo: 'login'
  }

];