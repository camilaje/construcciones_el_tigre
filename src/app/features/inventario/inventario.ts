import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { from } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

interface ResumenObraRow {
  inventario_obra_id: string;
  obra: string;
  herramienta: string;
  cantidad_actual: number;
  encargado: string | null;
  ultimo_movimiento: string | null;
}

interface ResumenObraResponse {
  data: ResumenObraRow[] | null;
  error: PostgrestError | null;
}

@Component({
  selector: 'app-inventario',
  imports: [MatButtonModule, MatTableModule, MatToolbarModule, MatProgressSpinnerModule],
  templateUrl: './inventario.html',
  styleUrl: './inventario.scss'
})
export class Inventario {
  private readonly supabaseService: SupabaseService;
  private readonly authService: AuthService;
  private readonly router: Router;
  private readonly rowsSignal: WritableSignal<ResumenObraRow[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly columns: string[];
  protected readonly rows: Signal<ResumenObraRow[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.authService = inject(AuthService);
    this.router = inject(Router);
    this.rowsSignal = signal<ResumenObraRow[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);

    this.columns = ['obra', 'herramienta', 'cantidad_actual', 'encargado', 'ultimo_movimiento'];
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    from(this.supabaseService.client.from('resumen_por_obra').select('*')).subscribe(
      (result: ResumenObraResponse): void => {
        this.loadingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.rowsSignal.set(result.data ?? []);
      }
    );
  }

  protected logout(): void {
    this.authService.signOut().subscribe((): void => {
      this.router.navigateByUrl('/login');
    });
  }
}
