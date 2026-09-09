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
| `POST /accounts` (empezar a trackear un UID) | ✅ | — |
| `POST /accounts/{uid}/claim` (reclamar uno ya trackeado y sin dueño) | ✅ | — |
| `POST /accounts/{uid}/sync` (refrescar desde Enka) | ✅ | ✅ |
| `POST /accounts/{uid}/chronicle/import` | ✅ (reclama) | ✅ |
| `POST/PATCH/DELETE` de agentes y teams | ❌ | ✅ |
| `PUT/DELETE /accounts/{uid}/credentials` | ❌ | ✅ |
| `POST /accounts/{uid}/chronicle/sync` | ❌ | ✅ |

Las lecturas quedan libres a propósito: el showcase de Enka ya es público, y un tracker que
no se puede mirar sin instalar nada no sirve. Lo de Enka se refresca libre por la misma
razón — es dato público y el TTL ya frena el abuso.

## Los dos reclamos

Una cuenta tiene un `claim_level`:

- **`unclaimed`** — existe pero nadie la reclamó (filas viejas, anteriores a este cambio).
  No se puede escribir. Se sale de acá con `POST /accounts/{uid}/claim`.
- **`provisional`** — alguien escribió el UID en la web y se llevó una key. Puede editar a
  mano ya mismo, sin instalar nada. **No prueba nada**: el que llegó primero se quedó con el
  UID, sea suyo o no.
- **`verified`** — alguien importó el Chronicle de ese UID con la extensión. Eso sí prueba
  propiedad: producir un bundle de HoYoLAB para un UID exige la sesión del dueño de ese UID.

**El reclamo verificado le gana al provisional.** Cuando entra un import y la cuenta está
`unclaimed` o `provisional`, la key rota, el nivel pasa a `verified` y la key vieja muere.
El dueño real siempre puede recuperar su UID: le alcanza con importar una vez.

Regla exacta del import, que resuelve además el "perdí la key":

- Si el que llama presenta la key vigente → se importa y la key **no** rota.
- Si no presenta key, o presenta una inválida → el bundle es la prueba: la key rota a una
  nueva `verified` y se devuelve en la respuesta.

Consecuencia aceptada: dos navegadores del mismo dueño se pelean la key (cada import sin key
rota e invalida al otro). La salida es copiar la key a la otra instalación desde las
opciones de la extensión, no un mecanismo nuevo.

Si al rotar había ediciones manuales del ocupante anterior, no se borran: quedan marcadas
como `source='manual'` y la UI le ofrece al dueño nuevo descartarlas.

## Qué se valida del import

No podemos verificar criptográficamente que un bundle vino de HoYoLAB. Lo único que sí se
chequea, y es la única prueba disponible:

1. El payload trae la sección `index` con un `role` (sin eso el import ya se rechaza hoy).
2. El `role_id` del payload **coincide** con el `{uid}` del path. Hoy no se chequea.
3. Opcional y aparte: si `ZZZ_API_TOKEN` está seteado, se sigue exigiendo el `Bearer` además
   de la key. Deja de ser obligatorio, pero queda como reja extra para el deploy propio —
   un token que viaja adentro de una extensión publicada no es secreto, así que no puede ser
   la única defensa.

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
  y `ImportDisabledError` se quedan, con el token ahora opcional.
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
- un import cuyo `role_id` no coincide con el uid del path se rechaza;
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
