---
description: React + TypeScript coding standards for the frontend
paths:
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
---

# Frontend (React + TypeScript) standards

<!-- ADAPTAR: `paths:` si el frontend no vive en frontend/, y la sección de integración con Django si el proyecto no la usa. -->

React + Vite + strict TypeScript. `eslint --fix` runs automatically on save (PostToolUse hook); also `npm run lint` from `frontend/`.

> Note: if a global skill recommends Tailwind/CSS modules — **this setup does NOT use them.** Follow the patterns below.

## Structure
- **Feature-based:** `features/<name>/{components,hooks,types,utils,styles,assets}`, plus `shared/` (reusable `ui/`, `hooks/`, `utils/`, `styles/`, `assets/`), `app/` (shell/config), and `mounts/` (backend entry points).
- Keep features isolated; no cross-feature imports — share via `shared/`.

## Components & exports
- **Function components + hooks only.**
- Components are **default exports**, files in **PascalCase** (e.g. `ChatMessageBubble.tsx`).
- Hooks/utilities are **named exports**; hooks are `use`-prefixed in `hooks/` (e.g. `useChatMessages`).
- Props typed as an `interface` with a **`Props` suffix**, destructured in the signature.

## TypeScript
- `strict: true`. Use **discriminated-union types** for state (`type LoadState = "idle" | "loading" | "loaded" | "error"`).
- Use **`import type`** for type-only imports.
- **Double quotes** and **semicolons** (note: opposite of the Python side).
- **FORBIDDEN TO WRITE COMMENTS** YOU WILL BE PUNISHED. DO NOT WRITE COMMENTS UNLESS SPECIFICALLY REQUESTED.

## Styling
- Inline **`CSSProperties` objects** exported from the feature's `styles/index.ts`. No Tailwind, no CSS modules, no styled-components.

## React ↔ Django integration (if the project mounts React inside Django templates)
- Mount React into Django templates via generic `mount()` / `mountFromDataset()` helpers (`app/mount.tsx`), called from `mounts/*.ts` on `DOMContentLoaded`.
- `npm run build` emits into the Django static dir (e.g. `static/react/`) with a `manifest.json` that Django templates consume.
