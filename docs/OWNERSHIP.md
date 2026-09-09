# Propiedad de una cuenta — sin login

Decidido el 2026-09-09 con Maxi. Reemplaza al punto §4 de `docs/PENDIENTES.md` ("Sin auth y
ahora se guardan cookies de HoYoLAB") y retira el `ZZZ_API_TOKEN` global como único portero.

## El problema

El tracker no tiene login y no lo va a tener. Pero guarda cosas que no son públicas —
cookies de HoYoLAB, el Chronicle importado, las ediciones manuales — y hoy cualquiera que
sepa un UID puede dispararle `POST /accounts/{uid}/chronicle/sync` usando las credenciales
guardadas de esa cuenta. En local da igual; publicado, no.

La forma de la URL **no** es el problema. Mover el UID al body no protege nada: un body es
tan adivinable como un path. Lo que protege es que el que escribe tenga que presentar un
secreto. Por eso las rutas quedan como están (`/accounts/{uid}/...`) y lo que cambia es
quién puede escribir.

## El modelo

**Leer es público. Escribir pide una key.**

| Operación | Sin key | Con `X-Account-Key` |
| --- | --- | --- |
| `GET` de perfil, roster, builds, teams, Chronicle, catálogo | ✅ | ✅ |
| `POST /accounts` (empezar a trackear un UID; **reclama** si nadie lo tenía) | ✅ | — |
| `POST /accounts/{uid}/claim` (reclamar uno ya trackeado y sin dueño) | ✅ | — |
| `POST /accounts/{uid}/sync` (refrescar desde Enka) | ✅ | ✅ |
| `POST /accounts/{uid}/chronicle/import` | ✅ mientras nadie la haya reclamado | ✅ |
| `POST/PATCH/DELETE` de agentes y teams | ❌ | ✅ |
| `PUT/DELETE /accounts/{uid}/credentials` | ❌ | ✅ |
| `POST /accounts/{uid}/chronicle/sync` | ❌ | ✅ |

Las lecturas quedan libres a propósito: el showcase de Enka ya es público, y un tracker que
no se puede mirar sin instalar nada no sirve. Lo de Enka se refresca libre por la misma
razón — es dato público y el TTL ya frena el abuso.

## Los dos reclamos

Una cuenta tiene un `claim_level`:

- **`unclaimed`** — existe pero nadie la reclamó (filas viejas, anteriores a este cambio).
  No se puede escribir. Se sale de acá reclamándola, y hay tres puertas que reclaman:
  `POST /accounts/{uid}/claim`, un import, y `POST /accounts` — trackear un UID que nadie
  tenía lo reclama de paso y devuelve la key en el mismo `account_key` (si ya tenía dueño,
  refresca desde Enka y devuelve `account_key: null`).
- **`provisional`** — alguien escribió el UID en la web y se llevó una key. Puede editar a
  mano ya mismo, sin instalar nada. **No prueba nada**: el que llegó primero se quedó con el
  UID, sea suyo o no.
- **`verified`** — alguien importó el Chronicle de ese UID. **Tampoco prueba nada por sí
  solo**, y esto es importante: un bundle es un JSON que manda el cliente, así que el UID que
  nombra lo elige el que lo manda, y un UID es público. No hay forma de verificar del lado
  del servidor que un bundle salió de una sesión de HoYoLAB. Lo que hace fuerte al nivel
  `verified` no es el bundle: es que **a partir de ahí manda la key y ningún bundle la
  puede pisar**.

**Un reclamo verificado no se pisa.** El import solo reclama lo que todavía no tiene dueño:

- Cuenta `unclaimed` → se importa y se reclama. `verified` si el bundle nombra el UID,
  `provisional` si no lo nombra (el `index` real no trae UID; ver abajo).
- Cuenta `provisional` → un bundle que nombra el UID le gana al ocupante: la key rota, el
  nivel pasa a `verified` y la key vieja muere. Un bundle que no lo nombra, no.
- Cuenta `verified` **sin la key vigente** → **403**. No se importa, no rota, no se escribe
  nada. Ni siquiera con un bundle que nombre el UID.
- Con la key vigente, en cualquier nivel → se importa y la key **no** rota.

El 403 sobre `verified` es la regla que sostiene todo lo demás. Sin ella, cualquiera que
supiera un UID mandaba `{"index":{"role":{"role_id":"<uid>"}}}`, se llevaba una key nueva,
dejaba al dueño afuera y después disparaba `chronicle/sync` con las cookies de HoYoLAB
guardadas de la víctima.

Costo aceptado: el dueño real que pierde la key **no** se recupera desde el navegador.
Importar de nuevo ya no alcanza. La única salida es el CLI, y por eso el CLI exige acceso a
la base:

```
zzz-tracker rotate-key <uid>
```

que imprime una key nueva y mata la anterior. El que lo corre pasa a ser el dueño, así que
se corre solo para el dueño real.

Consecuencia relacionada: dos navegadores del mismo dueño no se pelean la key, pero el
segundo tampoco entra solo — hay que copiarle la key desde las opciones de la extensión.

Si al rotar había ediciones manuales del ocupante anterior, no se borran: quedan marcadas
como `source='manual'` y la UI le ofrece al dueño nuevo descartarlas.

## Qué se valida del import

No podemos verificar que un bundle vino de HoYoLAB, ni criptográficamente ni de ninguna otra
forma: todo lo que llega lo eligió el que lo mandó. Así que lo que se chequea no es "¿esto es
auténtico?" sino "¿esto alcanza para escribir *esta* cuenta?".

1. El payload trae la sección `index` y no está vacía. **No** se le exige un `role`: el
   `index` que devuelve HoYoLAB de verdad no trae perfil — ni nickname, ni nivel, ni UID.
2. Si el bundle nombra un UID —`record_card`, o un `role` con `game_role_id` / `game_uid` /
   `uid` / `role_id`— tiene que ser el `{uid}` del path; si no, 422. Nombrar el UID correcto
   no prueba nada (es público), pero es el piso para reclamar una cuenta libre.
3. Si el bundle **no** nombra ningún UID, solo se acepta contra una cuenta que nadie reclamó
   —o con la key vigente—, y el reclamo que consigue es apenas `provisional`.
4. La `region` del body se acepta solo si es una región que existe, y la validación está
   en dos capas porque no se comportan igual: por **HTTP** el schema rechaza con **422** una
   región desconocida (vacío sí se acepta: significa "deducila del UID"); llamando al **caso
   de uso** `import_chronicle()` directo —CLI, tests— una región desconocida se **reemplaza**
   por la que implica el prefijo del UID en vez de romper. La región elige a qué host le pega
   después el sync server-side, así que no puede salir libre del body.
5. Opcional y aparte: si `ZZZ_API_TOKEN` está seteado, se sigue exigiendo el `Bearer` además
   de la key. Deja de ser obligatorio, pero queda como reja extra para el deploy propio —
   un token que viaja adentro de una extensión publicada no es secreto, así que no puede ser
   la única defensa.

## Cómo se leen los errores

El cuerpo de todo error es `{"detail": "...", "code": "..."}`. El `detail` es el texto para
una persona y puede cambiar de redacción cuando haga falta; **el `code` es contrato** y un
cliente ramifica por ahí, nunca buscando substrings en el `detail`. Hace falta porque el
status no alcanza: 409 es tanto `conflict` (esa cuenta ya trackea ese agente) como
`unclaimed_account` (reclamala antes de escribirla).

Los que aparecen en este flujo:

| status | `code` | cuándo |
| --- | --- | --- |
| 403 | `forbidden` | la cuenta tiene dueño y falta la key, o la key no es la de esa cuenta; también el import forjado contra una cuenta `verified` |
| 409 | `unclaimed_account` | la cuenta existe pero nadie la reclamó: reclamala primero |
| 409 | `conflict` | choque de dominio, p. ej. ese agente ya está trackeado |
| 401 | `unauthorized` | falta el `Bearer` y `ZZZ_API_TOKEN` está seteado |
| 404 | `not_found` | el UID, el agente o el team no existen |
| 422 | `validation_error` | el payload rompe una regla del dominio (UID que no coincide, región inexistente) |

La lista completa vive en `src/zzz_tracker/errors.py` y está fijada por `tests/test_errors.py`.
Los 422 que genera FastAPI por el schema (un campo con el tipo equivocado) mantienen su
propio formato y no traen `code`.

## Formato de la key

- `secrets.token_urlsafe(32)`, con prefijo `zzk_` para poder grepearla en un log y revocarla.
- Se guarda **hasheada** (`sha256`), nunca en claro. Son 256 bits de entropía, así que un
  sha256 alcanza: no es un password, no hace falta argon2.
- Se compara con `secrets.compare_digest`.
- Se devuelve **una sola vez**, en la respuesta que la emite. Después no se puede volver a leer.

## Modelo de datos

Tabla nueva `account_keys`, espejo de `hoyolab_credentials` (migración `0006_account_keys`):

| columna | tipo | nota |
| --- | --- | --- |
| `id` | int PK | |
| `account_uid` | FK → `accounts.uid`, unique, index, `ON DELETE CASCADE` | una key por cuenta |
| `key_hash` | `String(64)` | sha256 hex |
| `claim_level` | `String(16)` | `provisional` \| `verified` |
| `claimed_at` | datetime | |
| `rotated_at` | datetime \| None | última vez que un import la pisó |
| `last_used_at` | datetime \| None | para poder detectar keys muertas |

`Account.claim_level` es una property derivada: `unclaimed` si no hay fila.

Backfill de la migración: **ninguno**. Las cuentas que ya existen quedan `unclaimed` y por lo
tanto de solo lectura hasta que alguien las reclame. Para la base local de Maxi eso es un
`POST /accounts/{uid}/claim` por UID, o un comando `zzz-tracker claim <uid>` que imprime la key.

Los dos comandos del CLI, que son los que exigen acceso a la base:

| comando | para qué |
| --- | --- |
| `zzz-tracker claim <uid>` | reclamar una cuenta sin dueño (falla con 409 si ya lo tiene) |
| `zzz-tracker rotate-key <uid>` | emitir una key nueva y matar la anterior: la recuperación |

## La key es de una cuenta, no del que llama

La key pertenece a un UID, pero la mitad de las escrituras no nombran ningún UID:

```
POST   /accounts/{uid}/agents      el uid está en el path
POST   /accounts/{uid}/teams
PUT    /accounts/{uid}/credentials
POST   /accounts/{uid}/chronicle/sync

PATCH  /agents/{agent_id}          no hay uid en ningún lado
DELETE /agents/{agent_id}
PUT    /teams/{team_id}
DELETE /teams/{team_id}
```

En la primera familia se compara contra la key del `{uid}` del path. En la segunda hay que
traer la fila de la base, mirar su `account_uid` y recién ahí saber contra qué key comparar.

**El agujero que esto evita**: los ids de agente y de team son globales, no por cuenta. Si la
dependencia preguntara "¿el que llama presenta *alguna* key válida?", cualquiera reclamaría un
UID vacío — que es gratis, `POST /accounts` te da una key — y con esa key legítima editaría o
borraría los agentes de todos los demás. La pregunta correcta es "¿presenta la key **de la
cuenta dueña de esta fila**?".

Son dos dependencias, no una:

```python
def require_account_key(uid: UidPath, request: Request, service: TrackerServiceDep) -> None:
    _check(service, uid, request.headers.get("x-account-key", ""))

def require_agent_owner_key(
    agent_id: AgentIdPath, request: Request, service: TrackerServiceDep
) -> None:
    uid = service.account_uid_for_agent(agent_id)   # el SELECT extra
    _check(service, uid, request.headers.get("x-account-key", ""))
```

más `require_team_owner_key` igual pero con `account_uid_for_team`.

Que el 404 salga antes o después del chequeo de la key da igual: `GET /agents/{id}` es público,
así que enumerar ids no filtra nada que no se pueda leer de todos modos.

## Backend — qué se toca

- `storage/models.py` — modelo `AccountKey`, constantes `CLAIM_PROVISIONAL` / `CLAIM_VERIFIED`
  / `CLAIM_UNCLAIMED`, relación `Account.key`.
- `storage/keys.py` (nuevo) — `generate_key()`, `hash_key()`, `verify_key()`. Chico y sin
  dependencias, al lado de `crypto.py`.
- `alembic/versions/20260909_0006_account_keys.py`.
- `web/deps.py` — `require_account_key` y `require_agent_owner_key` / `require_team_owner_key`
  (ver "La key es de una cuenta, no del que llama", más abajo).
- `errors.py` — `ForbiddenError` (403, "esta cuenta tiene dueño; falta `X-Account-Key`") y
  `UnclaimedAccountError` (409, "reclamá la cuenta antes de escribirla"). `UnauthorizedError`
  se queda, con el token ahora opcional. `ImportDisabledError` se **borra**: nació para
  rechazar el import cuando no había token, que es exactamente lo que este cambio deja de
  hacer, así que quedaría como una clase que nadie levanta y que además describe la regla
  vieja. Si alguna vez hace falta deshabilitar el import de verdad, son cuatro líneas.
- `tracker/service.py` — `claim_account(uid)`, `rotate_key(uid, level)`, `verify_key(uid, key)`,
  `account_uid_for_agent(id)`, `account_uid_for_team(id)`; y `import_chronicle` pasa a devolver
  la key nueva cuando rota.
- `web/schemas.py` — `AccountRead.claim_level`; `AccountCreatedRead` y `ClaimResponse` con
  `account_key: str | None`; `ChronicleImportResponse.account_key: str | None`.
- Routers: la dependencia en agents (POST/PATCH/DELETE), teams (POST/PUT/DELETE) y chronicle
  (credentials PUT/DELETE, chronicle/sync). `import` con la lógica de rotación.

## Frontend — qué se toca

- `lib/accountKey.ts` (nuevo) — leer/guardar `localStorage['zzz.key.<uid>']`.
- `api/client.ts` — `request()` acepta el uid dueño de la operación y cuelga `X-Account-Key`
  cuando hay key guardada. Las lecturas no la mandan.
- Al crear una cuenta o reclamarla, mostrar la key **una vez** con un cartel de "guardá esto,
  no se vuelve a mostrar" (`Banner` de New Eridu, ver `docs/DESIGN.md`).
- Leer `#key=` del fragmento cuando la extensión abre la app, guardarla y limpiar la URL con
  `history.replaceState` para que no quede en el historial.
- Las pantallas de escritura (editar agente, teams, credenciales) miran si hay key: sin key,
  se ven en modo lectura con un aviso de "este UID tiene dueño" o "reclamalo para editar".
- Un lugar para pegar una key a mano (venís de otra máquina) — cae bien en `CredentialsPage`,
  que ya es la pantalla de "conectar".

## Extensión — qué se toca

- `lib/tracker.ts` — `STORAGE_KEYS.accountKeys` (`Record<uid, key>`), mandar `X-Account-Key`
  en el import, y guardar la key nueva cuando la respuesta la trae.
- `entrypoints/background.ts` — después del import, `accountUrl(...)` + `#key=<key>` para que
  el frontend quede autenticado sin copiar y pegar nada (la línea 119 de hoy).
- `entrypoints/options/App.tsx` — el campo de `apiToken` pasa a opcional y se explica; se
  suma ver/copiar/pegar la key por UID, que es lo que permite usar dos navegadores.
- `README.md` de la extensión: qué es la key, que se muestra una sola vez, cómo se recupera.

## Tests

Backend, por escenario:

- una cuenta nueva desde la web devuelve key y queda `provisional`;
- `claim` sobre una cuenta con dueño da 409;
- escribir sin header da 403, con key equivocada 403, con key vigente 200;
- escribir sobre una cuenta `unclaimed` da 409;
- un import sin key sobre cuenta `provisional` rota, devuelve key nueva y deja `verified`,
  y la key vieja deja de funcionar;
- un import **con** la key vigente no rota;
- **un bundle forjado (sin key, nombrando el UID) contra una cuenta `verified` da 403, no
  rota, no escribe nada, y la key del dueño sigue funcionando**;
- un import cuyo `role_id` no coincide con el uid del path se rechaza;
- un import que no nombra ningún UID no puede tomar una cuenta que ya tiene dueño;
- un import que nombra una región inexistente no le cambia la región a la cuenta;
- `zzz-tracker rotate-key` emite una key nueva e invalida la anterior;
- con `ZZZ_API_TOKEN` seteado, el import sigue exigiendo el `Bearer`;
- `PATCH /agents/{id}` resuelve la cuenta dueña por el agente y no por el path;
- **la key de la cuenta A no puede editar ni borrar un agente ni un team de la cuenta B**,
  aunque sea una key perfectamente válida (el agujero de la sección de arriba);
- `PUT`/`DELETE /teams/{id}` con la key de otra cuenta da 403.

Frontend: que las lecturas no manden el header, que las escrituras sí, que el fragmento
`#key=` se consuma y se limpie, y que una pantalla sin key se renderice en modo lectura.

Extensión: que el import mande el header cuando hay key guardada y que persista la rotada.

## Orden

1. Backend: modelo, migración, `storage/keys.py`, servicio, dependencia, routers, tests.
2. Extensión: header, persistencia de la key rotada, `#key=` en el redirect.
3. Frontend: storage de la key, header en escrituras, modo lectura, cartel de key nueva.
4. Docs: `README.md` (comandos y el modelo de propiedad), `PENDIENTES.md` (§4 tachado),
   `EXTENSION.md` (el token deja de ser obligatorio).

Recién después de esto tiene sentido la fase 8 (deploy): es lo que hacía falta decidir antes
de publicar.
