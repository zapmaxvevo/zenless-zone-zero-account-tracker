# Notas del core del backend

Lo que el código de `src/zzz_tracker/tracker/`, `src/zzz_tracker/storage/`, `errors.py`,
`config.py`, `app.py`, `cli.py` y `web/deps.py` no puede decir en una línea. El modelo de
propiedad completo está en `docs/OWNERSHIP.md`; el modelo de datos, en
`docs/reference/04-MODELO-DE-DATOS.md`; el camino por el que entran los datos de HoYoLAB, en
`docs/reference/notas/extension.md`.

Dos ideas atraviesan casi todo lo que sigue:

- **Sin login.** La `account key` es la prueba de propiedad entera. No hay usuarios, no hay
  sesiones, no hay nada más que mirar.
- **El backend nunca sale a HoYoLAB.** El Battle Chronicle llega como un bundle que la
  extensión capturó en el browser del usuario y posteó. Todo lo que dice el bundle lo eligió
  quien lo manda.

---

## `src/zzz_tracker/tracker/`

El paquete está partido por caso de uso: `accounts.py` (cuentas y keys), `agents.py` (agentes
y builds), `teams.py`, `enka_sync.py`, `chronicle.py` (el import) y `rows.py` (dos helpers de
fila compartidos). `service.py` es sólo la fachada: `TrackerService` compone los colaboradores
y delega. **Todo lo público se re-exporta desde `service.py`** — `web/schemas.py`, `web/deps.py`,
`cli.py` y los tests importan de ahí y no saben que hay un paquete abajo.

### `service.py` — `TrackerService`

**No obvio:** un sync nunca pisa lo editado a mano. Los agentes con `source == "manual"` se
saltean enteros, y los agentes que un showcase no trajo se conservan en vez de borrarse:
Enka sólo expone el puñado de agentes que el jugador puso en vitrina, así que "no vino" no
significa "no lo tiene". Editar un agente es exactamente lo que lo marca `manual`, de modo que
una corrección sobrevive a todos los syncs posteriores.

**Si lo ignorás:** un sync que borra lo que no vino le vacía el roster a cualquiera que use la
app, y uno que pisa `manual` le borra las correcciones cada vez que refresca.

### `accounts.py` — `claim_account`

**No obvio:** no es alcanzable por HTTP a propósito. La web puede *trackear* un UID pero nunca
*poseerlo*, porque tipear un número público no prueba nada. Ésta es la puerta de la CLI, para
una cuenta anterior a las account keys o cuyo dueño nunca va a correr la extensión.

**Si lo ignorás:** exponerla como endpoint convierte "conozco el UID" en "soy el dueño", que es
justo lo que todo el modelo de propiedad evita.

### `accounts.py` — `find_or_create`

**No obvio:** el `IntegrityError` que atrapa no es defensivo por si acaso: dos imports
simultáneos del mismo UID nuevo llegan los dos con `find_account() is None` y los dos
insertan. El perdedor hace rollback y relee la fila del ganador.

**Si lo ignorás:** el segundo import de una carrera revienta con un 500 en vez de escribir
sobre la cuenta que acaba de aparecer. `test_two_simultaneous_imports_of_a_new_account_do_not_collide`
fuerza esa carrera con un listener de `before_flush`.

### `agents.py` — `AgentEdit`

**No obvio:** `None` significa "dejalo como está", pero `wengine` y `discs` **no se mergean**:
un W-Engine reemplaza al que estuviera equipado y los discs reemplazan el set completo. Una
build se edita mandándola entera. `clear_wengine` es el único modo de desequipar, porque
`wengine=None` ya quiere decir "no lo toques".

**Si lo ignorás:** mandar un solo disc borra los otros cinco, y no hay forma de sacar un
W-Engine sin el flag.

### `agents.py` — `write_build`

**No obvio:** Enka y HoYoLAB se pisan mutuamente y está bien: el último sync que corra gana,
porque los dos describen la build tal como está en el juego. El único `source` protegido es
`manual`, y sigue protegido para siempre.

**Si lo ignorás:** agregar precedencia entre fuentes ("HoYoLAB es más completo que Enka") hace
que un import viejo le gane a uno nuevo según qué endpoint contestó primero.

### `agents.py` — `create_agent`

**No obvio:** delega en `write_build(..., SOURCE_MANUAL)`. El `assert agent is not None` de
abajo no es paranoia: `write_build` sólo devuelve `None` cuando el agente ya existe y es
`manual`, y el chequeo de conflicto de arriba ya probó que no existe ningún agente.

### `chronicle.py` — `ChroniclePayloads`

**No obvio:** el bundle lleva el `data` crudo de cada endpoint, sin tocar, que es por qué lo
leen los mismos mappers que leerían la respuesta original. `index` es la única sección
obligatoria; cualquier otra ausente (o con el mapa de seasons vacío) se saltea y se **reporta**,
no se rechaza.

`record_card` no es un endpoint del chronicle sino la entrada de ZZZ del perfil de HoYoLAB, y
es el único payload que **nombra** la cuenta: el `index` no trae ni UID, ni nickname, ni nivel.
Que una captura no haya podido traerlo es normal, así que su ausencia nunca se reporta como
sección salteada.

**Si lo ignorás:** meter `record_card` en la lista de secciones salteadas ensucia el reporte de
todos los imports normales.

### `chronicle.py` — `import_chronicle`

**No obvio:** **un bundle no prueba nada.** Cada byte lo elige quien lo manda, el UID incluido,
y un UID es público. Por eso el primer import de un UID se lo queda — no hay nada ahí que
quitarle a nadie — y de ahí en adelante la key es lo único que habla por la cuenta: ningún
bundle le gana, por bien que nombre el UID. Un dueño que perdió la key consigue una nueva
desde la CLI, que cuesta acceso a la base de datos.

### `chronicle.py` — `_import_region`

**No obvio:** la región se guarda en la cuenta y se sirve con ella, y llega en el body como
todo lo demás. Un typo — o un string inventado — quedaría ahí siendo leído como un hecho. Lo
que no está en `KNOWN_REGIONS` cae de vuelta a la que implica el UID, que es la respuesta que
nunca dependió de quien llamó.

### `chronicle.py` — `_ensure_import_allowed`

**No obvio:** una cuenta con dueño acepta la key y nada más. Un bundle no puede discutirle —
nombrar el UID correcto no cuesta nada — así que no hay segunda puerta: ningún import, por
completo que sea, se queda con un UID que ya tiene dueño. Una cuenta sin dueño acepta
cualquier bundle, porque no hay nada que quitarle.

### `chronicle.py` — `_claim_by_import`

**No obvio:** llegar acá con una key válida significa que volvió el dueño: la key se queda y no
se emite ninguna. Importar dos veces nunca obliga a nadie a anotar un secreto nuevo. Llegar sin
key significa que hace un momento la cuenta no tenía dueño y ahora sí.

### `chronicle.py` — `_persist_chronicle`

**No obvio:** el orden de los pasos es contrato por dos motivos. Uno, `skipped_sections` se
reporta en ese orden y hay un test que lo fija (`avatar_basic`, `buddy_info`, `shiyu_defense`,
`deadly_assault`, `lost_void`, `avatar_info`). Dos, las builds corren **al final** para que la
build completa le gane al `level`/`mindscape` que `avatar_basic` trajo para el mismo agente.

De las cinco secciones, cuatro pasan por `_persist_section` ("si vino `None`, anotala como
salteada; si no, persistila y contá"). La quinta, los challenge runs, no entra en ese molde:
cubre **dos** nombres de sección a la vez, deduplica seasons entre ambas y aparta los modos sin
datos en `unavailable_modes` en vez de contarlos. Forzarla al helper salía peor que dejarla
aparte.

**Si lo ignorás:** reordenar los pasos rompe `test_a_partial_import_stores_what_came_and_reports_the_missing_sections_as_skipped`
y, peor, deja el roster pisando las builds.

### `chronicle.py` — `_persist_builds`

**No obvio:** el payload crudo se guarda al lado de la build (`AgentBuildSnapshot`). Cuesta una
fila por agente y es la única forma de recuperar un campo que el mapper todavía no lee sin
volver a pedirle nada a HoYoLAB — cosa que este backend no puede hacer.

### `chronicle.py` — `_name_account`

**No obvio:** el nickname y el nivel se buscan en cascada porque ningún payload los garantiza.
El `record_card` es el único que contesta seguro, y una captura muchas veces viene sin él. Si
falla, se le pregunta al `index` (en algunas versiones sí trae un perfil) y por último a los
payloads de challenges, que firman su respuesta con `nick_name` y son la última chance de
enterarse del nombre.

### `chronicle.py` — `_upsert_challenge_run`

**No obvio:** las `entries` se borran y se rehacen enteras, en vez de matchearse por posición
como hacen los demás upserts. Una temporada re-jugada cambia qué capas existen, no sólo sus
números.

**Si lo ignorás:** matchear por `position` deja colgadas las capas que el jugador ya no jugó.

### `rows.py` — `get_or_create`

**No obvio:** devuelve la fila **sin flush**. Los `_upsert_*` flushean ellos, después de copiar
los campos, porque varios necesitan el `id` recién antes de tocar una relación.

---

## `src/zzz_tracker/storage/`

### `keys.py` — el módulo entero

**No obvio:** `token_urlsafe(32)` son 256 bits de entropía, y por eso un sha256 pelado alcanza:
una key no es un password que alguien tenga que recordar, así que no hay nada que
brute-forcear y ninguna razón para pagar argon2. El prefijo `zzk_` está para que una key
filtrada sea grepeable en un log. Se guarda **sólo el hash**: un dump de la base no le entrega
a nadie el acceso de escritura que la key concede.

### `keys.py` — `verify_key`

**No obvio:** la comparación es en tiempo constante a propósito (`secrets.compare_digest`).

**Si lo ignorás:** un `==` normal filtra por timing cuánto del prefijo de la key acertaste.

### `database.py` — `normalize_database_url`

**No obvio:** Neon, Supabase y Vercel Postgres reparten `postgres://…` o `postgresql://…`.
SQLAlchemy sacó el nombre de dialecto `postgres` hace años, y un `postgresql` pelado resuelve a
psycopg2, que no es dependencia de este proyecto — psycopg 3 sí. Una URL que nombra su propio
driver se deja como está: si la escribiste, la quisiste así, y el ImportError que sigue lo dice
sin vueltas.

### `database.py` — `_connect_args`

**No obvio:** SQLite ignora **todos** los `ON DELETE CASCADE` salvo que se emita
`PRAGMA foreign_keys=ON` por conexión, y acá nadie lo emite. Local, los cascades que ves en los
modelos los hace cumplir sólo el `delete-orphan` del ORM; sólo Postgres, que es donde esto
deploya, los hace cumplir en la base.

**Si lo ignorás:** leés un test local en verde como prueba de que una foreign key aguanta.

### `database.py` — `_pool_args`

**No obvio:** la API corre como funciones serverless. Un contenedor atiende un request y puede
quedar congelado o descartado justo después, así que un pool sostenido entre invocaciones es
mayormente sockets muertos, y muchos contenedores tibios con uno cada uno se comen el límite de
conexiones. El pooling es del endpoint pgbouncer del proveedor (ver `docs/DEPLOY.md`). SQLite
conserva el pool default de SQLAlchemy, que es lo que quieren la base local y los tests.

### `models.py` — `KNOWN_REGIONS`

**No obvio:** es la lista de regiones que HoYoLAB realmente sirve, y existe porque un import
nombra su propia región en el body. Ver `chronicle.py — _import_region`.

### `models.py` — `AccountKey`

**No obvio:** una fila por cuenta, con un secreto que nunca se lee de vuelta: **que la fila
exista es lo que significa "esta cuenta tiene dueño"**. Sólo el primer import de un UID crea
una — después, la key es lo único que habla por la cuenta — así que `rotated_at` marca las
reemisiones deliberadas, que sólo pasan desde la CLI.

### `models.py` — `DriveDisc`

**No obvio:** `game_id` es el id de la pieza individual y `set_id` el del set que completa,
resuelto desde la static data. `roll_count` es el `BreakLevel` de Enka: cuántos rolls de
substat recibió la pieza.

### `models.py` — `AgentBuildSnapshot`

**No obvio:** una fila por cuenta y agente, sobrescrita por cada import. El snapshot es la
válvula de escape para lo que el mapper todavía no lee, así que lo que importa es que espeje la
build guardada hoy, no cómo se veía el mes pasado. Guardar historia acá crecería sin límite por
un valor que nadie lee dos veces; un historial de builds, si alguna vez existe, es de la build
trackeada y no de una copia del payload.

---

## `src/zzz_tracker/errors.py`

### `ZZZTrackerError`

**No obvio:** `code` es la mitad de la respuesta pensada para un programa y `detail` la mitad
pensada para una persona. Un cliente ramifica por el code, nunca por las palabras: el texto
puede cambiar sin aviso, y el status solo no alcanza — 409 es a la vez "ese agente ya está
trackeado" (`conflict`) y "esta cuenta todavía no tiene dueño" (`unclaimed_account`).

**Si lo ignorás:** los codes son parte de la API. Renombrar uno es un breaking change;
`tests/test_errors.py` pinea cada uno justamente para que el rename duela acá y no en el
cliente.

### `ForbiddenError` (403) vs `UnclaimedAccountError` (409)

**No obvio:** son dos respuestas distintas a propósito. 403 es "esta cuenta tiene dueño y vos
no presentaste su key". 409 es "esta cuenta no tiene dueño, así que no existe ninguna key que
pudiera escribirla": no hay nada que presentar todavía, y al que llama se lo manda al camino
para *volverse* dueño en vez de dejarlo buscando un secreto que nunca se emitió.

---

## `src/zzz_tracker/web/deps.py`

### `require_api_token`

**No obvio:** el token es una reja extra para un deploy privado, **no** es lo que prueba quién
es dueño de una cuenta: un token embebido en una extensión publicada no es un secreto. La
propiedad es la account key. Dejar `ZZZ_API_TOKEN` sin setear simplemente saca esta reja.

### `_check_account_key`

**No obvio:** distingue "sin dueño" (409, `unclaimed_account`) de "key equivocada" (403,
`forbidden`) por lo dicho arriba en `errors.py`.

### `require_agent_owner_key` / `require_team_owner_key`

**No obvio:** leen la fila **antes** de validar. Los ids de agente y de team son globales, así
que la pregunta nunca es "¿este que llama tiene *una* key válida?" — reclamar un UID vacío es
gratis y te regala una de ésas. La pregunta es "¿tiene la key de la cuenta a la que pertenece
*este* agente?", y eso exige leer la fila primero.

**Si lo ignorás:** cualquiera con una cuenta propia reclamada puede escribir los agentes de
cualquier otra.

### `UidPath`

**No obvio:** un guard lee el mismo path parameter que el endpoint que protege, así que tiene
que describirlo igual. Una copia más laxa acá relajaría, en silencio, la validación de la ruta.

---

## `src/zzz_tracker/config.py`

### `Settings.api_token`

**No obvio:** acá nada habla con HoYoLAB. El Battle Chronicle llega como un bundle que capturó
y posteó la extensión del browser; `api_token`, cuando está seteado, es una reja extra sobre
ese import y nada más. Ver `require_api_token`.
