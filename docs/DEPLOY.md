# Deploy — Vercel + Postgres

Fase 8 del plan. Lo que sigue son los pasos exactos, en orden, para publicar el tracker, y
la lista de lo que **no** vive en el serverless y por qué.

Requisito previo: el modelo de propiedad de `docs/OWNERSHIP.md` tiene que estar en la rama
que se publica. Sin eso las escrituras quedan abiertas a cualquiera que sepa un UID.

Lo que hace este deploy simple es una decisión que se tomó antes que él: **el servidor no le
habla a HoYoLAB.** No guarda cookies, no sincroniza nada por su cuenta, no tiene cliente
HTTP contra HoYoLAB. El Battle Chronicle llega como un paquete que capturó la extensión en
el navegador del dueño y le posteó al tracker. De ahí que no haya ningún secreto obligatorio
que generar, ni cron, ni riesgo de captcha desde las IPs de Vercel.

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

## La extensión es la única puerta de entrada

Conviene entenderlo antes de empezar, porque cambia qué significa "está deployado".

Reclamar una cuenta se hace de una sola forma: **importando su Chronicle con la extensión**.
Escribir un UID en la web lo empieza a trackear pero no lo reclama y no devuelve ninguna key
(`docs/OWNERSHIP.md`, *El único reclamo*). Y sin la key de un UID, ese UID se puede **mirar
pero no editar nunca**: ni agentes, ni teams, ni nada.

O sea que un deploy sin extensión instalada es un tracker de solo lectura. El paso 8 —
apuntar la extensión al dominio nuevo— no es una comodidad al final de la lista: sin él el
sitio publicado no sirve para nada más que mirar lo que ya tiene.

La única excepción es el CLI, que exige acceso a la base: `zzz-tracker claim <uid>` reclama
sin pasar por la extensión, y es lo que resuelve el paso 7.

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

### 2. Correr las migraciones contra la base nueva

Desde la máquina, **antes** del primer deploy. La app no migra sola al arrancar, a propósito:
varias funciones arrancando en frío a la vez se pisarían.

```bash
ZZZ_DATABASE_URL='postgresql://…?sslmode=require' uv run alembic upgrade head
```

Verificado contra Postgres 17: las siete migraciones aplican y revierten limpias, y
`alembic check` no detecta diferencia contra `storage/models.py`. El job `migrations` del CI
lo vuelve a comprobar en cada push.

La última, `0007_drop_hoyolab_credentials`, es la que completa el cambio de rumbo: dropea la
tabla `hoyolab_credentials` y lo que colgaba del sync que ya no existe. En una base nueva no
se nota; sobre una base que ya venía andando, **borra las cookies guardadas**, que es
exactamente el punto.

Para migraciones futuras, el mismo comando; el `render_as_batch=True` de `alembic/env.py`
solo cambia el plan en SQLite, en Postgres emite el `ALTER TABLE` normal.

### 3. Cargar las variables en Vercel

En *Settings → Environment Variables*, para **Production** y **Preview**. Son pocas: la única
obligatoria es la base.

| Variable | Qué poner |
| --- | --- |
| `ZZZ_DATABASE_URL` | **obligatoria** — la connection string pooleada del paso 1 |
| `ZZZ_API_TOKEN` | opcional; ver abajo |
| `ZZZ_STATIC_DATA_DIR` | **no la setees** — `api/index.py` la apunta sola a los archivos que viajan en el deploy (paso 5) |
| `ZZZ_ENKA_BASE_URL` | dejarla sin setear salvo que apuntes a un mock |
| `ZZZ_APP_NAME` | dejarla sin setear; solo es el título del OpenAPI |

Ésa es la lista completa: `config.py::Settings` no tiene más campos, y `.env.example` las
explica una por una con sus defaults. **No hay ningún secreto obligatorio que generar** — el
`ZZZ_CREDENTIALS_KEY` que pedía este runbook desapareció junto con las cookies guardadas.

`ZZZ_API_TOKEN` es la única reja opcional que queda, y sigue en pie. Vacío, el import de la
extensión lo gobiernan solo las reglas de propiedad: reclama una cuenta libre, y contra una
que ya tiene dueño exige su key. Seteado, además exige el `Bearer` — una reja extra para el
deploy propio, nunca la única, porque un token que viaja adentro de una extensión publicada
no es secreto. Si lo seteás, acordate de cargarlo también en las opciones de la extensión
(paso 8).

### 4. Importar el proyecto

Framework preset **Other**: `vercel.json` ya trae `installCommand`, `buildCommand` y
`outputDirectory`. Root directory, la raíz del repo (no `frontend/`).

Las dependencias de la función salen de `api/requirements.txt`, que es un export del
`uv.lock`. **Después de cualquier `uv add` hay que regenerarlo:**

```bash
uv export --no-dev --no-emit-project --no-hashes --format requirements-txt -o api/requirements.txt
```

### 5. Los datos estáticos de Enka viajan en el repo

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

### 6. Deployar y comprobar

```bash
curl https://<proyecto>.vercel.app/api/health
# {"status":"ok","app":"ZZZ Tracker","version":"0.1.0"}

curl https://<proyecto>.vercel.app/api/catalog/agents | head -c 200
# si vuelve {"items":[]}, los estáticos no entraron en el bundle: mirar `includeFiles`
```

Y abrir la raíz, que tiene que servir la SPA y no un 404.

Para comprobar que una key sirve contra el deploy —después del paso 7, o cuando la pegaste
en otra máquina— hay una lectura que valida sin escribir nada:

```bash
curl -i -H 'X-Account-Key: zzk_…' https://<proyecto>.vercel.app/api/accounts/1500123456/ownership
# 204 la key es la de ese UID · 403 falta o es de otra cuenta
# 409 unclaimed_account · 404 el UID no está trackeado
```

El status *es* la respuesta: no devuelve la key ni un pedazo de ella.

Si algo sale mal, el cuerpo del error lo dice en dos mitades: `{"detail": "…", "code": "…"}`.
El `detail` es para leerlo y el `code` es el nombre estable del error (`errors.py`), que es lo
que conviene citar al diagnosticar porque las palabras del `detail` pueden cambiar. Los que
más van a aparecer recién deployado: `static_data_unavailable` (paso 5), `unclaimed_account`
(paso 7) y `forbidden` (falta el `X-Account-Key`).

### 7. Reclamar las cuentas que ya existían

Las cuentas que ya estaban en la base quedan sin dueño y por lo tanto de solo lectura
(`docs/OWNERSHIP.md`, la migración no hace backfill). Hay dos salidas y conviene elegir a
conciencia:

- **Importar su Chronicle con la extensión** (paso 8). Es el camino normal, y el que reclama
  la cuenta y devuelve la key sin tocar el servidor.
- **`zzz-tracker claim <uid>`**, que reclama sin pasar por la extensión. Pide acceso a la
  base, así que se corre desde la máquina, apuntando a producción:

```bash
ZZZ_DATABASE_URL='postgresql://…' uv run zzz-tracker claim 1500123456
```

Imprime la key por stdout, **una sola vez**. Pegarla en la app en
`/account/<uid>/key`, que la valida contra `/ownership` en el momento en vez de dejarte
descubrir el error al primer guardado.

`claim` se niega sobre una cuenta que ya tiene dueño. Perder la key de una cuenta reclamada
se arregla solo desde acá, con acceso a la base —reimportar ya no la recupera, porque un
bundle lo arma el cliente entero y no prueba nada—:

```bash
ZZZ_DATABASE_URL='postgresql://…' uv run zzz-tracker rotate-key 1500123456
```

Invalida la key anterior en el acto: todo lo que la estuviera usando (un navegador, la
extensión en otra máquina) necesita la nueva.

### 8. Apuntar la extensión al dominio nuevo

La extensión **no** se deploya con el resto: se instala unpacked en cada navegador y se
construye a mano. Cómo se instala, cómo se configura y cómo funciona la key está todo en
`extension/README.md`; acá va sólo lo que cambia por tener un dominio público. Y no es un
paso opcional: es la única forma de reclamar un UID sin acceso a la base.

**Primero, el manifest.** `extension/wxt.config.ts` declara en `host_permissions` el tracker
local y `https://personal-zzz.vercel.app/*`, que se escribió como placeholder antes de que
existiera el deploy. Si el proyecto de Vercel se llama distinto, hay que reemplazar esa línea
por el dominio real; sin eso la extensión no puede hablarle al backend y el import falla con
"No se pudo conectar con el tracker", que no dice que el problema es un permiso.

Dos cosas que conviene saber antes de editarlo:

- Los `host_permissions` **no aceptan comodín de subdominio útil** para los deploys de
  preview: cada rama recibe un `<proyecto>-<hash>-<scope>.vercel.app` distinto, así que sólo
  el dominio de producción (o uno propio) sirve como destino estable. Para probar contra un
  preview hay que agregar ese host a mano y rebuildear.
- Conviene dejar `http://127.0.0.1:8000/*` donde está: es lo que permite seguir usando la
  misma instalación contra el backend local.

**Después, rebuild y recarga.** Editar el manifest no alcanza, hay que reconstruir y volver a
cargar la extensión:

```bash
cd extension
npm run build           # Chrome  → .output/chrome-mv3
npm run build:firefox   # Firefox → .output/firefox-mv3
```

En Chrome, `chrome://extensions` → *Recargar* en la extensión. En Firefox el temporary add-on
se vuelve a cargar desde `about:debugging`, y además hay que **habilitar el permiso del
dominio nuevo** en `about:addons` → *Permissions*: en Firefox MV3 los `host_permissions` son
opcionales y no se conceden solos.

**Por último, las opciones.** Son dos URLs distintas y las dos apuntan al mismo dominio, que
es lo que confunde: acá el backend y el frontend viven juntos.

| Campo | Valor en el deploy |
| --- | --- |
| URL del tracker | `https://<proyecto>.vercel.app/api` |
| URL del frontend del tracker | `https://<proyecto>.vercel.app` |
| Token de la API | el `ZZZ_API_TOKEN` del paso 3, o vacío si no lo seteaste |

El `/api` de la primera es el prefijo del ruteo de Vercel; sin él la extensión pega contra la
SPA y recibe HTML donde espera JSON. La segunda es la base del link "Ver la cuenta en el
tracker" (`/account/<uid>`) y va **sin** `/api`.

## Lo que queda afuera del serverless

Poco, desde que el backend dejó de hablarle a HoYoLAB. Lo que queda son las dos tareas que
necesitan la base o el repo, no una request.

### Las migraciones

Manuales, paso 2. Nada las corre en el arranque.

### `sync-static`

Manual, paso 5. Escribe archivos, y en Vercel no hay dónde.

### Reclamar y recuperar cuentas por CLI

`zzz-tracker claim` y `zzz-tracker rotate-key` (paso 7) exigen acceso a la base a propósito:
son la vía de escape cuando la extensión no alcanza, y esa vía tiene que costar más que
abrir el navegador.

**Lo que ya no está acá**: el cron de `sync-chronicle`. No se movió a otro lado — dejó de
existir. El backend no tiene cliente de HoYoLAB, no guarda cookies y no hay ningún
`POST /chronicle/sync` que un cron pudiera llamar. Todo lo de HoYoLAB entra a mano, desde la
extensión, cuando el dueño aprieta *Importar*.

## Riesgos que siguen abiertos

- **La extensión es un punto único de fallo.** Es la única puerta para reclamar un UID y la
  única para traer Chronicle. Si se rompe contra un cambio de HoYoLAB, el deploy sigue de
  pie pero nadie reclama nada nuevo; el escape es `zzz-tracker claim` con acceso a la base.
- **El dominio de la extensión está hardcodeado**: vive en `extension/wxt.config.ts`, no en
  las opciones, así que cambiar de dominio (o de proyecto de Vercel) obliga a editar,
  rebuildear y recargar la extensión en cada navegador donde esté instalada. Los deploys de
  preview quedan fuera del manifest por definición (paso 8).
- **Estáticos congelados**: un agente nuevo del juego no aparece hasta que alguien corra
  `sync-static` y commitee.
- **Cold start**: cada función arranca sin pool, así que la primera query de una invocación
  paga el handshake TLS contra Postgres. Es el precio de no dejar conexiones colgadas; si
  molesta, la palanca es el pgbouncer del proveedor, no un pool en el proceso.
- **Nada de esto corrió todavía contra Vercel.** `vercel.json` y `api/index.py` están
  probados en local —el ruteo con el prefijo `/api`, los estáticos, Postgres— pero el
  proyecto nunca se publicó. Lo más frágil es el glob de `includeFiles`: si la función
  arranca pero el catálogo vuelve vacío o falla el import de `zzz_tracker`, es ahí.

Dos riesgos que este documento listaba y **ya no aplican**, para que nadie los vuelva a
buscar: el captcha de HoYoLAB desde las IPs de datacenter de Vercel (el backend nunca sale a
HoYoLAB) y la clave Fernet en el entorno de Vercel (no hay cookies que cifrar, y la variable
no existe).
