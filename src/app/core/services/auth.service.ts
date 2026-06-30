import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { SUPABASE_RPC_ENUMERATION } from '../supabase-schema';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseService: SupabaseService;
  private readonly sessionSignal: WritableSignal<Session | null>;
  private readonly readySignal: WritableSignal<boolean>;

  public readonly session: Signal<Session | null>;
  public readonly ready: Signal<boolean>;
  public readonly role: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.sessionSignal = signal<Session | null>(null);
    this.readySignal = signal<boolean>(false);
    this.session = this.sessionSignal.asReadonly();
    this.ready = this.readySignal.asReadonly();
    this.role = computed((): string | null =>
      (this.sessionSignal()?.user?.app_metadata?.['role'] as string | undefined) ?? null
    );

    // No takeUntilDestroyed here: this is a root singleton (providedIn: 'root'), so its
    // DestroyRef never fires during a normal app session — these subscriptions are meant
    // to live for as long as the app does. onAuthStateChange below also isn't an RxJS
    // Observable; it's the Supabase SDK's own callback API with its own unsubscribe.
    from(this.supabaseService.client.auth.getSession()).subscribe(
      (result: { data: { session: Session | null } }): void => {
        this.sessionSignal.set(result.data.session);
        this.readySignal.set(true);
      }
    );

    this.supabaseService.client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null): void => {
        this.sessionSignal.set(session);
      }
    );
  }

  public signInWithUsername(username: string, password: string): Observable<string | null> {
    return from(
      this.supabaseService.client.rpc(SUPABASE_RPC_ENUMERATION.GET_AUTH_EMAIL_BY_USERNAME, {
        p_username: username.trim()
      })
    ).pipe(
      switchMap((result: { data: string | null; error: unknown }): Observable<string | null> => {
        if (result.error || !result.data) {
          return of('Usuario o contraseña incorrectos.');
        }
        return from(
          this.supabaseService.client.auth.signInWithPassword({ email: result.data, password })
        ).pipe(
          map((signInResult): string | null =>
            signInResult.error ? 'Usuario o contraseña incorrectos.' : null
          )
        );
      })
    );
  }

  public changePassword(currentPassword: string, newPassword: string): Observable<string | null> {
    const email: string | undefined = this.sessionSignal()?.user?.email;
    if (!email) return of('No hay sesión activa.');

    return from(
      this.supabaseService.client.auth.signInWithPassword({ email, password: currentPassword })
    ).pipe(
      switchMap((reAuthResult): Observable<string | null> => {
        if (reAuthResult.error) return of('La contraseña actual es incorrecta.');
        return from(
          this.supabaseService.client.auth.updateUser({ password: newPassword })
        ).pipe(
          map((updateResult): string | null => updateResult.error?.message ?? null)
        );
      })
    );
  }

  public signOut(): Observable<void> {
    return from(this.supabaseService.client.auth.signOut()).pipe(map((): void => undefined));
  }
}
