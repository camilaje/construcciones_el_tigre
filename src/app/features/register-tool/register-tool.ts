import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import { SupabaseService } from '../../core/supabase.service';

interface CatalogItem {
  id: string;
  name: string;
}

interface CatalogItemResponse {
  data: CatalogItem[] | null;
  error: PostgrestError | null;
}

interface InsertResponse {
  error: PostgrestError | null;
}

interface RegisterToolFormControls {
  toolId: FormControl<string>;
  siteId: FormControl<string>;
  initialQuantity: FormControl<number>;
  supervisorId: FormControl<string | null>;
}

@Component({
  selector: 'app-register-tool',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './register-tool.html',
  styleUrl: './register-tool.scss'
})
export class RegisterTool {
  private readonly supabaseService: SupabaseService;
  private readonly toolsSignal: WritableSignal<CatalogItem[]>;
  private readonly sitesSignal: WritableSignal<CatalogItem[]>;
  private readonly supervisorsSignal: WritableSignal<CatalogItem[]>;
  private readonly loadingCatalogsSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly successMessageSignal: WritableSignal<string | null>;

  protected readonly form: FormGroup<RegisterToolFormControls>;
  protected readonly tools: Signal<CatalogItem[]>;
  protected readonly sites: Signal<CatalogItem[]>;
  protected readonly supervisors: Signal<CatalogItem[]>;
  protected readonly loadingCatalogs: Signal<boolean>;
  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly successMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.toolsSignal = signal<CatalogItem[]>([]);
    this.sitesSignal = signal<CatalogItem[]>([]);
    this.supervisorsSignal = signal<CatalogItem[]>([]);
    this.loadingCatalogsSignal = signal<boolean>(true);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);
    this.successMessageSignal = signal<string | null>(null);

    this.tools = this.toolsSignal.asReadonly();
    this.sites = this.sitesSignal.asReadonly();
    this.supervisors = this.supervisorsSignal.asReadonly();
    this.loadingCatalogs = this.loadingCatalogsSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.successMessage = this.successMessageSignal.asReadonly();

    this.form = new FormGroup<RegisterToolFormControls>({
      toolId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      siteId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      initialQuantity: new FormControl(1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)]
      }),
      supervisorId: new FormControl<string | null>(null)
    });

    this.loadCatalogs();
  }

  protected submit(): void {
    if (this.form.invalid || this.savingSignal()) {
      return;
    }

    const toolId: string = this.form.controls.toolId.value;
    const siteId: string = this.form.controls.siteId.value;
    const initialQuantity: number = this.form.controls.initialQuantity.value;
    const supervisorId: string | null = this.form.controls.supervisorId.value;

    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);
    this.successMessageSignal.set(null);

    from(
      this.supabaseService.client.from('inventario_obra').insert({
        herramienta_id: toolId,
        obra_id: siteId,
        cantidad_inicial: initialQuantity,
        encargado_id: supervisorId
      })
    ).subscribe((result: InsertResponse): void => {
      this.savingSignal.set(false);

      if (result.error) {
        this.errorMessageSignal.set(
          result.error.code === '23505'
            ? 'Esta herramienta ya tiene inventario registrado en esta obra. Usa "Registrar movimiento" para trasladar cantidad hacia aquí.'
            : result.error.message
        );
        return;
      }

      this.successMessageSignal.set('Herramienta registrada correctamente en la obra.');
      this.form.reset({ toolId: '', siteId: '', initialQuantity: 1, supervisorId: null });
    });
  }

  private loadCatalogs(): void {
    const tools$: Observable<CatalogItemResponse> = from(
      this.supabaseService.client.from('herramientas').select('id, name:nombre').order('nombre')
    );
    const sites$: Observable<CatalogItemResponse> = from(
      this.supabaseService.client.from('obras').select('id, name:nombre').order('nombre')
    );
    const supervisors$: Observable<CatalogItemResponse> = from(
      this.supabaseService.client.from('encargados').select('id, name:nombre').order('nombre')
    );

    combineLatest([tools$, sites$, supervisors$]).subscribe(
      ([tools, sites, supervisors]: [CatalogItemResponse, CatalogItemResponse, CatalogItemResponse]): void => {
        this.loadingCatalogsSignal.set(false);

        if (tools.error || sites.error || supervisors.error) {
          this.errorMessageSignal.set('No se pudieron cargar los catálogos.');
          return;
        }

        this.toolsSignal.set(tools.data ?? []);
        this.sitesSignal.set(sites.data ?? []);
        this.supervisorsSignal.set(supervisors.data ?? []);
      }
    );
  }
}
