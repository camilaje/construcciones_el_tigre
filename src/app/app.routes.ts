import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Shell } from './shell/shell';
import { Login } from './features/login/login';
import { Home } from './features/home/home';
import { Inventory } from './features/inventory/inventory';
import { RegisterTool } from './features/register-tool/register-tool';
import { RegisterMovement } from './features/register-movement/register-movement';
import { Catalog } from './features/catalog/catalog';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home },
      { path: 'inventory', component: Inventory },
      { path: 'register-tool', component: RegisterTool },
      { path: 'register-movement', component: RegisterMovement },
      {
        path: 'catalogs/tools',
        component: Catalog,
        data: { table: 'herramientas', label: 'Herramientas', singularLabel: 'Herramienta' }
      },
      {
        path: 'catalogs/sites',
        component: Catalog,
        data: { table: 'obras', label: 'Obras', singularLabel: 'Obra' }
      },
      {
        path: 'catalogs/supervisors',
        component: Catalog,
        data: { table: 'encargados', label: 'Encargados', singularLabel: 'Encargado' }
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
