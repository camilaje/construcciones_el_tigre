import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SlicePipe } from '@angular/common';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, filter, from, switchMap } from 'rxjs';

import {
  APP_ROLE_ENUMERATION,
  AuthService,
  ConfirmationService,
  NotificationService,
  SUPABASE_EDGE_FUNCTION_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner } from '../../shared';

interface UserProfileType {
  userId: string;
  role: string;
  username: string | null;
  createdAt: string;
}

interface UserListResponseType {
  data: UserProfileType[] | null;
  error: PostgrestError | null;
}

interface EdgeFunctionResultType {
  data: unknown;
  error: { message: string } | null;
}

interface CreateFormControlsType {
  username: FormControl<string>;
  password: FormControl<string>;
  role: FormControl<string>;
}

const ROLE_LABELS: Record<string, string> = {
  [APP_ROLE_ENUMERATION.SUPER_ADMIN]: 'Super Admin',
  [APP_ROLE_ENUMERATION.ADMIN]: 'Admin',
  [APP_ROLE_ENUMERATION.WORKER]: 'Trabajador'
};

@Component({
  selector: 'app-user-management',
  imports: [
    SlicePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ErrorBanner
  ],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss'
})
export class UserManagement {
  private readonly supabaseService: SupabaseService;
  private readonly authService: AuthService;
  private readonly confirmationService: ConfirmationService;
  private readonly notificationService: NotificationService;
  private readonly destroyRef: DestroyRef;
  private readonly usersSignal: WritableSignal<UserProfileType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly appRole: typeof APP_ROLE_ENUMERATION;
  protected readonly columns: string[];
  protected readonly users: Signal<UserProfileType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly isSuperAdmin: Signal<boolean>;
  protected readonly currentUserId: Signal<string | null>;
  protected readonly createForm: FormGroup<CreateFormControlsType>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.authService = inject(AuthService);
    this.confirmationService = inject(ConfirmationService);
    this.notificationService = inject(NotificationService);
    this.destroyRef = inject(DestroyRef);

    this.usersSignal = signal<UserProfileType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);

    this.appRole = APP_ROLE_ENUMERATION;
    this.columns = ['username', 'role', 'createdAt', 'actions'];
    this.users = this.usersSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.isSuperAdmin = computed((): boolean => this.authService.role() === APP_ROLE_ENUMERATION.SUPER_ADMIN);
    this.currentUserId = computed((): string | null => this.authService.session()?.user?.id ?? null);

    this.createForm = new FormGroup<CreateFormControlsType>({
      username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
      role: new FormControl(APP_ROLE_ENUMERATION.WORKER, { nonNullable: true, validators: [Validators.required] })
    });

    this.loadUsers();
  }

  protected create(formDirective: FormGroupDirective): void {
    if (this.createForm.invalid || this.savingSignal()) return;
    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    const { username, password, role } = this.createForm.getRawValue();

    from(
      this.supabaseService.client.functions.invoke(SUPABASE_EDGE_FUNCTION_ENUMERATION.MANAGE_USER, {
        body: {
          action: 'create',
          username: username.trim(),
          password,
          role
        }
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: EdgeFunctionResultType): void => {
        this.savingSignal.set(false);
        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }
        this.notificationService.success(`Usuario "${username.trim()}" creado correctamente.`);
        formDirective.resetForm({
          username: '',
          password: '',
          role: APP_ROLE_ENUMERATION.WORKER
        });
        this.loadUsers();
      });
  }

  protected remove(user: UserProfileType): void {
    const label: string = user.username ?? user.userId;
    this.confirmationService
      .confirm(`¿Eliminar la cuenta de "${label}"? Esta acción no se puede deshacer.`)
      .pipe(
        filter((confirmed: boolean): boolean => confirmed),
        switchMap((): Observable<EdgeFunctionResultType> =>
          from(
            this.supabaseService.client.functions.invoke(SUPABASE_EDGE_FUNCTION_ENUMERATION.MANAGE_USER, {
              body: { action: 'delete', userId: user.userId }
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: EdgeFunctionResultType): void => {
        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }
        this.notificationService.success('Usuario eliminado correctamente.');
        this.loadUsers();
      });
  }

  protected canDelete(user: UserProfileType): boolean {
    if (user.userId === this.currentUserId()) return false;
    if (this.isSuperAdmin()) return user.role !== APP_ROLE_ENUMERATION.SUPER_ADMIN;
    return user.role === APP_ROLE_ENUMERATION.WORKER;
  }

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  private loadUsers(): void {
    this.loadingSignal.set(true);

    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.USER_PROFILES)
        .select('userId:user_id, role, username, createdAt:created_at')
        .order('created_at')
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: UserListResponseType): void => {
        this.loadingSignal.set(false);
        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }
        this.usersSignal.set(result.data ?? []);
      });
  }
}
