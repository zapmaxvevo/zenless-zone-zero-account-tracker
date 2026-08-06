# Plan de desarrollo — ZZZ Account Tracker

## Contexto

Repo greenfield para un tracker de cuentas de Zenless Zone Zero: info de cuenta, roster de agentes, builds (W-Engine + drive discs) y team comps. Deploy final en Vercel.

Decisiones tomadas (2026-08-05):

- **Origen de datos**: mixto — import automático desde la API de Enka.Network + edición/carga manual para completar lo que la API no expone.
- **Persistencia**: SQLite local para desarrollo; la persistencia de producción (Postgres hosteado) se decide al momento de deployar.
- **Usuarios**: multi-UID sin login — cualquiera ingresa un UID y ve/trackea esa cuenta; sin auth por ahora.
- **MVP**: las cuatro features (info de cuenta, roster, builds, teams), en ese orden.

Referencias de patrones (proyectos hermanos):

- Backend: `../bazoooka` — layout `src/<pkg>/` con `web/{routers,deps,schemas}` + `storage/{database,models}`, app factory `create_app(settings)` con estado en `app.state`, `DatabaseManager` (engine + sessionmaker), pydantic-settings con `env_prefix`, Alembic con URL desde env, CLI Typer como entrypoint.
- Frontend (andamiaje): `../aventurero` — tsconfig con project references, ESLint flat config, Prettier (singleQuote, printWidth 100), `build` = `tsc -b && vite build`, tests de vitest colocados junto al fuente, CSS plano con tokens en `:root`.
- Frontend (capa de red): `../bazoooka/frontend` — proxy de Vite `/api → http://127.0.0.1:8000`, `src/api/client.ts` mínimo + `src/api/types.ts` espejando los schemas del backend.

Gaps conocidos de bazoooka que acá se corrigen desde el inicio: sin config de ruff/mypy/pytest en pyproject, sin excepciones de dominio ni exception handlers, hack de sys.path en conftest.

## API de Enka.Network (ZZZ)

- Endpoint: `GET https://enka.network/api/zzz/uid/{uid}` — devuelve `PlayerInfo` (`SocialDetail` con perfil/nivel, `ShowcaseDetail.AvatarList` con los agentes exhibidos: nivel, promoción, skills, `Weapon` y `EquippedList` de discos). Incluye `ttl` (segundos hasta el próximo refresh) — respetarlo como caché para no golpear de más.
- Solo trae los agentes **exhibidos** en el showcase → por eso la edición manual es necesaria.
- La respuesta usa IDs crudos; los nombres/iconos salen de los datos estáticos: `github.com/EnkaNetwork/API-docs/store/zzz/` (`avatars.json`, `weapons.json`, `equipments.json`, `property.json`, `locs.json`).
- Usar un `User-Agent` propio identificable y manejar 404 (UID inexistente) y 429 (rate limit).

## Arquitectura

```
personal-zzz/
├── pyproject.toml           # uv, fastapi, sqlalchemy, alembic, httpx, pydantic-settings, typer
├── alembic/                 # migraciones (URL desde env ZZZ_DATABASE_URL)
├── data/                    # zzz.db local (gitignored) + static/ (JSONs de Enka)
├── src/zzz_tracker/
│   ├── app.py               # create_app(settings) — app factory, estado en app.state
│   ├── config.py            # Settings (pydantic-settings, env_prefix="ZZZ_") + get_settings()
│   ├── cli.py               # Typer: serve, sync-static
│   ├── errors.py            # excepciones de dominio + exception handlers HTTP
│   ├── web/
│   │   ├── deps.py          # get_db, get_settings, get_enka_client desde request.app.state
│   │   ├── schemas.py       # pydantic de request/response
│   │   └── routers/         # health, accounts, agents, teams, catalog
│   ├── storage/
│   │   ├── database.py      # DatabaseManager (patrón bazoooka)
│   │   └── models.py        # SQLAlchemy 2.0 DeclarativeBase
│   ├── enka/
│   │   ├── client.py        # httpx: fetch por UID, User-Agent, caché por ttl, errores tipados
│   │   ├── mapper.py        # JSON de Enka → modelos de dominio
│   │   └── static_data.py   # carga/lookup de avatars/weapons/equipments/locs
│   └── tracker/service.py   # casos de uso: sync de cuenta, upserts, reglas manual-vs-import
├── tests/                   # espeja src/; fixtures JSON grabados de Enka (sin red en tests)
└── frontend/                # Vite + React + TS (andamiaje aventurero, red bazoooka)
    └── src/
        ├── api/             # client.ts (get/post/patch/delete + ApiError), types.ts
        ├── pages/           # Home, Account, Roster, AgentDetail, Teams
        ├── components/
        └── index.css        # tokens en :root, CSS plano
```

## Modelo de datos

- **Account**: `uid` (PK), nickname, level (Inter-Knot), signature, avatar/profile ids, `last_synced_at`.
- **Agent**: id, `account_uid` FK, `game_id` (id de Enka), level, promotion, mindscape (rank), skill levels (JSON), core skill, `source` (`enka` | `manual`). Regla de sync: el import upserta los agentes con `source='enka'`; los creados/editados a mano quedan `manual` y el sync no los pisa.
- **WEngine**: 1-a-1 con Agent — `game_id`, level, phase (refinamiento), stars.
- **DriveDisc**: N por Agent — slot (1–6), `game_id` (set), rarity, level, main stat, substats (JSON: prop id, valor, rolls).
- **Team** + **TeamMember**: nombre, notas, 3 slots referenciando agents; scoped por cuenta.

Los stats se guardan como IDs de propiedad de Enka + valores crudos; la resolución a nombres legibles/iconos la hace el backend con los datos estáticos (endpoint de catálogo), no el frontend.

## Endpoints (v1)

- `GET /health`
- `POST /accounts` `{uid}` — importa desde Enka y crea la cuenta; `POST /accounts/{uid}/sync` — re-importa respetando `ttl`.
- `GET /accounts` / `GET /accounts/{uid}` — resumen de cuenta.
- `GET /accounts/{uid}/agents` / `GET /agents/{id}` — roster y detalle de build.
- `POST /accounts/{uid}/agents` + `PATCH /agents/{id}` + `DELETE /agents/{id}` — alta/edición/baja manual (incluye W-Engine y discos anidados; borrar un agente lo saca de los teams que lo usaban).
- `GET /accounts/{uid}/teams` + CRUD — team comps.
- `GET /catalog/agents|wengines|discs|properties` — id → nombre/icono/rareza desde los datos estáticos (para pickers y render).

## Frontend

- **Routing**: react-router-dom (los repos hermanos no usan router, pero acá las URLs compartibles por UID lo justifican): `/` (ingresar UID + cuentas recientes), `/account/:uid` (overview), `/account/:uid/agents` (roster en grilla), `/account/:uid/agents/:id` (build), `/account/:uid/teams`.
- **Cliente API**: extender el patrón de bazoooka con `post/patch/delete` y una clase `ApiError { status, detail }` para manejo tipado; tipos en `types.ts` espejando `schemas.py`.
- **Estado**: hooks simples (`useFetch`-style, patrón `{data, error, loading}` de `usePolling.ts` de bazoooka); sin Redux/Zustand hasta que duela.
- **Estilos**: CSS plano con tokens (patrón aventurero); sin Tailwind para mantener consistencia con el andamiaje elegido.

## Fases de implementación

1. **Scaffold backend**: pyproject completo (deps + `[tool.ruff]`, `[tool.mypy]` strict, `[tool.pytest.ini_options]` con `pythonpath = ["src"]`), app factory, settings, health router, DatabaseManager, test de humo. Checks verdes: `uv run pytest`, `uv run ruff check .`, `uv run mypy src`. Commit inicial (incluye CLAUDE.md/.gitignore/.claude ya existentes).
2. **Scaffold frontend**: Vite + React + TS, ESLint/Prettier/vitest, proxy `/api`, client + página Home mostrando `/health`. Checks verdes: `npm run build`, `lint`, `test`.
3. **Datos + Enka**: modelos SQLAlchemy, migración inicial de Alembic, `enka/client.py` + `mapper.py` + `static_data.py`, comando `sync-static`, servicio de sync, `POST /accounts` y `GET /accounts/{uid}`. Tests con fixtures JSON grabados (sin red).
4. **Roster y builds (API)**: endpoints de agents + catálogo con resolución de nombres/iconos.
5. **Frontend MVP**: Home con ingreso de UID, overview de cuenta, roster, detalle de agente con build completo.
6. **Teams**: CRUD backend + editor en frontend.
7. **Edición manual**: PATCH/POST de agents + formularios (crear agente no exhibido, corregir discos).
8. **Deploy (post-MVP)**: adaptar a Vercel — entrada serverless para FastAPI y migrar `database_url` a Postgres hosteado (Neon/Vercel Postgres); solo cambia la URL de SQLAlchemy + migraciones.

## Verificación

- Cada fase termina con el skill `/verify` en verde (pytest + ruff + mypy + build/lint/test del frontend).
- Tests de la integración Enka contra fixtures JSON grabados en `tests/fixtures/`; nunca red en CI.
- Prueba end-to-end manual al cerrar la fase 5: `uv run zzz-tracker serve` + `npm run dev`, cargar un UID real y verificar roster/builds contra el juego.
