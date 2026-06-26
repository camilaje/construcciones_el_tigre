import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { filter } from 'rxjs';

import { APP_ROUTE_ENUMERATION, AuthService } from '../core';

interface NavLinkType {
  path: APP_ROUTE_ENUMERATION;
  label: string;
  icon: string;
}

interface NavGroupType {
  label: string;
  icon: string;
  links: NavLinkType[];
}

const DEFAULT_PAGE_TITLE_CONSTANTS = 'Control de Herramientas';

const MATCH_OPTIONS: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored'
};

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatToolbarModule,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule
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

  protected readonly homeLink: NavLinkType;
  protected readonly navGroups: NavGroupType[];
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
      if (!user) return null;
      const fullName: string | undefined = user.user_metadata?.['full_name'];
      return fullName ?? user.email ?? null;
    });

    this.homeLink = { path: APP_ROUTE_ENUMERATION.HOME, label: 'Inicio', icon: 'home' };

    this.navGroups = [
      {
        label: 'Herramientas',
        icon: 'construction',
        links: [
          { path: APP_ROUTE_ENUMERATION.INVENTORY, label: 'Inventario', icon: 'inventory_2' },
          { path: APP_ROUTE_ENUMERATION.REGISTER_TOOL, label: 'Registrar en obra', icon: 'add_box' },
          { path: APP_ROUTE_ENUMERATION.REGISTER_MOVEMENT, label: 'Registrar movimiento', icon: 'sync_alt' },
          { path: APP_ROUTE_ENUMERATION.MOVEMENT_HISTORY, label: 'Historial', icon: 'history' }
        ]
      },
      {
        label: 'Materiales',
        icon: 'category',
        links: [
          { path: APP_ROUTE_ENUMERATION.MATERIAL_INVENTORY, label: 'Inventario', icon: 'inventory_2' },
          { path: APP_ROUTE_ENUMERATION.REGISTER_MATERIAL_INITIAL, label: 'Registrar en obra', icon: 'add_box' },
          { path: APP_ROUTE_ENUMERATION.REGISTER_MATERIAL, label: 'Registrar movimiento', icon: 'sync_alt' },
          { path: APP_ROUTE_ENUMERATION.MATERIAL_HISTORY, label: 'Historial', icon: 'history' }
        ]
      },
      {
        label: 'Catálogos',
        icon: 'menu_book',
        links: [
          { path: APP_ROUTE_ENUMERATION.CATALOG_TOOLS, label: 'Herramientas', icon: 'construction' },
          { path: APP_ROUTE_ENUMERATION.CATALOG_MATERIALS, label: 'Materiales', icon: 'category' },
          { path: APP_ROUTE_ENUMERATION.CATALOG_SITES, label: 'Obras', icon: 'location_city' },
          { path: APP_ROUTE_ENUMERATION.CATALOG_SUPERVISORS, label: 'Encargados', icon: 'badge' }
        ]
      }
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

  protected isGroupActive(group: NavGroupType): boolean {
    return group.links.some((link): boolean => this.router.isActive(link.path, MATCH_OPTIONS));
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
