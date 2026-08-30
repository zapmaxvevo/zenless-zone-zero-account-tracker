# Pendientes — ZZZ Account Tracker

Relevamiento del 2026-08-14, sobre la rama `design-system-sync`.
Actualizado el mismo día, después de bajar el diseño New Eridu.

Estado de los checks: `uv run pytest` 262 ✅, `uv run ruff check .` ✅, `uv run mypy src` ✅,
`npm run lint` ✅, `npm run build` ✅, `npm run test` 174 ✅. Nada está roto — lo que sigue son
huecos, no bugs.

Diagnóstico general: el backend se había adelantado al frontend; con el rediseño el frontend
lo alcanzó. Lo que queda es deploy, seguridad y deuda de duplicación.

## 1. El hueco de UI: cerrado

Resuelto el 2026-08-14 con la bajada del diseño New Eridu (ver `docs/DESIGN.md`).

- **HoYoLAB Chronicle ya tiene UI.** `frontend/src/api/client.ts` expone los seis endpoints
  (`storeCredentials`, `deleteCredentials`, `syncChronicle`, `listChallenges`, `listBangboos`,
  `getLostVoid`) y hay cuatro pantallas nuevas: Defensa Shiyu, Asalto Mortal, Vacío Perdido y
  Bangboos, más la de credenciales.
- **Los iconos se usan.** `lib/icons.ts` entra por `AgentCard`, `AgentPage` y `DiscCard`; el
  build ahora emite los PNG en `dist/assets/`.
- **Shiyu por capas se ve.** Los intentos se agrupan por capa y hay una fila con las siete,
  marcando las jugadas y sus estrellas.

Queda un hueco de contrato: no hay `GET /accounts/{uid}/credentials`, así que el frontend no
puede saber si una cuenta tiene credenciales guardadas y lo deduce de que no vuelva ningún dato.

## 2. Deploy (fase 8 del plan) sigue en cero

- No hay `vercel.json`, ni entrypoint serverless para FastAPI, ni `.env.example`.
- La base sigue en SQLite (`data/zzz.db`); falta migrar `ZZZ_DATABASE_URL` a Postgres
  hosteado (Neon / Vercel Postgres) y correr las migraciones ahí.
- **Es más complicado que cuando se escribió el plan**: `ZZZ_CREDENTIALS_KEY` (Fernet,
  ver `storage/crypto.py`) pasó a ser un secreto obligatorio para guardar credenciales, y
  las cookies de HoYoLAB desde IPs de Vercel tienen riesgo de captcha. Puede que el sync
  de Chronicle no pueda vivir en el serverless y tenga que quedar como job aparte
  (cron local, máquina propia).

## 3. El design system: adoptado a medias

- **Las fuentes ya cargan.** `frontend/index.html` trae Archivo Black, Chakra Petch e Inter, así
  que la app renderiza con la tipografía del diseño y no en `system-ui`.
- **La piel New Eridu vive en un solo lugar**: `frontend/src/styles/tokens.css` +
  `styles/eridu.css` (clases `.ne-*`) y las primitivas de `components/ui/`. La filosofía está
  escrita en `docs/DESIGN.md` y enganchada desde `CLAUDE.md`.
- **Falta todavía** consumir el paquete `zzz-ui` de `design-system/` en vez de mantener sus
  clases duplicadas a mano en `index.css` y `App.css`. Hoy los tokens están escritos dos veces
  (en `design-system/dist/zzz-ui.css` y en `styles/tokens.css`) y un cambio visual de los
  componentes base hay que hacerlo en los dos lados. Ver `.design-sync/NOTES.md`.

## 4. Más chicas, pero van a doler

- **Sin auth y ahora se guardan cookies de HoYoLAB.** Cualquiera que sepa un UID puede
  disparar `/accounts/{uid}/chronicle/sync` usando las credenciales guardadas de esa
  cuenta. En local da igual; publicado en Vercel, no. Decidir antes del deploy.
- **Docs desfasadas.** Ni `README.md` ni `docs/PLAN.md` mencionan HoYoLAB (existe
  `docs/HOYOLAB.md`, pero el plan sigue terminando en Enka + fase 8). El README tampoco
  documenta los comandos `new-credentials-key`, `set-credentials` ni `sync-chronicle`.
- **Sin CI.** No hay `.github/workflows`; `/verify` corre solo si uno se acuerda.
- **`design-system-sync` sin mergear**: 190 archivos por delante de `main`.

## Orden sugerido

1. Deploy (§2), decidiendo primero qué pasa con el sync de HoYoLAB y con la falta de auth.
2. Auth (§4) — ahora que hay UI para cargar credenciales de HoYoLAB, pesa más que antes.
3. Terminar de adoptar `zzz-ui` (§3) para dejar de mantener los tokens por duplicado.
