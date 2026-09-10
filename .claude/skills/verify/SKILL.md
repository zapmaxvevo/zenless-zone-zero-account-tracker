---
name: verify
description: Run the full check suite for this repo — backend lint, type-check, and tests plus frontend and extension lint, type-check/build, and tests. Use after making changes to confirm nothing is broken, or when the user asks to verify/check the project.
---

Run every check that applies to the parts of the repo that exist. Skip a section silently if it isn't scaffolded yet (no `pyproject.toml` → skip backend; no `frontend/package.json` → skip frontend; no `extension/package.json` → skip extension), but say so in the summary.

## Backend (repo root)

1. `uv run ruff check .`
2. `uv run ruff format --check .`
3. `uv run mypy src api`
4. `uv run pytest`

## Frontend (in `frontend/`)

1. `npm run lint`
2. `npm run build` (runs `tsc -b`, catching type errors)
3. `npm run test`

## Extension (in `extension/`)

1. `npm run lint`
2. `npm run build` (runs `tsc --noEmit`, catching type errors)
3. `npm run test`

## Reporting

Run all checks even if an early one fails, then report a single summary: each check with pass/fail, and for failures the relevant error output. Do not fix anything unless the user asked for fixes — verification and fixing are separate steps.
