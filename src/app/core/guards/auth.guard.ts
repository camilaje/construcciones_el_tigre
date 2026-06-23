import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { Observable, combineLatest, filter, map, take } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { APP_ROUTE_ENUMERATION } from '../app-route';

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth: AuthService = inject(AuthService);
  const router: Router = inject(Router);

  return combineLatest([toObservable(auth.ready), toObservable(auth.session)]).pipe(
    filter(([ready]: [boolean, Session | null]): boolean => ready),
    take(1),
    map(([, session]: [boolean, Session | null]): boolean | UrlTree =>
      session ? true : router.createUrlTree([APP_ROUTE_ENUMERATION.LOGIN])
    )
  );
};
