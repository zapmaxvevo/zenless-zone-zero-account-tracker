# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zenless Zone Zero (ZZZ) account tracker: account info, character stats, builds, and team comps. Deployment target: Vercel.

Greenfield repo — the stack below is the intended setup. When scaffolding, match it; if a structural decision isn't covered here, follow the patterns in the sibling projects `../bazoooka` (backend) and `../aventurero` (frontend).

## Stack & structure

- **Backend**: Python 3.12+, FastAPI, managed with **uv** (`pyproject.toml` at repo root, code in `src/`, tests in `tests/`). Dev tools: ruff, mypy, pytest.
- **Frontend**: Vite + React + TypeScript in `frontend/`. Dev tools: ESLint, Prettier, vitest.

## Commands

Backend (repo root, always through uv):
- `uv run pytest` — tests
- `uv run ruff check .` and `uv run ruff format .` — lint / format
- `uv run mypy src` — type-check

Frontend (inside `frontend/`):
- `npm run dev` / `npm run build` — build runs `tsc -b && vite build`, so type errors fail the build
- `npm run lint` / `npm run format` / `npm run test`

## Conventions

- Add dependencies with `uv add` / `npm install`; never hand-edit lockfiles.
- Keep the backend API and the frontend strictly separated: the frontend talks to the backend over HTTP only, no shared code.
