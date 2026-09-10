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

## Lo que pasó después del MVP

Las fases 1 a 7 cerraron el 2026-08-06 y el plan de arriba queda como está: es lo que se
decidió y lo que se hizo. Lo que sigue es lo que vino después, que no estaba previsto cuando
se escribió y que hoy pesa más que la mitad del plan original.

**HoYoLAB entró como segunda fuente de datos** (`docs/HOYOLAB.md`). Enka sólo muestra los
agentes del showcase, y el Battle Chronicle muestra la cuenta entera: roster completo con sus
builds, bangboos, Shiyu Defense, Deadly Assault y Lost Void. Trajo cosas que el plan no tenía:
cookies de usuario guardadas cifradas, un ttl y un backoff propios (los tres murieron un mes
después, ver abajo), un mapper tolerante a dos versiones de esquema, y el `raw` de cada
respuesta guardado como válvula de escape. La regla de precedencia sigue siendo la misma
que la del plan, ampliada a tres fuentes: `manual` no se pisa nunca, y entre `enka` y
`hoyolab` gana el último en escribir.

**La extensión de navegador** (`docs/EXTENSION.md`) resolvió lo que el backend no podía: el
captcha de HoYoLAB es irresoluble headless y las IPs de datacenter se lo comen, así que el
camino pasó a ser leer HoYoLAB desde el navegador del usuario y subir los payloads crudos a
`POST /accounts/{uid}/chronicle/import`. El backend no sale a la red en ese camino y nunca ve
una cookie. Está implementada hasta las builds completas (`avatar/info`, incremental por
agente).

**Y el 2026-09-09 se borró el sync server-side entero**, que es el cambio más grande que le
pasó al proyecto después del MVP. Durante un mes convivieron los dos caminos; la decisión fue
quedarse con uno. Lo que se fue, y por qué vale escribirlo aunque ya no exista:

- `hoyolab/client.py`, `storage/crypto.py` y la tabla `hoyolab_credentials` — el tracker
  guardaba las cookies de HoYoLAB del usuario, con el `ltoken_v2` cifrado con Fernet bajo
  `ZZZ_CREDENTIALS_KEY`. Era el activo que más valía la pena robarse, y el único secreto
  obligatorio del deploy.
- El TTL (`ZZZ_HOYOLAB_SYNC_TTL_SECONDS`) y el **backoff** (`ZZZ_HOYOLAB_BACKOFF_SECONDS` +
  `accounts.chronicle_failed_at`), que existían para no convertir un rate limit o un captcha
  en una tormenta de reintentos, y la marca `rejected_at` para las cookies vencidas, que no
  mejoran esperando.
- `POST /accounts/{uid}/chronicle/sync`, los tres endpoints de `credentials` y los comandos
  `sync-chronicle`, `set-credentials` y `new-credentials-key`, con su cron diario en una
  máquina con IP residencial — porque desde Vercel el captcha era cuestión de tiempo.
- Cuatro errores de dominio que sólo levantaba ese cliente: `MissingCredentialsError`,
  `InvalidCredentialsError`, `DataNotPublicError` y `CaptchaRequiredError`.

El razonamiento, corto: sostener ese camino costaba una tabla de cookies ajenas, un secreto
obligatorio, dos ventanas de tiempo, un cron fuera del deploy y cuatro errores más, todo para
algo que en el mejor de los casos iba a fallar de a ratos y en el peor iba a filtrar sesiones
de HoYoLAB. **`hoyolab/mapper.py` y `build_mapper.py` se quedaron**: se fue lo que descarga, no
lo que interpreta, y esa mitad no cambió una línea.

**El rediseño New Eridu** (`docs/DESIGN.md`) reemplazó al CSS del andamiaje. La app dejó de ser
"CSS plano con tokens" a secas: hay trece reglas escritas, una piel en `styles/eridu.css`, un
juego de primitivas en `components/ui/` y un paquete `design-system/` (`zzz-ui`) del que la app
toma el botón base. `CLAUDE.md` engancha ese documento como lectura obligatoria antes de tocar
una pantalla.

**El modelo de propiedad** (`docs/OWNERSHIP.md`) corrige la decisión del 2026-08-05 que decía
"sin auth por ahora". Sigue sin haber login, pero ya no cualquiera escribe: leer es público y
escribir pide la key de la cuenta (`X-Account-Key`). La única forma de conseguir una es
importar el Chronicle de ese UID con la extensión; trackearlo desde la web no reclama nada,
porque escribir un número público en un formulario no dice de quién es la cuenta. El primero
que importa se queda con el UID y desde ahí manda la key: ningún import posterior la pisa.

Nació con tres niveles de reclamo y terminó con uno solo (`has_owner`, un booleano). Lo que
justificaba la complejidad era lo que había en juego —las cookies guardadas—, y cuando ese
camino se borró el peor caso pasó a ser "te ensucian datos de tracking". El modelo se achicó
para que coincida con lo que protege.

**CI** (`.github/workflows/ci.yml`) corre en cada push lo mismo que `/verify` —lint, formato,
tipos y tests de las dos mitades— más un job que aplica y revierte las migraciones contra
Postgres y comprueba que no haya deriva contra los modelos.

**La fase 8 está preparada, no ejecutada**: `vercel.json`, `api/index.py`, `.env.example` y los
estáticos de Enka versionados ya están en el repo, y los pasos exactos están en
`docs/DEPLOY.md`. Falta correrlos. Es un deploy bastante más simple que el que se veía venir en
agosto: sin sync server-side no hay secreto obligatorio que generar ni cron que hostear fuera
de Vercel, y el riesgo de captcha desde IPs de datacenter desapareció con el código que lo
corría. Lo que sí sigue: `sync-static` no puede correr allá —el filesystem es de sólo lectura—,
por eso los JSON de Enka viajan commiteados.

## Verificación

- Cada fase termina con el skill `/verify` en verde (pytest + ruff + mypy + build/lint/test del frontend).
- Tests de la integración Enka contra fixtures JSON grabados en `tests/fixtures/`; nunca red en CI.
- Prueba end-to-end manual al cerrar la fase 5: `uv run zzz-tracker serve` + `npm run dev`, cargar un UID real y verificar roster/builds contra el juego.
