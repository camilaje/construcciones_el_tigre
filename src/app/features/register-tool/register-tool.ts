import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import {
  APP_ROUTE_ENUMERATION,
  NotificationService,
  POSTGRES_ERROR_CODE_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface CatalogItemType {
  id: string;
  name: string;
}

interface CatalogItemResponseType {
  data: CatalogItemType[] | null;
  error: PostgrestError | null;
}

interface InsertResponseType {
  error: PostgrestError | null;
}

interface RegisterToolFormControlsType {
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
    LoadingOverlay,
    ErrorBanner
  ],
  templateUrl: './register-tool.html',
  styleUrl: './register-tool.scss'
})
export class RegisterTool {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly router: Router;
  private readonly destroyRef: DestroyRef;
  private readonly toolsSignal: WritableSignal<CatalogItemType[]>;
  private readonly sitesSignal: WritableSignal<CatalogItemType[]>;
  private readonly supervisorsSignal: WritableSignal<CatalogItemType[]>;
  private readonly loadingCatalogsSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly form: FormGroup<RegisterToolFormControlsType>;
  protected readonly tools: Signal<CatalogItemType[]>;
  protected readonly sites: Signal<CatalogItemType[]>;
  protected readonly supervisors: Signal<CatalogItemType[]>;
  protected readonly loadingCatalogs: Signal<boolean>;
  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.router = inject(Router);
    this.destroyRef = inject(DestroyRef);
    this.toolsSignal = signal<CatalogItemType[]>([]);
    this.sitesSignal = signal<CatalogItemType[]>([]);
    this.supervisorsSignal = signal<CatalogItemType[]>([]);
    this.loadingCatalogsSignal = signal<boolean>(true);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);

    this.tools = this.toolsSignal.asReadonly();
    this.sites = this.sitesSignal.asReadonly();
    this.supervisors = this.supervisorsSignal.asReadonly();
    this.loadingCatalogs = this.loadingCatalogsSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<RegisterToolFormControlsType>({
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

  protected submit(formDirective: FormGroupDirective): void {
    if (this.form.invalid || this.savingSignal()) {
      return;
    }

    const toolId: string = this.form.controls.toolId.value;
    const siteId: string = this.form.controls.siteId.value;
    const initialQuantity: number = this.form.controls.initialQuantity.value;
    const supervisorId: string | null = this.form.controls.supervisorId.value;

    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.INVENTORY).insert({
        herramienta_id: toolId,
        obra_id: siteId,
        cantidad_inicial: initialQuantity,
        encargado_id: supervisorId
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: InsertResponseType): void => {
        this.savingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(
            result.error.code === POSTGRES_ERROR_CODE_ENUMERATION.UNIQUE_VIOLATION
              ? 'Esta herramienta ya tiene inventario registrado en esta obra. Usa "Registrar movimiento" para trasladar cantidad hacia aquí.'
              : result.error.message
          );
          return;
        }

        this.notificationService.success('Herramienta registrada correctamente en la obra.');
        this.router.navigate([APP_ROUTE_ENUMERATION.INVENTORY]);
      });
  }

  private loadCatalogs(): void {
    const tools$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.TOOLS).select('id, name:nombre').order('nombre')
    );
    const sites$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.SITES).select('id, name:nombre').order('nombre')
    );
    const supervisors$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.SUPERVISORS)
        .select('id, name:nombre')
        .order('nombre')
    );

    combineLatest([tools$, sites$, supervisors$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(
        ([tools, sites, supervisors]: [
          CatalogItemResponseType,
          CatalogItemResponseType,
          CatalogItemResponseType
        ]): void => {
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
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
