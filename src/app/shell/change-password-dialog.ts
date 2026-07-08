import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService, NotificationService } from '../core';
import { ErrorBanner } from '../shared';

interface ChangePasswordFormControlsType {
  currentPassword: FormControl<string>;
  newPassword: FormControl<string>;
  confirmPassword: FormControl<string>;
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPwd: string = group.get('newPassword')?.value ?? '';
  const confirmPwd: string = group.get('confirmPassword')?.value ?? '';
  return newPwd === confirmPwd ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-change-password-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ErrorBanner
  ],
  templateUrl: './change-password-dialog.html',
  styleUrl: './change-password-dialog.scss'
})
export class ChangePasswordDialog {
  private readonly authService: AuthService;
  private readonly notificationService: NotificationService;
  private readonly dialogRef: MatDialogRef<ChangePasswordDialog>;
  private readonly destroyRef: DestroyRef;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly form: FormGroup<ChangePasswordFormControlsType>;

  constructor() {
    this.authService = inject(AuthService);
    this.notificationService = inject(NotificationService);
    this.dialogRef = inject(MatDialogRef<ChangePasswordDialog>);
    this.destroyRef = inject(DestroyRef);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<ChangePasswordFormControlsType>(
      {
        currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
        confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] })
      },
      { validators: passwordsMatchValidator }
    );
  }

  protected get passwordsMismatch(): boolean {
    return this.form.hasError('passwordsMismatch') && (this.form.get('confirmPassword')?.touched ?? false);
  }

  protected submit(): void {
    if (this.form.invalid || this.savingSignal()) return;
    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    const { currentPassword, newPassword } = this.form.getRawValue();

    this.authService
      .changePassword(currentPassword, newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error: string | null): void => {
        this.savingSignal.set(false);
        if (error) {
          this.errorMessageSignal.set(error);
          return;
        }
        this.notificationService.success('Contraseña actualizada correctamente.');
        this.dialogRef.close();
      });
  }
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
