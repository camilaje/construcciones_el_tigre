import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

const SUCCESS_TOAST_DURATION_MS_CONSTANTS = 5000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar: MatSnackBar;

  constructor() {
    this.snackBar = inject(MatSnackBar);
  }

  public success(message: string): void {
    this.snackBar.open(message, undefined, {
      duration: SUCCESS_TOAST_DURATION_MS_CONSTANTS,
      panelClass: 'app-toast--success'
    });
  }
}
