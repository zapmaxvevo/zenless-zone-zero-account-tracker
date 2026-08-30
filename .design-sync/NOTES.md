# Notas de design-sync — zzz-ui

## Qué es este paquete

`design-system/` es un paquete creado **para esta sincronización**, no una biblioteca que ya
existía. Extrae el lenguaje visual de `frontend/src/index.css` + `frontend/src/App.css` como
primitivas desacopladas (sin router, sin tipos de dominio).

**La app todavía no lo consume.** `frontend/` sigue con su `App.css` de 614 líneas. Si algún
día se refactoriza para usar `zzz-ui`, esa duplicación desaparece; hasta entonces, un cambio
de estilo hay que hacerlo en los dos lados.

## Cómo correr el converter

Siempre **desde la raíz del repo**:

```sh
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules design-system/node_modules \
  --entry ./design-system/dist/zzz-ui.js --out ./ds-bundle \
  [--remote .design-sync/.cache/remote-sync.json]
```

- **`--entry` se resuelve contra el directorio actual, NO contra el paquete.** Por eso lleva
  el prefijo `design-system/`. Correrlo desde `design-system/` rompe la resolución de
  `.ds-sync/`. Esto costó un ciclo de build.
- Antes del converter, reconstruir el paquete: `cd design-system && npm run build`. El script
  es `rm -rf dist && tsc && vite build` en ese orden — `tsc` emite los `.d.ts` y Vite tiene
  `emptyOutDir: false` para no borrarlos.

## Decisiones de configuración

- **`provider: AppShell` es obligatorio, no cosmético.** El harness de previews inyecta
  `body{margin:0;padding:24px;background:#fff}` en un `<style>` **después** de las hojas de
  estilo, así que pisa el fondo oscuro de `base.css`. Sin el provider, todas las tarjetas
  renderizan componentes de tema oscuro sobre blanco y las que dependen de `--text` quedan
  ilegibles. `AppShell` se agregó al DS por este motivo y además es la API correcta: un
  agente de diseño no controla el `<body>`.
- **`tokensGlob` es inerte sin `tokensPkg`.** `lib/css.mjs → copyTokens()` hace
  `if (!tokensPkg) return` antes de mirar el glob. Por eso `ds-bundle/tokens/` queda vacío.
  **No es un problema**: los tokens se compilan dentro de `_ds_bundle.css`, que `styles.css`
  importa, y validate confirma 27 definidos / 25 referenciados. No persigas esto.
- **`guidelinesGlob` acotado a propósito.** El default incluye `docs/*.md`, que copiaba los
  18 docs por componente a `guidelines/` duplicándolos. Apuntado a `docs/guides/**/*.md`
  (no existe) para dejar `guidelines/` vacío.
- **Nombres de export ASCII en los previews.** `Tamaños` y `Vacío` se renombraron a
  `Tamanos` / `Vacio` por precaución con el encoding del parámetro `?story=`. No se verificó
  que los acentos realmente rompan — si querés acentos, probá primero uno solo.

## Avisos conocidos de validate

- `[FONT_MISSING] "Cascadia Code"` — **esperado, no lo arregles.** Es el tercer respaldo de
  `--mono`, detrás de `ui-monospace` y `SFMono-Regular`, que resuelven en toda plataforma
  real. Enviar la woff2 sería peso muerto.

Inter **sí** se envía: 6 woff2 (pesos 400/600/700 × subconjuntos latin y latin-ext, ~400 KB)
descargados de Google Fonts a `design-system/fonts/`, referenciados por `fonts/inter.css` con
rutas locales. Sin CDN.

## Hallazgo sobre la app (pendiente, no es del sync)

`frontend/src/index.css` declara `--ui: 'Inter', system-ui, …` pero **la app nunca carga
Inter** — no hay `@font-face` ni `<link>` a un servicio de fuentes en `index.html`. Hoy el
tracker renderiza en `system-ui`.

El DS sí envía Inter, así que los diseños hechos en Claude Design van a verse con Inter y la
app real no. Para alinearlos, la app tiene que servir las mismas woff2 (están en
`design-system/fonts/`) o hay que sacar `'Inter'` del stack.

## Riesgos para el próximo sync

- **El provider es un punto único de falla.** Si el harness de previews algún día deja de
  forzar el fondo blanco, `AppShell` seguiría siendo correcto, pero si alguien lo saca de
  `cfg.provider` todas las tarjetas se rompen visualmente sin que validate lo detecte
  (renderizan, solo que ilegibles). El render check **no** verifica contraste.
- **Los previews están escritos a mano y con datos inventados** (Ellen Joe, Zhu Yuan, Nicole,
  Koleda, Ben Bigger con ids del juego y niveles plausibles). Si el modelo de datos cambia,
  siguen compilando igual — no hay nada que los invalide automáticamente.
- **Inter viene de la red.** `design-system/fonts/` está commiteado, así que un clon nuevo no
  necesita bajarla. Pero si hay que regenerarla, depende de que Google Fonts siga sirviendo
  woff2 con un User-Agent de navegador moderno (con el UA de curl devuelve TTF).
- **`design-system/dist/` está gitignorado** por la regla `dist/` global del repo. Un clon
  nuevo tiene que correr `npm install && npm run build` dentro de `design-system/` antes del
  converter.
- **Verificado con Playwright/Chromium instalado en esta corrida** (no había caché previa).
  Un entorno sin navegador cae en `[RENDER_SKIPPED]`.
