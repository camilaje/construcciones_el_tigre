import { Component, InputSignal, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-error-banner',
  imports: [MatIconModule],
  templateUrl: './error-banner.html',
  styleUrl: './error-banner.scss'
})
export class ErrorBanner {
  // Angular's signal-based `input()` must be a property initializer (the
  // compiler relies on it to register the input) — it can't be assigned in
  // the constructor like the rest of this project's fields, same kind of
  // framework-imposed exception as AuthService skipping takeUntilDestroyed.
  public readonly message: InputSignal<string | null> = input<string | null>(null);
}
