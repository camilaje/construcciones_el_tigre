import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../core/auth.service';

interface NavLink {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss'
})
export class Shell {
  private readonly authService: AuthService;
  private readonly router: Router;
  private readonly sidenavOpenedSignal: WritableSignal<boolean>;

  protected readonly navLinks: NavLink[];
  protected readonly sidenavOpened: Signal<boolean>;

  constructor() {
    this.authService = inject(AuthService);
    this.router = inject(Router);
    this.sidenavOpenedSignal = signal<boolean>(false);
    this.sidenavOpened = this.sidenavOpenedSignal.asReadonly();

    this.navLinks = [
      { path: '/', label: 'Inicio', icon: 'home' },
      { path: '/inventory', label: 'Inventario por Obra', icon: 'inventory_2' },
      { path: '/register-tool', label: 'Registrar herramienta nueva', icon: 'add_box' },
      { path: '/register-movement', label: 'Registrar movimiento', icon: 'sync_alt' },
      { path: '/catalogs/tools', label: 'Catálogo de herramientas', icon: 'construction' },
      { path: '/catalogs/sites', label: 'Catálogo de obras', icon: 'location_city' },
      { path: '/catalogs/supervisors', label: 'Catálogo de encargados', icon: 'badge' }
    ];
  }

  protected toggleSidenav(): void {
    this.sidenavOpenedSignal.set(!this.sidenavOpenedSignal());
  }

  protected closeSidenav(): void {
    this.sidenavOpenedSignal.set(false);
  }

  protected onSidenavOpenedChange(opened: boolean): void {
    this.sidenavOpenedSignal.set(opened);
  }

  protected logout(): void {
    this.authService.signOut().subscribe((): void => {
      this.router.navigateByUrl('/login');
    });
  }
}
