import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { filter } from 'rxjs';

import { APP_ROUTE_ENUMERATION, AuthService } from '../core';

interface NavLinkType {
  path: APP_ROUTE_ENUMERATION;
  label: string;
  icon: string;
}

const DEFAULT_PAGE_TITLE_CONSTANTS = 'Control de Herramientas';

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
  private readonly destroyRef: DestroyRef;
  private readonly sidenavOpenedSignal: WritableSignal<boolean>;
  private readonly pageTitleSignal: WritableSignal<string>;

  protected readonly navLinks: NavLinkType[];
  protected readonly sidenavOpened: Signal<boolean>;
  protected readonly pageTitle: Signal<string>;
  protected readonly displayName: Signal<string | null>;

  constructor() {
    this.authService = inject(AuthService);
    this.router = inject(Router);
    this.destroyRef = inject(DestroyRef);
    this.sidenavOpenedSignal = signal<boolean>(false);
    this.pageTitleSignal = signal<string>(this.resolvePageTitle());

    this.sidenavOpened = this.sidenavOpenedSignal.asReadonly();
    this.pageTitle = this.pageTitleSignal.asReadonly();

    this.displayName = computed((): string | null => {
      const user = this.authService.session()?.user;
      if (!user) {
        return null;
      }

      const fullName: string | undefined = user.user_metadata?.['full_name'];
      return fullName ?? user.email ?? null;
    });

    this.navLinks = [
      { path: APP_ROUTE_ENUMERATION.HOME, label: 'Inicio', icon: 'home' },
      { path: APP_ROUTE_ENUMERATION.INVENTORY, label: 'Inventario por Obra', icon: 'inventory_2' },
      { path: APP_ROUTE_ENUMERATION.REGISTER_TOOL, label: 'Registrar herramienta nueva', icon: 'add_box' },
      { path: APP_ROUTE_ENUMERATION.REGISTER_MOVEMENT, label: 'Registrar movimiento', icon: 'sync_alt' },
      { path: APP_ROUTE_ENUMERATION.MOVEMENT_HISTORY, label: 'Historial de movimientos', icon: 'history' },
      { path: APP_ROUTE_ENUMERATION.CATALOG_TOOLS, label: 'Catálogo de herramientas', icon: 'construction' },
      { path: APP_ROUTE_ENUMERATION.CATALOG_SITES, label: 'Catálogo de obras', icon: 'location_city' },
      { path: APP_ROUTE_ENUMERATION.CATALOG_SUPERVISORS, label: 'Catálogo de encargados', icon: 'badge' }
    ];

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((): void => {
        this.pageTitleSignal.set(this.resolvePageTitle());
      });
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
    this.authService
      .signOut()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((): void => {
        this.router.navigateByUrl(APP_ROUTE_ENUMERATION.LOGIN);
      });
  }

  private resolvePageTitle(): string {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;

    while (route.firstChild) {
      route = route.firstChild;
    }

    return (route.data['title'] as string | undefined) ?? DEFAULT_PAGE_TITLE_CONSTANTS;
  }
}
