# Estado de la limpieza — traspaso

Escrito el 2026-09-09, **actualizado el 2026-09-10**. Documento **temporal**: cuando la limpieza
termine, se borra.

Al 2026-09-10 sólo queda el punto 5 (rehacer los commits) y una decisión tuya
(`extension/scripts/probe-avatar-info.js`: se borra o se queda). Todo lo demás de abajo está hecho.

Rama: `limpieza` (desde `main`, commit base `6707e4f`). Snapshot en `d4277e3`.

El plan completo está en `/home/maxi/.claude/plans/quizzical-scribbling-blum.md`.

## La suite está verde

Medido sobre el snapshot `d4277e3`, con todo lo de abajo ya aplicado:

| Check | Resultado |
| --- | --- |
| `uv run ruff check .` | pasa |
| `uv run mypy src api` | pasa, 48 archivos |
| `uv run pytest` | **235 passed** |
| `cd frontend && npm run test` | **239 passed**, 24 archivos |
| `cd extension && npm run test` | **118 passed**, 6 archivos |

Corrido el 2026-09-10, con todo lo de abajo aplicado: `cd frontend && npm run build` pasa,
`cd extension && npm run build` pasa (la extensión **no tiene** script `compile`; el build es
`build`, vía WXT). Los tests del frontend son hoy **384 en 40 archivos**, con 89.0 % de statements
y 84.3 % de branches.

## Lo que ya está hecho

**Backend — se partieron los tres god-files, sin tocar un solo test.** Eso es lo que prueba que
el refactor preservó el comportamiento: los 235 tests son los mismos de antes.

- `tracker/service.py` (914 líneas) → `accounts.py`, `agents.py`, `teams.py`, `enka_sync.py`,
  `chronicle.py`, `rows.py`, y `service.py` como fachada. `deps.py` sigue construyendo
  `TrackerService(session=..., enka=..., static=...)` igual que antes.
- `web/schemas.py` (789) → paquete `web/schemas/` con `common`, `accounts`, `agents`, `teams`,
  `catalog`, `chronicle`. `__init__.py` re-exporta todo: ningún import de afuera cambió.
- `hoyolab/mapper.py` (701) → `challenges.py`, `progress.py`, `profile.py`, `common.py`, con
  `mapper.py` re-exportando.
- `parsing.py` nuevo: las coerciones que estaban duplicadas **y divergidas** entre `enka/mapper.py`
  y `hoyolab/mapper.py` (una hacía `.strip()`, la otra no) ahora son una sola.
- Catálogo: cuatro modelos de respuesta idénticos → `CatalogListResponse[T]` genérico, y cuatro
  loops calcados → un builder. Espeja el genérico que el frontend ya tenía.
- `UidPath` dejó de estar definido dos veces.
- Comentarios: el rationale se mudó al banco en `docs/reference/notas/`.

**Frontend** — `AsyncSection` para la tríada `loading / error / vacío` que se repetía en 11
páginas, y las páginas de 350-390 líneas partidas en componentes propios (`AccountDashboard`,
`AgentBuild`, `AgentForm`, `TeamForm`, `ChronicleSeason`, `BuildStats`, …).

**Extensión** — comentarios mudados al banco, y `lib/sync.ts` nuevo con su test: lógica que estaba
metida adentro del content script y no se podía testear.

**Config de IA** — `.claude/agents/` con siete subagentes, las tres `.claude/rules/` reescritas
(eran de Django/DRF), y `/verify` ahora corre también la extensión.

**Docs** — `docs/reference/04-MODELO-DE-DATOS.md`, `05-CONTRATO-API.md`, `06-DOMINIO.md`.

## Lo que falta

Al 2026-09-10 queda **sólo el punto 5**. Los demás quedaron cerrados; se anota con qué.

1. ~~Terminar el frontend.~~ **Hecho** (`7f48e1c`). Se instalaron `jsdom`,
   `@testing-library/react` y `@vitest/coverage-v8` porque el repo no tenía entorno DOM de test:
   todo usaba `renderToStaticMarkup`, y en SSR React no corre `useEffect`, así que una pantalla con
   datos era imposible de testear —**por eso el único test de páginas que había afirmaba dos clases
   de CSS**—. `pages/render.test.tsx` está borrado y el entorno `jsdom` quedó **acotado por pragma**
   a `interactions.test.tsx` y `writeActions.test.tsx`: no lo vuelvas global.
2. ~~Faltan documentos del banco.~~ **Hecho**: `README.md`, `01-ORIENTACION.md` y
   `08-MAPA-DEL-REPO.md` en `f52c3e2`; `02-ARQUITECTURA.md` y `03-FLUJO-DE-DATOS.md` el 2026-09-10.
   Los ocho documentos y el índice existen, y los seis diagramas mermaid renderizan.
3. ~~Ensamblar `07-NOTAS-PARA-IA.md`.~~ **Hecho**: el índice existe y los cinco archivos de
   `notas/` están (`backend-core`, `backend-mappers`, `backend-web`, `extension`, `frontend`).
4. ~~Verificar lo que quedó sin correr.~~ **Hecho** el 2026-09-10: los dos builds pasan. Ojo que la
   extensión no tiene script `compile`; es `npm run build`.
5. **Rehacer los commits.** `d4277e3` es un WIP con todo junto. El plan pedía un commit por fase.
   Con la suite verde se puede partir en commits temáticos antes de mergear a `main`. **Es lo único
   que queda.**
6. ~~Limpieza menor pendiente.~~ **Hecho**: `tests/__pycache__` borrado (tenía los `.pyc` de cinco
   tests que ya no existen) y `.gitignore:2` ya lo cubre; nunca estuvo trackeado.

## Lo que salió del review del 2026-09-10

Una auditoría de comentarios, tests y estructura sobre el árbol ya limpio. El diagnóstico: nada de
lo que la limpieza arregló volvió. Cero `TODO/FIXME/HACK`, cero código comentado, ningún archivo de
producción por encima de 470 líneas, y la única duplicación que queda es la latente de
`.zui-input*` (`docs/PENDIENTES.md` §4). Lo que sí apareció, y se arregló:

- **Volvían las aserciones sobre clases CSS**: diez, en `ownership.test.tsx`, `DiscCard.test.tsx`,
  `AgentCard.test.tsx`, `ChronicleScreens.test.tsx`, `Hero.test.tsx`, `ChallengeAttempt.test.tsx` y
  `PortraitCard.test.tsx`. Reescritas contra lo que se ve (el texto enmascarado de la key, las
  cuatro secciones del Chronicle, "Sin equipar", el rótulo de la píldora, los nombres de los buffs).
  El criterio que quedó: **una pantalla no afirma la clase de un componente anidado**; un componente
  puede mirar su propio markup cuando la pieza es decoración sin texto (las tres barras del hero,
  las estrellas, las scanlines).
- **`PortraitCard.tsx` y `Hero.tsx` escribían forma y color a mano en el JSX** (`#0d0e12`,
  `rgba(13,14,18,.66)`, `bottom:100px`, `font-size:98px`, los `clamp()` de las barras). Todo se mudó
  a `eridu.css` como `.ne-portrait-band`, `.ne-portrait-band-element`, `.ne-hero-sm|md|lg`,
  `.ne-beam-1|2|3` y las reglas de tinta de `.ne-pill`. En el JSX queda **sólo el color que sale del
  dominio**, que es lo que `docs/DESIGN.md` permite.

Lo que el review encontró y **no** se arregló, en orden de valor:

1. **La extensión no tiene testeado ningún entrypoint**: `background.ts` (167 líneas, con `runImport`
   adentro), `hoyolab.content.ts` (196), `popup/App.tsx` y `options/App.tsx` (211 cada uno) y
   `lib/messages.ts`. No hay entorno DOM ni `@vitest/coverage-v8` en `extension/`: es el mismo
   agujero que el frontend acaba de tapar.
2. **No se puede medir cobertura del backend**: no hay `pytest-cov` instalado.
3. **`src/zzz_tracker/parsing.py` no tiene test propio** — justo el módulo que existe porque las dos
   copias habían divergido. Hoy se ejercita sólo de rebote por los mappers.
4. **Puntos flojos de cobertura del frontend**: `hooks/useCountdown.ts` 27 %, `ui/AppShell.tsx` 55 %,
   `DiscFields.tsx` 50 %, `TeamForm.tsx` 73 %, `AgentForm.tsx` 79 %.
5. **Superficie sobre-exportada**: ~26 símbolos exportados que sólo se usan dentro de su archivo,
   casi todos en `extension/lib/hoyolab.ts` (`RETCODES_*`, `ENDPOINTS`, `hoyolabHeaders`, …) y tipos
   internos de `frontend/src/lib/`. Cosmético.
6. **`tests/test_chronicle_import.py` (896 líneas) es hoy el archivo más grande del repo**, más que
   cualquier god-file que partimos.

## Cómo se retoma

Los siete teammates ya no existen en la sesión nueva. No hace falta: su trabajo está en el árbol
y la suite está verde. Para seguir alcanza con leer este archivo y el plan, y arrancar por el
punto 1.

Si querés volver a paralelizar, el briefing que usaron está en el scratchpad de la sesión vieja
y su contenido esencial es: cada teammate es dueño de un conjunto de archivos y no toca nada
fuera; la superficie pública no cambia (los paquetes re-exportan); **los tests no se tocan** en un
refactor, y si uno se rompe es el refactor el que está mal.

## Hallazgos de los teammates que no alcancé a atender

- ~~**`tests/test_disc_values.py:46`** decía `# B discs stop at 15` cuando los discos B topean en
  **9**.~~ Arreglado: hoy dice 9.
- **`extension/scripts/probe-avatar-info.js` es resto de investigación ya resuelta** — existió
  para averiguar la forma de `id_list`, respuesta que hoy vive en `avatarInfoUrl` y en el banco.
  Se dejó a propósito, con un header que dice que sólo se vuelve a correr si HoYoLAB cambia los
  parámetros. Si querés borrarlo, es decisión tuya.
- **Un teammate corrió `ruff --fix` y `ruff format` sobre el repo entero** mientras otros
  editaban. La suite quedó verde y `ruff format --check` da 78 archivos ya formateados, así que
  el riesgo es bajo, pero si aparece un reformateo raro en un archivo que nadie tocó, salió de ahí.
- **`MAX_DISC_PROCS` y `LEVELS_PER_PROC` conviven** y no son lo mismo: el primero es el tope de
  rolls que valida el schema (`web/schemas/agents.py`), el segundo es la escala de `procs_for()`
  en `discs/values.py`. Los dos están documentados en el banco.
- Los siete subagentes de `.claude/agents/` **ya están activos** en la sesión: se eligen solos
  por su `description`.
