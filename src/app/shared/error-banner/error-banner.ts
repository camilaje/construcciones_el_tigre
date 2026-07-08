import { Component, InputSignal, Signal, WritableSignal, computed, effect, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-error-banner',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './error-banner.html',
  styleUrl: './error-banner.scss'
})
export class ErrorBanner {
  // Angular's signal-based `input()` must be a property initializer (the
  // compiler relies on it to register the input) — it can't be assigned in
  // the constructor like the rest of this project's fields, same kind of
  // framework-imposed exception as AuthService skipping takeUntilDestroyed.
  public readonly message: InputSignal<string | null> = input<string | null>(null);
  public readonly dismissed = output<void>();

  private readonly hiddenSignal: WritableSignal<boolean> = signal(false);
  protected readonly visible: Signal<boolean> = computed(
    (): boolean => !!this.message() && !this.hiddenSignal()
  );

  constructor() {
    // Reset hidden when a new message arrives so the banner reappears.
    // Works for non-null→null→non-null cycles (the parent clears to null on
    // dismiss via the `dismissed` output), and also handles message changes
    // between different error strings.
    effect((): void => {
      if (this.message()) {
        this.hiddenSignal.set(false);
      }
    });
  }

  protected dismiss(): void {
    this.hiddenSignal.set(true);
    this.dismissed.emit();
  }
}
