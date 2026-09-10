# Notas de la capa web del backend

Lo que el código de `src/zzz_tracker/web/schemas/`, `src/zzz_tracker/web/routers/` y
`api/index.py` no puede decir en una línea. La capa es delgada a propósito: valida el body,
llama a `TrackerService` y arma la respuesta. Los guards de propiedad (`require_account_key`,
`require_agent_owner_key`, `require_team_owner_key`) viven en `web/deps.py` y están
documentados en `docs/reference/notas/backend-core.md`; el modelo de propiedad completo, en
`docs/OWNERSHIP.md`.

---

## `api/index.py`

### `api/index.py` — el módulo entero

**No obvio:** Vercel convierte cada archivo bajo `api/` en una función y le entrega el request
con el path original, así que `/api/accounts/1500123456` llega escrito completo. Pero los
routers están montados en la raíz (`/accounts/...`), porque eso es lo que proxea
`frontend/vite.config.ts` en desarrollo, donde el prefijo `/api` se reescribe antes de que el
request salga del dev server. `StripApiPrefix` hace la misma reescritura en producción.

**Si lo ignorás:** montar los routers con prefijo `/api` para "simplificar" rompe el dev
server, o obliga a `frontend/src/api/client.ts` a tener dos formas de URL según el entorno.
La reescritura existe justamente para que haya una sola.

### `api/index.py` — `sys.path` y `ZZZ_STATIC_DATA_DIR`

**No obvio:** Vercel no hace `pip install` del proyecto, por eso el `sys.path.insert` apunta a
`src/`. Y `static_data_dir` por defecto es relativo al working directory, que acá no
controlamos: los archivos del store viajan dentro del deploy (ver `.gitignore` y
`docs/DEPLOY.md`) y se apunta a ellos en absoluto, salvo que el entorno ya diga otra cosa
(de ahí el `setdefault` y no una asignación).

**Si lo ignorás:** el import de `zzz_tracker` falla en el deploy, o el catálogo contesta 503
en producción porque busca los archivos estáticos en un directorio que no es.

---

## `src/zzz_tracker/web/schemas/`

El contrato HTTP entero, partido por dominio: `common.py` (patrón de UID, topes, `RegionField`,
`ErrorResponse`, `HealthResponse`, `StatRead`), `accounts.py`, `agents.py`, `teams.py`,
`catalog.py` y `chronicle.py`. **Todo lo público se re-exporta desde `__init__.py`**: `deps.py`
y los routers importan de `zzz_tracker.web.schemas` y no saben que hay un paquete abajo.

### `common.py` — los topes `MAX_*` / `MIN_*`

**No obvio:** no son validación defensiva, son los topes del juego, y existen para mantener
honestas las builds cargadas a mano. Un agente importado nunca pasa por acá — el parser de
Enka y el import de HoYoLAB van directo a `ParsedAgent` / `ParsedStat` — así que subirlos
nunca rompe un import; sólo afloja lo que un humano puede tipear.

**Si lo ignorás:** cuando el juego suba un cap (nivel máximo, fase de W-Engine, nivel de
disco) el número se sube acá y nada más. Si en cambio los tratás como reglas de negocio y los
empezás a chequear también en `tracker/`, cada cap pasa a vivir en dos lados.

### `common.py` — `MAX_DISC_PROCS` vs `MAX_SUBSTAT_ROLLS`

**No obvio:** son dos números distintos que suenan iguales. `MAX_DISC_PROCS` (5) son los procs
que recibe el disco — el `BreakLevel` de Enka. `MAX_SUBSTAT_ROLLS` (6, en `discs/values.py`)
es el conteo de rolls de **un** substat: un disco S recibe 5 procs, pero un substat que se
lleva todos encima de su roll inicial lee 6.

**Si lo ignorás:** unificarlos en una constante rechaza builds legítimas (el substat de 6) o
acepta discos imposibles (6 procs).

### `common.py` — `_known_region`

**No obvio:** la región se guarda en la cuenta y se sirve con ella, así que un typo no
fallaría acá sino que se instalaría como un dato que nadie vuelve a cuestionar. Vacío es la
respuesta honesta a "no sé", y el UID la contesta en su lugar (`region_for_uid`).

**Si lo ignorás:** aceptar cualquier string deja regiones inventadas en la base, y ninguna
capa de arriba las va a poder distinguir de una real.

### `common.py` — `ErrorResponse`

**No obvio:** `code` es la mitad estable del error. Los clientes ramifican sobre `code`, y
`code` no cambia cuando cambia la redacción de `detail`. Los códigos viven al lado de las
excepciones en `errors.py`.

**Si lo ignorás:** el frontend termina haciendo `if (detail.includes("..."))` y cualquier
retoque de redacción rompe una rama de la UI.

### `common.py` — `StatRead`

**No obvio:** Enka manda bases, no lo que lee el jugador. `value` es esa base y `total` es el
número que muestra el juego, ya aplicado el conteo de rolls o el nivel del disco. `total` es
`None` sólo cuando un main stat no se puede escalar porque no se conocen la rareza o el nivel
del disco.

**Si lo ignorás:** mostrar `value` como si fuera lo que ve el jugador da números que no
coinciden con el juego, y tratar `total is None` como cero inventa un stat que no existe.

### `agents.py` — `SubstatWrite`

**No obvio:** sólo el camino de escritura manual construye estos modelos. El piso de rolls
(`MIN_SUBSTAT_ROLLS`, "un substat que está en el disco se rolleó al menos una vez") por eso
nunca rechaza datos importados.

**Si lo ignorás:** si algún día un import pasara por `SubstatWrite`, ese piso empezaría a
tirar bundles reales al piso por un dato que HoYoLAB manda distinto.

### `agents.py` — `AgentUpdate`

**No obvio:** `wengine` y `discs` se reemplazan, no se mergean. Mandar discos significa mandar
el set entero, y `"wengine": null` desequipa (de ahí el `model_fields_set` en `as_edit`, que
distingue "no lo mandaste" de "lo mandaste en null"). Aplicar cualquier cosa de este modelo
convierte al agente en manual, así que los syncs posteriores dejan de pisarlo.

**Si lo ignorás:** un PATCH que sólo quería corregir el nivel te congela el agente contra
Enka para siempre. Es el precio de poder corregir un agente importado, pero conviene saberlo.

### `catalog.py` — `CatalogListResponse[T]`

**No obvio:** es genérico y no cuatro modelos, pero el JSON que sale es idéntico
(`{"items": [...]}`) — es la misma forma que `CatalogListResponse<T>` en
`frontend/src/api/types.ts`. Lo único que cambia al hacerlo genérico son los nombres de los
schemas en `/openapi.json` (`CatalogListResponse_CatalogAgentRead_` en vez de
`CatalogAgentListResponse`).

**Si lo ignorás:** si alguna vez se genera un cliente TypeScript desde el `/openapi.json`, los
nombres van a salir con esa forma. El contrato de red no cambió; el nombre del tipo, sí.

### `catalog.py` — el docstring de `CatalogListResponse`

**No obvio:** "nunca vacío" no es una promesa vacía: sin los datos estáticos descargados el
catálogo contesta 503, no `[]`. Ver la nota de `routers/catalog.py`.

### `chronicle.py` — `ChronicleImportWrite`

**No obvio:** `extra="ignore"` es deliberado. Toda clave de `payloads` es opcional salvo
`index`, que confirma el UID; una sección que el browser no pudo traer llega ausente o `null`
y se saltea, no se rechaza. Las claves desconocidas se ignoran en todos lados para que la
extensión pueda ir adelante del backend.

**Si lo ignorás:** poner `extra="forbid"` convierte cada release de la extensión en un deploy
obligatorio del backend, y una sección que HoYoLAB no sirvió ese día tira el import entero.

### `chronicle.py` — `ChronicleImportResponse.account_key`

**No obvio:** `account_key` se llena exactamente una vez por cuenta: en el import que le dio
dueño. Todo import posterior presenta esa key y recibe `null`, así que un cliente sólo guarda
una key que le están entregando.

**Si lo ignorás:** devolver la key en cada import la convierte en algo que cualquiera que
pueda escribir puede leer, y deja de distinguirse "me la dieron" de "ya la tenía". El camino
de vuelta desde una key perdida es `zzz-tracker rotate-key` en la máquina que tiene la base.

---

## `src/zzz_tracker/web/routers/`

### `routers/accounts.py` — `create_account`

**No obvio:** trackear un UID es gratis y no dice nada sobre propiedad. Un UID es un número
público, y tipear uno no dice de quién es. Ser dueño de una cuenta arranca importando su
chronicle, que es lo único que un extraño no puede hacer por vos.

**Si lo ignorás:** si alguna vez se hace que `POST /accounts` reclame la cuenta, cualquiera
se queda con el UID de cualquiera tipeando un número.

### `routers/accounts.py` — `check_ownership`

**No obvio:** existe porque nada reemite una key por HTTP. Pegar una a mano es como una
segunda máquina la consigue, y un pegado mal hecho, si no, recién aparecería en el primer
guardado fallido. Este endpoint contesta antes: 204 si la key es dueña, 403 si falta o es de
otra cuenta, 409 si la cuenta todavía no tiene dueño, 404 si el UID no está trackeado.

Usa el mismo guard que las escrituras a propósito: una segunda forma de chequear una key es
una segunda forma de que la respuesta esté mal. Y la key no vuelve nunca, ni entera ni en
parte: **el status *es* la respuesta**.

**Si lo ignorás:** hacer que devuelva algo de la key (un prefijo, un hash, "empieza con X")
regala material para adivinarla, y escribir un chequeo propio en vez de reusar el guard hace
que un día la respuesta y la escritura difieran.

### `routers/agents.py` — el módulo

**No obvio:** cada nombre, icono y etiqueta de stat se resuelve acá desde los datos estáticos
de Enka, así que el frontend nunca ve un game id crudo que tenga que buscar. A diferencia del
catálogo, estos endpoints **siguen contestando** cuando faltan los datos estáticos: lo que el
jugador tiene vale mostrarlo con los nombres en `null`.

El showcase sólo expone los agentes que el jugador puso en vitrina, así que el resto del
roster se tipea acá. Lo escrito a mano queda marcado `manual` y desde ahí sobrevive a todo
sync, lo que también significa que corregir un agente importado lo congela contra Enka.

**Si lo ignorás:** poner `RequiredStaticDataDep` acá "por consistencia con el catálogo" deja
al jugador sin ver su propio roster por un archivo que no descargó el operador.

### `routers/agents.py` — `delete_agent`

**No obvio:** toda team comp que lo tenía pierde ese slot y conserva el resto de sus miembros,
así que un agente borrado nunca deja un team apuntando a la nada.

### `routers/catalog.py` — el 503

**No obvio:** todo el catálogo depende de archivos que el operador descarga con
`zzz-tracker sync-static`. Mientras faltan, cada endpoint contesta `503` con un
`ErrorResponse` que dice cómo conseguirlos, en vez de una lista vacía: **un catálogo vacío es
indistinguible de un juego sin agentes**.

**Si lo ignorás:** con `[]` el frontend renderiza pickers vacíos que se ven perfectos y no
sirven para nada, y nadie se entera de que falta un `sync-static`.

### `routers/catalog.py` — `_catalog`

**No obvio:** el builder saltea dos cosas, y son distintas. `lookup(...) is None` es "el id
está en el índice pero no hay info" (dato estático incompleto); que `build(...)` devuelva
`None` es un filtro propio del endpoint — hoy sólo `list_properties`, que descarta los ids que
Enka deja sin nombre porque no hay nada que mostrar de ellos.

### `routers/teams.py` — el módulo

**No obvio:** los teams se escriben enteros. `POST` y `PUT` llevan los dos la comp completa,
así que editar un slot significa mandar los tres miembros de nuevo; eso mantiene los slots
consistentes y le ahorra al frontend un endpoint por miembro. Los miembros vuelven con el
agente ya resuelto a nombre, icono y W-Engine: la misma forma que sirve el roster.

**Si lo ignorás:** agregar un `PATCH /teams/{id}/members/{slot}` obliga a resolver la
consistencia de slots incrementalmente, que es el problema que este diseño evita.

### `routers/chronicle.py` — `import_chronicle`

**No obvio:** es la única forma en que datos de HoYoLAB llegan a este backend, y la única en
que una cuenta consigue dueño. Un bundle no prueba nada por sí solo — el cliente elige cada
byte, el UID incluido, y un UID es público — así que pasa sin key sólo donde no hay nada que
robar: una cuenta que todavía no tiene dueño, que entonces reclama, contestando la key una
vez. Contra una cuenta con dueño pide la key de ese dueño y contesta 403 sin ella.

**Si lo ignorás:** tratar el UID del bundle como prueba de identidad deja que cualquiera
reescriba la cuenta de cualquiera mandando un JSON armado a mano.
