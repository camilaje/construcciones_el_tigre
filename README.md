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
- Despliegue planeado: **Netlify** (gratuito)

## Convenciones de código (obligatorias para todo código nuevo)

1. **RxJS, no `async/await` ni `.then()` suelto.** Las llamadas que devuelven `Promise` (ej. métodos de
   `supabase-js`) se envuelven con `from()` y se manejan con operadores RxJS / `.subscribe()`.
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
   `.bloque__elemento { ... }` sueltos al nivel superior del archivo.
6. **Todo el código en inglés** (archivos, clases, interfaces, variables, métodos, nombres de rutas) — pero
   **no** el esquema de Supabase (tablas/columnas/RPC/vista siguen en español, ya desplegadas con datos
   reales) ni el texto visible para el usuario final (labels, botones, mensajes: siguen en español porque la
   usuaria de la app es personal de obra, no developers). El puente entre ambos mundos se resuelve con
   *column aliasing* de PostgREST en cada `.select()` (`'site:obra, tool:herramienta'`), así la respuesta de
   Supabase ya llega con propiedades en inglés sin tocar la base de datos. Ver `register-tool.ts` o
   `inventory.ts` como referencia.
7. **Mensajes de éxito en formularios van como toast**, vía `NotificationService.success(mensaje)`
   (`core/notification.service.ts`, envuelve `MatSnackBar`, se autodescarta a los 5s) — no como texto inline
   en la pantalla. Los mensajes de error sí se quedan inline (el usuario suele necesitar verlos mientras
   corrige el formulario). Y al resetear un formulario después de un submit exitoso, usar
   `formDirective.resetForm(valores)` (con `#formDirective="ngForm"` en el `<form>` y pasándolo a tu método
   de submit) en vez de `this.form.reset(valores)` — `form.reset()` no limpia el flag `submitted` de
   Angular, así que los campos requeridos vacíos se ven en rojo aunque el usuario no los haya tocado.
8. **Nada de strings/códigos quemados que se repiten entre archivos.** Nombres de tabla/vista/RPC de
   Supabase y códigos de error de Postgres viven en `core/supabase-schema.ts`
   (`SUPABASE_TABLE_ENUMERATION`, `SUPABASE_VIEW_ENUMERATION`, `SUPABASE_RPC_ENUMERATION`,
   `POSTGRES_ERROR_CODE_ENUMERATION`); las rutas de la app viven en `core/app-route.ts`
   (`APP_ROUTE_ENUMERATION`). Todo `.from(...)`, `.rpc(...)`, `path`/`data` de rutas, `routerLink`,
   `navigateByUrl` y comparación de `error.code` pasa por uno de estos enums, nunca por un literal.
9. **Convención de nombres para tipos vs. enums/constantes** (distinta de la del punto 3, que es sobre
   modificadores de acceso):
   - Interfaces/type alias: PascalCase con sufijo `Type` (`CatalogItemType`, `NavLinkType`).
   - Enums y constantes exportadas sueltas: `UPPER_SNAKE_CASE` con sufijo `_ENUMERATION` (enums) o
     `_CONSTANTS` (constantes sueltas/agrupadas) — ej. `SUPABASE_TABLE_ENUMERATION`,
     `SUCCESS_TOAST_DURATION_MS_CONSTANTS`. Los **miembros** del enum también van en `UPPER_SNAKE_CASE`
     (`SUPABASE_TABLE_ENUMERATION.TOOLS`, no `.Tools`).

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

- Logo en `public/logo.png` (emblema completo en negro sobre blanco, ya incluye el texto
  "Construcciones El Tigre" — no lo dupliques en texto en pantallas donde se muestre el logo).
- Colores: **negro `#000000` y blanco `#ffffff`** como principales; **terracota `#B0492E`** como acento
  secundario únicamente (errores, hover), nunca como color dominante.
- El login (`src/app/features/login/`) sobreescribe los tokens de sistema de Material 3 (`--mat-sys-primary`,
  `--mat-sys-on-primary`, `--mat-sys-error`, `--mat-sys-surface`, `--mat-sys-on-surface`) dentro del selector
  `.login`, en vez de pelear con `!important` contra el tema global.

## Arquitectura

```
src/app/
  core/
    supabase.service.ts   # cliente único de Supabase (createClient), inyectable
    auth.service.ts        # estado de sesión (signals) + signIn/signOut (Observables)
    auth.guard.ts           # CanActivateFn: redirige a /login si no hay sesión
    notification.service.ts # toast de éxito (MatSnackBar, autodesaparece a los 5s)
    supabase-schema.ts      # enums: tablas/vista/RPC de Supabase, códigos de error de Postgres
    app-route.ts            # enum APP_ROUTE_ENUMERATION con todas las rutas de la app
  shell/
    shell.ts                # layout con sidenav tipo hamburguesa (mode="over", oculto por
                             # defecto, botón ☰ en el toolbar) + logout
  features/
    login/                  # pantalla de login (Material + marca), pública
    home/                   # "Inicio": dashboard con conteos (herramientas/obras/encargados/etc.)
    inventory/               # "Inventario por Obra", lee la vista resumen_por_obra
    register-tool/           # "Registrar herramienta nueva en obra" (alta inicial)
    register-movement/       # "Registrar movimiento" (traslado obra-a-obra), usa el RPC transferir_herramienta
    movement-history/        # "Historial de movimientos", lee la vista historial_movimientos
    catalog/                 # CRUD genérico (create/edit/delete por nombre), reusado en 3 rutas vía
                             # route data: catalogs/tools, catalogs/sites, catalogs/supervisors
  app.routes.ts             # '/login' público; '/' (Shell) protegida con authGuard, con
                             # hijos '', 'inventory', 'register-tool', 'register-movement', 'movements',
                             # 'catalogs/tools', 'catalogs/sites', 'catalogs/supervisors'
```

### Base de datos (Supabase)

Migraciones en `supabase/migrations/`, seed en `supabase/seed.sql`. Para aplicar cambios nuevos, usar el
SQL Editor del Dashboard (`supabase.com/dashboard/project/ngiegwgrljveitpwsinf/sql/new`) — el CLI vinculado
(`supabase link`/`db push`) está bloqueado en esta máquina por el antivirus, ver sección de entorno abajo.

**Tablas:**

| Tabla | Qué guarda |
|---|---|
| `herramientas`, `obras`, `encargados` | Catálogos simples (CRUD) |
| `inventario_obra` | Una fila por combinación Herramienta×Obra. `cantidad_inicial` se ingresa una sola vez; `cantidad_actual` se recalcula solo (trigger) |
| `movimientos` | Historial de traslados obra-a-obra (siempre tiene origen y destino — la primera llegada de una herramienta es un insert directo a `inventario_obra`, nunca pasa por aquí) |

**Función clave:** `transferir_herramienta(herramienta_id, obra_origen_id, obra_destino_id, cantidad, ...)` —
valida stock en origen, crea el registro en destino si no existe, inserta el movimiento; un trigger recalcula
`cantidad_actual` en ambos lados y genera el texto legible del movimiento.

**Vistas** (ambas con `security_invoker = true` — si no, quedarían con el owner `postgres`, que es
superusuario, y se saltarían el RLS de las tablas base sin que se note):
- `resumen_por_obra` — reemplaza la hoja "Resumen_por_Obra" rota del Excel; agregación real, no fórmulas.
- `historial_movimientos` — resuelve nombres legibles (herramienta, obra origen/destino, quien
  entrega/recibe) a partir de `movimientos` + `inventario_obra`, para la pantalla de historial.

**RLS:** todas las tablas son `for all to authenticated using (true)` — sin acceso anónimo por diseño. Esto
es intencional: sin sesión, ninguna pantalla puede leer ni escribir, lo cual ya se usó como prueba de que el
login funciona (ver Playwright más abajo).

### Reglas de negocio que la app preserva

1. Una herramienta puede existir repartida en varias obras a la vez, cada combinación con su propia cantidad.
2. Un traslado es una sola operación atómica (resta en origen + suma-o-creación en destino).
3. El historial completo de movimientos debe ser reconstruible por herramienta/obra/tiempo.
4. La vista consolidada es una consulta agregada real, no una fórmula frágil.
5. `cantidad_inicial` se ingresa una sola vez, al llegar la herramienta por primera vez a una obra.

### Qué entidades son CRUD completo y cuáles no (decisión deliberada)

- **Herramientas, Obras, Encargados** (catálogos): CRUD completo — create/read/update/delete vía
  `features/catalog/`. No hay razón de negocio para restringirlo.
- **Inventario (`inventario_obra`)**: solo lectura + alta inicial. `cantidad_actual` nunca se edita a mano
  (es justo el bug que el rediseño corrige) — la única forma de cambiarla es a través de un movimiento.
- **Movimientos**: solo lectura + creación. Sin editar ni borrar — es el historial/auditoría; una
  corrección se hace registrando un movimiento nuevo, no reescribiendo el pasado.

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
- ⬜ Detalle de un registro de inventario, editar/borrar en Inventario (encargado/registro sin
  movimientos) — pendientes.
- ⬜ Despliegue en Netlify — pendiente.

Hay un usuario de prueba en Supabase Auth: `garciamorenojuancamilo526@gmail.com` (contraseña no documentada
aquí por seguridad — está en el historial de chat de configuración inicial).

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
