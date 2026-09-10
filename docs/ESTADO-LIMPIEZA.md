# Estado de la limpieza — traspaso

Escrito el 2026-09-09. Documento **temporal**: cuando la limpieza termine, se borra.

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

Falta correr `npm run build` del frontend y `npm run compile` de la extensión: quedaron sin
verificar porque el teammate del frontend estaba a mitad de camino.

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

En orden de importancia:

1. **Terminar el frontend.** `frontend-limpieza` quedó a mitad. Le autoricé instalar `jsdom` +
   `@testing-library/react` + `@vitest/coverage-v8`, porque el repo no tenía entorno DOM de test:
   todos los tests usaban `renderToStaticMarkup`, que en SSR no corre `useEffect`, así que una
   pantalla con datos era literalmente imposible de testear. **Eso explica por qué el único test
   de páginas que había afirmaba dos clases de CSS.** Le falta: cubrir los escenarios que dependen
   del ciclo de vida (el `onRetry`, el editor de equipo rechazando el cuarto agente, vacío-vs-error),
   borrar `pages/render.test.tsx` si todavía está, y dejar los números de cobertura.
   Condición que le puse: **no volver el entorno jsdom global** — los tests de funciones puras que
   ya andan en node se quedan ahí (pragma por archivo o `environmentMatchGlobs`).
2. **Faltan documentos del banco:** `docs/reference/README.md` (el índice), `01-ORIENTACION.md`,
   `02-ARQUITECTURA.md`, `03-FLUJO-DE-DATOS.md`, `08-MAPA-DEL-REPO.md`. Los dejé para el final a
   propósito, para que describan la estructura **post-refactor** y no la que acabamos de desarmar.
   Ahora ya se pueden escribir: la estructura final es la que está en el árbol.
3. **Ensamblar `07-NOTAS-PARA-IA.md`.** Hoy el banco está partido en `docs/reference/notas/`
   (`backend-core.md`, `backend-mappers.md`, `extension.md`; faltan `backend-web.md` y
   `frontend.md`). Se hizo así para que siete teammates escribieran en paralelo sin pisarse. Falta
   el índice que los une.
4. **Verificar lo que quedó sin correr:** `cd frontend && npm run build` y
   `cd extension && npm run compile`.
5. **Rehacer los commits.** `d4277e3` es un WIP con todo junto. El plan pedía un commit por fase.
   Con la suite verde se puede partir en commits temáticos antes de mergear a `main`.
6. **Limpieza menor pendiente:** borrar `tests/__pycache__`, que guarda `.pyc` de cinco tests que
   ya no existen (`test_chronicle_resilience`, `test_chronicle_sync`, `test_hoyolab_client`,
   `test_tmp_review_probe`, `test_zz_adversarial_tmp`), y confirmar que `.gitignore` lo cubre.

## Cómo se retoma

Los siete teammates ya no existen en la sesión nueva. No hace falta: su trabajo está en el árbol
y la suite está verde. Para seguir alcanza con leer este archivo y el plan, y arrancar por el
punto 1.

Si querés volver a paralelizar, el briefing que usaron está en el scratchpad de la sesión vieja
y su contenido esencial es: cada teammate es dueño de un conjunto de archivos y no toca nada
fuera; la superficie pública no cambia (los paquetes re-exportan); **los tests no se tocan** en un
refactor, y si uno se rompe es el refactor el que está mal.

## Hallazgos de los teammates que no alcancé a atender

- **`tests/test_disc_values.py:46`** tiene un comentario equivocado: dice `# B discs stop at 15`
  y los discos B topean en **9**. El `assert` de abajo es correcto; el comentario miente. Una
  línea de arreglo.
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
