---
description: React + TypeScript coding standards for the frontend
paths:
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
---

# Frontend (React + TypeScript) standards

Vite + React + TypeScript estricto en `frontend/`. `eslint --fix` corre solo al guardar
(hook PostToolUse); todo lo demás se corre desde `frontend/`: `npm run dev`, `npm run build`
(`tsc -b && vite build`, así que un error de tipos rompe el build), `npm run lint`,
`npm run format`, `npm run test`.

> El backend es FastAPI y vive en `src/`, con **uv**. Frontend y backend hablan solo por HTTP:
> no comparten código. Las reglas de `python.md` y `tests.md` no aplican acá.

## Structure

Por capa, no por feature: la app es una sola y no tiene `features/` ni `shared/`.

- `api/` — `client.ts` (fetch + `ApiError`), `types.ts` (lo que devuelve el backend),
  `errors.ts`. Es el único lugar que sabe que existe HTTP.
- `components/` — componentes compartidos. `components/ui/` son las primitivas de la piel:
  `AppShell`, `Hero`, `SectionHead`, `Tile`, `PortraitCard`, `Face`, `Banner`, `IconTag`.
- `pages/` — una pantalla por ruta, montadas en `App.tsx`.
- `hooks/` — `useApi`, `useAgentArt`, `useCountdown`, `useCompactHeader`.
- `lib/` — lógica pura sin React: `palette`, `labels`, `icons`, `elements`, `score`, `stats`.
- `styles/` — `tokens.css` y `eridu.css`. `assets/` — los iconos del juego.

Una pantalla no importa de otra pantalla: lo común baja a `components/`, `lib/` o `hooks/`.

## Components & exports

- Solo function components + hooks.
- Los componentes son **default export** y el archivo va en **PascalCase**
  (`PortraitCard.tsx`).
- Hooks y utilidades son **named exports**; los hooks viven en `hooks/` con prefijo `use`.
- Las props se tipan con un `interface` de sufijo **`Props`**, desestructurado en la firma. Un
  `interface` que no sea de props (un `Tab`, un `Notice`) no lleva sufijo.

## TypeScript

- `strict: true`. Estados con **uniones discriminadas**
  (`type LoadState = 'idle' | 'loading' | 'loaded' | 'error'`).
- **`import type`** para los imports que son solo de tipos.
- **Comillas simples** y **punto y coma**, que es lo que fuerza prettier: `singleQuote`,
  `semi`, `trailingComma: 'all'`, `printWidth: 100`. Las comillas dobles quedan solo en los
  atributos JSX, que es lo que hace prettier por defecto.
- **PROHIBIDO ESCRIBIR COMENTARIOS.** El código se explica solo: un nombre largo antes que una
  aclaración al costado, y una función chica antes que un bloque comentado. Lo que necesite
  contexto va a `docs/`, no a un `//`. Vale para el JSDoc también.
  (Esto es solo del frontend: el backend en `src/` sí se comenta.)

## Styling

CSS plano en `frontend/src/styles/`, sobre el paquete base `design-system/` (`zzz-ui`).
**Nada de Tailwind, CSS modules, styled-components ni objetos `CSSProperties` inline.**

- `tokens.css` — colores, fuentes, gradientes, ángulos, chaflanes.
- `eridu.css` — todas las clases `.ne-*`. **Una forma nueva va acá**, nunca inline en una
  pantalla. Si una forma aparece en una segunda pantalla, sube desde el CSS de esa pantalla a
  `eridu.css`.
- Lo que de verdad existe una sola vez queda en `styles/<pantalla>.css`.
- El color sale del dato, con los helpers de `lib/palette.ts`: nunca un hex hardcodeado en una
  pantalla. Lo único que viaja por `style={{}}` son las custom properties (`--tint`, `--grade`,
  `--element`, `--fill`), con la forma `style={{ ['--tint' as string]: color }}`.
- Los CSS **sí** llevan comentarios: son los que explican cada forma de la piel.

Antes de tocar cualquier pantalla, **leer `docs/DESIGN.md` entero**: es la fuente de verdad del
sistema New Eridu, no una sugerencia.

## Tests

Vitest, con los `*.test.ts` / `*.test.tsx` al lado de lo que prueban. Los componentes se
prueban renderizando a string con `renderToStaticMarkup` y afirmando sobre el HTML; lo de
`lib/` se prueba directo. Un test por escenario, con el nombre en castellano diciendo qué se
espera.
