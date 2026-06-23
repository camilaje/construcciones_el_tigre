import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Observable, from, map } from 'rxjs';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabaseService: SupabaseService;
  private readonly sessionSignal: WritableSignal<Session | null>;
  private readonly readySignal: WritableSignal<boolean>;

  public readonly session: Signal<Session | null>;
  public readonly ready: Signal<boolean>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.sessionSignal = signal<Session | null>(null);
    this.readySignal = signal<boolean>(false);
    this.session = this.sessionSignal.asReadonly();
    this.ready = this.readySignal.asReadonly();

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

  public signIn(email: string, password: string): Observable<string | null> {
    return from(this.supabaseService.client.auth.signInWithPassword({ email, password })).pipe(
      map((result): string | null => result.error?.message ?? null)
    );
  }

  public signOut(): Observable<void> {
    return from(this.supabaseService.client.auth.signOut()).pipe(map((): void => undefined));
  }
}
