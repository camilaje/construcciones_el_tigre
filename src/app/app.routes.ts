import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Shell } from './shell/shell';
import { Login } from './features/login/login';
import { Home } from './features/home/home';
import { Inventory } from './features/inventory/inventory';
import { RegisterTool } from './features/register-tool/register-tool';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home },
      { path: 'inventory', component: Inventory },
      { path: 'register-tool', component: RegisterTool }
    ]
  },
  { path: '**', redirectTo: '' }
];
