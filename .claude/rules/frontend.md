---
description: Frontend standards — React + Vite + TypeScript in frontend/, New Eridu design system
paths:
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
  - "frontend/**/*.css"
---

# Frontend (React + Vite + TypeScript) standards

La app vive en `frontend/`. Todo se corre desde ahí:

```bash
npm run dev      # proxea /api a http://127.0.0.1:8000, así que levantá el backend también
npm run build    # tsc -b && vite build: un error de tipos ROMPE EL BUILD
npm run lint     # eslint .
npm run format   # prettier --write .
npm run test     # vitest run
```

`npm run build` es también el type-check: no hay un paso de tipos aparte, y CI lo corre así. Antes
de dar algo por terminado, corré `lint` + `build` + `test`.

Dependencias con `npm install`, nunca editando `package-lock.json` a mano.

> El backend es FastAPI y vive en `src/zzz_tracker/`, con **uv**. Frontend y backend hablan **solo
> por HTTP**: no comparten código, no hay tipos generados. Las reglas de `python.md` y `tests.md`
> no aplican acá.

## Estructura — por capa, no por feature

La app es una sola: no hay `features/` ni `shared/`.

- `api/` — `client.ts` (fetch + `ApiError`), `types.ts`, `errors.ts`. **Es el único lugar del
  frontend que sabe que existe HTTP.** Ningún componente llama a `fetch`.
- `hooks/` — `useApi`, `useAccountKey`, `useAccountAccess`, `useAgentArt`, `useCountdown`,
  `useCompactHeader`. **Son la puerta a los datos**: una pantalla pide por un hook, no por
  `client.ts` directo.
- `components/` — compartidos. `components/ui/` son las primitivas de la piel: `AppShell`, `Hero`,
  `SectionHead`, `Tile`, `PortraitCard`, `Face`, `Banner`, `IconTag`, `Button`.
- `pages/` — una pantalla por ruta, montadas en `App.tsx`.
- `lib/` — lógica pura sin React: `palette`, `icons`, `labels`, `elements`, `score`, `stats`,
  `synergy`, `teams`, `time`, `uid`, `accountKey`, `agentDraft`, `chronicle`.
- `styles/` — `tokens.css` y `eridu.css` más un CSS por pantalla. `assets/` — los iconos del juego.

Una pantalla **no importa de otra pantalla**: lo común baja a `components/`, `lib/` o `hooks/`.

## La capa `api/`

`types.ts` **espeja los schemas del backend** (`src/zzz_tracker/web/schemas/`). Si un endpoint
cambia de forma, `types.ts` cambia con él y el `tsc -b` es lo que te avisa dónde. Reglas:

- El tipo espeja **lo que el backend manda de verdad**, no lo que sería lindo que mandara. Un campo
  que el backend dejó de enviar se saca de `types.ts`, no se deja opcional "por las dudas".
- Los errores llegan como `ApiError` con el `code` estable del backend (`not_found`, `forbidden`,
  `unclaimed_account`, `static_data_unavailable`, …). **Se ramifica por `code`, nunca por el texto
  del `detail`**, que puede cambiar de palabras sin aviso.
- La key de cuenta viaja en el header `X-Account-Key` y la maneja `useAccountKey` /
  `useAccountAccess`; una pantalla no arma ese header a mano.

## Componentes y exports

- Sólo function components + hooks.
- Los componentes son **default export** y el archivo va en **PascalCase** (`PortraitCard.tsx`).
- Hooks y utilidades son **named exports**; los hooks viven en `hooks/` con prefijo `use`.
- Las props se tipan con un `interface` de sufijo **`Props`**, desestructurado en la firma. Un
  `interface` que no sea de props (un `Tab`, un `Notice`) no lleva sufijo.

## TypeScript

- `strict: true`. Estados con **uniones discriminadas**
  (`type LoadState = 'idle' | 'loading' | 'loaded' | 'error'`), no con tres booleanos sueltos.
- **`import type`** para los imports que son sólo de tipos.
- **Comillas simples** y **punto y coma**, que es lo que fuerza prettier: `singleQuote`, `semi`,
  `trailingComma: 'all'`, `printWidth: 100`. Las comillas dobles quedan sólo en los atributos JSX,
  que es lo que hace prettier por defecto.
- Nada de `any`. Si algo llega sin forma, se le da forma en `api/types.ts`.

## Diseño — leer `docs/DESIGN.md` ENTERO antes de tocar una pantalla

No es una sugerencia y no alcanza con hojearlo: son **trece reglas** (tipografías, ángulos
canónicos, el chaflán, la jerarquía de fondos, marcas de agua, cuándo se permite el amarillo
`--accent`, color-desde-el-dato, el header de sección, densidad, la portrait card, estados vacíos y
de error, responsive, la capa de scanlines). Una pantalla que las sigue se ve parte de la app aunque
nadie la haya diseñado; una que las ignora se nota a la legua aunque use los mismos colores.

## Estilos

CSS plano en `frontend/src/styles/`, sobre el paquete base `design-system/` (`zzz-ui`).
**Nada de Tailwind, CSS modules, styled-components ni objetos `CSSProperties` inline.**

- `tokens.css` — colores, fuentes, gradientes, ángulos, chaflanes.
- `eridu.css` — todas las clases `.ne-*`. **Una forma nueva va acá, nunca inline en una pantalla.**
  Si una forma aparece en una segunda pantalla, sube desde el CSS de esa pantalla a `eridu.css`.
- Lo que de verdad existe una sola vez queda en `styles/<pantalla>.css`.
- **El color sale del dato**, con los helpers de `lib/palette.ts`: por elemento, por rango, por
  grado. **Nunca un hex hardcodeado en una pantalla.**
- **Los iconos salen de `lib/icons.ts`**: por elemento, especialidad, rango, skill. Y **elemento y
  especialidad se muestran como icono, nunca con su nombre escrito.**
- Lo único que viaja por `style={{}}` son las custom properties (`--tint`, `--grade`, `--element`,
  `--fill`), con la forma `style={{ ['--tint' as string]: color }}`.
- Los CSS **sí** llevan comentarios: son los que explican cada forma de la piel.

## Comentarios

**En TS/TSX no se escriben comentarios.** El código se explica solo: un nombre largo antes que una
aclaración al costado, y una función chica antes que un bloque comentado. Vale para el JSDoc
también. Lo que necesite contexto va a `docs/reference/`, no a un `//`.
(Esto es del frontend; en el backend un docstring de una línea sí se queda — ver `python.md`.)

## Tests

Vitest, con los `*.test.ts` / `*.test.tsx` al lado de lo que prueban.

- Lo de `lib/` se prueba directo, como función pura.
- Los componentes y pantallas se prueban renderizando a string con `renderToStaticMarkup` (dentro
  de un `MemoryRouter` si usan rutas) y afirmando sobre el HTML resultante.
- El borde externo del frontend es **`fetch`**: se stubbea con `vi.stubGlobal`, igual que
  `localStorage`. No se mockea un hook ni un componente propio.
- Un test por escenario, con el nombre **en castellano** diciendo qué se espera. Ejemplar de oro:
  `frontend/src/pages/ownership.test.tsx`.

El detalle de cómo se piensa un test está en `.claude/rules/tests.md`; su tesis vale igual acá:
se testea comportamiento observable, no métodos.
