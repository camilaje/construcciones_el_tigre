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
- **Supabase** (Postgres + Auth + PostgREST) — proyecto real: `ngiegwgrljveitpwsinf`
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
   `POSTGRES_ERROR_CODE_ENUMERATION`); las rutas de la app viven en `core/app-route.ts`
   (`APP_ROUTE_ENUMERATION`). Todo `.from(...)`, `.rpc(...)`, `path`/`data` de rutas, `routerLink`,
   `navigateByUrl` y comparación de `error.code` pasa por uno de estos enums, nunca por un literal.
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
11b. **Errores de formulario/reglas de negocio se muestran con `<app-error-banner [message]="..." />`**
    (`shared/error-banner/`, sibling de `core/` y `features/` para componentes presentacionales reusables
    entre features) en vez de un `<p>` suelto — ícono + fondo con tinte de error + borde, para que un error
    real se note de un vistazo y no se confunda con texto normal. El componente usa `input()` (API basada en
    signals) en vez de la inyección por constructor del resto del proyecto — excepción documentada: Angular
    exige que sea un inicializador de campo para reconocerlo como input, no se puede asignar en el
    constructor. El host del componente usa `display: contents` (`error-banner.scss`) porque el elemento
    siempre existe en el DOM aunque no haya mensaje — sin eso, ocuparía un espacio vacío en el `gap` de
    formularios flex incluso sin error que mostrar.

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
  (`user.user_metadata['full_name']`, con fallback al correo si no se ha configurado) + botón de cerrar
  sesión. Logo y nombre se ocultan en viewports angostos (`max-width: 600px`) para no chocar con el título
  truncado.
- **Usuarios nuevos no tienen `full_name` por defecto** — Supabase Auth no tiene ese campo al crear el
  usuario desde el Dashboard, así que el header les muestra el correo hasta que alguien con la contraseña
  de esa cuenta corra `supabase.auth.updateUser({ data: { full_name: '...' } })` (un script de una sola
  vez, no hay pantalla de "editar perfil" — decisión deliberada: el equipo es chico, no vale la pena la
  pantalla todavía).

## Arquitectura

```
src/app/
  core/
    services/
      supabase.service.ts    # cliente único de Supabase (createClient), inyectable
      auth.service.ts        # estado de sesión (signals) + signIn/signOut (Observables)
      notification.service.ts # toast de éxito (MatSnackBar, autodesaparece a los 5s)
      confirmation.service.ts # popup de confirmar/cancelar (SweetAlert2) para acciones destructivas
    guards/
      auth.guard.ts          # CanActivateFn: redirige a /login si no hay sesión
    supabase-schema.ts       # enums: tablas/vista/RPC de Supabase, códigos de error de Postgres
    app-route.ts             # enum APP_ROUTE_ENUMERATION con todas las rutas de la app
  shared/
    error-banner/            # <app-error-banner [message]="...">, ícono + fondo con tinte de error,
                              # para mensajes de validación/reglas de negocio en cualquier feature
  shell/
    shell.ts                # layout con sidenav tipo hamburguesa (mode="over", oculto por
                             # defecto, botón ☰ en el toolbar) + header dinámico (logo, título por
                             # ruta, nombre de usuario) + logout. La navegación está organizada en
                             # grupos colapsables con mat-accordion (Inicio | Herramientas |
                             # Materiales | Catálogos) — el grupo activo se expande automáticamente.
  features/
    login/                  # pantalla de login (Material + marca), pública
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
    catalog/                 # CRUD genérico configurable via route data: soporta campos opcionales
                             # hasQuantity (cantidad_total + summary view), hasBodega (toggle es_bodega),
                             # hasObservations (campo libre). Reusado en 4 rutas:
                             # catalogs/tools, catalogs/materials, catalogs/sites, catalogs/supervisors
  app.routes.ts             # '/login' público; '/' (Shell) protegida con authGuard, con hijos:
                             # '' (Home), 'inventory', 'inventory/:id', 'register-tool',
                             # 'register-movement', 'movements', 'materials/inventory',
                             # 'materials/register-initial', 'materials/register',
                             # 'materials/history', 'catalogs/tools', 'catalogs/materials',
                             # 'catalogs/sites', 'catalogs/supervisors'
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
| `movimientos` | Historial de traslados de herramientas obra-a-obra |
| `materiales` | Catálogo: nombre + `cantidad_total` + `observaciones` (campo libre de texto) |
| `inventario_material` | Una fila por combinación Material×Obra. `cantidad_inicial` se ingresa una sola vez; `cantidad_actual` se recalcula solo (trigger insert + trigger delete + trigger after-insert) |
| `movimientos_material` | Historial de traslados de materiales obra-a-obra |

**Funciones RPC:**
- `transferir_herramienta(herramienta_id, obra_origen_id, obra_destino_id, cantidad, ...)` — valida stock en
  origen, crea el registro en destino si no existe, inserta el movimiento; trigger recalcula `cantidad_actual`.
- `transferir_material(material_id, obra_origen_id, obra_destino_id, cantidad, ...)` — ídem para materiales.

**Vistas** (todas con `security_invoker = true` — sin esto quedarían con owner `postgres`, saltándose el RLS):
- `resumen_por_obra` — agregación Herramienta×Obra con `cantidad_actual`, encargado y último movimiento.
- `historial_movimientos` — resuelve nombres legibles para la pantalla de historial de herramientas.
- `resumen_herramientas` — por herramienta: `cantidad_total`, `en_obras` (excluye `es_bodega=true`), `disponible`.
- `resumen_materiales` — igual que la anterior pero para materiales.
- `resumen_por_obra_material` — agregación Material×Obra con `cantidad_actual`, encargado y último movimiento.
- `historial_movimientos_material` — resuelve nombres legibles para la pantalla de historial de materiales.

**RLS:** todas las tablas son `for all to authenticated using (true)` — sin acceso anónimo por diseño. Esto
es intencional: sin sesión, ninguna pantalla puede leer ni escribir, lo cual ya se usó como prueba de que el
login funciona (ver Playwright más abajo).

### Reglas de negocio que la app preserva

1. Una herramienta (o material) puede existir repartida en varias obras a la vez, cada combinación con su propia cantidad.
2. Un traslado es una sola operación atómica (resta en origen + suma-o-creación en destino).
3. El historial completo de movimientos debe ser reconstruible por herramienta/material/obra/tiempo.
4. La vista consolidada es una consulta agregada real, no una fórmula frágil.
5. `cantidad_inicial` se ingresa una sola vez, al llegar la herramienta/material por primera vez a una obra.
6. Una obra marcada como `es_bodega = true` es tratada como bodega: su stock cuenta como "disponible" en el resumen de herramientas, no como "en obras".
7. `cantidad_total` en `herramientas` y `materiales` representa el total físico que tiene la empresa; `disponible = cantidad_total − en_obras`.

### Qué entidades son CRUD completo y cuáles no (decisión deliberada)

- **Herramientas, Obras, Encargados, Materiales** (catálogos): CRUD completo — create/read/update/delete vía
  `features/catalog/`. No hay razón de negocio para restringirlo.
- **Inventario (`inventario_obra`, `inventario_material`)**: solo lectura + alta inicial. `cantidad_actual` nunca se edita a mano
  (es justo el bug que el rediseño corrige) — la única forma de cambiarla es a través de un movimiento.
- **Movimientos (`movimientos`, `movimientos_material`)**: creación + eliminación (sin edición). La eliminación
  recalcula automáticamente `cantidad_actual` en los inventarios afectados (trigger AFTER DELETE). Se permite
  borrar para corregir registros erróneos; la cantidad resultante queda siempre consistente con el historial
  restante.

## Estado actual (qué está construido)

- ✅ Esquema completo de base de datos, aplicado al proyecto Supabase real, con seed del catálogo legacy
  (22 herramientas, 2 obras, 7 encargados).
- ✅ Login (Supabase Auth, email+password) con marca aplicada.
- ✅ Guard de rutas — sin sesión, todo redirige a `/login`.
- ✅ Shell con sidenav (menú de módulos) y logout centralizado.
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
- ✅ Sidenav refactorizado a grupos colapsables con `mat-accordion` (Inicio | Herramientas | Materiales |
  Catálogos) — elimina la lista plana de 8 ítems y agrupa los módulos por dominio. El grupo que contiene
  la ruta activa se expande automáticamente al navegar.
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
  al modificar/borrar movimientos, garantizando consistencia en todos los casos.
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

Usuarios reales en Supabase Auth (contraseñas no documentadas aquí por seguridad — quien las necesite las
pide directamente):
- `garciamorenojuancamilo526@gmail.com` — Juan Camilo (cuenta original de configuración/pruebas).
- `paula.benjumeagrisa@gmail.com` — Paula.

## Changelog

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
- Auth con Supabase (email + password), guard de rutas, redirect a `/login` sin sesión.
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
(no solo compilación/build). Para repetir manualmente: crear un usuario en Supabase Auth (Dashboard →
Authentication → Users → Add user, marcando "Auto Confirm User"), levantar `npm run start`, entrar a
`http://localhost:4200/` (debe redirigir a `/login`), iniciar sesión, y confirmar que se ve la tabla de
"Inventario por Obra" (vacía si no hay `inventario_obra` cargado) y que "Cerrar sesión" regresa a `/login`.

## Producción

- **URL:** https://control-de-herramientas-el-tigre.netlify.app
- **Despliegue:** Netlify conectado directamente al repo de GitHub — cualquier push a `main` dispara un
  build y deploy automático (`netlify.toml` define el build command, la carpeta de publicación y el
  redirect SPA). No hay variables de entorno que configurar: la URL y la clave anónima de Supabase están
  en `src/environments/environment.ts`, son públicas por diseño (la seguridad real la da RLS).

### Cómo agregar un usuario nuevo

No hay pantalla de registro en la app (intencional — es una herramienta interna). El proceso es:

1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**.
2. Correo + contraseña, marcando **"Auto Confirm User"** (no hay SMTP configurado, así que sin esto el
   usuario nunca podría confirmar su cuenta por correo y quedaría sin poder entrar).
3. Esa persona ya puede iniciar sesión en `/login`. El header le mostrará su correo como saludo hasta que
   se le configure un nombre.
4. (Opcional) Para que el header salude por nombre ("Hola, {nombre}") en vez de mostrar el correo, hay que
   correr una vez, con la contraseña de esa cuenta:
   ```js
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   await supabase.auth.signInWithPassword({ email: '...', password: '...' });
   await supabase.auth.updateUser({ data: { full_name: 'Nombre' } });
   ```
   Esto es así (en vez de una pantalla de "editar perfil") porque el equipo es chico y no se justifica la
   pantalla todavía — decisión deliberada, no una limitación técnica.

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
