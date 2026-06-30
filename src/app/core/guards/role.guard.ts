import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, combineLatest, filter, map, take } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { APP_ROUTE_ENUMERATION } from '../app-route';

export const roleGuard = (allowedRoles: string[]): CanActivateFn =>
  (): Observable<boolean | UrlTree> => {
    const auth: AuthService = inject(AuthService);
    const router: Router = inject(Router);

    return combineLatest([toObservable(auth.ready), toObservable(auth.role)]).pipe(
      filter(([ready]: [boolean, string | null]): boolean => ready),
      take(1),
      map(([, role]: [boolean, string | null]): boolean | UrlTree =>
        role !== null && allowedRoles.includes(role)
          ? true
          : router.createUrlTree([APP_ROUTE_ENUMERATION.HOME])
      )
    );
  };
