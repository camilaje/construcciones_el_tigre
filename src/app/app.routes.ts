import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Login } from './features/login/login';
import { Inventario } from './features/inventario/inventario';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Inventario, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
