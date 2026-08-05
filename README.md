# ZZZ Tracker

Zenless Zone Zero account tracker: account info, agent roster, builds (W-Engine + drive discs)
and team comps.

- Backend: FastAPI + SQLAlchemy, managed with [uv](https://docs.astral.sh/uv/).
- Frontend: Vite + React + TypeScript (in `frontend/`).

See `docs/PLAN.md` for the development plan.

## Backend

First run:

```bash
uv sync                       # install dependencies
uv run alembic upgrade head   # create the schema (ZZZ_DATABASE_URL, or ./data/zzz.db)
uv run zzz-tracker sync-static # download Enka's id -> name/icon tables into ./data/static
uv run zzz-tracker serve --reload
```

Day to day:

```bash
uv run pytest
uv run ruff check . && uv run ruff format .
uv run mypy src
```

Configuration comes from environment variables prefixed with `ZZZ_` (or a `.env` file):
`ZZZ_DATABASE_URL`, `ZZZ_STATIC_DATA_DIR`, `ZZZ_ENKA_BASE_URL`. Alembic reads
`ZZZ_DATABASE_URL` too, falling back to the URL in `alembic.ini`.

### Enka.Network integration

`POST /accounts {"uid": "..."}` imports an account from
[Enka.Network](https://enka.network/api/zzz), and `POST /accounts/{uid}/sync` refreshes it.
Enka only exposes the agents the player put in their showcase, so the import is deliberately
additive:

- The `ttl` Enka reports is honoured — a sync inside that window reuses what is stored unless
  `?force=true` is passed.
- Agents whose `source` is `manual` are never overwritten by a sync.
- Agents that disappear from the showcase are kept, not deleted.

Ids in the API responses (agents, W-Engines, disc sets, stat properties) are resolved to names
and icons from the files `sync-static` downloads. The app still runs without them; those fields
simply stay unresolved.
