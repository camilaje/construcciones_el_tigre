import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { APP_ROUTE_ENUMERATION, AuthService } from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface LoginFormControlsType {
  username: FormControl<string>;
  password: FormControl<string>;
}

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    LoadingOverlay,
    ErrorBanner
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly authService: AuthService;
  private readonly router: Router;
  private readonly destroyRef: DestroyRef;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly form: FormGroup<LoginFormControlsType>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.authService = inject(AuthService);
    this.router = inject(Router);
    this.destroyRef = inject(DestroyRef);
    this.loadingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<LoginFormControlsType>({
      username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.loadingSignal()) return;

    const { username, password } = this.form.getRawValue();

    this.loadingSignal.set(true);
    this.errorMessageSignal.set(null);

    this.authService
      .signInWithUsername(username, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error: string | null): void => {
        this.loadingSignal.set(false);

        if (error) {
          this.errorMessageSignal.set(error);
          return;
        }

        this.router.navigateByUrl(APP_ROUTE_ENUMERATION.HOME);
      });
  }
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
