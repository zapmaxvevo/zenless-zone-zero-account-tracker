# New Eridu — filosofía visual

Este documento es la fuente de verdad de **cómo se ve** ZZZ Tracker. Sale del diseño
"Rediseño web inspirado en Zenless Zone Zero" hecho en Claude Design y bajado a la app.

Leelo **antes de crear una pantalla nueva**. Una pantalla que sigue estas trece reglas se
ve como parte de la app aunque nadie haya diseñado esa pantalla en particular; una que las
ignora se nota a la legua, aunque use los mismos colores.

Las clases citadas viven en `frontend/src/styles/eridu.css`; los tokens, en
`frontend/src/styles/tokens.css`. Si algo de acá no se puede expresar con una clase que ya
existe, la regla es **agregar la clase al layer compartido**, no escribir un estilo suelto
en la página.

---

## 0. La idea de fondo

Es la HUD de una terminal de operaciones de Hollow, no un dashboard de SaaS.

Tres consecuencias prácticas que explican todo lo demás:

1. **Nada está derecho.** El sistema tiene tres ángulos canónicos y todo lo gráfico usa
   uno de los tres. Un rectángulo perfectamente ortogonal se lee como un bug.
2. **Los datos son el decorado.** No hay ilustración de relleno: lo que decora es el
   número gigante, la letra de rango detrás de la card, el nombre del agente repetido en
   marca de agua. Si un adorno no es un dato, sobra.
3. **El amarillo es puntuación.** `--accent` marca lo que hay que mirar y lo que está
   activo. Usarlo de decoración lo apaga.

---

## 1. Tres tipografías, tres trabajos

Ninguna es intercambiable. Elegir mal la fuente es el error más visible que se puede
cometer en esta app.

| Rol | Fuente | Se usa para | Cómo |
| --- | --- | --- | --- |
| **Display** | `--font-display` — Archivo Black | Nombres propios, cifras protagonistas, títulos de sección | Siempre `text-transform: uppercase`, siempre inclinada, `line-height: .92–1`, `letter-spacing: -.01em a -.03em` |
| **Técnica** | `--font-tech` — Chakra Petch | Etiquetas, metadatos, chips, valores numéricos medianos, párrafos explicativos | Etiquetas en uppercase con `letter-spacing` grande; valores sin letter-spacing y `font-weight: 700` |
| **Cuerpo** | `--ui` — Inter | Formularios, texto de los componentes base de `zzz-ui` | Sin mayúsculas forzadas, sin letter-spacing |

**Archivo Black nunca va en peso 700**: la fuente ya es negra, `font-weight: 400` es su peso
real. Pedirle 700 la hace sintetizar y se ve sucia.

La escala de etiquetas técnicas es fija — el `letter-spacing` crece cuando el tamaño baja:

```
 9px / .24em   etiqueta dentro de un tile o card chica
10px / .18em   etiqueta de bloque, subtítulo de dato
11px / .14em   eyebrow de sección, meta de una card
12px / .06em   valor de dato (UID, ventana de temporada)
```

Clases: `.ne-display`, `.ne-label`, `.ne-label-sm`, `.ne-eyebrow`, `.ne-value`, `.ne-prose`.

---

## 2. Los tres ángulos

| Ángulo | Dónde | Clase |
| --- | --- | --- |
| `skewX(-7deg)` | Todo texto display | `.ne-display` (ya lo trae) |
| `skewX(-11deg)` | Marcas sólidas chicas: el tick antes de un título, la píldora de score, el logo | `.ne-tick`, `.ne-pill` |
| `rotate(19deg)` | Barras verticales que cruzan un hero de arriba a abajo | `.ne-beam` |
| `rotate(-15deg)` | Banda horizontal que cruza una card de agente por detrás del recorte | `.ne-band` |

Las barras a 19° **siempre** se dibujan con `top: -40%; height: 190%` para que sobren por
arriba y por abajo: una barra inclinada que empieza o termina dentro del bloque se ve
cortada, no diagonal. Lo mismo la banda a -15°: `left: -30%; width: 170%`.

Las barras van de a **tres, en degradé de opacidad** (`.9 / .55 / .32` o `.6 / .34 / .18`) y
grosores decrecientes. Una sola barra se lee como un error de layout; tres se leen como una
firma.

---

## 3. La esquina cortada

El chaflán inferior derecho es la firma estructural del sistema:

```css
clip-path: polygon(0 0, 100% 0, 100% calc(100% - Npx), calc(100% - Npx) 100%, 0 100%);
```

`N` escala con el bloque:

```
 8px   chip / botón de sección
14px   card chica (disco, tile interno)
16px   tile de dashboard
18–20px  fila de equipo, card de agente, panel de sección
22–30px  hero
```

Clase: `.ne-cut` con el modificador de tamaño (`.ne-cut-sm`, `.ne-cut-md`, `.ne-cut-lg`,
`.ne-cut-xl`).

**Chaflán y `border-radius` no conviven.** Los componentes base de `zzz-ui` (botones,
inputs, tags) sí llevan radio; los bloques de la piel New Eridu llevan chaflán. Si un bloque
tiene los dos, elegí chaflán.

---

## 4. Jerarquía de fondos

Cuatro niveles, y hay un negro más negro que el fondo de la página:

| Token | Valor | Qué es |
| --- | --- | --- |
| `--ink` | `#07080b` | **Barras de sistema**: header, píldoras de dato, gradiente al pie de una card, casillero de slot. Es el "más adelante", no el "más atrás" |
| `--bg` | `#0d0e12` | Fondo de página |
| `--bg-panel` | `#16181f` | Panel |
| `--bg-panel-2` | `#1e212b` | Item dentro de un panel |

Los bloques protagonistas no usan color plano sino gradiente, y cada gradiente tiene su
ángulo asignado:

```css
--grad-hero:  linear-gradient(120deg, #191c25 0%, #0d0e12 62%);   /* hero de pantalla */
--grad-card:  linear-gradient(168deg, #20232e 0%, #0b0c10 72%);   /* card de agente */
--grad-row:   linear-gradient(105deg, #1b1e27 0%, #101218 100%);  /* fila de equipo */
```

Clases: `.ne-hero`, `.ne-portrait-card`, `.ne-row`.

---

## 5. La marca de agua

Cada bloque protagonista lleva **su propio dato** repetido en Archivo Black gigante detrás
del contenido: `opacity: .045–.14`, `skewX(-9deg)`, `pointer-events: none`, y **saliéndose
del bloque** por un borde (offsets negativos).

- En un **hero de cuenta o de agente**: el nombre, partido en líneas.
- En una **card de agente**: la letra de rango, teñida del color de rango.
- En un **hero de sección** (Chronicle): la palabra de la sección (`SHIYU`, `VACÍO`).

La marca de agua es opcional en bloques secundarios, pero un hero sin marca de agua se ve
vacío. Clase: `.ne-watermark`.

---

## 6. El amarillo es puntuación

`--accent` (`#f3e600`) se usa exactamente para cinco cosas:

1. **La cifra que importa** — score de build, score de equipo, contador de una sección.
2. **El estado activo** — tab actual, chip de sección seleccionado, temporada actual.
3. **La marca de "esto suma"** — borde izquierdo de 2px + fondo `rgba(243,230,0,.07)` en un
   substat que cuenta para el score.
4. **El bloque diagonal** del hero (las barras a 19°).
5. **El eyebrow** de un hero (`.ne-eyebrow`).

Nunca para texto corrido, nunca para bordes de contenedor "porque queda lindo". Sobre
amarillo el texto va `#0d0e12`, nunca blanco.

El **blanco puro `#fff`** es el otro color de énfasis y es distinto de `--text` (`#e8e9ee`):
todo lo display va en `#fff`, el texto normal en `--text`, el secundario en `--text-dim`.

---

## 7. El color viene del dominio

Ningún color se elige por gusto: sale del dato.

```
elemento   fire #ff7a45 · ice/frost #61d2ff · electric #8f8bff · physics/assault #f7d64a
           ether/auric-ink #ff5fa2 · wind #4fd9a0 · lumiflux #ffeec4
rango      S #f3e600 · A #b06de0 · B #5aa9e6 · I (Pyrois) #f3e600
grade      S #f3e600 · A #b06de0 · B #5aa9e6 · C #7a808f
```

Un sub-atributo no estrena color: hereda el de su elemento padre (Escarcha del hielo, Tinta
áurica del éter, Embestida del físico). El nombre del atributo llega con claves distintas
según la fuente —Enka dice `Elec` y `AuricEther`, HoYoLAB manda `"203"`—, así que todo pasa
primero por `elementKey()` en `frontend/src/lib/elements.ts`: **un atributo nuevo se agrega
ahí una sola vez** y la paleta, las etiquetas y los iconos lo heredan.

El color de elemento aparece siempre en los mismos cinco lugares, y en ninguno más:

1. aro del retrato circular (`border: 2px solid`),
2. banda fina bajo la banda amarilla de una card de agente,
3. borde izquierdo del main stat de un disco,
4. barras diagonales del hero de build,
5. franja de acento de la fila de un equipo (la toma del **primer** miembro).

Helper: `elementColor()` / `rankColor()` / `gradeColor()` en `frontend/src/lib/palette.ts`.
No hardcodees hex en una pantalla.

### El icono es el nombre

El juego nombra estas categorías con un símbolo, no con una palabra, y la app hace lo mismo:
**atributo, especialidad y rango se dibujan con su icono del juego, nunca con el nombre
escrito.** El icono va dentro del tag, con el borde teñido por el dato como cualquier otro
tag; el nombre traducido viaja en `title` y en un `.ne-sr-only` para lectores de pantalla, y
solo se ve cuando la wiki todavía no ilustra ese valor.

Componente: `IconTag` en `frontend/src/components/ui/IconTag.tsx`. Iconos:
`elementIcon()` / `professionIcon()` / `rankIcon()` / `attackIcon()` / `skillIcon()` en
`frontend/src/lib/icons.ts`; los baja `scripts/fetch_wiki_icons.py`.

El icono de rango ya viene con su color puesto —S dorado, A violeta, B celeste—, así que un
tag de rango no se tiñe aparte. **La marca de agua sí sigue siendo la letra**: es un recurso
tipográfico (regla 5), no un tag.

El rango de un agente **no siempre es el de su rareza**: Enka y HoYoLAB solo saben de la
escala 2..4, y Pyrois llega como una S más aunque en el juego tenga su propio rango. La
excepción vive en `agentRankLabel()` (`lib/labels.ts`), indexada por `game_id`, y todo lo
que dibuje el rango de un **agente** pasa por ahí; `rarityLabel()` queda para W-Engines y
discos, que no tienen excepciones.

Una excepción, porque no es decoración sino texto que hay que poder tipear o comparar: los
**selects de filtro** (roster, formularios) llevan el nombre — un `<option>` no dibuja iconos
y el filtro se busca por palabra.

Una lista de habilidades es el caso mixto: el icono va **junto** al nombre, porque ahí la
fila es un renglón de datos, no un tag.

### Lo que no es dato del juego, no se muestra

De qué fuente salió un agente (Enka, el Chronicle, o tipeado a mano) es metadato del
tracker, no del juego: **no aparece en pantalla**. La card de un agente muestra lo que el
agente es, no cómo entró a la base.

---

## 8. El encabezado de sección

Es un solo patrón y se repite idéntico en dashboard, roster, discos, equipos y Chronicle:

```
▌ TÍTULO            12          [acción]
──────────────────────────────────────────
```

- tick amarillo de `6×26px`, `skewX(-11deg)` → `.ne-tick`
- `<h3>` Archivo Black 24px, uppercase, `skewX(-7deg)` → `.ne-display`
- contador opcional en Chakra Petch 700 amarillo
- acción opcional a la derecha (`LinkButton size="sm"`)
- `padding-bottom: 12px; border-bottom: 1px solid var(--border)`

Clase completa: `.ne-section-head`. **Un `<h2>`/`<h3>` sin su tick no existe en esta app.**

---

## 9. Densidad de terminal

La app es densa a propósito. Los valores no se negocian por pantalla:

```
gap entre bloques de una pantalla   12px
gap dentro de una grilla            10px
gap entre líneas de un mismo grupo  4–8px
padding de tile                     16–18px
padding de card                     12–14px
padding de hero                     20–28px (con clamp)
```

Grillas siempre con `repeat(auto-fit|auto-fill, minmax(Npx, 1fr))`, nunca columnas fijas:

```
tiles de dashboard    minmax(255px, 1fr)   auto-fit
cards de agente       minmax(clamp(150px,42vw,196px), 1fr)   auto-fill
discos                minmax(250px, 1fr)   auto-fit
tiles de temporada    minmax(108px, 1fr)   auto-fit
```

---

## 10. La card de retrato

Es el elemento más caro del sistema y el que define la personalidad. Anatomía, de atrás
hacia adelante:

1. fondo `--grad-card` + chaflán de 20px + `overflow: hidden`,
2. la **letra de rango** como marca de agua arriba a la derecha, saliéndose,
3. la **banda amarilla** a `-15deg` a ~100px del pie, y debajo una banda de 7px del **color
   del elemento**,
4. el **arte del agente** centrado, `height: 240px`, apoyado sobre la banda, con
   `drop-shadow`,
5. la **píldora de score** arriba a la izquierda, saliéndose por el borde (`left: -6px`),
   fondo amarillo, `skewX(-11deg)`,
6. al pie, un gradiente `to top, var(--ink) 58%, transparent` con el nombre (display),
   el meta, los tags y el W-Engine.

Hover: `translateY(-5px)`, borde acento, `box-shadow: 0 20px 44px rgba(0,0,0,.65)`,
`transition: .18s ease`. **Es el único elemento de la app con hover "físico"**: los demás
solo cambian de color.

Clase: `.ne-portrait-card` + `PortraitCard` en `frontend/src/components/ui/`.

---

## 11. Estados

- **Vacío / libre**: borde `dashed`, texto `--text-dim`. Nunca rojo. Un slot vacío es
  información, no un problema.
- **Sin datos**: el bloque se dibuja **igual, completo**, con los valores en `—` y el color
  bajado a `--text-dim`. Nunca se colapsa el bloque: la ausencia de dato también es dato.
- **Aviso de sync**: banner con rombo (un cuadrado `rotate(45deg)`) + título en Chakra Petch
  700 uppercase + explicación en `.ne-prose`, chaflán de 12px.
- **Captcha / sync salteado se pintan de acento, no de rojo.** No son errores: son la API
  diciendo "más tarde". El rojo (`--red`) queda para fallas reales.

Clases: `.ne-empty`, `.ne-banner`, `.ne-banner-warn`.

---

## 12. Responsive

- El **shell mide su propio contenedor**, no la ventana: por debajo de 800px el header
  colapsa a hamburguesa. Se hace con `ResizeObserver`, no con media query, para que el
  layout sea correcto también embebido.
- El header **se esconde al scrollear hacia abajo** (`translateY(-130%)`, `.26s ease`) y
  vuelve al subir. Umbral: 6px de delta, 90px de scroll mínimo.
- Todo tamaño display y todo padding de hero va en `clamp()`. Un `font-size` display fijo
  rompe en móvil.
- Las grillas ya son fluidas por la regla 9: no hace falta media query para ellas.

---

## 13. Las scanlines

Overlay fijo, no interactivo, sobre toda la página — es lo que da la textura de pantalla:

```css
position: fixed; inset: 0; z-index: 0; pointer-events: none;
background-image:
  repeating-linear-gradient(0deg, rgba(255,255,255,.028) 0 1px, transparent 1px 3px),
  repeating-linear-gradient(115deg, rgba(243,230,0,.035) 0 2px, transparent 2px 9px);
```

Va una sola vez, en el shell (`.ne-scanlines`). No se repite por pantalla.

---

## Receta: pantalla nueva

1. **Hero** arriba: `.ne-hero` + `.ne-cut-xl`, con `.ne-eyebrow` (contexto en amarillo),
   `<h2 class="ne-display">` (el nombre), una línea de meta en `.ne-label`, las tres barras
   `.ne-beam` a la derecha y la `.ne-watermark` a la izquierda.
2. **Fila de tiles** si hay cifras de cabecera: grilla `auto-fit minmax(255px,1fr)` de
   `.ne-tile` (etiqueta → cifra display → nota).
3. **Paneles** con `.ne-section-head` para cada bloque de contenido.
4. Dentro de los paneles, la grilla que corresponda de la regla 9.
5. Cualquier ausencia de dato → regla 11, nunca un bloque que desaparece.

Si la pantalla necesita una forma nueva, agregala a `eridu.css` con prefijo `.ne-` y
documentala acá. El objetivo es que dentro de un año siga habiendo **un** sistema.

---

## El vocabulario, de un vistazo

Antes de inventar una clase, buscala acá. Todas viven en `eridu.css`.

**Tipografía** `.ne-display` (+`-xl/-lg/-md/-sm`) · `.ne-figure` (+`-xl/-lg/-md`) · `.ne-label`
(+`-sm/-lg`) · `.ne-eyebrow` · `.ne-value` (+`-lg`) · `.ne-prose` · `.ne-accent`

**Ángulos y marcas** `.ne-tick` (+`-sm`) · `.ne-beam` (+`-1/-2/-3`, el ancho y la opacidad de
cada barra) · `.ne-band` · `.ne-pill` · `.ne-watermark`

**Estructura** `.ne-shell` · `.ne-panel` · `.ne-stack` · `.ne-cut` + `.ne-cut-sm/-md/-lg/-xl` ·
`.ne-section-head` / `.ne-section-title` / `.ne-section-count` · `.ne-actions`

**Bloques** `.ne-hero` (+`-sm/-md/-lg`, la altura y el tamaño de su marca de agua) /
`.ne-hero-body` / `.ne-hero-row` / `.ne-hero-art` · `.ne-tile` (+`-ink`,
`-ring`) · `.ne-stat-box` · `.ne-stat-row` · `.ne-row` / `.ne-row-body` (+`.is-flared`) /
`.ne-row-main` / `.ne-row-figure` / `.ne-row-flare` / `.ne-row-link` · `.ne-ring`

**Grillas** `.ne-grid-tiles` · `.ne-grid-cards` · `.ne-grid-builds` · `.ne-grid-discs` ·
`.ne-grid-stats`

**Retratos** `.ne-portrait-card` / `-art` / `-foot` / `-score` / `-rank` / `-fallback` / `-name` /
`-note` / `-band` / `-band-element` · `.ne-face` / `-wrap` / `-badge` / `-fallback` · `.ne-faces`

**Discos** `.ne-disc` · `.ne-slot` (+`-empty`) · `.ne-disc-main` · `.ne-sub` (+`.is-key`) /
`.ne-sub-label` / `.ne-sub-value` · `.ne-pips` / `.ne-pip` (+`.is-on`) · `.ne-bar` (+`-lg`)

**Estados** `.ne-empty` · `.ne-state` · `.ne-banner` / `-dot` / `-body` / `-warn` / `-error` ·
`.ne-stars` / `.ne-star.is-on`

**Controles** `.ne-chip` (+`.is-active`) · `.ne-data-pill` · `.ne-ghost` · `.ne-tab` (+`-menu`,
`.is-active`) · `.ne-burger` · `.ne-menu` · `.ne-logo` / `.ne-brand` · `.ne-tag-tint` · `.ne-tag-row` /
`.ne-tag-icon` · `.ne-sr-only` · `.zui-button` (+`-accent`, `-danger`, `-sm`)

`.zui-button*` es la excepción al prefijo: es el botón base de `zzz-ui`, no una forma New Eridu,
pero su única definición en la app vive igual en `eridu.css`. Ninguna pantalla escribe esas
clases a mano — se piden como `<Button>` o `<LinkButton>`, que son la puerta hacia ellas.

Ni la geometría ni los hex viajan en el JSX: un tamaño es un modificador (`.ne-hero-sm`), una
posición es una clase (`.ne-portrait-band`), y el texto sobre una marca sólida toma su tinta de la
marca (`.ne-pill .ne-label` / `.ne-value`). Lo único que una pantalla pasa por `style` es **el color
que sale del dominio** —elemento, rango, nota— y las custom properties de abajo.

Las custom properties que leen esas clases: `--cut` (chaflán), `--grade` (nota de un disco),
`--element` (barra del main stat), `--fill` (relleno de una barra), `--flare` (franja de una
fila), `--ring` (aro de un retrato), `--ring-turn` (relleno del anillo de progreso), `--tint`
(color de un tag). Se pasan por `style={{ ['--grade' as string]: color }}`.

Lo que queda en un CSS de pantalla (`styles/<pantalla>.css`) es solo lo que de verdad existe una
sola vez: `.ne-build-*`, `.ne-team-*`, `.ne-season-*`, `.ne-attempt-*`, `.ne-boo-*`, `.ne-layer*`,
`.ne-squad*`, `.ne-filters`, `.ne-disc-fields`. Si una de esas formas aparece en una segunda
pantalla, se promueve a `eridu.css` y se anota acá.

---

## Dónde está cada cosa

```
frontend/index.html                 carga Archivo Black + Chakra Petch + Inter
frontend/src/styles/tokens.css      colores, fuentes, gradientes, ángulos, chaflanes
frontend/src/styles/eridu.css       todas las clases .ne-*
frontend/src/lib/palette.ts         color por elemento / rango / grade
frontend/src/lib/icons.ts           icono por elemento / especialidad / rango / habilidad
frontend/src/components/ui/         AppShell, Hero, Tile, SectionHead, PortraitCard, IconTag,
                                    Button / LinkButton (tone, size), …
design-system/                      paquete zzz-ui: Button, Panel, Tag, Field, … (base)
```

El diseño original vive en Claude Design, proyecto
`Rediseño web inspirado en Zenless Zone Zero` (`929c05bc-4fe1-4cec-ab6a-fe2ce8c4df5d`),
archivo `ZZZ Tracker.dc.html`. El design system base está sincronizado en `design-system/`
(proyecto `6df275b2-b9f8-4b75-8fa3-7689d1623b03`, ver `.design-sync/`).
