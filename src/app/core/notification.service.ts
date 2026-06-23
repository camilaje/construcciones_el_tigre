import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar: MatSnackBar;

  constructor() {
    this.snackBar = inject(MatSnackBar);
  }

  success(message: string): void {
    this.snackBar.open(message, undefined, { duration: 5000 });
  }
}
