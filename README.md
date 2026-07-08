# Control de Herramientas — Construcciones El Tigre

Reemplazo del archivo Excel/LibreOffice `Control_Herramientas_El_Tigre_v9.ods` que la empresa usa para
controlar dónde está cada herramienta, en qué obra, a cargo de quién, y el historial de traslados entre obras.

## Por qué existe este proyecto

El Excel tiene fallas de diseño reales, no solo de UX:

- La cantidad actual es `cantidadInicial - cantidadQueSale`, una resta **no acumulativa**: una segunda salida
  en la misma fila rompe la fórmula a menos que se sume a mano.
- Trasladar una herramienta entre obras son **dos ediciones manuales separadas** (restar en origen, crear o
  sumar a mano en destino) — nunca atómico.
- La hoja "Resumen_por_Obra" depende de columnas auxiliares con una fórmula rota (columna fija a la primera
  obra del catálogo en vez de variar), así que no garantiza mostrar todas las combinaciones Obra×Herramienta.

La app corrige los tres puntos: historial de movimientos ilimitado, traslados atómicos, y una vista agregada
real en vez de fórmulas frágiles.

## Stack

- **Angular 22** (standalone components, signals, control flow `@if`/`@for`)
- **Angular Material** (Material 3 / system tokens vía `mat.theme()` en `src/styles.scss`)
- **Supabase** (Postgres + Auth + PostgREST + Edge Functions) — proyecto real: `ngiegwgrljveitpwsinf`
- **RxJS** para todo el flujo asíncrono (ver convenciones abajo)
- Desplegado en **Netlify** (gratuito) — **https://control-de-herramientas-el-tigre.netlify.app**

## Convenciones de código (obligatorias para todo código nuevo)

1. **RxJS, no `async/await` ni `.then()` suelto.** Las llamadas que devuelven `Promise` (ej. métodos de
   `supabase-js`) se envuelven con `from()` y se manejan con operadores RxJS / `.subscribe()`. Toda
   suscripción en un componente se cierra con `takeUntilDestroyed(this.destroyRef)` (`DestroyRef` inyectado
   en el constructor, igual que cualquier otra dependencia) para evitar fugas de memoria. **Nunca
   suscripciones anidadas** (un `.subscribe()` dentro de otro `.subscribe()`) — cuando el segundo paso
   depende del resultado del primero, se aplana con `switchMap` (ver `inventory-detail.ts` para el caso de
   dos pasos encadenados, o `catalog.ts`/`inventory.ts` `remove()` para confirmar-y-luego-borrar con
   `filter` + `switchMap`). Excepción documentada: `core/services/auth.service.ts` no usa
   `takeUntilDestroyed` — es un singleton `providedIn: 'root'` cuyo `DestroyRef` no se dispara en una
   sesión normal de la app, y sus suscripciones están pensadas para vivir mientras viva la app.
2. **Inyección de dependencias con `inject()`**, nunca como parámetro de constructor. Aun así, la asignación
   ocurre dentro del cuerpo del constructor (ver patrón abajo), no como inicializador de campo.
3. **Todo campo de clase**: tipado explícito, modificador de acceso explícito (`private`/`protected`/`public`,
   nunca implícito), e **inicializado en el constructor** (no como inicializador inline en la declaración).
4. **Todo método**: tipos explícitos de parámetros y de retorno, y modificador de acceso explícito.
   `protected` para miembros que solo usa el template; `private` para lo puramente interno.
5. **SCSS en BEM** (`bloque__elemento--modificador`) como clases de estilo, agregadas en el template junto a
   las clases propias de Angular Material, escrito con **anidación de SCSS**: un único `.bloque { ... }` por
   archivo, con cada elemento como `&__elemento { ... }` dentro y cada modificador como `&--modificador`
   anidado dentro de su elemento (ver `shell.scss` para el caso con modificador). Nunca selectores planos
   `.bloque__elemento { ... }` sueltos al nivel superior del archivo. **Unidades: `rem` para todo** (anchos,
   altos, `max-width`, `border-radius`, gaps, paddings, font-sizes) — excepto los breakpoints de
   `@media (max-width: ...)` y los `border: 1px solid` (bordes finos), que se quedan en `px` a propósito: un
   breakpoint en `rem` da números poco legibles (`37.5rem` en vez de `600px`) y un borde de 1px en `rem` se
   vuelve borroso o más grueso si el usuario cambia el zoom de texto del navegador, justo lo contrario de lo
   que se busca con un borde fino.
6. **Todo el código en inglés** (archivos, clases, interfaces, variables, métodos, nombres de rutas) — pero
   **no** el esquema de Supabase (tablas/columnas/RPC/vista siguen en español, ya desplegadas con datos
   reales) ni el texto visible para el usuario final (labels, botones, mensajes: siguen en español porque la
   usuaria de la app es personal de obra, no developers). El puente entre ambos mundos se resuelve con
   *column aliasing* de PostgREST en cada `.select()` (`'site:obra, tool:herramienta'`), así la respuesta de
   Supabase ya llega con propiedades en inglés sin tocar la base de datos. Ver `register-tool.ts` o
   `inventory.ts` como referencia.
7. **Mensajes de éxito en formularios van como toast**, vía `NotificationService.success(mensaje)`
   (`core/notification.service.ts`, envuelve `MatSnackBar`, se autodescarta a los 5s) — no como texto inline
   en la pantalla. Los mensajes de error sí se quedan inline, mediante `<app-error-banner [message]="..." />`
   (`shared/error-banner/`, ver punto 11b) — el usuario suele necesitar verlos mientras corrige el
   formulario. Y al resetear un formulario después de un submit exitoso, usar
   `formDirective.resetForm(valores)` (con `#formDirective="ngForm"` en el `<form>` y pasándolo a tu método
   de submit) en vez de `this.form.reset(valores)` — `form.reset()` no limpia el flag `submitted` de
   Angular, así que los campos requeridos vacíos se ven en rojo aunque el usuario no los haya tocado.
8. **Confirmaciones destructivas (borrar) usan `ConfirmationService.confirm(mensaje)`**
   (`core/confirmation.service.ts`, envuelve SweetAlert2 con `Swal.fire(...)`) en vez de `window.confirm()`
   nativo. Devuelve `Observable<boolean>` — se suscribe y solo se procede si `confirmed` es `true`. Nunca
   `async/await` con el resultado de `Swal.fire()`, aunque internamente sea una Promise: se envuelve con
   `from()` igual que cualquier otra llamada async, por la regla de RxJS del punto 1.
9. **Nada de strings/códigos quemados que se repiten entre archivos.** Nombres de tabla/vista/RPC de
   Supabase y códigos de error de Postgres viven en `core/supabase-schema.ts`
   (`SUPABASE_TABLE_ENUMERATION`, `SUPABASE_VIEW_ENUMERATION`, `SUPABASE_RPC_ENUMERATION`,
   `SUPABASE_EDGE_FUNCTION_ENUMERATION`, `APP_ROLE_ENUMERATION`, `POSTGRES_ERROR_CODE_ENUMERATION`);
   las rutas de la app viven en `core/app-route.ts` (`APP_ROUTE_ENUMERATION`). Todo `.from(...)`, `.rpc(...)`,
   `path`/`data` de rutas, `routerLink`, `navigateByUrl` y comparación de `error.code` pasa por uno de estos
   enums, nunca por un literal.
10. **Convención de nombres para tipos vs. enums/constantes** (distinta de la del punto 3, que es sobre
   modificadores de acceso):
   - Interfaces/type alias: PascalCase con sufijo `Type` (`CatalogItemType`, `NavLinkType`).
   - Enums y constantes exportadas sueltas: `UPPER_SNAKE_CASE` con sufijo `_ENUMERATION` (enums) o
     `_CONSTANTS` (constantes sueltas/agrupadas) — ej. `SUPABASE_TABLE_ENUMERATION`,
     `SUCCESS_TOAST_DURATION_MS_CONSTANTS`. Los **miembros** del enum también van en `UPPER_SNAKE_CASE`
     (`SUPABASE_TABLE_ENUMERATION.TOOLS`, no `.Tools`).
11. **Barrels (`index.ts`)** en `core/`, `core/services/`, `core/guards/`, `shell/`, cada subcarpeta de
    `features/`, y un `features/index.ts` que reexporta todas las features. `core/index.ts` reexporta
    `./services` y `./guards`. Cualquier import entre carpetas distintas pasa por el barrel más cercano
    (`from '../../core'`, `from './features'`), nunca por la ruta del archivo (`from
    '../../core/services/supabase.service'`). Dentro de `core/`, `services/` agrupa los servicios
    inyectables (Supabase, Auth, Notification, Confirmation) y `guards/` los route guards
    (`CanActivateFn`) — cada uno con su propio `index.ts`. Excepción: los archivos **dentro** de esas
    subcarpetas se importan entre sí de forma directa (ej. `auth.guard.ts` importa
    `../services/auth.service`, no el barrel), para evitar auto-referenciar el propio barrel.
11b. **Errores de formulario/reglas de negocio se muestran con `<app-error-banner [message]="..." (dismissed)="clearError()" />`**
    (`shared/error-banner/`, sibling de `core/` y `features/` para componentes presentacionales reusables
    entre features) en vez de un `<p>` suelto — ícono + fondo con tinte de error + borde, dismissible, para
    que un error real se note de un vistazo y no se confunda con texto normal. El usuario puede cerrarlo con
    el botón ✕; el evento `dismissed` llama a `clearError()` en el padre, que hace `errorMessageSignal.set(null)`.
    El componente usa `input()` y `output()` (API basada en signals) en vez de la inyección por constructor
    del resto del proyecto — excepción documentada: Angular exige que sean inicializadores de campo para
    reconocerlos como input/output, no se pueden asignar en el constructor. El host del componente usa
    `display: contents` (`error-banner.scss`) porque el elemento siempre existe en el DOM aunque no haya
    mensaje — sin eso, ocuparía un espacio vacío en el `gap` de formularios flex incluso sin error que mostrar.

Patrón de referencia (ver `src/app/core/auth.service.ts` o `src/app/features/login/login.ts`):

```ts
export class Ejemplo {
  private readonly miServicio: MiServicio;
  private readonly estadoSignal: WritableSignal<string | null>;
  protected readonly estado: Signal<string | null>;

  constructor() {
    this.miServicio = inject(MiServicio);
    this.estadoSignal = signal<string | null>(null);
    this.estado = this.estadoSignal.asReadonly();
  }

  protected hacerAlgo(valor: string): void {
    from(this.miServicio.llamadaQueDevuelvePromise(valor)).subscribe((resultado: Resultado): void => {
      this.estadoSignal.set(resultado.mensaje);
    });
  }
}
```

## Identidad de marca

> 💡 Registro histórico de las opciones de paleta evaluadas:
> [`docs/propuesta-paleta-colores.md`](docs/propuesta-paleta-colores.md). Opción C implementada el 2026-06-26.

- Logo en `public/logo.png` (negro sobre fondo blanco/transparente, para superficies claras — toolbar,
  login, favicon) y `public/logo_negro.png` (blanco sobre fondo oscuro, para superficies oscuras —
  sidenav). Ambos ya incluyen el texto "Construcciones El Tigre" — no lo dupliques en texto donde se
  muestre el logo.
- Favicon: `index.html` apunta a `/logo.png` directamente como PNG (`<link rel="icon" type="image/png">`),
  no al `favicon.ico` por defecto de Angular CLI — los navegadores modernos soportan PNG sin conversión.
- **Paleta "Concreto y Tierra" (Opción C, implementada 2026-06-26):**
  - Carbón cálido `#4b4a45` — texto principal, sidenav, botones primarios (`--mat-sys-primary`, `--mat-sys-on-surface`)
  - Blanco cálido `#f5f1ec` — fondo de página y superficies (`--mat-sys-surface`)
  - Arena `#e4ddd2` — tarjetas de stats, paneles de tips
  - Terracota `#b0492e` — error y único acento visual (`--mat-sys-error`) — no usar para otros roles
  - Gris cálido `#8b8a84` — texto secundario/muted (etiquetas, subtítulos)
  - Verde musgo `#5c7a4d` — toast de éxito (`--app-color-success`)
- **Set semántico mínimo** (`src/styles.scss`, custom properties `--app-color-success: #2e7d32`,
  `--app-color-warning: #c9971e`, `--app-color-info: #2563ac`; el error sigue siendo la terracota de
  arriba) — para que "éxito" deje de compartir color con "error"/"hover". Hoy solo está aplicado al toast
  de éxito (`NotificationService` pasa `panelClass: 'app-toast--success'`, estilizado en `styles.scss`
  apuntando a `.mdc-snackbar__surface`/`.mdc-snackbar__label` con `!important` — Material no expone esos
  tokens vía CSS variables en este punto, hay que pisar el color del elemento directamente). Advertencia e
  información están definidos pero sin una superficie concreta todavía que los use.
- Los tokens de sistema de Material 3 (`--mat-sys-primary`, `--mat-sys-on-primary`, `--mat-sys-error`,
  `--mat-sys-surface`, `--mat-sys-on-surface`) se sobreescriben **globalmente** en `body` (`src/styles.scss`),
  no solo en el login — así toda la app hereda negro/blanco/terracota en vez del azul por defecto de
  Material, sin pelear con `!important` contra el tema base.
- **Cualquier contenedor con fondo oscuro** (ej. `.shell__sidenav`) debe re-escopear `--mat-sys-surface` /
  `--mat-sys-on-surface` a blanco/negro invertido dentro de su propio selector — si no, los componentes de
  Material dentro de ese contenedor (hover, ripples, texto) siguen usando los valores globales (pensados
  para superficies claras) y el texto se vuelve negro-sobre-negro e ilegible, sobre todo en estados como
  `:hover` que cae de nuevo en el token de sistema en vez del override puntual de color que sí se haya hecho.
- El header (`shell.html`) es el mismo en todas las pantallas protegidas: logo + **título dinámico según la
  ruta activa** (`route.data['title']`, resuelto en `Shell.resolvePageTitle()` escuchando
  `Router.events`/`NavigationEnd`) + saludo "Hola, {nombre}" con el usuario logueado
  (`user.user_metadata['full_name']`) + ícono de ajustes (⚙) + botón de cerrar sesión. Logo y nombre se
  ocultan en viewports angostos (`max-width: 600px`) para no chocar con el título truncado.

## Arquitectura

```
src/app/
  core/
    services/
      supabase.service.ts    # cliente único de Supabase (createClient), inyectable
      auth.service.ts        # estado de sesión (signals) + signInWithUsername/changePassword/signOut
      notification.service.ts # toast de éxito (MatSnackBar, autodesaparece a los 5s)
      confirmation.service.ts # popup de confirmar/cancelar (SweetAlert2) para acciones destructivas
    guards/
      auth.guard.ts          # CanActivateFn: redirige a /login si no hay sesión
      role.guard.ts          # CanActivateFn factory: roleGuard(allowedRoles[]) — redirige a /home si
                             # el rol del usuario no está en la lista permitida
    supabase-schema.ts       # enums: SUPABASE_TABLE_ENUMERATION, SUPABASE_VIEW_ENUMERATION,
                             # SUPABASE_RPC_ENUMERATION, SUPABASE_EDGE_FUNCTION_ENUMERATION,
                             # APP_ROLE_ENUMERATION, POSTGRES_ERROR_CODE_ENUMERATION
    app-route.ts             # enum APP_ROUTE_ENUMERATION con todas las rutas de la app
  shared/
    error-banner/            # <app-error-banner [message]="..." (dismissed)="clearError()">, ícono + fondo con
                              # tinte de error + borde, dismissible — para mensajes de validación/negocio en cualquier feature
    loading-overlay/         # <app-loading-overlay [active]="loading()" />, overlay semi-transparente de
                              # pantalla completa con spinner centrado (position:fixed, inset:0, z-index:150).
                              # Usado en los 16 componentes de features durante cargas iniciales y mutaciones
  shell/
    shell.ts                # layout con sidenav tipo hamburguesa (mode="over", oculto por
                             # defecto, botón ☰ en el toolbar) + header dinámico (logo, título por
                             # ruta, nombre de usuario, ícono ⚙ con menú "Cambiar contraseña",
                             # logout). La navegación está organizada en grupos colapsables con
                             # mat-accordion (Inicio | Usuarios | Herramientas | Materiales |
                             # Catálogos) — el grupo activo se expande automáticamente. "Usuarios"
                             # solo es visible para rol admin/super_admin.
    change-password-dialog.ts # MatDialog: cambiar contraseña del usuario autenticado actual.
                              # Verifica la contraseña actual antes de aplicar la nueva.
  features/
    login/                  # pantalla de login con campo "Nombre de usuario" (no email)
    home/                   # "Inicio": dashboard con conteos (herramientas/obras/encargados/etc.)
    inventory/               # "Inventario por Obra", lee la vista resumen_por_obra; editar encargado y
                             # borrar (si no tiene movimientos); link a inventory-detail por fila
    inventory-detail/        # ficha de un registro: cabecera + línea de tiempo filtrada de movimientos
    register-tool/           # "Registrar herramienta nueva en obra" (alta inicial)
    register-movement/       # "Registrar movimiento" (traslado obra-a-obra), usa el RPC transferir_herramienta
    movement-history/        # "Historial de movimientos", lee la vista historial_movimientos
    material-inventory/      # "Inventario de materiales", lee la vista resumen_por_obra_material
    register-material-initial/ # "Registrar material en obra" (alta inicial), inserta en inventario_material
    register-material/       # "Registrar movimiento de material" (traslado), usa RPC transferir_material
    material-history/        # "Historial de movimientos de material", lee historial_movimientos_material
    register-purchase/       # "Registrar compra de herramienta" — ingreso externo sin obra origen,
                             #  usa RPC registrar_compra_herramienta; navega a /inventory al terminar
    register-writeoff/       # "Dar de baja herramienta" (daño/pérdida/obsolescencia), solo admin/super_admin.
                             #  Dropdown de herramienta → dropdown de obra (solo obras con stock > 0).
                             #  Usa RPC dar_de_baja_herramienta; navega a /inventory al terminar
    register-consumption/    # "Registrar consumo de material" (todos los roles).
                             #  Dropdown de material → dropdown de obra (solo obras con stock > 0).
                             #  Usa RPC registrar_consumo_material; navega a /materials/inventory al terminar
    catalog/                 # CRUD genérico configurable via route data: soporta campos opcionales
                             # hasQuantity (cantidad_total + summary view), hasBodega (toggle es_bodega),
                             # hasObservations (campo libre). Reusado en 4 rutas:
                             # catalogs/tools, catalogs/materials, catalogs/sites, catalogs/supervisors
                             # Workers (rol worker) ven el catálogo en modo solo lectura (sin botones
                             # de editar/borrar y sin columna de acciones).
    user-management/         # "/admin/users" — protegida con roleGuard([admin, super_admin]).
                             # Lista usuarios desde perfiles_usuario, crea y elimina vía Edge Function
                             # manage-user. super_admin puede crear admins; admins solo crean workers.
  app.routes.ts             # '/login' público; '/' (Shell) protegida con authGuard, con hijos:
                             # '' (Home), 'inventory', 'inventory/:id', 'register-tool',
                             # 'register-movement', 'register-purchase', 'movements',
                             # 'materials/inventory', 'materials/register-initial', 'materials/register',
                             # 'materials/register-purchase', 'materials/register-consumption',
                             # 'materials/history', 'catalogs/tools', 'catalogs/materials',
                             # 'catalogs/sites', 'catalogs/supervisors',
                             # 'register-writeoff' (roleGuard [admin, super_admin]),
                             # 'admin/users' (roleGuard [admin, super_admin])
```

### Base de datos (Supabase)

Migraciones en `supabase/migrations/`, seed en `supabase/seed.sql`. Para aplicar cambios nuevos, usar el
SQL Editor del Dashboard (`supabase.com/dashboard/project/ngiegwgrljveitpwsinf/sql/new`) — el CLI vinculado
(`supabase link`/`db push`) está bloqueado en esta máquina por el antivirus, ver sección de entorno abajo.

**Tablas:**

| Tabla | Qué guarda |
|---|---|
| `herramientas` | Catálogo: nombre + `cantidad_total` (total de unidades que existe en la empresa) |
| `obras` | Catálogo: nombre + `es_bodega` (si es true, el stock ahí se cuenta como "disponible") |
| `encargados` | Catálogo simple (solo nombre) |
| `inventario_obra` | Una fila por combinación Herramienta×Obra. `cantidad_inicial` se ingresa una sola vez; `cantidad_actual` se recalcula solo (trigger) |
| `movimientos` | Historial de movimientos de herramientas. Columna `tipo` (`traslado` / `compra` / `baja`). Para tipo `baja`: `inventario_destino_id` es NULL y `motivo` lleva la razón (`daño` / `pérdida` / `obsolescencia`) |
| `materiales` | Catálogo: nombre + `cantidad_total` + `observaciones` (campo libre de texto) |
| `inventario_material` | Una fila por combinación Material×Obra. `cantidad_inicial` se ingresa una sola vez; `cantidad_actual` se recalcula solo (trigger insert + trigger delete + trigger after-insert) |
| `movimientos_material` | Historial de movimientos de materiales. Columna `tipo` (`traslado` / `compra` / `consumo`). Para tipo `consumo`: `inventario_destino_id` es NULL |
| `perfiles_usuario` | Perfil de cada usuario: `user_id` (FK → auth.users), `role` (super_admin/admin/worker), `display_name`, `username` (login identifier, UNIQUE), `created_at` |

**Funciones RPC:**
- `transferir_herramienta(herramienta_id, obra_origen_id, obra_destino_id, cantidad, ...)` — valida stock en
  origen, crea el registro en destino si no existe, inserta el movimiento; trigger recalcula `cantidad_actual`.
- `registrar_compra(herramienta_id, obra_destino_id, cantidad, ...)` — solo admin/super_admin (verificado con
  `auth_role()` dentro del RPC, no solo en el frontend). Ingreso externo sin obra origen (compra). Incrementa
  `cantidad_total` en `herramientas` e inserta movimiento con `tipo = 'compra'`.
- `dar_de_baja_herramienta(herramienta_id, obra_origen_id, cantidad, motivo, ...)` — solo admin/super_admin
  (`auth_role()` dentro del RPC). Valida stock disponible y que `cantidad_total` no quede negativo, decrece
  `cantidad_total` en `herramientas` e inserta movimiento con `tipo = 'baja'` y `motivo`
  (`daño`/`pérdida`/`obsolescencia`). `inventario_destino_id` queda NULL.
- `transferir_material(material_id, obra_origen_id, obra_destino_id, cantidad, ...)` — ídem para materiales.
- `registrar_compra_material(material_id, obra_destino_id, cantidad, ...)` — solo admin/super_admin
  (`auth_role()` dentro del RPC). Ingreso externo de material. Incrementa `cantidad_total` en `materiales`
  e inserta movimiento con `tipo = 'compra'`.
- `registrar_consumo_material(material_id, obra_origen_id, cantidad, ...)` — SECURITY DEFINER, abierta a
  todos los roles a propósito (workers pueden usarla). Valida stock disponible y que `cantidad_total` no
  quede negativo, decrece `cantidad_total` en `materiales` e inserta movimiento con `tipo = 'consumo'`.
  `inventario_destino_id` queda NULL.
- `recalcular_cantidad_actual_material(inventario_id)` — SECURITY DEFINER. Recalcula `cantidad_actual` desde
  el historial (`cantidad_inicial + entradas − salidas`) y **rechaza el resultado si daría negativo**
  (lanza excepción amigable en vez de dejar que falle el `CHECK` de la columna). Necesita SECURITY DEFINER
  porque workers no tienen permiso de UPDATE en `inventario_material` directamente. Su equivalente para
  herramientas (`recalcular_cantidad_actual`) tiene el mismo guard de negativos y también es SECURITY
  DEFINER por la misma razón (ver changelog 2026-07-07).
- `movimientos_after_insert()` — SECURITY DEFINER. Recalcula ambos inventarios afectados y genera
  `texto_autogenerado`; necesita SECURITY DEFINER porque `movimientos` no tiene política de UPDATE para
  ningún rol (los movimientos son de solo creación + eliminación por diseño) y ese campo se escribe
  internamente justo después del INSERT.
- `auth_role()` — devuelve el rol del usuario actual; lee el claim del JWT primero (rápido), cae a
  `perfiles_usuario` como fallback (primer login tras una migración de roles).
- `get_auth_email_by_username(p_username)` — SECURITY DEFINER; resuelve el email interno de auth.users a
  partir del username. Usado por `AuthService.signInWithUsername()` en el login.

**Edge Functions** (`supabase/functions/`):
- `manage-user` — gestión de usuarios desde el frontend. Acciones: `create` (genera email sintético interno,
  crea el auth user y el perfil), `delete`. Valida que el llamador sea admin/super_admin; los admins solo
  pueden crear/eliminar workers; nadie puede crear/eliminar super_admins desde la app. Usa `service_role`
  internamente (server-side) — el frontend solo envía el JWT del usuario autenticado.

**Vistas** (todas con `security_invoker = true` — sin esto quedarían con owner `postgres`, saltándose el RLS):
- `resumen_por_obra` — agregación Herramienta×Obra con `cantidad_actual`, encargado y último movimiento.
- `historial_movimientos` — resuelve nombres legibles para el historial de herramientas; incluye columna `tipo`
  (`traslado`/`compra`/`baja`) y `motivo` (solo para bajas).
- `resumen_herramientas` — por herramienta: `cantidad_total`, `en_obras` (excluye `es_bodega=true`), `disponible`.
- `resumen_materiales` — igual que la anterior pero para materiales.
- `resumen_por_obra_material` — agregación Material×Obra con `cantidad_actual`, encargado y último movimiento.
- `historial_movimientos_material` — resuelve nombres legibles para el historial de materiales; incluye columna
  `tipo` (`traslado`/`compra`/`consumo`).

**RLS:** políticas granulares por operación y por rol en todas las tablas:
- Catálogos (`herramientas`, `materiales`, `obras`, `encargados`) y inventarios: todos los autenticados
  pueden SELECT e INSERT; solo `admin`/`super_admin` pueden UPDATE y DELETE.
- Movimientos: todos los autenticados pueden SELECT e INSERT; solo `admin`/`super_admin` pueden DELETE.
- `perfiles_usuario`: SELECT para todos los autenticados; INSERT/UPDATE/DELETE bloqueados desde PostgREST
  (solo la Edge Function con `service_role` puede modificarlos).
- El rol se determina con `auth_role()`, que lee primero el claim `role` del JWT y cae al DB como fallback.

### Reglas de negocio que la app preserva

1. Una herramienta (o material) puede existir repartida en varias obras a la vez, cada combinación con su propia cantidad.
2. Un traslado es una sola operación atómica (resta en origen + suma-o-creación en destino).
3. El historial completo de movimientos debe ser reconstruible por herramienta/material/obra/tiempo.
4. La vista consolidada es una consulta agregada real, no una fórmula frágil.
5. `cantidad_inicial` se ingresa una sola vez, al llegar la herramienta/material por primera vez a una obra.
6. Una obra marcada como `es_bodega = true` es tratada como bodega: su stock cuenta como "disponible" en el resumen de herramientas, no como "en obras".
7. `cantidad_total` en `herramientas` y `materiales` representa el total físico que tiene la empresa; `disponible = cantidad_total − en_obras`.
8. Los **workers** pueden crear registros (catálogos, altas iniciales, movimientos, consumos de materiales);
   no pueden editar ni eliminar nada, y no pueden dar de baja herramientas.
9. Los **admins** tienen acceso completo a la app y pueden crear/eliminar usuarios worker.
10. Solo el **super_admin** puede crear/eliminar cuentas admin. No se pueden crear super_admins desde la app.
11. Una **baja de herramienta** es una salida sin destino: retira unidades del inventario de una obra y las
    elimina del total de la empresa (`cantidad_total − cantidad`). Requiere una razón: `daño`, `pérdida` u
    `obsolescencia`. Solo admin/super_admin pueden registrarla.
12. Un **consumo de material** es equivalente a la baja pero para materiales: retira stock de una obra y
    descuenta de `cantidad_total`. Todos los roles pueden registrar consumos (workers incluidos, ya que es
    una operación habitual en obra).

### Qué entidades son CRUD completo y cuáles no (decisión deliberada)

- **Herramientas, Obras, Encargados, Materiales** (catálogos): CRUD completo para admin/super_admin; solo
  lectura + creación para workers.
- **Inventario (`inventario_obra`, `inventario_material`)**: solo lectura + alta inicial. `cantidad_actual` nunca se edita a mano
  (es justo el bug que el rediseño corrige) — la única forma de cambiarla es a través de un movimiento.
- **Movimientos (`movimientos`, `movimientos_material`)**: creación + eliminación (sin edición). La eliminación
  recalcula automáticamente `cantidad_actual` en los inventarios afectados (trigger AFTER DELETE). Se permite
  borrar para corregir registros erróneos; la cantidad resultante queda siempre consistente con el historial
  restante. Workers pueden crear movimientos y consumos pero no eliminarlos. Las bajas de herramienta son
  movimientos con `tipo = 'baja'` (solo admin/super_admin); los consumos de material son movimientos con
  `tipo = 'consumo'` (todos los roles).

## Estado actual (qué está construido)

- ✅ Esquema completo de base de datos, aplicado al proyecto Supabase real, con seed del catálogo legacy
  (22 herramientas, 2 obras, 7 encargados).
- ✅ Login con nombre de usuario (no email). `AuthService.signInWithUsername()` llama al RPC
  `get_auth_email_by_username` para resolver el email interno antes de autenticar.
- ✅ Guard de rutas — sin sesión, todo redirige a `/login`. `roleGuard(allowedRoles)` para rutas con
  restricción de rol (ej. `/admin/users` solo para admin/super_admin).
- ✅ Sistema de roles (RBAC): 3 roles (`super_admin`, `admin`, `worker`) almacenados en `perfiles_usuario`
  y sincronizados al JWT via trigger. El rol viaja en `app_metadata.role` del JWT y se lee como signal
  (`authService.role()`) en toda la app.
- ✅ Shell con sidenav (menú de módulos), header dinámico con saludo por nombre, ícono ⚙ que abre menú
  "Cambiar contraseña" (MatDialog), y logout centralizado.
- ✅ Cambio de contraseña: cualquier usuario autenticado puede cambiar su contraseña desde el ícono ⚙ en
  el toolbar. Verifica la contraseña actual antes de aplicar la nueva.
- ✅ Gestión de usuarios (`/admin/users`, solo admin/super_admin): lista, crea y elimina usuarios.
  Los nuevos usuarios se crean con username + contraseña (sin correo); internamente se genera un email
  sintético invisible. La Edge Function `manage-user` realiza las operaciones con `service_role`
  server-side; el frontend solo envía el JWT del usuario autenticado.
- ✅ Restricciones de rol en la UI: workers ven catálogos/inventarios/historial en modo solo lectura
  (sin botones de editar/borrar, sin columna de acciones). El enlace "Usuarios" en el sidenav solo
  aparece para admin/super_admin.
- ✅ Pantalla "Inicio" — dashboard con conteos reales (herramientas, obras, encargados, combinaciones con
  stock, unidades totales, movimientos) para que no se vea vacía al recargar.
- ✅ Pantalla "Inventario por Obra" — lee `resumen_por_obra`, muestra estado vacío si no hay datos.
- ✅ Pantalla "Registrar herramienta nueva en obra" (alta inicial) — inserta en `inventario_obra`.
- ✅ Pantalla "Registrar movimiento" — llama al RPC `transferir_herramienta`, valida que origen y destino
  sean distintos, y muestra los mensajes de error del RPC (stock insuficiente, etc.) tal cual.
- ✅ CRUD de catálogos (Herramientas, Obras, Encargados) — `features/catalog/`, una sola pantalla
  reusada por route data, con manejo de error de nombre duplicado y de borrado bloqueado por FK.
- ✅ Toasts de éxito (`NotificationService`) en formularios, en vez de mensajes fijos en pantalla.
- ✅ Pantalla "Historial de movimientos" — lee la vista `historial_movimientos`, solo lectura.
- ✅ Strings/códigos repetidos centralizados en enums (`core/supabase-schema.ts`, `core/app-route.ts`).
- ✅ Editar/borrar en "Inventario por Obra" — reasignar encargado inline, y borrar un registro sin
  movimientos asociados (bloqueado con mensaje claro si tiene historial, vía FK restrict). La
  `cantidad_actual` sigue sin ser editable directamente, por diseño.
- ✅ Detalle de un registro de inventario (`/inventory/:id`) — cabecera (herramienta, obra, cantidad,
  encargado) + línea de tiempo de movimientos donde esa obra es origen o destino.
- ✅ Barrels (`index.ts`) en `core/`, `shell/` y cada feature, con `features/index.ts` agregador.
- ✅ Popups de confirmar/cancelar para borrar (Catálogos, Inventario) con SweetAlert2
  (`core/confirmation.service.ts`), en vez de `window.confirm()` nativo.
- ✅ Filtros por Obra/Herramienta en "Inventario por Obra", y por Herramienta/Obra/rango de fecha en
  "Historial de movimientos" — client-side, vía `computed()` sobre las filas ya cargadas.
- ✅ Responsive verificado en viewport móvil real (iPhone 12, 390px): título del toolbar trunca con
  ellipsis en vez de superponerse al botón "Cerrar sesión"; las tablas (Inventario, Historial, Detalle)
  van dentro de un contenedor con scroll horizontal propio en vez de desbordar la página.
- ✅ Colores de marca aplicados globalmente (no solo en login) y header dinámico (logo, título por
  ruta, nombre de usuario) en todas las pantallas protegidas.
- ✅ Catálogos (Herramientas/Obras/Encargados) usan `mat-table`, igual que Inventario/Historial.
- ✅ Tablas con bordes redondeados (`__table-wrapper` con `border-radius` + `overflow: hidden`) en
  Inventario, Historial, Catálogos y Detalle de inventario.
- ✅ Sidenav: el hover de los links ya no queda negro-sobre-negro — el override global de
  `--mat-sys-on-surface` se re-escopea a blanco dentro de `.shell__sidenav` (es una superficie oscura).
- ✅ Sin títulos `<h1>` redundantes con el título dinámico del header en Inicio, Inventario, Historial,
  Catálogos, Registrar herramienta y Registrar movimiento (Detalle de inventario conserva el suyo porque
  muestra info específica — herramienta y obra — que el header no tiene).
- ✅ En "Inicio", los botones de acción rápida van antes que las tarjetas de estadísticas, y en mobile
  las tarjetas se acomodan en 2 columnas — así los botones quedan visibles sin necesidad de scroll.
- ✅ Aprovechamiento de espacio en desktop: el contenedor de página (`shell.scss`, `&__page`) tiene
  `max-width` y se centra, para que el contenido no quede pegado a la izquierda en monitores anchos. Las
  pantallas de formulario (Login, Registrar herramienta, Registrar movimiento) muestran un panel lateral
  con tips/contexto junto a la tarjeta; las de listado (Inventario, Historial, Catálogos) muestran una
  franja de estadísticas reales (conteos ya calculados de los datos cargados, sin pedir nada nuevo a
  Supabase) arriba de la tabla. Ambos paneles se ocultan bajo los 900px para no afectar el mobile, que ya
  estaba resuelto.
- ✅ Unidades de CSS unificadas en `rem` (ver convención 5 arriba) en todas las hojas de estilo del proyecto.
- ✅ Auditoría mobile-first: las tablas de Inventario, Historial de movimientos y Detalle de inventario
  (las que tienen muchas columnas) se reflujan a tarjetas apiladas bajo los 600px — cada `<td>` se muestra
  como línea "etiqueta: valor" en vez de columna, eliminando el scroll horizontal combinado con filas
  gigantes que generaba el texto largo (ej. "Último movimiento"). El botón "Cerrar sesión" del header
  pasa a ser solo ícono bajo los 600px para darle más espacio al título de la página, que antes se
  truncaba más agresivamente. Catálogos no necesitó el cambio (solo 2 columnas).
- ✅ Set semántico mínimo de color (`--app-color-success`/`-warning`/`-info` en `src/styles.scss`) — por
  ahora solo "éxito" tiene una superficie real (el toast verde de `NotificationService`).
- ✅ Errores de formulario/reglas de negocio más visibles: `<app-error-banner>` (ícono + fondo con tinte +
  borde) reemplaza el `<p>` de texto plano en Login, Registrar herramienta, Registrar movimiento y
  Catálogos.
- ✅ Sidenav refactorizado a grupos colapsables con `mat-accordion` (Inicio | Usuarios | Herramientas |
  Materiales | Catálogos) — elimina la lista plana de ítems y agrupa los módulos por dominio. El grupo que
  contiene la ruta activa se expande automáticamente al navegar. "Usuarios" solo visible para admin/super_admin.
  Los grupos Herramientas y Materiales incluyen ahora los nuevos accesos: "Registrar compra", "Dar de baja"
  (solo admin/super_admin en Herramientas) y "Registrar consumo" (en Materiales).
- ✅ Módulo de materiales completo: inventario por obra (`material-inventory/`), registrar movimiento
  (`register-material/`, usa RPC `transferir_material`), historial (`material-history/`). Las tres pantallas
  siguen la misma estructura y convenciones que sus equivalentes de herramientas.
- ✅ Catálogo de herramientas ampliado: campo `cantidad_total` editable + columnas "Total / En obras /
  Disponible" calculadas desde la vista `resumen_herramientas`. Obras con `es_bodega = true` no cuentan
  en "en obras", así que el stock en bodega se refleja como disponible.
- ✅ Catálogo de materiales: igual que herramientas + campo `observaciones` (texto libre opcional).
- ✅ Catálogo de obras ampliado: toggle "Es bodega" por fila — marca una obra como bodega sin salir del
  catálogo. Las bodegas son obras regulares con `es_bodega = true` (decisión del cliente).
- ✅ Alta inicial de materiales en obra (`register-material-initial/`, ruta `/materials/register-initial`) —
  equivalente a "Registrar herramienta en obra" pero para materiales. Inserta directamente en
  `inventario_material` con `cantidad_inicial`; un trigger recalcula `cantidad_actual` al insertar, y otro
  al modificar/borrar movimientos, garantizando consistencia en todos los casos. Redirige a
  `/materials/inventory` tras el submit exitoso.
- ✅ Registro de compras de herramientas y materiales (`register-purchase/` y `materials/register-purchase/`) —
  ingreso externo sin obra origen. Usa RPCs `registrar_compra_herramienta` y `registrar_compra_material`;
  incrementa `cantidad_total` del catálogo y genera movimiento con `tipo = 'compra'`. El historial muestra
  estos registros con badge "Compra" (azul oscuro) en vez de la flecha origen→destino.
- ✅ Baja de herramientas dañadas (`register-writeoff/`, ruta `/register-writeoff`, solo admin/super_admin) —
  retira unidades dañadas/perdidas/obsoletas del inventario de una obra y descuenta de `cantidad_total`.
  Dropdown herramienta → dropdown obra (filtrado por stock > 0). Usa RPC `dar_de_baja_herramienta`.
  El historial muestra bajas con badge rojo (texto = motivo: "daño"/"pérdida"/"obsolescencia").
  Redirige a `/inventory` tras el submit exitoso.
- ✅ Consumo de materiales (`register-consumption/`, ruta `/materials/register-consumption`, todos los roles) —
  retira material consumido en obra y descuenta de `cantidad_total`. Dropdown material → dropdown obra
  (filtrado por stock > 0). Usa RPC `registrar_consumo_material` (SECURITY DEFINER para que workers puedan
  ejecutarlo). El historial muestra consumos con badge ámbar "Consumo".
  Redirige a `/materials/inventory` tras el submit exitoso.
- ✅ Redirect post-submit en todos los formularios: RegisterTool, RegisterMaterialInitial, RegisterPurchase,
  RegisterWriteoff y RegisterConsumption navegan al inventario correspondiente en vez de resetear el form.
- ✅ `inventario_material` tiene `cantidad_inicial` (migración 040000, aplicada 2026-06-26) — corrige el bug
  donde el trigger de movimientos sobreescribía `cantidad_actual` a cero al primer traslado, ignorando el
  stock ingresado en el alta inicial. Mismo modelo que `inventario_obra`.
- ✅ Inicio reestructurado: botones de acción agrupados por módulo (Herramientas / Materiales), cada grupo con
  acción primaria y secundarias. Estadísticas separadas para herramientas y materiales (catálogo, inventario,
  unidades totales, movimientos).
- ✅ Sidenav: grupos Herramientas y Materiales simétricos — ambos tienen Inventario | Registrar en obra |
  Registrar movimiento | Historial. Alineación y espacio icono-texto corregidos eliminando `mat-list-item`
  (que anulaba el layout flex) y usando CSS puro con `gap: 0.625rem`.
- ✅ Desplegado en Netlify, conectado al repo de GitHub (auto-deploy en cada push a `main`) —
  **https://control-de-herramientas-el-tigre.netlify.app**. Verificado end-to-end contra producción: login, datos
  reales de Supabase, navegación profunda con refresh (`/catalogs/tools` recargado en el navegador no da
  404, gracias al redirect SPA del `netlify.toml`), logout.
- ✅ Reflow mobile de tablas corregido de raíz (`src/styles.scss`) — regla global bajo `@media (max-width:
  600px)` para `.inventory__table`, `.movement-history__table`, `.material-inventory__table`,
  `.material-history__table` e `.inventory-detail__table`: fuerza `tbody`/`tr`/`td` a `display: block` y
  oculta `thead`. Necesario porque los `<tr mat-row>` de `mat-table` se renderizan en el contexto del CDK,
  no del componente host, así que las reglas SCSS de componente por sí solas no bastaban.
- ✅ Paneles de "tips" de Registrar compra, Registrar baja y Registrar consumo ampliados con contexto más
  específico (qué filtra cada dropdown, que la cantidad puede ser parcial, qué significa cada motivo de baja).
- ✅ **Loading overlay global** (`shared/loading-overlay/`): overlay semi-transparente a pantalla completa
  con spinner centrado (`position: fixed; inset: 0; z-index: 150`) que se activa durante cualquier petición
  en los 16 componentes de features — tanto cargas iniciales (`[active]="loading()"`) como mutaciones
  (borrar, guardar, actualizar). El `change-password-dialog` queda excluido intencionalmente: `position: fixed`
  dentro del stacking context de un MatDialog quedaría detrás del propio dialog. El barrel `shared/index.ts`
  reexporta `LoadingOverlay` junto a `ErrorBanner`.
- ✅ **ErrorBanner dismissible**: `<app-error-banner>` pasó de solo mostrar el error a permitir cerrarlo con
  un botón ✕. Usa `output()` para emitir `dismissed`; el padre llama `clearError()` → `errorMessageSignal.set(null)`.
  Se actualizó la convención 11b para documentar el patrón y el binding `(dismissed)`.
- ✅ **Fix de timezone en campos "Fecha"**: los 5 componentes de registro (herramienta, movimiento, compra,
  baja, consumo y sus equivalentes de material) usaban `new Date().toISOString().slice(0, 10)` para
  pre-rellenar la fecha — `toISOString()` convierte a UTC antes de formatear, así que en UTC- la fecha por
  defecto era el día anterior. Cambiado a `new Date().toLocaleDateString('en-CA')`, que produce el mismo
  formato `YYYY-MM-DD` pero en hora local del dispositivo.
- ✅ Guards contra cantidades negativas: `inventario_material.cantidad_actual` ahora tiene
  `CHECK (cantidad_actual >= 0)` (herramientas ya lo tenía) y `cantidad_total` lo tiene en ambos catálogos
  (`herramientas`, `materiales`). Además, `recalcular_cantidad_actual`/`_material` validan el resultado
  *antes* de escribirlo y lanzan un mensaje claro en vez de un error crudo de constraint — esto bloquea el
  caso de borrar un movimiento "fuera de orden" (ej. una compra vieja cuyo stock ya se trasladó o consumió
  después) que antes podía dejar el inventario en negativo sin aviso.
- ✅ `registrar_compra`, `registrar_compra_material` y `dar_de_baja_herramienta` ahora verifican
  `auth_role() in ('admin', 'super_admin')` dentro del propio RPC, no solo en el `roleGuard` del frontend —
  antes, un worker que invocara el RPC directamente (ej. consola del navegador) podía dejar `cantidad_total`
  desincronizado de `cantidad_actual` porque el `UPDATE` sobre el catálogo fallaba en silencio por RLS
  mientras el resto de la operación sí se completaba.

Usuarios en Supabase Auth (contraseñas no documentadas aquí por seguridad — quien las necesite las pide directamente):
- **Juan Camilo** (`super_admin`) — username de login: `Juan Camilo`
- **Paula** (`admin`) — username de login: `Paula`

## Changelog

### 2026-07-08 — Loading overlay global, ErrorBanner dismissible y fix de timezone

- **Loading overlay global** (`shared/loading-overlay/`): nuevo componente compartido que cubre toda la
  pantalla con un overlay semi-transparente (`rgba(255,255,255,0.75)`) y un spinner centrado (`mat-spinner
  diameter=48`) durante cualquier petición activa. `position: fixed; inset: 0; z-index: 150` — visible por
  encima de todo el contenido y por debajo de los diálogos de Material (z-index ~1000). Integrado en los 16
  componentes de features tanto para cargas iniciales (`[active]="loading()"`) como para mutaciones (borrar,
  guardar, actualizar): en los `switchMap` de confirmaciones destructivas se agrega
  `this.loadingSignal.set(true)` antes de lanzar la petición para que el overlay aparezca inmediatamente al
  confirmar. El `change-password-dialog` queda excluido intencionalmente. El `:host` del componente usa
  `display: contents` para no generar caja propia en el flujo del DOM.
- **ErrorBanner dismissible**: `<app-error-banner>` amplió su API con `output<void>()` para emitir el evento
  `dismissed`. El binding en todos los templates pasó de `[message]="errorMessage()"` a
  `[message]="errorMessage()" (dismissed)="clearError()"`. Cada componente implementa `clearError()` que
  hace `errorMessageSignal.set(null)`. Convención 11b actualizada para documentar el patrón completo.
- **Fix de timezone en campos "Fecha"**: `new Date().toISOString().slice(0, 10)` reemplazado por
  `new Date().toLocaleDateString('en-CA')` en todos los componentes de registro (register-tool,
  register-movement, register-purchase, register-writeoff, register-consumption y sus equivalentes de
  material). `toISOString()` convierte a UTC antes de formatear, lo que hacía que en zonas UTC- la fecha por
  defecto fuera el día anterior; `en-CA` produce `YYYY-MM-DD` en hora local del dispositivo sin cambio de
  zona horaria.

### 2026-07-07 — Guards contra cantidades negativas y refuerzo de permisos server-side

Auditoría del módulo de materiales (ver `docs/` o pedir el análisis de sesión) detectó dos huecos y ambos
se corrigieron en la misma migración (`20260707000000_negative_quantity_guards_and_admin_rpc_checks.sql`):

- **Cantidades negativas**: `inventario_material.cantidad_actual` no tenía `CHECK (cantidad_actual >= 0)`
  (a diferencia de `inventario_obra`, que sí lo tenía desde el inicio). Borrar un movimiento antiguo cuyo
  stock ya se había usado en un movimiento posterior podía dejar el inventario en negativo sin ningún aviso.
  Se agregó el `CHECK` que faltaba (más `CHECK (cantidad_total >= 0)` en `herramientas` y `materiales`) y un
  guard previo en `recalcular_cantidad_actual`/`_material` que lanza un mensaje amigable antes de llegar a
  escribir un valor negativo. Se probó forzando el escenario (compra → traslado que usa ese stock → intento
  de borrar la compra) y el borrado queda bloqueado con el mensaje esperado.
- **Permisos de admin solo en frontend**: `registrar_compra`, `registrar_compra_material` y
  `dar_de_baja_herramienta` dependían únicamente del `roleGuard` de Angular para restringirse a
  admin/super_admin — nada en la base de datos lo impedía si alguien invocaba el RPC directamente. Se
  agregó `auth_role() in ('admin', 'super_admin')` al inicio de cada función. `registrar_consumo_material`
  no cambió — sigue abierta a todos los roles a propósito.
- **`cantidad_actual` de herramientas no se actualizaba para traslados hechos por workers**
  (`20260707010000_recalcular_cantidad_actual_security_definer.sql`): `recalcular_cantidad_actual`
  (herramientas) nunca tuvo `SECURITY DEFINER` — a diferencia de su equivalente de materiales, corregido en
  julio 5-6. La política `admin update inventario_obra` bloqueaba en silencio el `UPDATE` interno del
  trigger cuando lo disparaba un worker (ej. un traslado normal desde "Registrar movimiento"), dejando
  `cantidad_actual` desactualizada hasta que un admin tocara esa misma combinación herramienta+obra. Se
  agregó `SECURITY DEFINER` (mismo patrón que materiales) y se recalcularon retroactivamente todos los
  registros de `inventario_obra` por si algún dato ya había quedado desincronizado.
- **"Último movimiento" apareciendo vacío en Inventario/Historial de herramientas**
  (`20260707020000_movimientos_texto_autogenerado_security_definer.sql`): la tabla `movimientos` no tiene
  ninguna política de `UPDATE` desde que se introdujo RLS granular (por diseño — los movimientos son de solo
  creación + eliminación, nunca edición). Eso bloqueaba también el `UPDATE` interno que
  `movimientos_after_insert` usa para guardar `texto_autogenerado`, para **cualquier rol, admin incluido**.
  El arreglo no fue agregar una política de `UPDATE` (eso permitiría editar movimientos libremente,
  violando la regla de negocio) sino agregar `SECURITY DEFINER` solo al trigger. Se incluyó un backfill que
  regenera `texto_autogenerado` para los registros que quedaron en `NULL` desde el 30 de junio (con la
  salvedad de que el backfill usa la `cantidad_actual` de hoy, no la del momento histórico exacto — es un
  texto informativo, no afecta ningún cálculo de negocio).
- Los cuatro fixes de esta sección no requirieron cambios de frontend: los mensajes de error nuevos ya se
  muestran solos vía `<app-error-banner>`, que ya leía `result.error.message` en todas las pantallas de
  borrado/registro.

### 2026-07-06 — Reflow mobile de tablas y tips de formularios más específicos

- **Fix de raíz para tablas en mobile** (`src/styles.scss`): las reglas SCSS por componente no bastaban
  porque `mat-table` renderiza `<tr mat-row>` en el contexto del CDK, no del componente host, así que los
  selectores con `_ngcontent` nunca hacían match. Se agregó una regla global bajo
  `@media (max-width: 600px)` que fuerza `tbody`/`tr`/`td` a `display: block` y oculta `thead` para las
  cinco tablas del proyecto (Inventario, Historial e Inventario/Historial de materiales, Detalle).
- **Tips de formularios ampliados**: Registrar compra, Registrar baja y Registrar consumo pasaron de 3-4
  bullets genéricos a explicaciones puntuales (qué filtra cada dropdown, que la cantidad puede ser parcial,
  qué significa cada motivo de baja, cómo revertir un registro).

### 2026-07-05 — Compras, baja de herramientas y consumo de materiales

- **Registro de compras** (`/register-purchase`, `/materials/register-purchase`): ingreso de herramientas y
  materiales adquiridos externamente sin obra origen. Los RPCs `registrar_compra_herramienta` y
  `registrar_compra_material` incrementan `cantidad_total` del catálogo e insertan el movimiento con
  `tipo = 'compra'`. El historial muestra estos registros con un badge "Compra" diferenciado.
- **Baja de herramientas** (`/register-writeoff`, solo admin/super_admin): nueva pantalla para retirar
  herramientas dañadas, perdidas u obsoletas. Columna `tipo` extendida a `traslado | compra | baja` en
  `movimientos`; nueva columna `motivo` (`daño | pérdida | obsolescencia`); `inventario_destino_id` pasa a
  ser nullable. Trigger `movimientos_after_insert` actualizado para el branch `baja` (solo resta en origen).
  El historial de movimientos muestra las bajas con un badge rojo cuyo texto es el motivo.
- **Consumo de materiales** (`/materials/register-consumption`, todos los roles): nueva pantalla para
  registrar material consumido en obra. Columna `tipo` extendida a `traslado | compra | consumo` en
  `movimientos_material`. RPC `registrar_consumo_material` con `SECURITY DEFINER` para que workers puedan
  ejecutarlo sin permiso directo de UPDATE. El historial de materiales muestra consumos con badge ámbar.
- **Redirect post-submit**: todos los formularios de registro navegan al inventario correspondiente
  (`/inventory` para herramientas, `/materials/inventory` para materiales) en vez de resetear el form.
- **Bug corregido — `relation "mo" does not exist`** (migración 20260706000000): las funciones de trigger
  `recalcular_cantidad_actual_material`, `inventario_material_after_insert` y
  `movimientos_material_after_insert` en la DB live tenían una definición desincronizada de las migraciones
  locales (con una referencia a un alias "mo" inexistente). Se recrearon con `CREATE OR REPLACE` y se
  recalcularon todos los registros de inventario afectados.

### 2026-06-30 — RBAC, autenticación por username y gestión de usuarios

- **Sistema de roles (RBAC)**: tabla `perfiles_usuario` con roles `super_admin`, `admin`, `worker`.
  Trigger `sync_role_to_jwt` sincroniza el rol al JWT en cada cambio. Función `auth_role()` como fuente
  de verdad para las políticas RLS.
- **Políticas RLS granulares**: reemplazaron las políticas permisivas en las 8 tablas operativas.
  Workers pueden SELECT e INSERT en todo; solo admin/super_admin pueden UPDATE, DELETE y eliminar movimientos.
- **Autenticación por username**: el login pide "Nombre de usuario" en vez de correo. Internamente,
  `get_auth_email_by_username()` (RPC SECURITY DEFINER) resuelve el email de auth.users a partir del username.
  Los nuevos usuarios creados desde la app reciben un email sintético invisible (`timestamp.random@app.internal`).
- **Edge Function `manage-user`**: crea y elimina usuarios vía `service_role` server-side. El frontend
  nunca toca el `service_role` key — solo envía su JWT y la función valida rol antes de operar.
- **Gestión de usuarios** (`/admin/users`): pantalla accesible solo para admin/super_admin. Permite crear
  usuarios (username + contraseña + rol) y eliminarlos con confirmación. Tabla renombrada a
  `perfiles_usuario` para mantener la convención de nombres en español.
- **Cambio de contraseña**: ícono ⚙ en el toolbar abre un MatMenu con "Cambiar contraseña". El dialog
  verifica la contraseña actual antes de aplicar la nueva (`re-auth + updateUser`).
- **Restricciones de rol en la UI**: workers ven todos los módulos en modo solo lectura (sin acciones de
  editar/borrar). El enlace "Usuarios" en el sidenav solo aparece para admin/super_admin.
- **`roleGuard(allowedRoles)`**: guard factory reutilizable para cualquier ruta que requiera un rol mínimo.

### 2026-06-26 — Correcciones de UX y navegación

- **Sidenav: alineación de ítems corregida.** `mat-list-item` sobreescribía el layout flex y colapsaba el
  espacio entre ícono y texto. Se eliminó y se pasó a CSS puro (`display: flex`, `gap: 0.625rem`), con
  tamaño de ícono uniforme en toda la nav.
- **Link "Registrar en obra" recuperado en grupo Herramientas.** Había desaparecido al refactorizar el
  sidenav a acordeón. Ambos grupos (Herramientas y Materiales) son ahora simétricos:
  Inventario | Registrar en obra | Registrar movimiento | Historial.

### 2026-06-26 — Módulo de materiales y alta inicial

- **Alta inicial de materiales** (`/materials/register-initial`): primera vez que un material llega a una
  obra o bodega — equivalente exacto de "Registrar herramienta en obra" para el módulo de materiales.
- **Bug crítico corregido** (migración 040000): `inventario_material` no tenía `cantidad_inicial`. El trigger
  de movimientos sobreescribía `cantidad_actual` a cero en el primer traslado. Se agregó la columna y se
  actualizaron los triggers para que el cálculo sea `cantidad_inicial + entradas − salidas`, igual que en
  `inventario_obra`.
- **Dashboard de inicio reestructurado**: botones de acción agrupados por módulo (Herramientas / Materiales);
  estadísticas independientes para cada uno (catálogo, inventario, unidades totales, movimientos).

### 2026-06-26 — Módulo de materiales completo + sidenav por grupos

- **Módulo de materiales**: tablas `materiales` / `inventario_material` / `movimientos_material`, RPC
  `transferir_material`, 3 vistas (`resumen_materiales`, `resumen_por_obra_material`,
  `historial_movimientos_material`). Pantallas: inventario, registrar movimiento e historial, con la misma
  estructura y convenciones que las de herramientas.
- **Sidenav refactorizado** de lista plana a acordeón colapsable con 3 grupos (Herramientas, Materiales,
  Catálogos). El grupo que contiene la ruta activa se expande automáticamente.
- **Catálogo de herramientas ampliado**: campo `cantidad_total` editable + columnas Total / En obras /
  Disponible calculadas desde la vista `resumen_herramientas`.
- **Catálogo de materiales**: ídem herramientas + campo `observaciones` libre opcional.
- **Catálogo de obras ampliado**: toggle "Es bodega" por fila — diferencia entre obra activa y bodega sin
  entidad separada (decisión del cliente; `es_bodega = true` hace que el stock cuente como disponible).

### 2026-06-26 — Paleta de color y correcciones

- **Paleta "Concreto y Tierra" (Opción C)** implementada globalmente: carbón cálido `#4b4a45`, blanco cálido
  `#f5f1ec`, arena `#e4ddd2`, terracota `#b0492e`, gris `#8b8a84`, verde musgo `#5c7a4d`. Tokens de Material 3
  sobreescritos en `body` para que toda la app herede la paleta sin pelear con `!important`.
- **Bug de borrar movimientos corregido**: al eliminar un movimiento, los triggers recalculaban
  `cantidad_actual` incorrectamente en algunos casos. Corregido con trigger `AFTER DELETE` que recalcula
  ambos inventarios (origen y destino) a partir del historial restante.
- **Cantidad total de herramientas**: columna `cantidad_total` en `herramientas` y vista `resumen_herramientas`
  con los contadores Total / En obras / Disponible.

### 2026-06-25 — Rediseño de páginas

- **Rediseño visual** de todas las pantallas de listado y formulario: paneles de estadísticas en listados,
  paneles de tips en formularios, mejor aprovechamiento del espacio en desktop, layout flex con `flex-wrap`
  para adaptar en mobile sin breakpoints duros adicionales.

### 2026-06-22 — Funcionalidad completa y despliegue a producción

- **Despliegue en Netlify**: auto-deploy conectado al repo de GitHub. `netlify.toml` con redirect SPA para
  que las rutas profundas no den 404 al recargar. Verificado end-to-end contra producción.
- **Filtros** en "Inventario por Obra" (por obra y herramienta) y en "Historial de movimientos" (por
  herramienta, obra y rango de fecha) — client-side via `computed()`, sin peticiones adicionales a Supabase.
- **Detalle de inventario** (`/inventory/:id`): cabecera con herramienta, obra, cantidad y encargado, más
  línea de tiempo de todos los movimientos donde esa obra es origen o destino.
- **Editar / borrar en "Inventario por Obra"**: reasignar encargado inline; borrar un registro si no tiene
  movimientos (bloqueado con mensaje claro vía FK restrict si tiene historial).
- **Historial de movimientos** (`/movements`): vista de solo lectura + borrar con recalculo automático.
- **CRUD de catálogos** (Herramientas, Obras, Encargados): una sola pantalla `features/catalog/` reusada
  via route data. Maneja duplicado de nombre y borrado bloqueado por FK con mensajes específicos.
- **Confirmaciones destructivas** con SweetAlert2 (`ConfirmationService`) en vez de `window.confirm()`.
- **Toasts de éxito** vía `NotificationService` (MatSnackBar, 5 s), errores inline con `<app-error-banner>`.
- **Responsive mobile** verificado en iPhone 12 (390 px): tablas con scroll horizontal propio, columnas
  refluidas a tarjetas apiladas bajo 600 px, botón de logout reducido a ícono para dar espacio al título.
- **Colores de marca globales** y header dinámico (logo + título por ruta + saludo con nombre del usuario).
- **Barrels** (`index.ts`) en `core/`, `shell/` y cada feature; `features/index.ts` agregador.
- **Enums centralizados** para tablas/vistas/RPC/rutas (`supabase-schema.ts`, `app-route.ts`) — sin strings
  quemados en ningún componente.
- **Favicon** como PNG directo (logo de la empresa), sin conversión a `.ico`.

### 2026-06-22 — MVP inicial

- Proyecto Angular 22 creado con Angular Material y cliente Supabase.
- Esquema de base de datos: `herramientas`, `obras`, `encargados`, `inventario_obra`, `movimientos`;
  función `transferir_herramienta`; vistas `resumen_por_obra` e `historial_movimientos`; RLS activado.
- Auth con Supabase (username + password), guard de rutas, redirect a `/login` sin sesión.
- Pantalla "Inventario por Obra" con datos reales desde Supabase.
- Shell con sidenav hamburguesa, toolbar con logo y logout.
- "Registrar herramienta en obra" (alta inicial en `inventario_obra`).
- "Registrar movimiento" — traslado atómico vía RPC `transferir_herramienta`.
- Dashboard "Inicio" con conteos reales para que no se vea vacía al cargar.

---

## Cómo levantar el proyecto en local

**Requisito:** Node.js ≥ 22.22.3 (o ≥24.15.0 / ≥26.x). Si `node --version` muestra algo menor, instala una
versión nueva desde [nodejs.org/en/download](https://nodejs.org/en/download) (instalador `.msi`, opciones
por defecto) — `npm run start` falla con un mensaje claro si la versión es insuficiente.

```bash
npm install
npm run start   # ng serve, puerto 4200 por defecto -> http://localhost:4200/
```

### Nota de entorno: antivirus Avast intercepta HTTPS en esta máquina

Avast hace TLS MITM scanning (re-firma certificados con su propia CA). Esto rompe herramientas de línea de
comandos que no confían en el certificado inyectado:

- **Supabase CLI** (`supabase link`, `db push`, `projects list`): siguen bloqueados incluso con excepciones
  de Avast agregadas para `api.supabase.com` y `*.supabase.co` — el binario Go no resuelve el problema vía
  excepción de Avast. **Workaround:** usar el SQL Editor del Dashboard en vez del CLI para migraciones.
- **Herramientas basadas en Node** (`npm install` de paquetes que descargan binarios, `npx playwright
  install`, etc.): fallan con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` aunque Avast tenga excepciones, porque Node
  no usa el almacén de certificados de Windows por defecto. **Workaround:** exportar
  `NODE_OPTIONS=--use-system-ca` antes de correr el comando (Node ≥22 lo soporta).
- **`nvm-windows`**: no es fiable en este entorno (no imprime salida ni en `nvm version`, y `nvm install`
  falla en silencio sin crear la carpeta de la versión). **Workaround usado:** descargar el zip oficial
  `node-vX.Y.Z-win-x64.zip` de nodejs.org, extraerlo a una carpeta cualquiera, y anteponerla al `PATH` de la
  sesión — no requiere admin ni toca la instalación de Node del sistema.

## Verificación end-to-end

El flujo login → guard → inventario → logout fue verificado con Playwright contra el dev server real
(no solo compilación/build). Para repetir manualmente: levantar `npm run start`, entrar a
`http://localhost:4200/` (debe redirigir a `/login`), iniciar sesión con username + contraseña, y confirmar
que se ve la tabla de "Inventario por Obra" y que "Cerrar sesión" regresa a `/login`.

## Producción

- **URL:** https://control-de-herramientas-el-tigre.netlify.app
- **Despliegue:** Netlify conectado directamente al repo de GitHub — cualquier push a `main` dispara un
  build y deploy automático (`netlify.toml` define el build command, la carpeta de publicación y el
  redirect SPA). No hay variables de entorno que configurar: la URL y la clave anónima de Supabase están
  en `src/environments/environment.ts`, son públicas por diseño (la seguridad real la da RLS).

### Cómo agregar un usuario nuevo

No hay pantalla de registro pública (intencional — es una herramienta interna). El proceso es:

1. Iniciar sesión con una cuenta `admin` o `super_admin`.
2. Ir a **Usuarios** en el sidenav (solo visible para admin/super_admin).
3. Completar el formulario: **Nombre de usuario** (cualquier cadena de texto, es el identificador de login)
   + **Contraseña inicial** (mínimo 6 caracteres) + **Rol** (solo el super_admin puede elegir entre
   Trabajador y Admin; los admins siempre crean Trabajadores).
4. El usuario ya puede entrar en `/login` escribiendo exactamente el mismo nombre de usuario y la contraseña asignada.
5. Cualquier usuario puede cambiar su propia contraseña desde el ícono ⚙ en el toolbar → "Cambiar contraseña".

### Límites de los planes gratuitos (verificado, no es un trial con fecha de vencimiento)

- **Supabase:** gratis indefinidamente. Límites: 500 MB de base de datos, 5 GB de egress/mes — muy por
  encima de lo que este proyecto puede llegar a usar. **El riesgo real es otro:** los proyectos free se
  **pausan automáticamente tras 7 días sin actividad**. Si el equipo no usa la app por una semana, alguien
  tiene que entrar al Dashboard de Supabase y darle "Restore" al proyecto antes de que la app vuelva a
  funcionar (no se pierde nada, solo hay que reactivarlo).
- **Netlify:** gratis indefinidamente ("$0 forever"), con 300 créditos/mes que cubren 100 GB de
  transferencia y 300 minutos de build — para un sitio estático tan chico como este, prácticamente
  imposible de agotar con uso normal. A diferencia de Supabase, Netlify **no pausa el sitio por
  inactividad de visitas**.
