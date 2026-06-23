import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { APP_ROUTE_ENUMERATION, AuthService } from '../../core';

interface LoginFormControlsType {
  email: FormControl<string>;
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
    MatProgressSpinnerModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly authService: AuthService;
  private readonly router: Router;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly form: FormGroup<LoginFormControlsType>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.authService = inject(AuthService);
    this.router = inject(Router);
    this.loadingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<LoginFormControlsType>({
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.loadingSignal()) {
      return;
    }

    const email: string = this.form.controls.email.value;
    const password: string = this.form.controls.password.value;

    this.loadingSignal.set(true);
    this.errorMessageSignal.set(null);

    this.authService.signIn(email, password).subscribe((error: string | null): void => {
      this.loadingSignal.set(false);

      if (error) {
        this.errorMessageSignal.set('Correo o contraseña incorrectos.');
        return;
      }

      this.router.navigateByUrl(APP_ROUTE_ENUMERATION.HOME);
    });
  }
}
