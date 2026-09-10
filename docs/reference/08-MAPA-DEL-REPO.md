# Mapa del repo — qué vive dónde

Para cuando abrís el repo y no sabés en qué carpeta buscar, o encontrás una que no sabés qué es.
Lo que hay adentro de cada mitad y por qué está separado: [`02-ARQUITECTURA.md`](02-ARQUITECTURA.md).

## Las cuatro mitades que importan

| Carpeta | Qué es |
| --- | --- |
| `src/zzz_tracker/` | El backend: FastAPI + SQLAlchemy. Se maneja con `uv` desde la raíz. |
| `frontend/` | La app web: Vite + React + TypeScript. `npm` desde adentro de `frontend/`. |
| `extension/` | La extensión de navegador: WXT + React. `npm` desde adentro de `extension/`. Es la única forma de que un dato de HoYoLAB entre al tracker. |
| `api/` | Un solo archivo, `index.py`: el envoltorio serverless de Vercel. Importa `create_app()` y le saca el prefijo `/api` al path. |

Backend y frontend **no comparten código**: hablan sólo por HTTP.

## El backend por dentro

```
src/zzz_tracker/
├── app.py            create_app(): arma la app, el estado y los routers
├── cli.py            el comando `zzz-tracker` (serve, sync-static, claim, rotate-key)
├── config.py         Settings de pydantic, prefijo de env ZZZ_
├── errors.py         los errores de dominio y su `code` (que es contrato)
├── parsing.py        coerciones defensivas compartidas por los dos mappers
├── web/
│   ├── deps.py       los alias *Dep y los guards de escritura
│   ├── routers/      6 routers: health, accounts, agents, teams, catalog, chronicle
│   └── schemas/      el contrato HTTP, 6 módulos; __init__.py re-exporta todo
├── tracker/          el dominio: service.py es la fachada de 5 colaboradores
├── storage/          models.py, database.py, keys.py
├── enka/             cliente HTTP de Enka + mapper + datos estáticos
├── hoyolab/          mappers de la Chronicle; mapper.py sólo re-exporta
└── discs/            values.py: la matemática de main stats y substats
```

Los tres módulos que **sólo re-exportan** (`web/schemas/__init__.py`, `hoyolab/mapper.py`,
`tracker/service.py`) están ahí a propósito: mantienen la superficie pública estable. Ver
[`07-NOTAS-PARA-IA.md`](07-NOTAS-PARA-IA.md).

## Lo que confunde

**`design-system/` vs `ds-bundle/` vs `.design-sync/`** — son tres cosas del mismo circuito, y
ninguna la usa la app:

- `design-system/` es el paquete `zzz-ui`: primitivas visuales (botones, inputs, tags) extraídas
  del frontend como biblioteca desacoplada. **La app todavía no lo consume.** Un cambio de estilo
  hoy hay que hacerlo en los dos lados. Está versionado.
- `.design-sync/` es la configuración y el caché de la sincronización que genera ese paquete
  (`config.json`, `conventions.md`, `NOTES.md`, previews). El paquete se regenera **desde el
  frontend**, nunca al revés. `.design-sync/.cache/` está gitignoreado.
- `ds-bundle/` es la bajada del diseño hecho en Claude Design (componentes en JSX + HTML, tokens,
  guidelines, screenshots). **Está gitignoreado**: es local, no viaja en el repo.

Lo que sí manda sobre cómo se ve la app es `docs/DESIGN.md` (las trece reglas de New Eridu), con
`frontend/src/styles/tokens.css` y `eridu.css` como su implementación.

**`data/static/` vs `tests/fixtures/static/`** — los dos tienen `avatars.json`, `weapons.json`,
`equipments.json`, `locs.json`, `property.json`, y no son lo mismo:

- `data/static/` son las tablas reales de Enka que baja `uv run zzz-tracker sync-static`. **Están
  commiteadas a propósito**, con una excepción explícita en `.gitignore`: el filesystem de Vercel
  es de sólo lectura y `sync-static` no tendría dónde escribir allá.
- `tests/fixtures/static/` es un recorte mínimo para los tests, con un puñado de ids.
- `data/zzz.db` es la base de desarrollo y **no** está versionada.

**`extension/.output/` y `extension/.wxt/`** — generados por WXT. `.output/` es la extensión
compilada que cargás en el navegador; `.wxt/` son los tipos y la config que WXT prepara en el
`postinstall`. No se editan a mano.

**`docs/` tiene dos mitades.** `docs/reference/` (este directorio) describe **el presente** y se
actualiza con cada cambio. El resto —`PLAN.md`, `EXTENSION.md`, `PENDIENTES.md`, `DISC_SCORE.md`,
`DISC_SCORE_FIXES.md`— son **planes e historia**: valen por el porqué, pero pueden mentir sobre
cómo está el código hoy. `HOYOLAB.md`, `OWNERSHIP.md`, `DEPLOY.md` y `DESIGN.md` están en el medio:
son referencia viva de su tema.

## La configuración de Claude Code

```
.claude/
├── agents/    7 subagentes especializados; se eligen solos por su `description`
├── rules/     python.md (backend), frontend.md, tests.md — se aplican por `paths:`
├── skills/    /verify, /run-tests, /crear-api, /documentation
├── hooks/     run_relevant_tests.py: baseline antes de editar, suite al terminar
└── settings.json
```

## Lo demás

| | |
| --- | --- |
| `alembic/` | Las migraciones. `versions/` va de `0001` a `0007`; el índice está en [`04-MODELO-DE-DATOS.md`](04-MODELO-DE-DATOS.md). |
| `tests/` | La suite del backend. `conftest.py` tiene las fixtures; `fixtures/` los payloads de Enka y HoYoLAB. |
| `scripts/` | `fetch_wiki_icons.py`, que baja los iconos del juego. Se corre a mano. |
| `.github/workflows/ci.yml` | Cuatro jobs: backend, migraciones contra Postgres, frontend, extensión. |
| `vercel.json` | El ruteo del deploy: `/api/*` a la función Python, el resto al estático. |
