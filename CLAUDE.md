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

## Design

The app's look is the **New Eridu** design system. **Read `docs/DESIGN.md` in full before building or
changing any screen** — it is the source of truth, not a suggestion. Its thirteen rules cover the three
typefaces and their jobs, the three canonical angles, the cut corner, the background hierarchy,
watermarks, when accent yellow is allowed, colour-from-domain, the section header, density, the portrait
card, empty/error states, responsive behaviour and the scanline overlay.

Where things live:

- `frontend/src/styles/tokens.css` — colours, fonts, gradients, angles, chamfers
- `frontend/src/styles/eridu.css` — every `.ne-*` class; **new shapes go here**, never inline in a screen
- `frontend/src/components/ui/` — `AppShell`, `Hero`, `SectionHead`, `Tile`, `PortraitCard`, `Face`, `Banner`, `IconTag`
- `frontend/src/lib/palette.ts` — colour by element / rank / grade; never hardcode a hex in a screen
- `frontend/src/lib/icons.ts` — game icons by element / specialty / rank / skill; element and
  specialty are shown as icons, never as their written name
- `frontend/src/lib/score.ts` — the build-score model the design's hierarchy is built on
- `design-system/` — the synced `zzz-ui` base package (buttons, inputs, tags); the New Eridu skin sits on top
