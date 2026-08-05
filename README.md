# ZZZ Tracker

Zenless Zone Zero account tracker: account info, agent roster, builds (W-Engine + drive discs)
and team comps.

- Backend: FastAPI + SQLAlchemy, managed with [uv](https://docs.astral.sh/uv/).
- Frontend: Vite + React + TypeScript (in `frontend/`).

See `docs/PLAN.md` for the development plan.

## Backend

```bash
uv sync                 # install dependencies
uv run zzz-tracker serve --reload
uv run pytest
uv run ruff check .
uv run mypy src
```

Configuration comes from environment variables prefixed with `ZZZ_` (or a `.env` file), e.g.
`ZZZ_DATABASE_URL`, `ZZZ_STATIC_DATA_DIR`, `ZZZ_ENKA_BASE_URL`.
