# Propiedad de una cuenta — sin login

Decidido el 2026-09-09 con Maxi. Reemplaza al punto §4 de `docs/PENDIENTES.md` ("Sin auth y
ahora se guardan cookies de HoYoLAB") y retira el `ZZZ_API_TOKEN` global como único portero.

**Revisado el mismo día**, después de decidir que el backend no sincroniza nada por su
cuenta: todo lo de HoYoLAB entra por la extensión, a mano. Eso sacó del medio las cookies
guardadas —el activo que más valía la pena robar— y con ellas la mitad de este documento.
Lo que queda es más chico y más honesto.

## El problema

El tracker no tiene login y no lo va a tener. Pero guarda cosas que no son públicas —el
Chronicle importado, las ediciones manuales— y sin nada que lo frene cualquiera que sepa un
UID puede escribirle encima. En local da igual; publicado, no.

La forma de la URL **no** es el problema. Mover el UID al body no protege nada: un body es
tan adivinable como un path. Lo que protege es que el que escribe tenga que presentar un
secreto. Por eso las rutas quedan como están (`/accounts/{uid}/...`) y lo que cambia es
quién puede escribir.

Cuánto vale lo que se protege cambió con el rumbo nuevo: sin cookies guardadas, el peor caso
de que te roben una cuenta pasó de "manejo tu sesión de HoYoLAB" a "te ensucio datos de
tracking". Por eso el modelo es de un solo nivel y no de tres.

## El modelo

**Leer es público. Escribir pide una key.**

| Operación | Sin key | Con `X-Account-Key` |
| --- | --- | --- |
| `GET` de perfil, roster, builds, teams, Chronicle, catálogo | ✅ | ✅ |
| `GET /accounts/{uid}/ownership` (¿esta key es la de este UID?) | ❌ | ✅ 204 |
| `POST /accounts` (empezar a trackear un UID) | ✅ | — |
| `POST /accounts/{uid}/sync` (refrescar desde Enka) | ✅ | ✅ |
| `POST /accounts/{uid}/chronicle/import` | ✅ mientras nadie la haya reclamado | ✅ |
| `POST/PATCH/DELETE` de agentes y teams | ❌ | ✅ |

Las lecturas quedan libres a propósito: el showcase de Enka ya es público, y un tracker que
no se puede mirar sin instalar nada no sirve. Lo de Enka se refresca libre por la misma
razón — es dato público y el TTL ya frena el abuso.

## El único reclamo

Una cuenta tiene dueño o no lo tiene: `has_owner`, un booleano. No hay niveles.

- **Sin dueño** — existe pero nadie la reclamó: la trackeó alguien desde la web, o es una
  fila anterior a este cambio. Se puede leer, no se puede escribir.
- **Con dueño** — alguien importó su Chronicle con la extensión y se llevó la key.

**Trackear un UID no lo reclama.** Escribir un número público en un formulario no dice nada
sobre de quién es la cuenta, así que `POST /accounts` es gratis y no devuelve ninguna key.
Lo único que reclama es el import.

**Un reclamo no se pisa.** El import solo reclama lo que todavía no tiene dueño:

- Cuenta **sin dueño** → se importa y queda reclamada; la key se devuelve una vez, en esa
  respuesta.
- Cuenta **con dueño**, sin la key vigente → **403**. No se importa, no rota, no se escribe
  nada. Da igual lo completo que venga el bundle.
- Cuenta **con dueño**, con la key vigente → se importa y la key **no** rota.

Que el import no pruebe nada por sí solo es central y conviene decirlo claro: un bundle es
un JSON que arma el cliente, así que el UID que nombra lo elige el que lo manda, y un UID es
público. No hay forma de verificar del lado del servidor que un bundle salió de una sesión
de HoYoLAB. Lo que hace fuerte a la propiedad no es el bundle: es que **a partir del primer
reclamo manda la key y ningún bundle la puede pisar**. El primero que importa se queda con
el UID, igual que el primero que llega se queda con un nombre de usuario.

Costo aceptado: el dueño real que pierde la key **no** se recupera desde el navegador.
Importar de nuevo no alcanza. La única salida es el CLI, y por eso el CLI exige acceso a la
base:

```
zzz-tracker rotate-key <uid>
```

que imprime una key nueva y mata la anterior. El que lo corre pasa a ser el dueño, así que
se corre solo para el dueño real. Dos navegadores del mismo dueño se resuelven copiando la
key de uno al otro desde las opciones de la extensión.

Como pegar la key a mano es la **única** forma de tenerla en una segunda máquina, hay una
lectura para validarla en el momento en vez de descubrir el error al primer guardado:

```
GET /accounts/{uid}/ownership     con X-Account-Key
```

204 si la key es la de ese UID, 403 si falta o es de otra cuenta, 409 `unclaimed_account` si
el UID no tiene dueño todavía, 404 si no está trackeado. No escribe nada y no devuelve la
key ni un fragmento de ella: el status *es* la respuesta. Usa exactamente la misma
dependencia que las escrituras, para que no haya dos maneras de validar una key que puedan
divergir.

## Qué se valida del import

No podemos verificar que un bundle vino de HoYoLAB, ni criptográficamente ni de ninguna otra
forma: todo lo que llega lo eligió el que lo mandó. Así que lo que se chequea no es "¿esto es
auténtico?" sino "¿esto alcanza para escribir *esta* cuenta?".

1. El payload trae la sección `index` y no está vacía. **No** se le exige un `role`: el
   `index` que devuelve HoYoLAB de verdad no trae perfil — ni nickname, ni nivel, ni UID.
2. Si el bundle nombra un UID —`record_card`, o un `role` con `game_role_id` / `game_uid` /
   `uid` / `role_id`— tiene que ser el `{uid}` del path; si no, 422. Nombrar el UID correcto
   no prueba nada (es público); el chequeo evita el import equivocado, no el malicioso.
3. Que el bundle no nombre ningún UID no cambia nada: la captura de `record_card` falla a
   menudo y el `index` real no trae UID, así que sería una regla que castiga al usuario
   honesto sin frenar a nadie. Lo que decide es si la cuenta tiene dueño.
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
| 403 | `forbidden` | la cuenta tiene dueño y falta la key, o la key no es la de esa cuenta; también el import contra una cuenta que ya tiene dueño |
| 409 | `unclaimed_account` | la cuenta existe pero nadie la reclamó: importá su Chronicle primero |
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

Tabla `account_keys` (migración `0006_account_keys`):

| columna | tipo | nota |
| --- | --- | --- |
| `id` | int PK | |
| `account_uid` | FK → `accounts.uid`, unique, index, `ON DELETE CASCADE` | una key por cuenta |
| `key_hash` | `String(64)` | sha256 hex |
| `claimed_at` | datetime | |
| `rotated_at` | datetime \| None | última vez que el CLI emitió una nueva |
| `last_used_at` | datetime \| None | para poder detectar keys muertas |

`Account.is_claimed` es una property derivada: la fila existe o no existe. Eso es lo que la
API expone como `has_owner`.

La migración `0007_drop_hoyolab_credentials` completa el cambio de rumbo: dropea
`hoyolab_credentials`, la columna `accounts.chronicle_failed_at` (marcaba el backoff del
sync que ya no existe) y `account_keys.claim_level` (quedó con un solo valor posible).

Backfill: **ninguno**. Las cuentas que ya existen quedan sin dueño y por lo tanto de solo
lectura hasta que alguien importe su Chronicle. Para la base local de Maxi eso es un
`zzz-tracker claim <uid>` por UID.

Los dos comandos del CLI, que son los que exigen acceso a la base:

| comando | para qué |
| --- | --- |
| `zzz-tracker claim <uid>` | reclamar una cuenta sin dueño sin pasar por la extensión (falla con 409 si ya lo tiene) |
| `zzz-tracker rotate-key <uid>` | emitir una key nueva y matar la anterior: la recuperación |

## La key es de una cuenta, no del que llama

La key pertenece a un UID, pero la mitad de las escrituras no nombran ningún UID:

```
POST   /accounts/{uid}/agents      el uid está en el path
POST   /accounts/{uid}/teams

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

## Backend — qué quedó

- `storage/models.py` — `AccountKey` (una fila = un dueño) y `Account.is_claimed`.
- `storage/keys.py` — `generate_key()`, `hash_key()`, `verify_key()`.
- `web/deps.py` — `require_account_key`, `require_agent_owner_key`, `require_team_owner_key`
  (ver "La key es de una cuenta, no del que llama").
- `errors.py` — `ForbiddenError` (403) y `UnclaimedAccountError` (409); `UnauthorizedError`
  se queda, con el token opcional.
- `tracker/service.py` — `claim_account(uid)`, `rotate_key(uid)`, `verify_key(uid, key)`,
  `account_uid_for_agent(id)`, `account_uid_for_team(id)`, y en `import_chronicle` el par
  `_ensure_import_allowed` / `_claim_by_import`.
- `web/schemas.py` — `AccountRead.has_owner`; `ChronicleImportResponse.account_key`.
- Migraciones `0006_account_keys` y `0007_drop_hoyolab_credentials`.

Lo que se borró con el cambio de rumbo, para que nadie lo busque: `storage/crypto.py`,
`hoyolab/client.py`, la tabla `hoyolab_credentials`, `POST /accounts/{uid}/chronicle/sync`,
los tres endpoints de `credentials`, `POST /accounts/{uid}/claim`, los comandos
`sync-chronicle`, `set-credentials` y `new-credentials-key`, los settings de HoYoLAB
(`ZZZ_CREDENTIALS_KEY`, `ZZZ_HOYOLAB_*`) y los errores que solo levantaba el cliente de
HoYoLAB (`MissingCredentialsError`, `InvalidCredentialsError`, `DataNotPublicError`,
`CaptchaRequiredError`). **`hoyolab/mapper.py` y `hoyolab/build_mapper.py` se quedan**: el
bundle de la extensión trae el `data` crudo y se parsea por el mismo camino de siempre.

## Frontend — qué se toca

- `lib/accountKey.ts` — leer/guardar `localStorage['zzz.key.<uid>']`.
- `api/client.ts` — `request()` acepta el uid dueño de la operación y cuelga `X-Account-Key`
  cuando hay key guardada. Las lecturas no la mandan.
- La key se muestra **una vez**, cuando la devuelve el import, con un cartel de "guardá esto,
  no se vuelve a mostrar" (`Banner` de New Eridu, ver `docs/DESIGN.md`).
- Leer `#key=` del fragmento cuando la extensión abre la app, guardarla y limpiar la URL con
  `history.replaceState` para que no quede en el historial.
- Las pantallas de escritura miran si hay key: sin key, se ven en modo lectura con un aviso
  de "este UID tiene dueño" o "importá tu Chronicle para reclamarlo".
- Un lugar para pegar una key a mano, para cuando venís de otra máquina.

## Extensión — qué se toca

- `lib/tracker.ts` — `STORAGE_KEYS.accountKeys` (`Record<uid, key>`), mandar `X-Account-Key`
  en el import, y guardar la key nueva cuando la respuesta la trae.
- `entrypoints/background.ts` — después del import, `accountUrl(...)` + `#key=<key>` para que
  el frontend quede autenticado sin copiar y pegar nada.
- `entrypoints/options/App.tsx` — el campo de `apiToken` pasa a opcional y se explica; se
  suma ver/copiar/pegar la key por UID, que es lo que permite usar dos navegadores.
- `README.md` de la extensión: qué es la key, que se muestra una sola vez, cómo se recupera.

## Tests

Backend, por escenario:

- trackear un UID desde la web no devuelve key y deja la cuenta sin dueño;
- el primer import de un UID lo reclama y devuelve la key una vez;
- escribir sin header da 403, con key equivocada 403, con key vigente 200;
- `GET /ownership` responde 204 con la key correcta, 403 sin ella o con una ajena, 409 si la
  cuenta no tiene dueño y 404 si el UID no está trackeado, sin escribir ni devolver nada;
- escribir sobre una cuenta sin dueño da 409 y apunta al import;
- un import **con** la key vigente no rota y devuelve `account_key: null`;
- **un bundle forjado (sin key, nombrando el UID) contra una cuenta con dueño da 403, no
  rota, no escribe nada, y la key del dueño sigue funcionando**;
- un import con una key que no es la vigente da 403 sin rotar;
- un import cuyo `role_id` no coincide con el uid del path se rechaza;
- un bundle que no nombra ningún UID igual reclama una cuenta libre;
- un import que nombra una región inexistente da 422;
- `zzz-tracker rotate-key` emite una key nueva e invalida la anterior;
- con `ZZZ_API_TOKEN` seteado, el import sigue exigiendo el `Bearer`;
- `PATCH /agents/{id}` resuelve la cuenta dueña por el agente y no por el path;
- **la key de la cuenta A no puede editar ni borrar un agente ni un team de la cuenta B**,
  aunque sea una key perfectamente válida (el agujero de la sección de arriba);
- `PUT`/`DELETE /teams/{id}` con la key de otra cuenta da 403.

Frontend: que las lecturas no manden el header, que las escrituras sí, que el fragmento
`#key=` se consuma y se limpie, y que una pantalla sin key se renderice en modo lectura.

Extensión: que el import mande el header cuando hay key guardada y que persista la nueva.

## Orden

1. Backend: modelo, migraciones, `storage/keys.py`, servicio, dependencia, routers, tests.
2. Extensión: header, persistencia de la key, `#key=` en el redirect.
3. Frontend: storage de la key, header en escrituras, modo lectura, cartel de key nueva.
4. Docs: `README.md` (comandos y el modelo de propiedad), `PENDIENTES.md` (§4 tachado),
   `EXTENSION.md` (el token deja de ser obligatorio), `HOYOLAB.md` (el backend ya no
   sincroniza).

Recién después de esto tiene sentido la fase 8 (deploy): es lo que hacía falta decidir antes
de publicar.
