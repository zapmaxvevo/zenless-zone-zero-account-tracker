# Integración HoYoLAB — Battle Chronicle (ZZZ)

Documento de referencia de la integración con el Battle Chronicle de HoYoLAB. Es API **no
oficial y sin contrato**: lo que sigue es lo investigado sobre el comportamiento real de los
endpoints, más las decisiones de diseño que se tomaron por eso. El código no lleva
comentarios, así que este documento es la única memoria escrita de la integración.

Complementa a `PLAN.md`, que cubre la integración con Enka.Network.

## Qué aporta frente a Enka

| | Enka.Network | HoYoLAB Chronicle |
|---|---|---|
| Autenticación | ninguna | cookies de sesión |
| Roster | solo los agentes **exhibidos** | **todo** el roster poseído |
| Detalle de build | W-Engine + discos completos | solo nivel y mindscape |
| Bangboos | no | sí |
| Modos de fin de juego | no | Shiyu Defense, Deadly Assault, Lost Void |
| Caché | `ttl` propio en la respuesta | ninguno, lo pone el tracker |

Son complementarias, no sustitutas: HoYoLAB da **amplitud** (todo lo que tenés) y Enka da
**profundidad** (cómo está buildeado lo que exhibís).

## Terminología ES ↔ EN

La API responde en el idioma de `x-rpc-lang` (`hoyolab_language`, por defecto `en-us`), así
que los nombres que llegan son los ingleses. Equivalencias que confunden:

| Español (juego) | Inglés (API) | Notas |
|---|---|---|
| Defensa Shiyu | Shiyu Defense | endpoint `hadal_info_v2` |
| **Nodo Inestable** | **Critical Node** | ver abajo |
| Nodo Estable / Nodo Disputado | Stable Node / Disputed Node | permanentes |
| Asalto Mortal | Deadly Assault | endpoint `hadal_mem_detail_v2` |
| Cero Hueco / Vacío Perdido | Hollow Zero / Lost Void | endpoint `abysss2_abstract` |
| Cinema / Mindscape | Mindscape Cinema | el "rank" del agente (`rank` en el JSON) |
| Nivel Inter-Knot | Inter-Knot level | el nivel de cuenta |
| Bangboo | Bangboo / buddy | endpoint `buddy/info` |

**El Nodo Inestable no es un modo aparte ni es semanal.** Es la mitad rotativa de Shiyu
Defense: rota **cada 14 días** (viernes por medio, 04:00 hora de servidor), mientras que los
nodos Estable y Disputado son permanentes. En la API no existe como endpoint propio; llega
dentro del payload de Shiyu.

## Autenticación

Hacen falta exactamente **dos cookies**: `ltuid_v2` y `ltoken_v2`. `cookie_token_v2` y
`account_id_v2` **no** son necesarias (la primera sirve solo para canjear códigos de regalo).

En Global **no** hace falta el header `ds` / dynamic secret: la propia app web de HoYoLAB no
lo manda. China sí lo exige, pero es otra integración entera y no está soportada.

Headers que manda el cliente (`hoyolab/client.py::HoyolabClient._headers`):

```
Cookie: ltuid_v2=…; ltoken_v2=…
User-Agent: zzz-tracker/<version> (+https://github.com/zapmaxvevo/personal-zzz)
Referer: https://act.hoyolab.com/
x-rpc-lang / x-rpc-language: en-us
x-rpc-client_type: 5
x-rpc-app_version: 1.5.0
```

**Los valores que HoYoLAB rota están todos como constantes de módulo en `hoyolab/client.py`**,
no incrustados en el código: `REFERER`, `CLIENT_TYPE` (`"5"`, el cliente web) y `APP_VERSION`
(`"1.5.0"`). El día que HoYoLAB empiece a rechazar por versión de app vieja, el único cambio
es `APP_VERSION`. El `User-Agent` sale de `USER_AGENT`, derivado de `zzz_tracker.__version__`,
y el idioma del parámetro `language` del constructor, que la app y la CLI cablean desde
`Settings.hoyolab_language`.

### Cómo sacar las cookies

1. Iniciar sesión en `https://www.hoyolab.com`.
2. F12 → **Application** → **Storage** → **Cookies** → `https://www.hoyolab.com`.
3. Copiar los valores de `ltuid_v2` y `ltoken_v2`.
4. Guardarlas con `zzz-tracker set-credentials <uid>` (ver *Operación*) o con
   `PUT /accounts/{uid}/credentials`.

`ltoken_v2` **caduca** y hay que repetir el proceso. Cuando eso pasa, HoYoLAB responde
`retcode -100` / `10001`; el cliente levanta `InvalidCredentialsError` y
`TrackerService.sync_chronicle` la intercepta para marcar `HoyolabCredential.rejected_at`
antes de re-lanzarla. A partir de ahí `credentials_for` falla directo sin salir a la red, hasta
que se vuelvan a guardar las cookies: `store_credentials` limpia `rejected_at`.

El marcado es sutil y vale la pena leerlo entero (`_mark_credentials_rejected`):

1. `rollback()` — **descarta el sync a medias**. Cuando el 401 llega en la mitad de la
   secuencia, la sesión ya tiene escritos el roster, los bangboos o alguna run. Sin este
   rollback el `commit` del marcado los persistiría, y el sync dejaría de ser atómico.
2. Recarga la cuenta **por uid** (`find_account`), porque el rollback expiró los objetos que
   tenía el sync en la mano.
3. Escribe `rejected_at` **solo si estaba en `None`**, para conservar la fecha del *primer*
   rechazo en vez de irla pisando en cada reintento.
4. Recién ahí commitea: lo único que queda en la base es la marca.

`_mark_chronicle_failed` (ver *Backoff*) sigue exactamente el mismo patrón.

### Leer el Chronicle de otro UID

Con **tus** cookies se puede leer el Chronicle de **otro** UID: se pasan el `uid` y la
`region` del otro como query params, y las cookies siguen siendo las tuyas. La app oficial
hace exactamente eso: mantiene `uid` (el propio) y `viewUid` (el consultado) y manda
`isHost: 1|2` para distinguir.

Requisito: que el dueño tenga el Battle Chronicle público (`switch_id: 1`). Si no →
`retcode 10102`. Excepción: `/note` (notas en tiempo real) es solo de la cuenta propia →
`retcode 10104`.

> Razonado sobre el comportamiento de la app oficial, **no probado de punta a punta** con
> cookies reales. Tratarlo como probable, no como garantizado.

### Almacenamiento cifrado

Las cookies viven en `hoyolab_credentials`, una fila por cuenta: `ltuid_v2` en claro y
`ltoken_v2` **cifrado con Fernet** (`storage/crypto.py::CredentialCipher`). La clave está en
`ZZZ_CREDENTIALS_KEY` (`config.py::Settings.credentials_key`), **nunca en la base**: un dump
de las tablas no alcanza para secuestrar la sesión de HoYoLAB.

Si la variable está vacía, `create_app` deja `app.state.cipher = None` (y la CLI construye el
servicio con `cipher=None`), y el servicio levanta `ValidationError` al intentar guardar o
leer credenciales. Si trae algo que no es una clave Fernet válida, `CredentialCipher` levanta
`ValidationError` al construirse. `ltoken_v2` **nunca** se devuelve por la API:
`CredentialRead` expone solo `account_uid`, `ltuid_v2`, `rejected`, `last_used_at`,
`created_at` y `updated_at`.

Cambiar la clave invalida todo lo ya guardado (`ValidationError` al descifrar, con el mensaje
"ZZZ_CREDENTIALS_KEY has changed") y obliga a volver a pegar las cookies.

## Endpoints

Base: `https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz`
(`Settings.hoyolab_base_url`, `DEFAULT_BASE_URL` en el cliente). Timeout por defecto 20 s.
`HoyolabClient` crea su propio `httpx.Client` salvo que se le inyecte uno, y `close()` solo
cierra el que creó él; sirve también como context manager.

### La trampa de los parámetros

Los endpoints se reparten en dos convenciones **para los mismos dos valores**:

| Convención | Endpoints |
|---|---|
| `role_id` + `server` | `index`, `avatar/basic`, `buddy/info`, `hadal_info_v2` |
| `uid` + `region` | el resto (`hadal_mem_detail_v2`, `abysss2_abstract`) |

`HoyolabClient._get` lo resuelve con `uid_param`, que arrastra el nombre del parámetro de
región (`role_id` → `server`, `uid` → `region`).

**Los seis métodos públicos pasan `uid_param` explícito**, ninguno se apoya en el default de
`_get` (`UID_PARAM`). Que la convención de cada endpoint esté escrita en su propio método es
deliberado: agregar uno nuevo obliga a elegir, en vez de heredar el default y descubrir el
error contra la API.

| Método | Path | Params | Devuelve |
|---|---|---|---|
| `fetch_profile` | `index` | `role_id`, `server` | `role` (nickname, nivel, región) + `stats` |
| `fetch_agents` | `avatar/basic` | `role_id`, `server` | `avatar_list`: roster completo |
| `fetch_bangboos` | `buddy/info` | `role_id`, `server` | `list`: bangboos poseídos |
| `fetch_shiyu_defense` | `hadal_info_v2` | `role_id`, `server`, `schedule_type` | Shiyu de la temporada |
| `fetch_deadly_assault` | `hadal_mem_detail_v2` | `uid`, `region`, `schedule_type` | Deadly Assault de la temporada |
| `fetch_lost_void` | `abysss2_abstract` | `uid`, `region` | progreso acumulado de Hollow Zero |

`abysss2` con tres eses es la errata real de HoYoLAB, no un typo del repo.

Todos devuelven el `data` crudo del payload (dict vacío si falta o si no es un dict). El HTTP
y el `retcode` los maneja `_get`; el parseo lo hace el mapper.

### Temporadas: solo hay dos

`schedule_type` acepta `1` (`SCHEDULE_CURRENT`) y `2` (`SCHEDULE_PREVIOUS`). **No hay más
historia disponible.** Por eso `challenge_runs` persiste cada temporada y ningún sync borra
filas: la base es el único sitio donde el histórico sobrevive.

## Errores del cliente

Dos capas de mapeo, en este orden.

### 1. Por HTTP, antes de mirar el body

| Situación | Excepción | HTTP del tracker |
|---|---|---|
| `httpx.HTTPError` (DNS, TLS, timeout, conexión) | `ExternalServiceError` | 502 |
| **HTTP 429** (`HTTP_TOO_MANY_REQUESTS`) | **`RateLimitedError`** | 429 |
| cualquier otro status ≠ 200 | `ExternalServiceError` | 502 |
| body que no es JSON, o JSON que no es un objeto | `ExternalServiceError` | 502 |

El 429 **no es redundante** con el mapeo por retcode: ese throttle lo aplica el WAF de HoYoLAB
*antes* de que la aplicación llegue a poner un `retcode`, y desde Vercel (IPs de datacenter
compartidas) es el escenario de rate limit más probable de los dos.

### 2. Por retcode, con HTTP 200

Fuera del throttle, HoYoLAB responde **HTTP 200 para todo**; el estado real viene en `retcode`
dentro del body. `HoyolabClient._raise_for_retcode` lo traduce a excepciones de dominio
(`errors.py`), y `register_exception_handlers` las convierte en `{"detail": …}` con su status:

| Retcodes | Constante | Excepción | HTTP |
|---|---|---|---|
| `0` | `RETCODE_OK` | — | ok |
| `-100`, `10001` | `RETCODES_INVALID_COOKIES` | `InvalidCredentialsError` | 401 |
| `10102`, `10104` | `RETCODES_NOT_PUBLIC` | `DataNotPublicError` | 403 |
| `10101`, `-110`, `1028` | `RETCODES_RATE_LIMITED` | `RateLimitedError` | 429 |
| `1034`, `10035`, `5003`, `10041` | `RETCODES_CAPTCHA` | `CaptchaRequiredError` | 503 |
| cualquier otro | — | `ExternalServiceError` | 502 |

**El `message` de HoYoLAB se propaga en las cinco ramas**, no solo en el fallback: las cuatro
mapeadas lo agregan entre paréntesis al final del detalle cuando viene no vacío (`" (Not
logged in)"`), y el fallback lo concatena junto al retcode. Es lo único que explica *por qué*
HoYoLAB rechazó, así que no se descarta nunca.

Errores locales, sin salir a la red: `MissingCredentialsError` (401) cuando la cuenta no
tiene cookies guardadas, `NotFoundError` (404) cuando el UID no está trackeado, y
`ValidationError` (422) cuando falta o es inválida la clave Fernet, cuando el cliente HoYoLAB
no está configurado, o cuando el UID es chino.

### Regiones

Se derivan del prefijo del UID (`storage/models.py::region_for_uid`):

| Prefijo | Región | Servidor |
|---|---|---|
| `10` | `prod_gf_us` | América |
| `13` | `prod_gf_jp` | Asia |
| `15` | `prod_gf_eu` | Europa |
| `17` | `prod_gf_sg` | TW/HK/MO |
| 8 dígitos exactos | `CHINA_REGION` (`prod_gf_cn`) | China — **no soportado** |

El largo 8 se chequea **antes** que el prefijo. Prefijo desconocido cae a `DEFAULT_REGION`
(`prod_gf_eu`). El valor efectivo se cachea en `Account.region` (lo escribe el sync) y
`TrackerService._region_for` **rechaza** los UIDs chinos con `ValidationError` antes de
intentar cualquier petición.

## El mapper: esquemas V1 y V2, y por qué se guarda `raw`

`hoyolab/mapper.py` no toca la red ni la base: convierte los `data` crudos en dataclasses
congeladas (`ParsedChallengeRun`, `ParsedChallengeEntry`, `ParsedChallengeAgent`,
`ParsedLostVoid`, `ParsedChronicleAccount`, `ParsedRosterAgent`, `ParsedBangboo`) que el
servicio persiste.

Está escrito **a la defensiva de punta a punta**: helpers `_as_dict` / `_as_list` / `_as_int`
/ `_as_str` que degradan a vacío en vez de explotar, y `_first_present(data, *keys)` que
prueba varios nombres de campo para el mismo dato. No es paranoia gratuita: HoYoLAB ya
renombró campos en producción (ver *Fragilidad demostrada*).

Las funciones `parse_*` de un solo objeto devuelven `None` cuando falta lo mínimo (el
`schedule_id` de una run, el `id` de un agente, un payload vacío en Lost Void), y las de lista
descartan los elementos que no se pudieron parsear en vez de fallar enteras.

### Shiyu Defense: dos esquemas vivos a la vez

`parse_shiyu_defense` discrimina por `data["hadal_ver"]` y el contenido cuelga de
`hadal_info_v1` o `hadal_info_v2`:

| | V1 | V2 |
|---|---|---|
| Id de temporada | `schedule_id` | **`zone_id`** |
| Ventana | `hadal_begin_time` / `hadal_end_time` como **dict de partes** (`year`, `month`, …) | los mismos campos como **epoch en segundos** |
| Intentos | `all_floor_detail[]`, cada piso con `node_1` / `node_2` | una clave `*_layer_detail` por capa, cada una con `layer_challenge_info_list[]` |
| Agentes | `node_N.avatars` | `avatar_list` |
| Puntaje global | no hay: `score` y `max_score` quedan en `0` | `brief` (`score`, `max_score`, `rank_percent`, `battle_time`, `rating`) |
| Rating global | mejor rating de `rating_list` con `times > 0` | `brief.rating` |
| Estrellas | `_stars_for(rating)` × `times`, sumado sobre `rating_list` (con las estrellas de los intentos como fallback si da 0) | suma de las estrellas de los intentos |
| Tiempo global | `fast_layer_time` | `brief.battle_time` |
| Tiempo del intento | suma de los `battle_time` de `node_1` y `node_2` | `battle_time` del intento |

`fitfh_layer_detail` es la errata literal de HoYoLAB (por "fifth"); el mapper la lee pero
acepta también `fifth_layer_detail` por si algún día la arreglan.

#### Las capas se descubren, no se enumeran

Shiyu no es solo el Nodo Inestable. Sus tres nodos —Estable, Disputado e Inestable— llegan en
el **mismo** payload, repartidos entre las capas, y una versión anterior de este mapper leía
únicamente `fourth_layer_detail` y `fitfh_layer_detail`: todo lo jugado en las capas bajas se
tiraba en silencio.

`_shiyu_v2_layers` ya no enumera dos claves. Recorre `LAYER_ORDINALS` (`first` … `seventh`,
con la variante `fitfh`/`fifth`) y después **barre la sección buscando cualquier clave que
termine en `_layer_detail`** que no haya visto. Una capa con un ordinal que no conocemos entra
igual, al final y con `layer_index` en `None`. La idea es que agregar una capa del lado de
HoYoLAB no vuelva a costarnos datos.

Cada intento guarda de qué capa salió:

| Campo | V1 | V2 | Para qué |
|---|---|---|---|
| `layer_index` | `layer_index` (o `floor_index`) del piso | el ordinal de la clave (`third_layer_detail` → `3`) | agrupar los intentos por nodo |
| `layer_id` | `layer_id` del piso | `layer_id` del intento | el id crudo tal como llega |

`layer_index` en V2 es **derivado del nombre de la clave**, no un campo observado; `layer_id`
sí viene en el payload. Ninguno de los dos define a qué nodo pertenece la capa: eso es un
mapeo capa→nodo que todavía no tenemos confirmado y que por ahora no se inventa.

**En V2 el intento hereda de su capa lo que no trae.** No todos los campos vienen repetidos en
cada elemento de `layer_challenge_info_list`: algunos los declara una sola vez el
`fourth_layer_detail` / `fitfh_layer_detail` que los contiene. El mapper busca primero en el
item y cae al layer:

| Campo del intento | Se busca en el item | Y si no está, en el layer | Helper |
|---|---|---|---|
| `name` | `zone_name`, `layer_name`, `name` | los mismos tres | `_layered_str` |
| `boss_name` | `monster_name`, `boss_name` | los mismos dos | `_layered_str` |
| `boss_icon` | `monster_pic`, `boss_icon`, `monster_icon` | los mismos tres | `_layered_str` |
| `rating` | `rating` | `rating` | inline |
| `challenged_at` | `challenge_time` | `challenge_time` | inline |
| `buffs` | `buffer` | `buffer` | `_parse_buffs` |

Cae al layer solo cuando el item deja el valor **vacío**, no cuando trae algo distinto: el
intento siempre gana si dice algo.

En V2 la `position` de los intentos es **correlativa entre capas**: se numera 1..N recorriendo
las capas en orden de ordinal, sin reiniciar por capa. Los agentes de un intento se
**deduplican por `game_id`**, lo que importa sobre todo en V1, donde los dos nodos repiten
gente.

Cuando `hadal_ver` falta o trae un valor desconocido, el dispatch cae por presencia: prefiere
la sección V2, si no la V1, y guarda en `schema_version` la cadena declarada tal cual llegó
(o `"v2"`/`"v1"` si no venía ninguna). Por eso `schema_version` no está limitado a
`"v1"`/`"v2"`.

**El tiempo se parsea en dos formas** porque las dos existen: `_to_datetime` acepta tanto el
dict de partes de V1 como el epoch de V2, y siempre devuelve UTC. Un epoch `0`, ausente o
ilegible devuelve `None`, no una fecha falsa.

### Deadly Assault

`parse_deadly_assault` es un esquema único (`schema_version` fijo en `"v2"`): `zone_id` como
temporada, los intentos en `list[]`, y `total_score` / `total_star` / `rank_percent` en la
raíz. Tres detalles que difieren de Shiyu:

- Las estrellas del intento vienen **explícitas** en `star`, no se derivan del rating.
- `boss` llega como **lista**, no como objeto; `_first_dict` toma el primer elemento. Su
  `name` se usa además como `name` del intento.
- El rating global **siempre** se deriva de los intentos (`_best_rating`); no hay `brief`. Y
  como los intentos tampoco traen `rating`, en la práctica el rating de Deadly Assault queda
  vacío: ver *Lo que no se sabe todavía*.

### Cuándo una temporada "tiene datos"

`_has_data` respeta el flag `has_data` del payload si viene como booleano; si no viene, cae a
"¿parseé al menos un intento?". Una temporada sin jugar no llega a persistirse (ver *El sync*).

### Ratings y rarezas

```python
RATING_ORDER = ("B", "A", "S", "S+")
RATING_STARS = {"B": 1, "A": 2, "S": 3, "S+": 3}
RARITY_BY_LETTER = {"B": 2, "A": 3, "S": 4}
```

`S+` vale las mismas 3 estrellas que `S` (es el techo del modo, no una cuarta estrella), pero
gana en `_best_rating`, que es lo que decide el rating global cuando hay que derivarlo de los
intentos. `RARITY_BY_LETTER` traduce la letra de HoYoLAB a la escala numérica que ya usa
Enka, y se aplica **solo a bangboos** (`_rarity_number`, cuyo único llamador es
`_parse_bangboo`): en agentes de roster y de challenge la rareza se guarda como la letra cruda.

Cuidado con `element`: HoYoLAB manda `element_type` numérico (p. ej. `201`) y `_as_str` lo
convierte a string, así que lo que queda guardado es `"201"`, no un nombre de elemento.

### Por qué se guarda `raw`

`ChallengeRun` y `LostVoidProgress` guardan el payload **sin tocar** en `raw`, más el
`schema_version` en el caso de las runs. Es la válvula de escape: el día que cambien el
esquema antes de que el mapper se entere, el dato igual queda guardado y se puede re-mapear
sin volver a pedirlo — y pedirlo de nuevo puede ser imposible, porque solo hay dos temporadas.

### Fragilidad demostrada

No es paranoia preventiva, ya pasó:

- El endpoint `/challenge` (el Shiyu viejo) **murió**: hoy devuelve 404.
- Deadly Assault migró de `mem_detail` a `hadal_mem_detail_v2`.

## Modelo de datos

Tablas de la migración `20260808_0002_hoyolab_chronicle` (revisión `0002`, sobre `0001`):

| Tabla | Modelo | Forma |
|---|---|---|
| `hoyolab_credentials` | `HoyolabCredential` | 1:1 con `Account` (índice único en `account_uid`); `ltuid_v2` + `encrypted_ltoken`, `last_used_at`, `rejected_at` |
| `bangboos` | `Bangboo` | N por cuenta, único por `(account_uid, game_id)` |
| `challenge_runs` | `ChallengeRun` | una temporada de un modo; único por `(account_uid, mode, schedule_id)` |
| `challenge_run_entries` | `ChallengeRunEntry` | un intento dentro de la temporada; único por `(run_id, position)`, con `layer_index` / `layer_id` para saber de qué capa salió |
| `lost_void_progress` | `LostVoidProgress` | PK = `account_uid`: fila única por cuenta (es un acumulado, no una temporada) |

Todas cuelgan de `accounts.uid` con `ON DELETE CASCADE`. `Account` suma cinco columnas:
`region`, `chronicle_public`, `chronicle_synced_at`, `chronicle_import_source` (migración
`0004`: `"server"` si el último sync lo hizo el backend, `"extension"` si entró por el
import, `NULL` si nunca sincronizó) y `chronicle_failed_at` (la marca de backoff). Las cuatro
primeras se exponen en `AccountRead`; `chronicle_failed_at` es interna y no sale por la API.

`ChallengeRun` es compartida por Shiyu Defense y Deadly Assault porque los registros tienen
la misma forma (ventana de temporada, puntaje global, un puñado de intentos); los distingue
`mode` (`MODE_SHIYU_DEFENSE` / `MODE_DEADLY_ASSAULT`).

En `ChallengeRunEntry`, `agents` es un **snapshot** JSON del equipo tal como estaba ese día
(`ParsedChallengeAgent.as_snapshot()`: `game_id`, `level`, `rarity`, `element`, `mindscape`,
`icon`), no un FK al roster: así el registro sigue diciendo la verdad después de que esos
agentes suban de nivel.

`ChallengeAgentRead.icon` tiene default `""` a propósito: las filas guardadas antes de que el
snapshot incluyera el icono siguen deserializando sin romper el endpoint. No hay migración de
datos para rellenarlas — se completan solas cuando el sync vuelva a escribir esa temporada.

### `rank_percent` se guarda en centésimas

`rank_percent` se persiste **crudo, en centésimas de punto porcentual, tal como lo manda
HoYoLAB**: `250` significa 2,5 %. La columna es `Integer`, y el mapper y el servicio lo pasan
tal cual.

La división por 100 la hace **una sola capa**: `ChallengeRunRead.from_run`, al serializar
(`rank_percent=None if run.rank_percent is None else run.rank_percent / 100`, expuesto como
`float | None`). Es una trampa fácil de duplicar: si un consumidor vuelve a dividir, el número
queda cien veces más chico.

### Qué pisa qué

**No hay ranking de fuentes ni constante de precedencia.** La regla implementada, en
`TrackerService._upsert_roster_agent` y `_upsert_agent`, es una sola:

> un agente con `source == "manual"` no se sobrescribe nunca; el resto sí.

Es lo que chequea `Agent.is_manual`. Crear o editar un agente por la API (`create_agent` /
`update_agent`) es lo que lo marca `manual`, y eso lo vuelve inmune a todo sync posterior,
venga de donde venga.

No hace falta un ranking porque **las fuentes aportan campos disjuntos**:

| Fuente | Qué escribe |
|---|---|
| `enka` | build completa: nivel, promoción, skills, W-Engine, discos — solo de los agentes exhibidos |
| `hoyolab` | `level` y `mindscape_level` — de **todo** el roster |
| `manual` | lo que el usuario corrija |

Cada una manda en lo suyo, y en los dos campos compartidos gana la que corra después. El sync
de HoYoLAB **no toca discos ni W-Engines**: `_upsert_roster_agent` escribe exactamente
`level` y `mindscape_level`, nada más. Un agente que HoYoLAB descubre por primera vez nace
con `source = "hoyolab"` y sin build; Enka la completa después si el jugador lo exhibe.

Asimetría a tener presente: `_upsert_agent` (Enka) reescribe `source = "enka"` en cada sync,
mientras que `_upsert_roster_agent` (HoYoLAB) solo fija `source` al **crear** la fila y no
toca el de los agentes que ya existían.

Las constantes que existen en `storage/models.py` son `SOURCE_ENKA`, `SOURCE_MANUAL`,
`SOURCE_HOYOLAB`, `MODE_SHIYU_DEFENSE`, `MODE_DEADLY_ASSAULT`, `REGIONS_BY_UID_PREFIX`,
`DEFAULT_REGION`, `CHINA_REGION` y `region_for_uid`.

## El sync

`TrackerService.sync_chronicle(uid, force=False, include_previous=True)` es la única entrada.
Guardias, en este orden, antes de tocar la red:

1. **Cuenta** — `get_account`, `NotFoundError` si el UID no está trackeado.
2. **TTL y backoff** — `Account.is_chronicle_sync_due(ttl_seconds, backoff_seconds)` mira las
   **dos** ventanas; si da falso y no hay `force`, devuelve `ChronicleSyncReport(skipped=True)`.
   Ver *Backoff*.
3. **Cliente** — `_require_hoyolab`, `ValidationError` si la integración no está configurada.
4. **Región** — `_region_for` deriva y valida (rechaza China).
5. **Credenciales** — `credentials_for` descifra; falla si faltan (`MissingCredentialsError`),
   si están marcadas rechazadas (`InvalidCredentialsError`) o si no hay clave Fernet
   (`ValidationError`).

Recién ahí sale a la red, en dos mitades (así el import de la extensión comparte la segunda,
ver *Import desde la extensión*):

**`_fetch_chronicle`** junta los `data` crudos en un `ChroniclePayloads`, en este orden:
`index`, `avatar/basic`, `buddy/info`, por cada `schedule_type` (`1`, y `2` si
`include_previous`) Shiyu y Deadly Assault, y al final `abysss2_abstract`. Si un fetch falla,
no se persistió nada todavía. Después se marca `credential.last_used_at = now` y entra
**`_persist_chronicle`**:

6. `index` → nickname y nivel (solo si vienen no vacíos), `region`, `chronicle_public = True`.
7. `avatar_basic` → upsert del roster; cuenta cuántos agentes escribió (los `manual` se saltan
   y no cuentan).
8. `buddy_info` → upsert de bangboos.
9. Para cada `schedule_type` y cada modo: parse + upsert de la temporada.
10. `lost_void` → upsert de Lost Void.
11. `chronicle_synced_at = now`, `chronicle_failed_at = None`, un único `commit`.

Una sección que en el paquete venga en `None` (solo posible vía import) se salta y se lista
en `skipped_sections`; en el sync server-side todas las secciones vienen siempre.

Detalles que importan:

- **Una temporada sin jugar no crea fila.** Si el parseo devuelve `None` se ignora en silencio;
  si da `has_data == False`, el modo se agrega a `report.unavailable_modes` (deduplicado,
  conservando el orden) y no se persiste nada.
- **Una temporada repetida se guarda una sola vez.** Si la API devuelve el mismo `schedule_id`
  para `schedule_type=1` y `schedule_type=2` —lo esperable si no hay temporada anterior que
  servir— `_sync_challenge_modes` lo detecta con el set `seen_seasons` de
  `(mode, schedule_id)`, compartido entre las dos pasadas. **Gana la actual**, porque
  `SCHEDULE_CURRENT` se recorre primero y la segunda aparición se descarta entera: ni se
  persiste ni se cuenta en `unavailable_modes`. Sin ese guardado, `_upsert_challenge_run`
  encontraría la fila que acaba de escribir —es única por `(account_uid, mode, schedule_id)`—
  y la **pisaría** con la segunda lectura, que puede venir recortada o vacía.
- **Los intentos se reconstruyen enteros** en cada sync: `_upsert_challenge_run` limpia
  `run.entries` y los vuelve a crear, para no arrastrar posiciones viejas.
- **`chronicle_public = True` es optimista**: se pone apenas `index` no falló. Si el Chronicle
  fuera privado, `fetch_profile` ya habría levantado `DataNotPublicError`. Nada lo vuelve a
  `False`.
- **Todo el sync es una sola transacción; si algo falla a mitad, no queda nada a medias.** Los
  dos manejadores de error que corren después del fallo —`_mark_credentials_rejected` y
  `_mark_chronicle_failed`— arrancan con `rollback()` justamente para eso: lo primero que
  hacen es tirar el sync incompleto, y lo único que commitean es su propia marca de una
  columna. Un sync que reventó no deja roster ni runs a medio escribir.
- Un sync con éxito **limpia** las dos marcas de fallo: `chronicle_failed_at` explícitamente en
  el paso 11, y `rejected_at` cuando se vuelven a guardar las cookies con `store_credentials`.

`ChronicleSyncReport` devuelve `account`, `runs`, `agents_synced`, `bangboos_synced`,
`lost_void_synced`, `unavailable_modes` y `skipped`.

### Backoff

Cuando HoYoLAB corta —**`RateLimitedError` o `CaptchaRequiredError`**— el tracker deja de salir
a la red para esa cuenta durante una ventana. Insistir contra un rate limit o un captcha es
exactamente lo que lo empeora, así que el freno es automático y no depende de que el cron se
porte bien.

| Pieza | Dónde | Qué hace |
|---|---|---|
| `Account.chronicle_failed_at` | `storage/models.py` | momento del último corte; `None` = sin backoff |
| `Account.is_in_chronicle_backoff(backoff_seconds, now)` | `storage/models.py` | `True` mientras `now < chronicle_failed_at + backoff_seconds` |
| `Account.is_chronicle_sync_due(ttl_seconds, backoff_seconds, now)` | `storage/models.py` | corta por backoff **antes** de mirar el TTL |
| `TrackerService._mark_chronicle_failed` | `tracker/service.py` | `rollback` → recarga por uid → escribe la marca → `commit` |
| `chronicle_backoff_seconds` | `TrackerService.__init__` | default `DEFAULT_CHRONICLE_BACKOFF_SECONDS` = 900 |
| `ZZZ_HOYOLAB_BACKOFF_SECONDS` | `config.py` | default 900; lo cablean `web/deps.py` y `cli.py` |

Reglas exactas:

- Las dos ventanas son **independientes y ambas bloqueantes**: alcanza con que una esté abierta
  para que el sync se salte. El backoff se evalúa primero.
- **`force=True` se salta las dos** (`if not force and not due`). Es la vía para reintentar a
  mano antes de tiempo, sabiendo lo que se hace.
- Un sync saltado por backoff es indistinguible de uno saltado por TTL: `skipped=True`, HTTP
  200, y la CLI dice que la cuenta sigue fresca. No hay campo que los separe.
- `chronicle_failed_at` se limpia **solo con un sync exitoso**. Ni el `force` ni el paso del
  tiempo lo borran: la columna queda con la fecha del último corte hasta que uno funcione.
- `InvalidCredentialsError` **no** arma el backoff; usa el otro camino (`rejected_at`), que es
  permanente hasta que se peguen cookies nuevas. Tiene sentido: unas cookies vencidas no
  mejoran esperando.
- `is_chronicle_sync_due` acepta `backoff_seconds=0` por default, que desactiva el chequeo. Es
  para los llamadores que solo quieren preguntar por el TTL.

## Import desde la extensión

`POST /accounts/{uid}/chronicle/import` recibe el paquete que la extensión de navegador (plan
en `EXTENSION.md`) captura con la sesión del usuario: **el backend no sale a la red**, solo
parsea y persiste. Lo que sigue es la referencia de lo implementado en la fase 1.

- **Auth**: `Authorization: Bearer <ZZZ_API_TOKEN>` (`Settings.api_token`,
  `web/deps.py::require_api_token`). Con la variable vacía el endpoint está deshabilitado y
  responde **503** (`ImportDisabledError`) — mismo patrón que el cipher: env vacía = feature
  apagada. Sin header, con otro esquema o con token errado, **401** (`UnauthorizedError`). La
  comparación usa `secrets.compare_digest`, y el 503 se evalúa antes que el 401.
- **Body**: `ChronicleImportWrite` (`extra="ignore"`): `source`, `extension_version`,
  `captured_at`, `region`, `language` y `payloads`. Cada clave de `payloads` es el `data` ya
  desenvuelto de un endpoint —lo mismo que devuelve `HoyolabClient._get`—, así los `parse_*`
  del mapper se aplican sin adaptador: `index`, `avatar_basic`, `buddy_info`,
  `shiyu_defense` / `deadly_assault` (objeto `{"1": …, "2": …}` por `schedule_type`),
  `lost_void` y `avatar_info` (lista de respuestas crudas).
- **`index` es la única clave obligatoria**: de ahí salen nickname y nivel, y se valida el
  UID. `parse_chronicle_uid` (mapper) busca `game_role_id` / `game_uid` / `uid` / `role_id`
  en la raíz y en las variantes de `PROFILE_KEYS`; si lo que encuentra difiere del `{uid}`
  del path → **422**. Si el `index` no trae ningún UID, no hay nada que refutar y el import
  se acepta. Sin `index` (o `null`) → 422.
- **La cuenta se crea si no existe** (el flujo de la extensión no pasa por la home del
  tracker). Cualquier otra sección ausente o `null` se salta y se lista en
  `skipped_sections`; una temporada presente pero con `has_data == false` va a
  `unavailable_modes`, igual que en el sync.
- **`avatar_info` se acepta pero no escribe builds todavía** (fase 3): se reporta en
  `skipped_sections` y `builds_synced` queda en `0`.
- El import **no** toca `HoyolabCredential` (ni `last_used_at`), ni TTL, ni backoff: no hubo
  red del lado del backend. Sí escribe `chronicle_synced_at`, `region` (la del body; si viene
  vacía se deriva del UID, rechazando China), `chronicle_public = True` y
  `chronicle_import_source = "extension"` (el sync server-side escribe `"server"`; gana el
  último en correr).
- **Un solo camino de persistencia.** `TrackerService._persist_chronicle(account,
  ChroniclePayloads)` hace parse + upsert + bookkeeping + commit tanto para el sync
  server-side (que ahora junta primero todos los payloads con `_fetch_chronicle`) como para
  `import_chronicle`. La regla de fuentes no cambia: `manual` inmune, y el roster importado
  solo escribe `level` + `mindscape_level`, sin tocar las builds de Enka.
- **Respuesta**: `ChronicleImportResponse` = `ChronicleSyncResponse` + `builds_synced` +
  `skipped_sections`.
- **CORS**: el plan asumía que no hacía falta (el POST sale del background con
  `host_permissions`, que saltea CORS), pero en Firefox MV3 los permisos de host son opcionales
  y el fetch del background puede terminar sujeto a CORS igual (preflight `OPTIONS` → 405 sin
  middleware). El app registra `CORSMiddleware` permisivo (`allow_origins=["*"]`, sin
  credenciales): la auth del import es el bearer token, nunca cookies, así que no abre nada.

## API HTTP

`web/routers/chronicle.py`, prefijo `/accounts`, tag `chronicle`. El `{uid}` del path valida
contra `UID_PATTERN` (`^\d{6,16}$`); lo que no matchea lo rechaza FastAPI con su propio 422,
antes de llegar al servicio.

| Método | Ruta | Query / body | Respuesta | Errores |
|---|---|---|---|---|
| `PUT` | `/accounts/{uid}/credentials` | body `{ltuid_v2, ltoken_v2}` (1–32 y 1–512 chars) | `CredentialRead`, **sin el token** | 404 cuenta no trackeada · 422 sin `ZZZ_CREDENTIALS_KEY` o cookies en blanco |
| `DELETE` | `/accounts/{uid}/credentials` | — | 204 sin body | 404 cuenta no trackeada, o cuenta sin credenciales guardadas |
| `POST` | `/accounts/{uid}/chronicle/sync` | `?force=false&previous=true` | `ChronicleSyncResponse` | 401 sin cookies o rechazadas · 403 Chronicle privado · 404 cuenta · 422 UID chino, sin clave o integración no configurada · 429 rate limit · 502 upstream · 503 captcha |
| `POST` | `/accounts/{uid}/chronicle/import` | header `Authorization: Bearer <ZZZ_API_TOKEN>`; body `ChronicleImportWrite` (ver *Import desde la extensión*) | `ChronicleImportResponse` | 401 sin token o token inválido · 422 sin `index`, UID que no coincide, o UID chino sin región · 503 `ZZZ_API_TOKEN` sin configurar |
| `GET` | `/accounts/{uid}/challenges` | `?mode=shiyu_defense\|deadly_assault` | `{items: [ChallengeRunRead]}`, ordenado por `mode` y `schedule_id` desc | 404 cuenta no trackeada |
| `GET` | `/accounts/{uid}/bangboos` | — | `{items: [BangbooRead]}`, ordenado por `game_id` | 404 cuenta no trackeada |
| `GET` | `/accounts/{uid}/lost-void` | — | `LostVoidRead` | 404 cuenta no trackeada, o sin progreso sincronizado |

`?mode=` **no se valida**: un modo desconocido no da 422, devuelve la lista vacía. Sin `mode`
vienen los dos modos juntos.

`ChronicleSyncResponse` trae `account_uid`, `skipped`, `agents_synced`, `bangboos_synced`,
`lost_void_synced`, `unavailable_modes` y `runs`. Un `skipped: true` es **200**, no un error:
significa que el TTL todavía no venció **o que la cuenta está en backoff** (ver *Backoff*).
Los dos errores que arman ese backoff son justamente el `429` y el `503` de esta misma ruta:
el sync siguiente para ese UID se saltará hasta que la ventana cierre, salvo `?force=true`.

El estado del Chronicle se lee además desde el propio `AccountRead` (`GET /accounts` y
`GET /accounts/{uid}`), que expone `region`, `chronicle_public`, `chronicle_synced_at`,
`chronicle_import_source` (`"extension"` / `"server"` / `null`, quién hizo el **último**
sync) y `has_hoyolab_credentials` (si hay una `HoyolabCredential` guardada — el frontend ya
no deduce "tiene credenciales" de que vuelvan datos). `region` cae a `region_for_uid(uid)`
cuando la columna todavía está vacía, así que trae la región derivada aunque la cuenta nunca
se haya sincronizado.

**Todos los datetimes salen en UTC, con `Z`.** SQLite devuelve los `DateTime` sin tzinfo, así
que cada schema los pasa por `as_utc()` al serializar: `AccountRead`, `CredentialRead`,
`ChallengeRunRead`, `ChallengeEntryRead` y `LostVoidRead.from_progress`. Un `synced_at` sin
`as_utc` se serializaría como hora local implícita y mentiría por la diferencia horaria.

Los status salen de `errors.py` (`ZZZTrackerError.status_code`) y los sirve
`register_exception_handlers` como `{"detail": "…"}`.

## CLI

Entrypoint `zzz-tracker` (`[project.scripts]` → `zzz_tracker.cli:app`, Typer).

| Comando | Firma | Para qué |
|---|---|---|
| `new-credentials-key` | sin argumentos | genera la clave Fernet: la imprime por **stdout** y la explicación por **stderr**, así `$(zzz-tracker new-credentials-key)` captura solo la clave sin perder la advertencia |
| `set-credentials` | `<uid>` `[--ltuid X]` `[--ltoken Y]` | guarda las cookies cifradas; sin las opciones las pide interactivo, el token **sin echo**, para que no quede en el historial del shell. Si el servicio falla, imprime `uid: detalle` por stderr y sale con código 1 |
| `sync-chronicle` | `[uid]` `[--force]` `[--no-previous]` | lee el Chronicle. **Sin UID recorre todas las cuentas que tengan credenciales guardadas** — este es el modo pensado para el cron |

`--force` sincroniza aunque el TTL no haya vencido (y aunque la cuenta esté en backoff);
`--no-previous` se traduce a `include_previous=False`, o sea que lee solo la temporada en curso.

`sync-chronicle` no aborta al primer error: reporta cada cuenta que falló por stderr y sale
con código 1 al final si hubo alguna. Por cada cuenta sincronizada imprime agentes y bangboos,
una línea por run (modo, temporada, rating, score y estrellas), el progreso de Lost Void si lo
guardó, y los modos sin datos; si se saltó por TTL o por backoff, dice que sigue fresca y
recuerda `--force`.

### Con UID y sin UID no se comportan igual

La diferencia está en `syncable_uids`, que arma la lista **solo** de la pasada sin UID:

| | `sync-chronicle` (sin UID) | `sync-chronicle <uid>` |
|---|---|---|
| Cuentas sin credenciales | se saltan, en silencio | se intenta → 401 `MissingCredentialsError`, falla visible |
| Cuentas con credenciales **rechazadas** | **se saltan**, avisando por stderr que hay que renovarlas | se intenta → 401 `InvalidCredentialsError`, falla visible |
| Efecto en el código de salida | las saltadas **no** cuentan como fallo | el fallo cuenta: exit 1 |

Es la diferencia entre la pasada automática del cron y una petición explícita. Una cookie
vencida no se arregla reintentando: si el cron la tratara como error, alertaría todos los días
por algo que solo un humano puede resolver, y de paso le pegaría a HoYoLAB con credenciales
que ya sabe que están mal. Pedir un UID concreto, en cambio, es alguien preguntando *qué pasa
con esta cuenta*, y ahí el 401 es exactamente la respuesta que se busca.

Códigos de salida de la pasada sin UID:

- Ninguna cuenta con credenciales guardadas → avisa por stderr y sale con **0**.
- Solo cuentas rechazadas → imprime una línea de aviso por cada una y sale con **0**; no se
  llega a llamar al servicio.
- Alguna cuenta sincronizable que falló → **1**, con la lista de UIDs al final.

## Operación

### Puesta en marcha

```bash
uv run zzz-tracker new-credentials-key      # pegar el resultado en ZZZ_CREDENTIALS_KEY
uv run zzz-tracker set-credentials 1500123456
uv run zzz-tracker sync-chronicle 1500123456
```

### Variables de entorno

`config.py::Settings` usa `env_prefix="ZZZ_"` y lee un `.env` del directorio de trabajo. Las
que tocan a HoYoLAB:

| Variable | Campo | Default | Para qué |
|---|---|---|---|
| `ZZZ_CREDENTIALS_KEY` | `credentials_key` | `""` | clave Fernet de las cookies. Vacía = sin cipher: guardar o leer credenciales da 422 |
| `ZZZ_HOYOLAB_BASE_URL` | `hoyolab_base_url` | `https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz` | host de la API; se sobrescribe para apuntar a un mock |
| `ZZZ_HOYOLAB_LANGUAGE` | `hoyolab_language` | `en-us` | valor de `x-rpc-lang`; define el idioma de los nombres que se persisten |
| `ZZZ_HOYOLAB_SYNC_TTL_SECONDS` | `hoyolab_sync_ttl_seconds` | `3600` | ventana mínima entre syncs de una misma cuenta |
| `ZZZ_HOYOLAB_BACKOFF_SECONDS` | `hoyolab_backoff_seconds` | `900` | cuánto se deja de golpear a HoYoLAB después de un rate limit o un captcha (ver *Backoff*) |
| `ZZZ_API_TOKEN` | `api_token` | `""` | bearer token del import de la extensión. Vacío = endpoint de import deshabilitado (503). Se rota cambiando la env (ver *Import desde la extensión*) |

`ZZZ_DATABASE_URL` la comparten las dos integraciones; el resto (`ZZZ_ENKA_BASE_URL`,
`ZZZ_STATIC_DATA_DIR`, `ZZZ_APP_NAME`) es de Enka y está en `PLAN.md`.

### El cron

**Sin `ttl` upstream.** A diferencia de Enka, HoYoLAB no informa cuándo volver. El ritmo lo
pone el tracker: `hoyolab_sync_ttl_seconds` contra `Account.chronicle_synced_at`.

Un cron diario alcanza: las temporadas duran semanas y solo hacen falta dos lecturas por
temporada para no perder historia. Donde haya un proceso de larga vida con acceso a la base:

```cron
17 4 * * * cd /srv/personal-zzz && uv run zzz-tracker sync-chronicle >> /var/log/zzz-sync.log 2>&1
```

Sin UID recorre cada cuenta con credenciales **usables** —las de cookies rechazadas se saltan,
ver *Con UID y sin UID no se comportan igual*—, y el TTL evita el trabajo repetido si el cron
corre más seguido que la ventana. El código de salida 1 significa "alguna cuenta falló", que
es lo que debería alertar; unas cookies vencidas **no** disparan esa alerta, salen por stderr
sin tocar el código de salida.

**En Vercel no hay proceso donde correr esa CLI**: ahí el cron tiene que golpear
`POST /accounts/{uid}/chronicle/sync` una vez por UID, espaciando las llamadas, y asumir que
sale desde IPs de datacenter.

### Captcha y Vercel

El riesgo operativo grande. Al ser serverless, las peticiones salen de **IPs de datacenter
compartidas**, lo que dispara el captcha (geetest, `app_key: game_record_zzz`, retcodes
1034/10035/5003/10041) y el rate limit — por HTTP 429 o por retcode — mucho más que desde una
IP residencial. El captcha **no se puede resolver headless**.

Consecuencias de diseño, no sugerencias. Las tres están **implementadas**, no libradas al
criterio de quien opere:

- Respetar el TTL; `force` es para depurar, no para el cron. Lo impone
  `is_chronicle_sync_due(ttl_seconds, …)` contra `chronicle_synced_at`.
- **Nunca hacer polling.** Sync bajo demanda o por cron espaciado. El TTL frena el caso normal
  y el **backoff** frena el caso malo: un cron demasiado agresivo, o varios procesos pidiendo
  el mismo UID, no pueden convertir un rate limit en una tormenta de reintentos.
- Tratar `CaptchaRequiredError` (503) y `RateLimitedError` (429) como estados transitorios
  esperables, no como bugs: reintentar más tarde, nunca en bucle. Eso es literalmente lo que
  hace `_mark_chronicle_failed` — el "más tarde" son los `ZZZ_HOYOLAB_BACKOFF_SECONDS` que
  siguen al corte, y el "nunca en bucle" es que durante esa ventana el sync ni siquiera abre
  la conexión: sale por `skipped=True` antes de tocar la red.

El mecanismo completo está en *Backoff*, dentro de *El sync*.

## Tests

Fixtures en `tests/fixtures/`, una por endpoint, sin red:
`hoyolab_index.json`, `hoyolab_avatar_basic.json`, `hoyolab_buddy_info.json`,
`hoyolab_shiyu_v1.json`, `hoyolab_shiyu_v2.json`, `hoyolab_deadly_assault.json`,
`hoyolab_lost_void.json`.

> **Las fixtures están escritas a mano, no son capturas reales.** Nadie tuvo nunca cookies
> válidas contra las que grabarlas. Lo que verifican es que el mapper se comporte como el
> mapper dice comportarse, no que HoYoLAB mande eso. Ver *Lo que no se sabe todavía*.
> Seguirán siendo las inventadas hasta que corra la fase 0 de `EXTENSION.md`, que las
> reemplaza por capturas reales del navegador.

`tests/test_chronicle_import.py` arma el paquete de `POST /accounts/{uid}/chronicle/import`
con **estas mismas fixtures**, que es exactamente lo que la extensión va a subir: cuando la
fase 0 las reemplace por capturas reales, el contrato del import queda verificado sin tocar
los tests.

Las dos de Shiyu existen precisamente para cubrir los dos esquemas: `hoyolab_shiyu_v1.json`
trae `hadal_ver: "v1"` con fechas como dict de partes, y `hoyolab_shiyu_v2.json` trae
`hadal_ver: "v2"` con epochs y la errata `fitfh_layer_detail`. Si alguna vez hay que tocar el
mapper, esas dos son la red de seguridad.

`tests/test_hoyolab_client.py` cubre el transporte —headers, elección de `role_id`/`uid`, el
429 del WAF, cada familia de retcodes y la propagación del `message`— inyectándole al cliente
un `httpx.Client` con transporte falso; `tests/test_hoyolab_mapper.py` cubre el parseo contra
las fixtures.

## Lo que no se sabe todavía

Esta sección es lo contrario de *Limitaciones conocidas*: ahí están las cosas que sabemos que
no se pueden hacer; acá las que **no sabemos si funcionan**. Distinguirlas importa, porque un
agujero de conocimiento se cierra con una tarde de pruebas y una limitación no.

### Deadly Assault no trae rating

Verificado sobre el payload grabado (`tests/fixtures/hoyolab_deadly_assault.json`): **ninguna
clave `rating` ni variante**, ni en la raíz ni en los elementos de `list[]`. El modo se puntúa
con `total_score` y `total_star` (y `star` por intento, explícito), no con letras. Es coherente
con el diseño del modo, no un olvido nuestro — aunque el payload sea reconstruido y no una
captura, ver abajo.

**No es derivable.** `RATING_STARS` manda `S` y `S+` a las **mismas 3 estrellas**, así que no
existe inversa: 3 estrellas no dice si fue `S` o `S+`. Cualquier intento de reconstruir el
rating desde las estrellas sería inventar la mitad de los casos.

Consecuencias visibles, las tres correctas:

| Dónde | Qué se ve |
|---|---|
| `ChallengeRun.rating` | `""` (`_best_rating` sobre intentos sin rating devuelve vacío) |
| CLI | `rating -`, por el `run.rating or '-'` de `echo_report` |
| `ChallengeRunRead.rating` | `""`, string vacío, no `null` |

Si algún día la clave aparece, **no hay que tocar el mapper**:
`_parse_deadly_assault_entry` ya lee `info.get("rating")` de forma tolerante y `_best_rating`
lo levantaría solo. Alcanzaría con actualizar la fixture y borrar esta sección.

### El contrato no está verificado contra la API real

Las fixtures están **escritas a mano** a partir de lo investigado, no capturadas: nadie tuvo
cookies válidas. El mapper está probado contra ellas, o sea que está probado contra *nuestra
idea* del payload. Los helpers `_first_present` del mapper existen precisamente por eso: la
mayoría de los nombres alternativos que prueban son conjeturas, no campos observados.

Lo que **no** está verificado, ordenado por cuánto puede doler:

| Sin verificar | Por qué importa | Si está mal, qué se rompe |
|---|---|---|
| Nombres de campo de **Shiyu V2** (`fitfh_layer_detail`, `layer_challenge_info_list`, `monster_pic`, `brief.*`) | es el esquema más nuevo y el que menos rastro público tiene | la run se guarda con ceros, o `parse_shiyu_defense` cae al camino V1 |
| Si `name` / `boss_name` / `boss_icon` viven en el item o en el layer | el fallback a la capa se escribió sin saberlo | nada, si están en alguno de los dos; el fallback cubre ambos casos |
| Cómo se llaman las **capas bajas** de Shiyu V2 (`first_layer_detail` … `third_layer_detail`) | son conjetura por analogía con `fourth`/`fitfh`, las únicas dos con rastro público | poco: el barrido de `*_layer_detail` las levanta igual, solo que sin `layer_index`. Se pierden únicamente si la clave no termina en `_layer_detail` |
| Qué **capa pertenece a qué nodo** (Estable / Disputado / Inestable) | es lo que haría falta para separar los nodos en la UI | nada hoy: no se infiere. Sin esto, la UI solo puede agrupar por capa |
| **Ausencia de rating en Deadly Assault** | ver arriba | nada: el mapper lo levantaría solo |
| **Lectura del Chronicle de terceros** | razonada sobre la app oficial; el cliente nunca manda `isHost` | `retcode 10102`, o datos de la cuenta propia en vez de la ajena |
| `rank_percent` en **centésimas** (`250` = 2,5 %) | la división por 100 está cableada en `ChallengeRunRead.from_run` | porcentajes 100× mal en toda la UI |
| Forma de **Lost Void** (`abysss2_abstract`) | `parse_lost_void` prueba muchas variantes de clave; ninguna fue observada | progreso todo en `0`, sin error |
| Mapa de **regiones por prefijo de UID** | solo `10`/`13`/`15`/`17`; el resto cae a `prod_gf_eu` | `retcode` de UID inexistente en la región equivocada |
| Qué **retcodes** aparecen de verdad | las cinco familias salen de reportes de terceros | un retcode sin mapear cae a `ExternalServiceError` (502) |

### Checklist para la primera vez con cookies reales

En orden, parando en el primero que falle:

1. **Auth mínima.** `set-credentials` + `sync-chronicle <uid>`. Confirmar que alcanzan
   `ltuid_v2` + `ltoken_v2` y que Global no pide el header `ds`.
2. **Guardar los payloads.** Antes de mirar nada más, sacar los `raw` de `challenge_runs` y
   `lost_void_progress` y **diffearlos contra las fixtures**. Ese diff es el resultado más
   valioso de toda la sesión: convierte las siete fixtures inventadas en fixtures reales.
3. **Shiyu V2.** Chequear `hadal_ver`, si la errata `fitfh_layer_detail` sigue viva, y si
   `name` / `boss_name` / `boss_icon` llegan en el item, en el layer, o en ninguno.
   **Listar todas las claves que terminan en `_layer_detail`**: confirma cómo se llaman las
   capas bajas y si el barrido las está agarrando. Con esas capas a la vista, anotar cuál cae
   en qué nodo — es el dato que falta para separar Estable, Disputado e Inestable en la UI.
4. **Deadly Assault.** Buscar cualquier clave de rating. Si aparece, actualizar la fixture y
   borrar la sección de arriba.
5. **`rank_percent`.** Comparar el número crudo con el porcentaje que muestra la app oficial:
   confirma o tira abajo lo de las centésimas.
6. **Lost Void.** Verificar que los campos no queden todos en `0`, que es como se ve un mapeo
   fallido de este endpoint (no tira error).
7. **Terceros.** Con las mismas cookies, pedir el UID de otra persona con el Chronicle
   público. Si da `10102`, probar mandando `isHost=2` como en la app oficial.
8. **Región.** Si hay UIDs de más de un servidor, verificar el prefijo de cada uno.
9. **Retcodes.** Anotar cualquiera que caiga en el 502 genérico y sumarlo a la familia que
   corresponda en `client.py`.

Cada punto que se confirme se pasa a la sección que corresponda de este documento y se saca de
acá.

## Limitaciones conocidas

- **Notorious Hunt no existe en la API.** No hay endpoint; si se quiere, es carga manual.
- **China no soportada.** Otro host (`api-takumi-record.mihoyo.com`), cookies de Miyoushe y
  header `ds` obligatorio: es una integración entera aparte. `_region_for` la rechaza
  explícitamente con `ValidationError` (422).
- **Solo dos temporadas.** `schedule_type` no acepta más que `1` y `2`; todo lo anterior está
  perdido salvo que ya esté en `challenge_runs`. Por eso la base es el histórico y ningún sync
  borra filas.
- **Lectura de terceros no probada en vivo.** Está razonada sobre el código y el
  comportamiento de la app oficial de HoYoLAB, pero **no se verificó de punta a punta con
  cookies reales**. Ver *Leer el Chronicle de otro UID* y *Lo que no se sabe todavía*.
- **Deadly Assault no expone rating**, y no se puede derivar de las estrellas. Ver *Lo que no
  se sabe todavía*.
- **El captcha no se puede resolver headless.** No hay plan B automático: cuando HoYoLAB lo
  pide, ese sync se pierde y hay que reintentar más tarde.
- **`/note` es solo de la cuenta propia** (retcode 10104), a diferencia del resto del
  Chronicle. El tracker no lo usa.
- **`element` queda como número en string** (`"201"`), sin resolver a nombre de elemento.
- **La rareza de los agentes queda como letra** (`"S"`), sin traducir a la escala numérica de
  Enka; solo los bangboos se traducen.
- **Sin contrato ni versionado.** El esquema puede cambiar sin aviso; por eso `raw`,
  `schema_version` y los helpers tolerantes del mapper.
