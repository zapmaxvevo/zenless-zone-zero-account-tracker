# Contrato de la API

Los endpoints que expone el backend, quién puede llamar a cada uno, con qué códigos falla y cómo
se sirve la misma URL en desarrollo y en producción. Leelo antes de agregar un endpoint, antes de
cambiar un `code` de error y antes de escribir un cliente nuevo.

Fuentes: `src/zzz_tracker/web/routers/`, `src/zzz_tracker/web/deps.py`,
`src/zzz_tracker/errors.py`, y `frontend/src/api/client.ts` como consumidor de referencia.

---

## 1. Endpoints

"Público" significa que no hace falta ningún header. "Key" significa `X-Account-Key` con la key
**de esa cuenta** (para `/agents/{id}` y `/teams/{id}`, la de la cuenta a la que pertenece el
recurso, que el backend resuelve leyendo la fila).

### Cuentas

| Método | Ruta | Qué hace | Quién | Devuelve |
|---|---|---|---|---|
| `POST` | `/accounts` | Empieza a rastrear un UID, importando lo que Enka exponga | público | `201` `AccountRead` |
| `GET` | `/accounts` | Todas las cuentas rastreadas | público | `AccountListResponse` |
| `GET` | `/accounts/{uid}` | Una cuenta | público | `AccountRead` |
| `GET` | `/accounts/{uid}/ownership` | Pregunta si la key que tenés es la de esta cuenta. No cambia nada | key | `204`, sin cuerpo |
| `POST` | `/accounts/{uid}/sync` | Reimporta desde Enka. `?force=true` ignora el ttl | público | `AccountRead` |

`GET /accounts/{uid}/ownership` no devuelve la key ni parte de ella: **el status es la respuesta**.
`204` = sí; `403` = no; `409` = la cuenta no tiene dueño; `404` = no está rastreada.

> **Observación:** `POST /accounts/{uid}/sync` **no tiene guard de key** — no lleva
> `dependencies=[Depends(require_account_key)]`. Cualquiera puede pedir un refresh desde Enka de
> cualquier UID rastreado. El frontend igual manda la key (`api.syncAccount` pasa el `uid` como
> owner), pero el backend no la mira. No escribe nada que el usuario elija: sólo repite lo que
> Enka ya publica.

### Agentes

| Método | Ruta | Qué hace | Quién | Devuelve |
|---|---|---|---|---|
| `GET` | `/accounts/{uid}/agents` | El roster de la cuenta | público | `AgentListResponse` |
| `POST` | `/accounts/{uid}/agents` | Agrega un agente a mano, con su build | key | `201` `AgentDetailRead` |
| `GET` | `/agents/{agent_id}` | Un agente con la build entera: W-Engine, discos y sets equipados | público | `AgentDetailRead` |
| `PATCH` | `/agents/{agent_id}` | Corrige un agente. **El W-Engine y los discos se reemplazan, no se mergean** | key | `AgentDetailRead` |
| `DELETE` | `/agents/{agent_id}` | Deja de rastrearlo y libera el slot que ocupara en algún equipo | key | `204` |

Los ids de agente son **globales**: no nombran ningún UID. Por eso el guard es
`require_agent_owner_key`, que primero lee la fila para saber de qué cuenta es. Preguntar "¿esta
persona tiene *una* key válida?" no serviría: reclamar un UID vacío es gratis.

Cualquier escritura por esta puerta marca al agente como `manual`, y desde entonces ningún sync
lo pisa (`04-MODELO-DE-DATOS.md`, §4.1).

### Equipos

| Método | Ruta | Qué hace | Quién | Devuelve |
|---|---|---|---|---|
| `GET` | `/accounts/{uid}/teams` | Las comps de la cuenta | público | `TeamListResponse` |
| `POST` | `/accounts/{uid}/teams` | Guarda una comp. Todos los miembros tienen que ser agentes de esa misma cuenta | key | `201` `TeamRead` |
| `GET` | `/teams/{team_id}` | Una comp | público | `TeamRead` |
| `PUT` | `/teams/{team_id}` | Reemplaza la comp entera: nombre, notas y miembros | key | `TeamRead` |
| `DELETE` | `/teams/{team_id}` | Borra la comp; los agentes siguen rastreados | key | `204` |

`POST` y `PUT` llevan siempre la comp completa. Editar un solo slot es mandar los tres miembros de
nuevo. Los miembros vuelven con el agente ya resuelto (nombre, icono, W-Engine), la misma forma
que sirve el roster.

### Chronicle

| Método | Ruta | Qué hace | Quién | Devuelve |
|---|---|---|---|---|
| `POST` | `/accounts/{uid}/chronicle/import` | Guarda un bundle capturado en el navegador; rastrea el UID si es nuevo | `Bearer` si está configurado + key si la cuenta ya tiene dueño | `ChronicleImportResponse` |
| `GET` | `/accounts/{uid}/challenges` | Temporadas de Shiyu Defense / Deadly Assault. `?mode=shiyu_defense\|deadly_assault` filtra | público | `ChallengeRunListResponse` |
| `GET` | `/accounts/{uid}/bangboos` | Los bangboos de la cuenta | público | `BangbooListResponse` |
| `GET` | `/accounts/{uid}/lost-void` | Progreso de Lost Void. `404` si nunca se importó | público | `LostVoidRead` |

El import es **la única puerta por la que entran datos de HoYoLAB** y la única por la que una
cuenta consigue dueño. Su regla de acceso no está en un `Depends` sino adentro del servicio
(`ChronicleImporter._ensure_import_allowed`), porque depende de si la cuenta ya tiene dueño:

- cuenta sin dueño → pasa sin key, la reclama, y `account_key` viene en la respuesta **esa única
  vez**;
- cuenta con dueño → hace falta su `X-Account-Key`; sin él, `403`, y `account_key` vuelve `null`.

Un bundle no prueba nada por sí solo: cada byte lo elige quien lo manda, el UID incluido, y un UID
es público. Detalle en `06-DOMINIO.md` y en `docs/OWNERSHIP.md`.

`ChronicleImportResponse` informa además qué entró y qué no: `agents_synced`, `bangboos_synced`,
`builds_synced`, `lost_void_synced`, `unavailable_modes` y `skipped_sections` (las secciones que
el bundle no traía; `record_card` nunca se reporta como saltada porque su ausencia es normal).

### Catálogo

| Método | Ruta | Qué hace | Quién | Devuelve |
|---|---|---|---|---|
| `GET` | `/catalog/agents` | Todos los agentes que conoce el juego | público | `CatalogListResponse[CatalogAgentRead]` |
| `GET` | `/catalog/wengines` | Todos los W-Engines | público | `CatalogListResponse[CatalogWEngineRead]` |
| `GET` | `/catalog/discs` | Todos los sets de discos, con su bonus | público | `CatalogListResponse[CatalogDiscSetRead]` |
| `GET` | `/catalog/properties` | Las props de stat que tienen nombre | público | `CatalogListResponse[CatalogPropertyRead]` |

Sin los datos estáticos bajados (`zzz-tracker sync-static`) el catálogo contesta **`503`, no una
lista vacía**. Los endpoints de agentes sí contestan sin ellos: lo que el jugador tiene vale la
pena mostrarlo aunque los nombres vengan en `null`.

### Salud

| Método | Ruta | Quién | Devuelve |
|---|---|---|---|
| `GET` | `/health` | público | `HealthResponse` (`status`, `app`, `version`) |

---

## 2. Códigos de error

Todo error de dominio contesta el mismo cuerpo:

```json
{ "detail": "…", "code": "…" }
```

| `code` | Status | Qué significa | Cuándo lo vas a ver |
|---|---|---|---|
| `not_found` | 404 | El recurso no existe | UID no rastreado, agente o equipo inexistente, cuenta sin Lost Void importado |
| `conflict` | 409 | **Eso ya existe** | `POST /accounts/{uid}/agents` con un `game_id` que la cuenta ya rastrea; `claim` sobre una cuenta que ya tiene dueño |
| `unclaimed_account` | 409 | **Esa cuenta todavía no tiene dueño** | Cualquier escritura guardada sobre una cuenta sin `AccountKey`. No hay key que puedas mandar: no se emitió ninguna |
| `validation_error` | 422 | El pedido está bien formado pero rompe una regla del dominio | Slot de disco repetido, agente de otra cuenta en un equipo, bundle cuyo UID no coincide con el de la ruta, UID chino |
| `unauthorized` | 401 | Falta el token compartido | Sólo si el operador configuró `ZZZ_API_TOKEN` y el import llegó sin `Authorization: Bearer` |
| `forbidden` | 403 | La cuenta tiene dueño y esta key no es la suya | Escritura con `X-Account-Key` ausente o equivocada |
| `rate_limited` | 429 | Enka limitó la consulta | Durante un sync |
| `external_service_error` | 502 | Enka falló | Durante un sync |
| `static_data_unavailable` | 503 | Faltan los datos estáticos de Enka | Cualquier endpoint de `/catalog` |
| `internal_error` | 500 | Error no clasificado | Es el default de la clase base `ZZZTrackerError` |

### Por qué 409 aparece dos veces

Porque son dos preguntas distintas y confundirlas manda al usuario a buscar algo que no existe:

- **`conflict`** — "eso ya está". Hay algo ahí y no lo podés crear de nuevo. La salida es editar
  lo que ya existe.
- **`unclaimed_account`** — "esta cuenta no tiene dueño todavía". No es que tu key esté mal: es
  que **nunca se emitió ninguna key para este UID**. La salida es importar la cuenta con la
  extensión, que la reclama y devuelve su key.

Y `unclaimed_account` tampoco es `forbidden`. `403` dice "existe una key y no es la tuya"; `409
unclaimed_account` dice "no hay key". El frontend les da mensajes distintos justamente por eso
(`FORBIDDEN_MESSAGE`, `WRONG_KEY_MESSAGE`, `UNCLAIMED_MESSAGE` en `frontend/src/api/errors.ts`).

### Por qué el cliente branchea por `code` y nunca por `detail`

- El **`code` es contrato**. Renombrarlo rompe a todos los clientes, y `tests/test_errors.py`
  pinea cada uno. Un error nuevo se agrega con un `code` nuevo; uno existente no se renombra.
- El **`detail` es para una persona**. Se puede reescribir sin avisar, y de hecho se reescribe:
  varios `detail` traen instrucciones concretas (`zzz-tracker rotate-key <uid>`) que cambian
  cuando cambia el comando.
- El **status solo no alcanza**: 409 es a la vez `conflict` y `unclaimed_account`, y esos dos
  casos llevan al usuario a lugares opuestos.

Así lo consume el frontend: `ApiError` guarda `status`, `detail` y `code`; `errors.ts` mapea
primero por `code` (`MESSAGES_BY_CODE`) y sólo cae al `status` cuando no hay `code` conocido.
`ApiError.sentKey` recuerda si la request llevó key, que es lo que separa "no tengo la key" de
"mandé la key equivocada" ante el mismo `403`.

> **Límite conocido:** los `422` que genera **FastAPI** por validación de forma (un `uid` que no
> matchea `^\d{6,16}$`, un campo con el tipo mal) **no traen `code`**: su `detail` es la lista de
> errores de pydantic. `extractCode` devuelve `null` y el cliente cae al mensaje por status. Sólo
> los `422` que levanta el dominio (`ValidationError`) traen `code: "validation_error"`.

---

## 3. Headers

### `X-Account-Key`

La key que prueba propiedad. La devuelve el import que reclama la cuenta —una sola vez, en
`ChronicleImportResponse.account_key`— o el CLI (`zzz-tracker claim`, `zzz-tracker rotate-key`).
Hace falta para **escribir**; para leer, nunca.

El formato es `zzk_` + 43 caracteres url-safe. El backend guarda sólo su sha256, así que la key en
claro vive únicamente donde la guardó el usuario. El frontend la guarda por UID en el navegador
(`frontend/src/lib/accountKey.ts`) y `client.ts` la adjunta sola en cada escritura de esa cuenta.

Si se perdió: `zzz-tracker rotate-key <uid>` en la máquina donde vive la base emite una nueva e
invalida la anterior.

### `Authorization: Bearer <token>`

Opcional, y **no es lo que prueba propiedad**. Sólo existe si el operador setea `ZZZ_API_TOKEN`;
si está vacío, `require_api_token` no pide nada. Es una reja extra para un deploy privado —para
que un backend expuesto no acepte imports de cualquiera— y hoy la pide un solo endpoint, el
import de chronicle.

Un token embebido en una extensión publicada no es un secreto, así que no puede sostener
ownership. Eso lo sostiene `X-Account-Key`, y sólo eso.

---

## 4. Cómo se sirve en producción

Los routers están montados en la raíz: `/accounts/...`, `/agents/...`, `/catalog/...`. El
frontend, en cambio, siempre pide `/api/...` (`const BASE = '/api'` en `client.ts`). Esa
diferencia la borra una reescritura, y hay una en cada entorno:

- **Desarrollo** — el proxy de Vite (`frontend/vite.config.ts`) manda `/api` a
  `http://127.0.0.1:8000` con `rewrite: (path) => path.replace(/^\/api/, '')`.
- **Producción** — Vercel convierte cada archivo de `api/` en una función y le entrega el path
  entero, así que `/api/accounts/1500123456` llega escrito completo. El middleware ASGI
  `StripApiPrefix` (`api/index.py`) le saca el prefijo antes de que la app lo vea, sobre `path` y
  sobre `raw_path`.

Es la misma reescritura de los dos lados, y por eso `client.ts` tiene una sola forma de URL para
ambos.

`api/index.py` además mete `src/` en el `sys.path` (Vercel no hace `pip install` del proyecto) y
apunta `ZZZ_STATIC_DATA_DIR` a un path absoluto, porque el directorio de trabajo de una función
serverless no es algo que controlemos.
