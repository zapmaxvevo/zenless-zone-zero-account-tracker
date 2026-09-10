# Orientación — volver al proyecto

Para el que abre este repo después de meses, o por primera vez. Quince minutos de lectura y
podés tocar algo sin romperlo.

## Qué es

Un tracker de cuentas de **Zenless Zone Zero**: info de la cuenta, roster de agentes, sus builds
(W-Engine + drive discs), team comps, y el progreso del Battle Chronicle (Shiyu Defense, Deadly
Assault, Lost Void, bangboos). Multi-UID y **sin login**.

Tres piezas: una app web, un backend, y una extensión de navegador. La extensión no es un extra:
es la única forma de que un dato de HoYoLAB entre al tracker.

## Las tres decisiones que explican todo lo demás

**1. El backend no le habla a HoYoLAB. Nunca.** No tiene cliente HTTP de HoYoLAB, no guarda
cookies, no tiene cron. El Battle Chronicle lo captura la extensión con la sesión que vos ya
tenés abierta en el navegador, y lo postea al backend. Eso saca del medio el activo que más valía
la pena robar (tus cookies), el riesgo de captcha desde las IPs de Vercel, y la mitad de la
complejidad del deploy. A Enka.Network sí lo consulta el backend, directo.

**2. No hay login, y no lo va a haber.** Lo que protege una cuenta es su **account key**: una por
UID, que el import de la extensión entrega **una sola vez** cuando reclama la cuenta. Leer es
público; escribir necesita la key en `X-Account-Key`. El detalle está en `docs/OWNERSHIP.md`.

**3. Enka manda valores base, no los que muestra el juego.** Es la trampa del dominio y está
documentada en [`06-DOMINIO.md`](06-DOMINIO.md). Si un número de disco te parece bajo, es esto.

## Cómo se levanta

Backend, desde la raíz:

```bash
uv sync
uv run alembic upgrade head       # crea el esquema (ZZZ_DATABASE_URL, o ./data/zzz.db)
uv run zzz-tracker sync-static    # baja las tablas id -> nombre/icono de Enka
uv run zzz-tracker serve --reload # http://127.0.0.1:8000
```

Frontend, en otra terminal:

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173, proxea /api al backend
```

Extensión, si la vas a tocar:

```bash
cd extension && npm install && npm run dev
```

## Los comandos que vas a usar

| | |
| --- | --- |
| `/verify` | Corre **todo**: lint, tipos y tests de las tres mitades. Es lo primero antes de dar algo por terminado. |
| `uv run pytest` | Tests del backend. |
| `uv run ruff check .` · `uv run ruff format .` | Lint y formato. |
| `uv run mypy src api` | Tipos, en modo `strict`. |
| `cd frontend && npm run test` · `npm run build` | El build corre `tsc -b`, así que un error de tipos rompe el build. |
| `cd extension && npm run test` · `npm run build` | |
| `uv run zzz-tracker claim <uid>` · `rotate-key <uid>` | Reclamar una cuenta o reemitir su key desde el servidor. |

CI corre lo mismo en cada push, más un job que aplica y revierte las migraciones contra Postgres
y chequea que no haya deriva contra los modelos.

## En qué estado está

El MVP está cerrado: las cuatro features (cuenta, roster, builds, teams) andan, más el Chronicle
completo y el modelo de propiedad. La suite está verde en las tres mitades.

**Lo que falta es publicar.** Es la fase 8 del plan y ya no es código: son pasos con credenciales
en Vercel y Postgres, escritos uno por uno en `docs/DEPLOY.md`.

Lo demás que sigue abierto está en `docs/PENDIENTES.md`. Ojo con ese archivo y con `docs/PLAN.md`:
son historia y planes, no describen necesariamente el presente.

## Lo que se borró, y por qué te lo cuento

Si buscás algo que juraría que existía y no está, probablemente sea esto: **el sync server-side de
HoYoLAB**. Se borraron el cliente HTTP, la tabla `hoyolab_credentials`, el cifrado Fernet de las
cookies, el TTL, el backoff, el cron y tres comandos de CLI. Fue el 2026-09-09, y el porqué está
en `docs/HOYOLAB.md`. No lo revivas sin leer eso primero.

## Por dónde seguir

| Vas a… | Leé |
| --- | --- |
| entender cómo encaja todo | [`02-ARQUITECTURA.md`](02-ARQUITECTURA.md) |
| tocar el import o el sync | [`03-FLUJO-DE-DATOS.md`](03-FLUJO-DE-DATOS.md) |
| agregar una tabla o una columna | [`04-MODELO-DE-DATOS.md`](04-MODELO-DE-DATOS.md) |
| agregar o cambiar un endpoint | [`05-CONTRATO-API.md`](05-CONTRATO-API.md) |
| entender un número del juego | [`06-DOMINIO.md`](06-DOMINIO.md) |
| **cambiar algo que te parece mal hecho** | [`07-NOTAS-PARA-IA.md`](07-NOTAS-PARA-IA.md) — puede ser deliberado |
| buscar una carpeta | [`08-MAPA-DEL-REPO.md`](08-MAPA-DEL-REPO.md) |
| tocar **cualquier** pantalla | `docs/DESIGN.md`, entero, antes de escribir una línea |
