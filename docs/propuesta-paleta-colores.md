# Propuesta de paleta de colores (sin implementar)

> **Estado: Opción C implementada (2026-06-26).** La paleta "Concreto y Tierra" fue aplicada en
> `src/styles.scss` y todos los SCSS de componentes. Este documento queda como registro de la decisión.

## Diagnóstico

Hoy la app usa **negro `#000000`, blanco `#ffffff`, y terracota `#B0492E`** — y la terracota hace
*todos* los trabajos a la vez: es el color de error, el color de hover/active, y el único acento de marca.
Eso no es necesariamente "feo", pero sí es **poco expresivo y poco semántico**: nada distingue visualmente
"esto fue exitoso" de "esto es un error" de "esto solo está activo", porque todo usa el mismo tono. Además,
el logo de Construcciones El Tigre es en sí mismo blanco y negro (línea de tigre, sin color), así que la
terracota fue una decisión de marca añadida, no algo heredado del logo — lo cual deja la puerta abierta a
elegir mejor esa paleta de acento sin "traicionar" el logo.

Las tres opciones de abajo son **direcciones distintas**, no variaciones del mismo tema — cada una resuelve
el diagnóstico de forma diferente. Al final hay una cuarta sección con un set de colores semánticos
(éxito/advertencia/información) que aplica **sin importar cuál dirección se elija**, porque es el problema
funcional más urgente independientemente del gusto estético.

---

## Opción A — "Tigre Cálido" (evolución de la marca actual) — Recomendada

La que menos se aleja de lo que ya existe: en vez de reemplazar la terracota, la libera de tener que hacer
todos los trabajos y le da compañía con un dorado/ámbar que evoca el pelaje del tigre (el logo es blanco y
negro, así que esta calidez la aporta la marca, no el logo).

| Rol | Color | Hex | Uso |
|---|---|---|---|
| Primario (superficies grandes, texto) | Carbón | `#1A1A1A` | Reemplaza el negro puro — menos duro en áreas grandes (sidenav, texto), msmo contraste |
| Acento principal (acciones, links activos) | Ámbar tigre | `#D98E2B` | Botones primarios, estado activo del menú — **usar con texto oscuro encima, no blanco** (ver nota de contraste) |
| Acento secundario / hover sutil | Ámbar claro | `#F2C879` | Hovers, fondos de estado seleccionado (no para texto) |
| Error / destructivo | Terracota (igual que hoy) | `#B0492E` | Se queda *exclusivamente* para error y confirmaciones de borrado — deja de usarse para hover genérico |
| Éxito | Verde bosque | `#2F7D4F` | Toasts de éxito, confirmaciones positivas |
| Superficies | Blanco / gris muy claro | `#FFFFFF` / `#F5F5F5` | Igual que hoy |

**Por qué:** Es el cambio de menor riesgo — nadie va a sentir que "la app cambió de marca", pero ahora hay
una jerarquía de color real (ámbar = acción, terracota = peligro, verde = éxito) en vez de un solo tono
para todo. El ámbar conecta visualmente con la idea de "tigre" sin necesitar ilustración nueva.

**Contraste:** el ámbar `#D98E2B` falla el contraste mínimo (WCAG AA) con texto blanco encima — se debe usar
con texto `#1A1A1A` (carbón) o como fondo de ícono/botón con relleno, no como color de texto sobre blanco.
La terracota `#B0492E` y el verde `#2F7D4F` sí pasan AA con texto blanco (ya probado en producción para la
terracota).

---

## Opción B — "Sitio de Obra" (industrial, literal)

La dirección más "construcción" de las tres: gris acero + naranja de seguridad, el lenguaje visual de
casco/chaleco/maquinaria. Es la que comunica más rápido "esto es una empresa de construcción" a cualquiera
que la vea, aunque sea una herramienta interna.

| Rol | Color | Hex | Uso |
|---|---|---|---|
| Primario | Acero/pizarra | `#2B3A42` | Header, sidenav, texto principal |
| Acento principal | Naranja de seguridad | `#F4A226` | Botones primarios, alertas — **texto oscuro encima, no blanco** |
| Secundario | Acero claro | `#5A7080` | Bordes, elementos secundarios |
| Error | Rojo ladrillo | `#C0392B` | Errores y confirmaciones de borrado |
| Éxito | Verde oliva | `#3C8C5C` | Toasts de éxito |
| Superficies | Blanco / gris frío | `#FFFFFF` / `#F0F2F3` | — |

**Por qué:** Si la prioridad es que la app "se sienta" de construcción incluso en una captura de pantalla
o en el ícono, esta es la opción más directa. El riesgo es que es un lenguaje visual más "genérico de
industria" (parecido a muchas apps de obra) y se aleja más del negro/blanco editorial que ya tiene la marca.

**Contraste:** el naranja `#F4A226` tiene el mismo problema que el ámbar de la Opción A — solo con texto
oscuro encima. El acero `#2B3A42` con texto blanco tiene excelente contraste.

---

## Opción C — "Concreto y Tierra" (cálida, premium/arquitectónica)

La menos "default de Material", más cálida que blanco/negro puro: tonos de concreto y arena de fondo,
terracota igual que hoy pero ahora con un respaldo cálido en vez de blanco clínico, y un acento oliva/ocre.

| Rol | Color | Hex | Uso |
|---|---|---|---|
| Primario | Carbón cálido | `#4B4A45` | Texto principal, sidenav |
| Fondo principal | Blanco cálido | `#F5F1EC` | Reemplaza el blanco puro como fondo de página |
| Superficie secundaria | Arena | `#E4DDD2` | Tarjetas, fondos de stats |
| Acento (igual que hoy) | Terracota | `#B0492E` | Botones primarios — ya pasa AA con blanco |
| Acento secundario | Ocre | `#C97B3E` | Hover, estados secundarios |
| Éxito | Verde musgo | `#5C7A4D` | Toasts de éxito |

**Por qué:** Mantiene la terracota exactamente como está (cero riesgo en ese frente) y resuelve el
"se ve pobre" con calidez de fondo en vez de agregar un color nuevo — todo el blanco/gris clínico actual
pasa a tonos tierra. Se siente más editorial/premium, menos "panel de administración genérico".

**Contraste:** esta opción no introduce ningún color nuevo de bajo contraste — el fondo cálido `#F5F1EC` es
lo bastante claro para que el texto carbón siga pasando AA cómodamente, y la terracota ya está probada con
blanco encima.

---

## Set semántico mínimo (aplica sin importar la opción elegida) — ✅ implementado (2026-06-25)

Independiente de cuál dirección estética se escoja, hay un problema funcional que vale la pena resolver de
una vez: hoy no existe un color de "éxito" ni de "advertencia" distinto del de error. Esto es el cambio de
menor esfuerzo y mayor impacto funcional:

| Rol | Hex sugerido | Nota |
|---|---|---|
| Éxito | `#2E7D32` | Para toasts de éxito — hoy son neutros, no verdes |
| Advertencia | `#C9971E` | Para casos como "stock bajo" o confirmaciones no destructivas |
| Información | `#2563AC` | Para mensajes informativos, si se necesitan a futuro |
| Error (mantener) | `#B0492E` | El que ya existe — se queda *solo* para esto |

**Implementado:** los 4 tokens viven como custom properties en `src/styles.scss`
(`--app-color-success`/`-warning`/`-info`, más el `--mat-sys-error` que ya existía). De momento solo
**éxito** tiene una superficie real usándolo: el toast de `NotificationService` (verde con texto blanco).
Advertencia e información quedan disponibles como variable pero sin un caso de uso concreto todavía en la
app — se conectan el día que aparezca una pantalla que los necesite (ej. un aviso de "stock bajo").

---

## Recomendación

**Opción A ("Tigre Cálido")** es el mejor punto de partida: resuelve el diagnóstico (un solo color haciendo
todos los trabajos) con el menor riesgo de marca, conecta temáticamente con el tigre sin tocar el logo, y
deja la terracota — que ya está probada en producción — donde más sentido semántico tiene: error y
confirmaciones destructivas únicamente.

## Próximo paso (cuando se decida)

1. Elegir una opción (o pedir variaciones).
2. Actualizar los tokens de Material 3 en `src/styles.scss` (`--mat-sys-primary`, `--mat-sys-secondary`,
   `--mat-sys-error`, y agregar tokens custom para éxito/advertencia si no existen ya en `NotificationService`).
2. Actualizar la sección "Identidad de marca" de `README.md` con la paleta final.
3. Verificar contraste real con Playwright/DevTools en los componentes ya existentes (botones, toasts,
   estados de tabla) antes de dar por cerrado el cambio.
