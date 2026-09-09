# Deploy — Vercel + Postgres

Fase 8 del plan. Lo que sigue son los pasos exactos, en orden, para publicar el tracker, y
la lista de lo que **no** vive en el serverless y por qué.

Requisito previo: el modelo de propiedad de `docs/OWNERSHIP.md` tiene que estar en la rama
que se publica. Sin eso las escrituras quedan abiertas a cualquiera que sepa un UID.

## La forma del deploy

Un solo proyecto de Vercel sirve las dos mitades:

| URL | Qué la atiende |
| --- | --- |
| `/assets/*`, `/index.html`, cualquier ruta del router | el estático de `frontend/dist` |
| `/api/*` | la función Python `api/index.py` |

`api/index.py` importa `create_app()` y le saca el prefijo `/api` al path antes de que la
app lo vea. Es la misma reescritura que hace hoy `frontend/vite.config.ts` en desarrollo, así
que `frontend/src/api/client.ts` usa una sola forma de URL (`const BASE = '/api'`) en los dos
entornos y no hay que tocar nada del cliente.

El ruteo está en `vercel.json`. La regla del SPA (`/((?!api/).*)` → `/index.html`) corre
**después** de buscar el archivo en el estático, así que un `/assets/index-abc.js` que existe
se sirve tal cual y solo las rutas del router caen en el `index.html`.

## Pasos

### 1. Crear la base

Neon, Supabase o Vercel Postgres, cualquiera sirve. Copiar la connection string **del host
pooleado** — en Neon es el que dice `-pooler`:

```
postgresql://usuario:clave@ep-xxx-pooler.region.aws.neon.tech/zzz?sslmode=require
```

Por qué el pooleado: la API son funciones serverless. Un contenedor atiende una request y
puede congelarse o morir enseguida, así que el tracker **no mantiene pool propio** contra
Postgres (`DatabaseManager._pool_args` usa `NullPool`); si lo hiciera, cada contenedor tibio
se quedaría con conexiones muertas y entre todos agotarían el límite del plan. El pool lo
pone el pgbouncer del proveedor.

`postgres://` y `postgresql://` se aceptan las dos: `normalize_database_url` les pone
`+psycopg` (psycopg 3, que es el driver que está en `pyproject.toml`; psycopg2 no está).

### 2. Generar la clave de credenciales

```bash
uv run zzz-tracker new-credentials-key
```

Imprime la clave Fernet por stdout. Es la que cifra las cookies de HoYoLAB guardadas en
`hoyolab_credentials`. **Guardala**: si cambia, todas las credenciales ya guardadas quedan
ilegibles y hay que volver a cargarlas.

### 3. Correr las migraciones contra la base nueva

Desde la máquina, **antes** del primer deploy. La app no migra sola al arrancar, a propósito:
varias funciones arrancando en frío a la vez se pisarían.

```bash
ZZZ_DATABASE_URL='postgresql://…?sslmode=require' uv run alembic upgrade head
```

Verificado contra Postgres 17: las seis migraciones aplican y revierten limpias, y
`alembic check` no detecta diferencia contra `storage/models.py`. El job `migrations` del CI
lo vuelve a comprobar en cada push.

Para migraciones futuras, el mismo comando; el `render_as_batch=True` de `alembic/env.py`
solo cambia el plan en SQLite, en Postgres emite el `ALTER TABLE` normal.

### 4. Cargar las variables en Vercel

En *Settings → Environment Variables*, para **Production** y **Preview**:

| Variable | Valor |
| --- | --- |
| `ZZZ_DATABASE_URL` | la connection string pooleada del paso 1 |
| `ZZZ_CREDENTIALS_KEY` | la clave del paso 2 |
| `ZZZ_API_TOKEN` | opcional; ver abajo |

Las demás tienen default razonable y están todas explicadas en `.env.example`.

`ZZZ_STATIC_DATA_DIR` **no se setea**: `api/index.py` la apunta sola a los archivos que
viajan en el deploy (paso 6).

`ZZZ_API_TOKEN` dejó de ser obligatorio con `docs/OWNERSHIP.md`. Vacío, el import de la
extensión queda protegido solo por la account key. Seteado, además exige el `Bearer` —
una reja extra para el deploy propio, nunca la única, porque un token que viaja adentro de
una extensión publicada no es secreto.

### 5. Importar el proyecto

Framework preset **Other**: `vercel.json` ya trae `installCommand`, `buildCommand` y
`outputDirectory`. Root directory, la raíz del repo (no `frontend/`).

Las dependencias de la función salen de `api/requirements.txt`, que es un export del
`uv.lock`. **Después de cualquier `uv add` hay que regenerarlo:**

```bash
uv export --no-dev --no-emit-project --no-hashes --format requirements-txt -o api/requirements.txt
```

### 6. Los datos estáticos de Enka viajan en el repo

`StaticData` lee cinco JSON (`avatars`, `weapons`, `equipments`, `property`, `locs`) para
traducir ids del juego a nombres e iconos. Sin ellos la app arranca igual —
`load_optional` devuelve `None`— pero el catálogo queda vacío y los agentes pierden nombre e
icono. Son ~530 KB en total.

El filesystem de Vercel es de solo lectura salvo `/tmp`, y `/tmp` no sobrevive entre
invocaciones: `zzz-tracker sync-static` no tiene dónde escribir allá. La salida menos mala,
y la que está implementada, es **versionarlos**: `.gitignore` sigue ignorando `data/` entera
salvo `data/static/*.json`, y `vercel.json` los mete en el bundle de la función con
`includeFiles`.

El costo es que se congelan en el commit. Cuando el juego suma agentes o W-Engines:

```bash
uv run zzz-tracker sync-static
git add data/static && git commit -m "Refresh Enka's static store files"
```

La alternativa —moverlos a una tabla— evitaría ese paso manual, pero pide migración, un
comando de carga y una lectura por request contra la base para algo que es un archivo
inmutable. No vale la pena hasta que el refresh moleste de verdad.

### 7. Deployar y comprobar

```bash
curl https://<proyecto>.vercel.app/api/health
# {"status":"ok","app":"ZZZ Tracker","version":"0.1.0"}

curl https://<proyecto>.vercel.app/api/catalog/agents | head -c 200
# si vuelve {"items":[]}, los estáticos no entraron en el bundle: mirar `includeFiles`
```

Y abrir la raíz, que tiene que servir la SPA y no un 404.

### 8. Reclamar las cuentas que ya existían

Las cuentas que ya estaban en la base quedan `unclaimed` y por lo tanto de solo lectura
(`docs/OWNERSHIP.md`, la migración no hace backfill). Una por una, apuntando a la base de
producción:

```bash
ZZZ_DATABASE_URL='postgresql://…' uv run zzz-tracker claim 1500123456
```

Imprime la key por stdout, **una sola vez**. Pegarla en la app desde la pantalla de
credenciales.

## Lo que queda afuera del serverless

### El sync de Chronicle

`POST /accounts/{uid}/chronicle/sync` existe y funciona en el deploy, pero **el cron no puede
vivir ahí**. Desde Vercel las peticiones salen de IPs de datacenter compartidas, que es
exactamente lo que dispara el captcha de HoYoLAB (geetest, retcodes 1034/10035/5003/10041) y
el rate limit. El captcha no se puede resolver headless: no hay plan B automático
(`docs/HOYOLAB.md`, *Captcha y Vercel*).

El deploy **no depende** de que ese sync corra: los 503/429 ya se tratan como estados
transitorios, el backoff frena los reintentos, y todo lo importado por la extensión o por
Enka sigue entrando igual.

El cron va en una máquina propia con IP residencial, apuntado a la base de producción:

```cron
17 4 * * * cd /srv/personal-zzz && ZZZ_DATABASE_URL='postgresql://…' ZZZ_CREDENTIALS_KEY='…' uv run zzz-tracker sync-chronicle >> /var/log/zzz-sync.log 2>&1
```

Sin UID recorre cada cuenta con credenciales usables y saltea las de cookies rechazadas. Sale
con 1 si alguna cuenta falló —eso es lo que debería alertar—; unas cookies vencidas salen por
stderr sin tocar el código de salida. Diario alcanza: las temporadas duran semanas.

No usar `--force` en el cron: es para depurar, y saltearse el TTL contra IPs compartidas es
la forma más rápida de comerse el captcha.

### Las migraciones

Manuales, paso 3. Nada las corre en el arranque.

### `sync-static`

Manual, paso 6.

## Riesgos que siguen abiertos

- **Captcha**: si el sync bajo demanda desde el navegador también empieza a comerse 503, la
  única salida es que el Chronicle entre por la extensión (que corre en la máquina del
  usuario, con su IP y su sesión) y dejar el endpoint de sync como cosa del cron local.
- **Estáticos congelados**: un agente nuevo del juego no aparece hasta que alguien corra
  `sync-static` y commitee.
- **Cold start**: cada función arranca sin pool, así que la primera query de una invocación
  paga el handshake TLS contra Postgres. Es el precio de no dejar conexiones colgadas; si
  molesta, la palanca es el pgbouncer del proveedor, no un pool en el proceso.
- **`ZZZ_CREDENTIALS_KEY` en el entorno de Vercel**: quien tenga acceso al proyecto puede
  leerla y con ella descifrar las cookies de HoYoLAB guardadas. Es el modelo que ya había en
  local; publicado, importa más quién entra al dashboard.
