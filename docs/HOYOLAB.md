# Integración HoYoLAB — Battle Chronicle (ZZZ)

Documento de referencia de la integración con el Battle Chronicle de HoYoLAB. Es API **no
oficial y sin contrato**: lo que sigue es lo investigado sobre el comportamiento real de los
endpoints, más las decisiones de diseño que se tomaron por eso. El código no lleva
comentarios, así que este documento es la única memoria escrita de la integración.

**El backend no le habla a HoYoLAB. Nunca.** Desde el 2026-09-09 el tracker no tiene cliente
HTTP de HoYoLAB, ni guarda cookies, ni tiene cron: los payloads los captura la extensión de
navegador con la sesión que el usuario ya tiene abierta, y los sube crudos a
`POST /accounts/{uid}/chronicle/import`. Este documento cubre tres cosas, en ese orden: **qué
devuelve cada endpoint** (lo pide la extensión, pero la forma es la misma de siempre), **cómo
se interpretan esos payloads** (el mapper, que vive en el backend y no cambió) y **cómo entran
al tracker**.

Lo que se borró con ese cambio —`hoyolab/client.py`, la tabla `hoyolab_credentials`, el
cifrado Fernet, el sync server-side con su TTL y su backoff, el cron y los tres comandos de
CLI— quedó anotado como historia en `PLAN.md`, *Lo que pasó después del MVP*. Si buscás algo
de eso, ahí está el porqué de que ya no exista.

Complementa a `PLAN.md`, que cubre la integración con Enka.Network, a `EXTENSION.md`, que es
el plan de la extensión, y a `OWNERSHIP.md`, que decide quién puede escribir una cuenta.

## Qué aporta frente a Enka

| | Enka.Network | HoYoLAB Chronicle |
|---|---|---|
| Autenticación | ninguna | la sesión del navegador del usuario |
| Roster | solo los agentes **exhibidos** | **todo** el roster poseído |
| Detalle de build | W-Engine + discos completos | W-Engine + discos completos (`avatar/info`), un request por agente |
| Bangboos | no | sí |
| Modos de fin de juego | no | Shiyu Defense, Deadly Assault, Lost Void |
| Caché | `ttl` propio en la respuesta | ninguno: se lee cuando el usuario importa |

Desde que la extensión pide `avatar/info`, HoYoLAB dejó de dar solo amplitud y da también la
build entera, así que se solapan casi del todo. Enka se queda igual porque es gratis y no pide
nada: refresca el showcase sin que nadie instale nada, y es lo único que funciona para un UID
ajeno. Los dos escriben las mismas filas y gana el último que corre — ver *Qué pisa qué*.

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

## La sesión vive en el navegador

Hacen falta exactamente **dos cookies**: `ltuid_v2` y `ltoken_v2`. `cookie_token_v2` y
`account_id_v2` **no** son necesarias (la primera sirve solo para canjear códigos de regalo).

Nada de eso pasa por acá. Las cookies ya están en el navegador de quien importa, el fetch sale
de un content script inyectado en `https://act.hoyolab.com/*` —el único origen para el que la
API devuelve `access-control-allow-origin`— y lo que llega al tracker es el `data` crudo de
cada endpoint. **El backend no tiene dónde guardar una cookie ni con qué cifrarla**: la tabla
`hoyolab_credentials` y `storage/crypto.py` se borraron. El peor caso de que alguien se robe
una cuenta del tracker dejó de ser "maneja tu sesión de HoYoLAB" y pasó a ser "te ensucia datos
de tracking", que es lo que le permite a `OWNERSHIP.md` ser un modelo de un solo nivel.

En Global **no** hace falta el header `ds` / dynamic secret: la propia app web de HoYoLAB no
lo manda. China sí lo exige, pero es otra integración entera y no está soportada.

Los headers los pone `extension/lib/hoyolab.ts::hoyolabHeaders`, y son los que manda el cliente
oficial:

```
x-rpc-lang / x-rpc-language: en-us
x-rpc-platform: 4
x-rpc-device_id: (vacío)
x-rpc-device_fp: (vacío)
```

No hay `Cookie`, `Referer` ni `User-Agent` en esa lista, y no es un olvido: los pone el
navegador solo, porque la petición sale de una pestaña de `act.hoyolab.com`. Es la mitad de la
gracia de haber movido el fetch ahí — los headers son auténticos sin tener que imitarlos.

`ltoken_v2` **caduca**. Cuando pasa, HoYoLAB responde `retcode -100` / `10001`, la extensión lo
clasifica como `invalid_session` y le dice al usuario que vuelva a iniciar sesión en
hoyolab.com. No hay nada que marcar en la base: sin credenciales guardadas no existe el estado
"estas cookies están vencidas", y la próxima vez que el usuario importe, o funciona o vuelve a
pedirle login.

### Leer el Chronicle de otro UID

Con **tus** cookies se puede leer el Chronicle de **otro** UID: se pasan el `uid` y la
`region` del otro como query params, y las cookies siguen siendo las tuyas. La app oficial
hace exactamente eso: mantiene `uid` (el propio) y `viewUid` (el consultado) y manda
`isHost: 1|2` para distinguir.

Requisito: que el dueño tenga el Battle Chronicle público (`switch_id: 1`). Si no →
`retcode 10102`. Excepción: `/note` (notas en tiempo real) es solo de la cuenta propia →
`retcode 10104`.

> Razonado sobre el comportamiento de la app oficial, **no probado de punta a punta**. La
> extensión no lo usa: importa el UID que descubre con `getGameRecordCard`, que es el de la
> sesión abierta. Queda anotado porque es lo que haría falta si algún día se quiere importar
> la cuenta de otra persona.

## Endpoints

Base: `https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz`
(`HOYOLAB_BASE_URL` en `extension/lib/hoyolab.ts`, el único módulo donde viven estas URLs).
Aparte, y con otro host, `getGameRecordCard`
(`https://sg-act-public-api.hoyolab.com/game_record/card/wapi/getGameRecordCard?uid=<ltuid_v2>`),
que es de dónde salen el `role_id`, la región y el nickname: **el usuario no tipea el UID ni
elige servidor**.

### La trampa de los parámetros

Los endpoints se reparten en dos convenciones **para los mismos dos valores**:

| Convención | Endpoints |
|---|---|
| `role_id` + `server` | `index`, `avatar/basic`, `avatar/info`, `buddy/info`, `hadal_info_v2` |
| `uid` + `region` | el resto (`hadal_mem_detail_v2`, `abysss2_abstract`) |

Está resuelto de una sola manera: el mapa `ENDPOINTS` le pone a cada endpoint su `uidParam`, y
`chronicleUrl` arrastra de ahí el nombre del parámetro de región (`role_id` → `server`,
`uid` → `region`). Que la convención de cada endpoint esté escrita al lado de su path es
deliberado: agregar uno obliga a elegir, en vez de heredar un default y descubrir el error
contra la API.

| Sección del bundle | Path | Params | Devuelve |
|---|---|---|---|
| `record_card` | `getGameRecordCard` (otro host) | `uid` = `ltuid_v2` | `game_role_id`, `region`, `nickname`, `level` de cada juego; la extensión recorta la entrada de ZZZ |
| `index` | `index` | `role_id`, `server` | `stats`, `avatar_list`, `buddy_list` — **sin perfil**, ver *Lo que no se sabe todavía* |
| `avatar_basic` | `avatar/basic` | `role_id`, `server` | `avatar_list`: roster completo con `level` y `rank` |
| `avatar_info` | `avatar/info` | `role_id`, `server`, `id_list[]` | la build entera de **un** agente |
| `buddy_info` | `buddy/info` | `role_id`, `server` | `list`: bangboos poseídos |
| `shiyu_defense` | `hadal_info_v2` | `role_id`, `server`, `schedule_type` | Shiyu de la temporada |
| `deadly_assault` | `hadal_mem_detail_v2` | `uid`, `region`, `schedule_type` | Deadly Assault de la temporada |
| `lost_void` | `abysss2_abstract` | `uid`, `region` | progreso acumulado de Hollow Zero |

`abysss2` con tres eses es la errata real de HoYoLAB, no un typo del repo.

De cada respuesta se sube el `data` crudo, sin tocar: el parseo lo hace el mapper del backend,
que es donde ya estaba. La extensión mira el `retcode` y nada más.

### `avatar/info`: la build completa, un agente por request

El endpoint más caro del bundle, y el único con URL propia en la extensión
(`avatarInfoUrl`). Verificado el 2026-08-30 contra la API real, con captura guardada en
`tests/fixtures/hoyolab_avatar_info.json`.

```
GET …/api/zzz/avatar/info?id_list[]=<game_id>&need_wiki=false&role_id=<uid>&server=<region>
```

Dos cosas que cuestan una tarde si se descubren a mano:

- **Los corchetes van repetidos, no indexados.** `id_list[]=1091` responde `retcode 0`;
  `id_list[0]=1091` responde **`-400005` "Parameter Error"**. El plan original decía lo
  contrario, leyendo el bundle desminificado.
- **Acepta un solo id por request.** `id_list[]=a&id_list[]=b` también da `-400005`, con 3 ids
  y con 36. Un roster de 36 agentes son 36 requests: ~50 s serializados con jitter de
  300–800 ms. Por eso el import de la extensión es incremental contra `avatar/basic`, que en un
  único request da `level` y `rank` de todo el roster.

`need_wiki=false` saca `avatar_wiki` / `strategy_wiki` / `equip_wiki` / `weapon_wiki`, que son
links a la wiki y ruido para el tracker. La respuesta trae `data.avatar_list` con **un**
agente.

#### Mapeo a los modelos, y las dos trampas

El espacio de ids es **el mismo que el de Enka**: `StaticData.disc_rarity()` y
`disc_set_id()` responden bien con el `equip[].id` de HoYoLAB. Todo lo de abajo se verificó
contra los seis agentes que ya estaban guardados por Enka en una cuenta real — coincidencia
exacta en 137 substats, 36 discos, 6 W-Engines y 36 skills.

| Modelo | De dónde sale |
|---|---|
| `Agent.mindscape_level` | `rank` |
| `Agent.skill_levels` | `skills[]` como `{str(skill_type): level}`; los `skill_type` (0,1,2,3,5,6) son las mismas claves que guarda Enka |
| `Agent.core_skill_enhancement` | `skills[skill_type=5].level - 1` (HoYoLAB 7 ≡ Enka 6) |
| `Agent.promotion_level` | **no viene**: se deriva del `level` |
| `DriveDisc.slot` | `equip[].equipment_type` |
| `DriveDisc.game_id` / `set_id` | `equip[].id` / `equip[].equip_suit.suit_id` |
| `DriveDisc.roll_count` | **no viene**: `level // 3` (un disco nivel 15 tiene 5) |
| `WEngine.phase` | `weapon.star` |
| `WEngine.modification_level` | **no viene**: se deriva del `level` |

**Trampa 1 — el valor del substat está acumulado.** HoYoLAB manda el total (`base: "27"` con
`level: 3`) y el modelo guarda **el paso por tirada**, que es lo que publica Enka (`value: 9`).
La conversión es `value = base / level`. Mapear `base` directo triplica los substats y rompe
todos los scores sin que salte ningún test.

**Trampa 2 — `base` es un string y los porcentajes van ×100.** `"38"` → `38`, `"4.8%"` → `480`.
Es la escala de Enka y la que espera `formatStatValue` en el frontend.

El conteo de tiradas es `properties[].level`, **no** `properties[].add`: `add` son las mejoras
posteriores y `level` es el total incluyendo la inicial, que es lo que significa `rolls` en el
modelo. La aritmética lo confirma: un disco nivel 15 tiene 5 mejoras, así que sus substats
suman 8 o 9 tiradas (3 o 4 iniciales + 5), y eso es exactamente lo que suman.

**Lo que HoYoLAB da y Enka no**: el `main_properties` de cada disco. Enka nunca lo mandó (los
36 discos capturados tienen `main_stat_id` en NULL), así que el import de la extensión no solo
agrega los agentes fuera del showcase: completa el stat principal de los que ya estaban.

**Lo que Enka da y HoYoLAB no**: `item_uid` de discos y W-Engines, `weapon_effect_state` y
`obtained_at`.

### Temporadas: solo hay dos

`schedule_type` acepta `1` (`SCHEDULE_CURRENT`) y `2` (`SCHEDULE_PREVIOUS`). **No hay más
historia disponible.** Por eso `challenge_runs` persiste cada temporada y ningún import borra
filas: la base es el único sitio donde el histórico sobrevive.

## Errores de HoYoLAB

Los ve la extensión, no el backend: para cuando el bundle llega al tracker, todo lo que podía
fallar contra HoYoLAB ya falló o ya salió bien. `extension/lib/hoyolab.ts` es donde están
mapeados, en dos pasos.

### 1. HTTP, que casi nunca dice nada

Fuera del throttle del WAF, HoYoLAB responde **HTTP 200 para todo**; el estado real viene en el
`retcode` del body. Un 429 sí llega como HTTP, y desde una IP residencial es raro — era el
escenario más probable cuando las peticiones salían de Vercel, y esa es justamente una de las
razones por las que ya no salen de ahí.

### 2. Por retcode

`classifyRetcode` traduce el número a una de ocho clases, y `userMessage` a una frase que el
popup puede mostrar sin que el usuario sepa qué es un retcode:

| Retcodes | Clase | Qué se le dice al usuario |
|---|---|---|
| `0` | `ok` | — |
| `-100`, `10001` | `invalid_session` | iniciá sesión en hoyolab.com y volvé a importar |
| `10102`, `10104` | `not_public` | el Chronicle de esa cuenta no está público |
| `10101`, `-110`, `1028` | `rate_limited` | esperá unos minutos y reintentá; no se reintenta solo |
| `1034`, `10035` | `captcha` | abrí `act.hoyolab.com`, resolvé el captcha y reintentá a mano |
| `10041` | `hard_limit` | HoYoLAB cortó el acceso: se cancela el import entero |
| `-400005` | `bad_params` | **es un bug nuestro**, no de tu sesión: reportalo con el trace |
| cualquier otro | `error` | devolvió un error (retcode N) |

Dos cosas que se decidieron y conviene no revertir sin datos:

- **`5003` no está en la familia captcha.** No aparece en el bundle de ZZZ; en `genshin.py` es
  "ya reclamado" de recompensas diarias. Queda fuera hasta que se lo observe de verdad.
- **`-400005` se distingue del resto** en vez de caer en el error genérico. Significa que
  armamos mal la query —le pasó a `avatar/info` con `id_list` indexado y con más de un id—, y
  decirle al usuario que su sesión venció cuando el bug es nuestro manda a revisar el lugar
  equivocado.

`STOP_KINDS` (`invalid_session`, `hard_limit`, `rate_limited`, `captcha`) corta el import en
vez de seguir con la sección siguiente: insistir contra un rate limit o un captcha es
exactamente lo que lo empeora. **Nunca se reintenta solo.** El resto de los fallos son de una
sección y no invalidan el import: lo que sí se capturó viaja igual y lo que no aparece como
sección saltada.

**El `message` de HoYoLAB se propaga siempre** que venga no vacío, y el `x-trace-id` también:
son lo único que explica *por qué* rechazó y lo único con lo que se puede correlacionar un
fallo, así que no se descartan nunca.

### Regiones

Se derivan del prefijo del UID, y la tabla está escrita **dos veces**: en
`storage/models.py::region_for_uid` y en `extension/lib/hoyolab.ts::regionForUid`. Es
duplicación a propósito, la misma que impone la regla de separación estricta del repo: la
extensión tiene que elegir el `server` de cada URL antes de que exista ninguna cuenta en el
tracker, y el backend tiene que poder desconfiar de la región que le mandan.

| Prefijo | Región | Servidor |
|---|---|---|
| `10` | `prod_gf_us` | América |
| `13` | `prod_gf_jp` | Asia |
| `15` | `prod_gf_eu` | Europa |
| `17` | `prod_gf_sg` | TW/HK/MO |
| 8 dígitos exactos | `CHINA_REGION` (`prod_gf_cn`) | China — **no soportado** |

El largo 8 se chequea **antes** que el prefijo. Prefijo desconocido cae a `DEFAULT_REGION`
(`prod_gf_eu`); del lado de la extensión, un UID chino devuelve `null` y no se importa. El
valor efectivo se cachea en `Account.region` (lo escribe el import) y
`TrackerService._region_for` **rechaza** los UIDs chinos con `ValidationError`.

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
"¿parseé al menos un intento?". Una temporada sin jugar no llega a persistirse (ver *El import*).

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
| `bangboos` | `Bangboo` | N por cuenta, único por `(account_uid, game_id)` |
| `challenge_runs` | `ChallengeRun` | una temporada de un modo; único por `(account_uid, mode, schedule_id)` |
| `challenge_run_entries` | `ChallengeRunEntry` | un intento dentro de la temporada; único por `(run_id, position)`, con `layer_index` / `layer_id` para saber de qué capa salió |
| `lost_void_progress` | `LostVoidProgress` | PK = `account_uid`: fila única por cuenta (es un acumulado, no una temporada) |

Todas cuelgan de `accounts.uid` con `ON DELETE CASCADE`. `Account` suma cuatro columnas, y
las cuatro se exponen en `AccountRead`: `region`, `chronicle_public`, `chronicle_synced_at` y
`chronicle_import_source` (migración `0004`), que hoy solo puede valer `"extension"` o `NULL`
—el valor `"server"` existió mientras el backend sincronizaba y no lo escribe nadie más—.
`hoyolab_credentials` y `accounts.chronicle_failed_at` (la marca del backoff) las dropea la
migración `0007_drop_hoyolab_credentials`.

`agent_build_snapshots` guarda el `data` crudo de cada `avatar/info`, una fila por cuenta y
agente, pisada en cada import: es el equivalente al `raw` de las runs para las builds.

`ChallengeRun` es compartida por Shiyu Defense y Deadly Assault porque los registros tienen
la misma forma (ventana de temporada, puntaje global, un puñado de intentos); los distingue
`mode` (`MODE_SHIYU_DEFENSE` / `MODE_DEADLY_ASSAULT`).

En `ChallengeRunEntry`, `agents` es un **snapshot** JSON del equipo tal como estaba ese día
(`ParsedChallengeAgent.as_snapshot()`: `game_id`, `level`, `rarity`, `element`, `mindscape`,
`icon`), no un FK al roster: así el registro sigue diciendo la verdad después de que esos
agentes suban de nivel.

`ChallengeAgentRead.icon` tiene default `""` a propósito: las filas guardadas antes de que el
snapshot incluyera el icono siguen deserializando sin romper el endpoint. No hay migración de
datos para rellenarlas — se completan solas cuando un import vuelva a escribir esa temporada.

### `rank_percent` se guarda en centésimas

`rank_percent` se persiste **crudo, en centésimas de punto porcentual, tal como lo manda
HoYoLAB**: `250` significa 2,5 %. La columna es `Integer`, y el mapper y el servicio lo pasan
tal cual.

La división por 100 la hace **una sola capa**: `ChallengeRunRead.from_run`, al serializar
(`rank_percent=None if run.rank_percent is None else run.rank_percent / 100`, expuesto como
`float | None`). Es una trampa fácil de duplicar: si un consumidor vuelve a dividir, el número
queda cien veces más chico.

### Qué pisa qué

**No hay ranking de fuentes ni constante de precedencia.** La regla implementada es una sola,
y la chequean los tres caminos de escritura:

> un agente con `source == "manual"` no se sobrescribe nunca; el resto sí.

Es lo que mira `Agent.is_manual`. Crear o editar un agente por la API (`create_agent` /
`update_agent`) es lo que lo marca `manual`, y eso lo vuelve inmune a toda escritura posterior,
venga de donde venga.

Entre las otras dos no hace falta ranking porque **describen lo mismo con distinta latencia**:

| Camino | Qué escribe |
|---|---|
| `_upsert_agent` (Enka) | build completa: nivel, promoción, skills, W-Engine, discos — solo de los agentes exhibidos |
| `_upsert_roster_agent` (`avatar/basic`) | `level` y `mindscape_level` — de **todo** el roster |
| `_upsert_hoyolab_build` (`avatar/info`) | build completa — de los agentes que el import trajo |

Los dos que escriben builds enteras comparten cuerpo (`_write_build`) y se pisan entre sí:
gana el último que corre. Dentro de un mismo import el orden también está fijado, y por eso
`_persist_builds` va **después** del roster: el dato completo tiene que ganarle al parcial que
`avatar/basic` acaba de escribir para el mismo agente.

Un agente que el roster descubre por primera vez nace con `source = "hoyolab"` y sin build,
hasta que llegue su `avatar/info` o hasta que el jugador lo exhiba en Enka. Asimetría a tener
presente: los dos caminos de build reescriben `source` en cada pasada, mientras que
`_upsert_roster_agent` solo lo fija al **crear** la fila y no toca el de los que ya existían.

Las constantes que existen en `storage/models.py` son `SOURCE_ENKA`, `SOURCE_MANUAL`,
`SOURCE_HOYOLAB`, `MODE_SHIYU_DEFENSE`, `MODE_DEADLY_ASSAULT`, `REGIONS_BY_UID_PREFIX`,
`DEFAULT_REGION`, `CHINA_REGION` y `region_for_uid`.

## El import: la única puerta

`POST /accounts/{uid}/chronicle/import` recibe el paquete que la extensión captura con la
sesión del usuario (`EXTENSION.md`). Es **el único camino por el que entra un dato de
HoYoLAB** y **la única forma de que una cuenta consiga dueño**. El backend no sale a la red:
parsea y persiste, nada más.

### Quién puede importar

Lo decide el modelo de propiedad (`OWNERSHIP.md`), no el token. La regla, en
`TrackerService._ensure_import_allowed`, tiene dos ramas y ninguna más:

- **La cuenta no tiene dueño** → entra, y el import la reclama: la respuesta trae la
  `account_key`, una sola vez. Da igual que la cuenta ya estuviera trackeada desde la web,
  porque trackear no reclama nada.
- **La cuenta tiene dueño** → hace falta su key en `X-Account-Key`. Con la key vigente se
  importa y la key **no** rota; sin ella, **403** (`forbidden`) y no se escribe nada.

Que un bundle no pruebe nada es el punto de partida, no una limitación a resolver: es un JSON
que arma el cliente, así que el UID que nombra lo elige el que lo manda, y un UID es público.
Por eso el primer import se lleva la cuenta —no había nada que llevarse— y a partir de ahí
manda la key. La recuperación del dueño que perdió la suya no pasa por el navegador: es
`zzz-tracker rotate-key <uid>`, donde vive la base.

`ZZZ_API_TOKEN` es una reja opcional encima de eso. Vacío —el default—, `require_api_token`
sale temprano y el import entra igual. Seteado, además hay que mandar
`Authorization: Bearer <ZZZ_API_TOKEN>`, y sin él, con otro esquema o con el token errado
responde **401** (`unauthorized`), comparando con `secrets.compare_digest`. Un token que viaja
adentro de una extensión publicada no es un secreto, así que nunca puede ser la única defensa.

### El paquete

`ChronicleImportWrite` (`extra="ignore"`): `source`, `extension_version`, `captured_at`,
`region`, `language` y `payloads`. Cada clave de `payloads` es el `data` ya desenvuelto de un
endpoint, así los `parse_*` del mapper se aplican sin adaptador: `record_card`, `index`,
`avatar_basic`, `buddy_info`, `shiyu_defense` / `deadly_assault` (objeto `{"1": …, "2": …}`
por `schedule_type`), `lost_void` y `avatar_info` (lista de respuestas crudas, una por agente).

- **`index` es la única clave obligatoria**, y alcanza con que esté y no venga vacía: no se le
  exige un `role`, porque el `index` real de HoYoLAB no trae perfil. Sin `index` (o `null`)
  → **422**.
- **El UID se busca primero en `record_card` y si no en el `index`** (`parse_chronicle_uid`:
  `game_role_id` / `game_uid` / `uid` / `role_id`, en la raíz y en las variantes de
  `PROFILE_KEYS`); si lo que encuentra difiere del `{uid}` del path → **422**. Que no nombre
  ningún UID no cambia nada: la captura de `record_card` falla a menudo, así que exigirlo
  castigaría al usuario honesto sin frenar a nadie —el UID que nombra no es prueba de nada—.
- **`record_card`** es la entrada de ZZZ de `getGameRecordCard`, recortada por la extensión a
  `game_role_id`, `nickname`, `region`, `level`, `is_public` y `has_role`; recortada a
  propósito, porque la card trae también las otras cuentas de HoYoverse del usuario. De ahí
  salen el nombre y el nivel de la cuenta, que el `index` no trae. **Nunca** se reporta como
  sección saltada: no es un endpoint del chronicle.
- **La `region` del body se valida en dos capas, y no se comportan igual.** Por HTTP el schema
  rechaza con **422** una región que no existe (vacío sí se acepta: significa "deducila del
  UID"); llamando al caso de uso `import_chronicle()` directo —tests— `_import_region`
  **reemplaza** lo desconocido por lo que implica el prefijo del UID en vez de romper. Lo que
  no puede pasar es que una región inventada se guarde: es la que decide a qué host habría que
  pedirle algo de esa cuenta.
- **La cuenta se crea si no existe**, porque el flujo de la extensión no pasa por la home del
  tracker.

### Qué se persiste, y en qué orden

`TrackerService._persist_chronicle` hace parse, upsert, bookkeeping y **un solo `commit`**:

1. Nombre y nivel de la cuenta, de `record_card`, o del `index`, o del `nick_name` que firman
   los payloads de challenge — el primero que sepa contestar (`_name_account`).
2. `region` y `chronicle_public = True`.
3. `avatar_basic` → upsert del roster; `agents_synced` cuenta los escritos (los `manual` se
   saltan y no cuentan).
4. `buddy_info` → upsert de bangboos.
5. Por cada `schedule_type` y cada modo: parse + upsert de la temporada.
6. `lost_void` → upsert del acumulado.
7. `avatar_info` → builds completas, **después** del roster para que el dato completo pise al
   parcial; `builds_synced` cuenta los agentes escritos y el `data` crudo de cada uno queda en
   `agent_build_snapshots`.
8. `chronicle_synced_at = now`, `chronicle_import_source = "extension"`.

Detalles que importan:

- **Una sección ausente o `null` se salta y se lista en `skipped_sections`.** Un import parcial
  es válido: la extensión sube lo que pudo capturar. `avatar_info` cae ahí también cuando viene
  vacía, que es lo normal en un import incremental donde ningún agente cambió.
- **Una temporada sin jugar no crea fila.** Si el parseo devuelve `None` se ignora en silencio;
  si da `has_data == False`, el modo va a `unavailable_modes` (deduplicado, conservando el
  orden) y no se persiste nada.
- **Una temporada repetida se guarda una sola vez.** Si llega el mismo `schedule_id` para
  `schedule_type=1` y `=2` —lo esperable si no hay temporada anterior que servir—, el set
  `seen_seasons` de `(mode, schedule_id)` lo detecta y **gana la actual**, que se recorre
  primero: la segunda aparición se descarta entera, ni se persiste ni se cuenta como
  indisponible. Sin ese guardado, `_upsert_challenge_run` encontraría la fila que acaba de
  escribir —es única por `(account_uid, mode, schedule_id)`— y la pisaría con una lectura que
  puede venir recortada.
- **Los intentos se reconstruyen enteros** en cada import: `_upsert_challenge_run` limpia
  `run.entries` y los vuelve a crear, para no arrastrar posiciones viejas.
- **`chronicle_public = True` es optimista**: se pone apenas hay `index`. Si el Chronicle fuera
  privado, la extensión ni habría podido capturarlo (`retcode 10102`). Nada lo vuelve a `False`.
- **Todo es una sola transacción.** Si algo revienta a mitad, no queda un roster a medio
  escribir.

### La respuesta

`ChronicleImportResponse`: `account_uid`, `agents_synced`, `bangboos_synced`, `builds_synced`,
`lost_void_synced`, `runs`, `unavailable_modes`, `skipped_sections` y `account_key`.

`account_key` trae la key **sólo cuando este import reclamó la cuenta**; si el que llamó ya
presentó la vigente, vuelve `null`, así un cliente nunca guarda una key que no le están
entregando. Se devuelve una sola vez: la base guarda el `sha256` y nada la vuelve a mostrar.

### CORS

El plan asumía que no hacía falta —el POST sale del background con `host_permissions`, que
saltea CORS—, pero en Firefox MV3 los permisos de host son opcionales y el fetch del background
puede terminar sujeto a CORS igual (preflight `OPTIONS` → 405 sin middleware). El app registra
`CORSMiddleware` permisivo (`allow_origins=["*"]`, **sin credenciales**): lo que autoriza son
headers que el cliente pone a propósito —la account key, y el bearer si está configurado—,
nunca cookies, así que abrir el origen no abre nada. Un navegador cualquiera no tiene la key de
la cuenta por el solo hecho de estar logueado en algún lado.

## API HTTP

`web/routers/chronicle.py`, prefijo `/accounts`, tag `chronicle`. El `{uid}` del path valida
contra `UID_PATTERN` (`^\d{6,16}$`); lo que no matchea lo rechaza FastAPI con su propio 422,
antes de llegar al servicio.

Quedaron cuatro rutas: **una escritura y tres lecturas**. Las lecturas son públicas, como todas
las del tracker.

| Método | Ruta | Query / body | Respuesta | Errores |
|---|---|---|---|---|
| `POST` | `/accounts/{uid}/chronicle/import` | header `X-Account-Key` (hace falta sólo si la cuenta ya tiene dueño) y `Authorization: Bearer <ZZZ_API_TOKEN>` **sólo si el backend tiene el token seteado**; body `ChronicleImportWrite` | `ChronicleImportResponse` | 401 token faltante o inválido, únicamente donde hay token configurado · 403 la cuenta tiene dueño y no vino su key · 422 sin `index`, UID que no coincide, o región inexistente |
| `GET` | `/accounts/{uid}/challenges` | `?mode=shiyu_defense\|deadly_assault` | `{items: [ChallengeRunRead]}`, ordenado por `mode` y `schedule_id` desc | 404 cuenta no trackeada |
| `GET` | `/accounts/{uid}/bangboos` | — | `{items: [BangbooRead]}`, ordenado por `game_id` | 404 cuenta no trackeada |
| `GET` | `/accounts/{uid}/lost-void` | — | `LostVoidRead` | 404 cuenta no trackeada, o sin progreso importado |

`?mode=` **no se valida**: un modo desconocido no da 422, devuelve la lista vacía. Sin `mode`
vienen los dos modos juntos.

El estado del Chronicle se lee además desde el propio `AccountRead` (`GET /accounts` y
`GET /accounts/{uid}`), que expone `region`, `chronicle_public`, `chronicle_synced_at`,
`chronicle_import_source` (`"extension"` o `null`) y `has_owner`. `region` cae a
`region_for_uid(uid)` cuando la columna todavía está vacía, así que trae la región derivada
aunque la cuenta nunca haya importado nada.

**Todos los datetimes salen en UTC, con `Z`.** SQLite devuelve los `DateTime` sin tzinfo, así
que cada schema los pasa por `as_utc()` al serializar: `AccountRead`, `ChallengeRunRead`,
`ChallengeEntryRead` y `LostVoidRead.from_progress`. Un `synced_at` sin `as_utc` se
serializaría como hora local implícita y mentiría por la diferencia horaria.

Los status salen de `errors.py` (`ZZZTrackerError.status_code`) y los sirve
`register_exception_handlers` como `{"detail": "…", "code": "…"}`. **El cliente ramifica por
`code`, nunca por el texto ni por el status solo**: el `detail` está escrito para una persona y
puede cambiar sin aviso, y un status puede significar dos cosas (409 es `conflict` y también
`unclaimed_account`). Los que puede devolver el Chronicle:

| status | code | cuándo |
|---|---|---|
| 401 | `unauthorized` | falta el `Bearer` donde `ZZZ_API_TOKEN` está configurado |
| 403 | `forbidden` | la cuenta tiene dueño y el import no trae su `X-Account-Key` |
| 404 | `not_found` | la cuenta no está trackeada, o no hay lo que se pide |
| 422 | `validation_error` | falta `index`, el UID no coincide, la región no existe |

La lista completa de codes está en `errors.py` y la pinea `tests/test_errors.py`: renombrar uno
es un cambio incompatible. Los 422 que arma FastAPI por el schema mantienen su propio formato y
no traen `code`.

## Operación

### Puesta en marcha

No hay ninguna: el backend no necesita saber nada de HoYoLAB para arrancar. Los datos entran
cuando el usuario quiere, desde su navegador —instalar la extensión, apuntarla al tracker,
estar logueado en hoyolab.com y darle a *Importar*—, y el paso a paso está en
`extension/README.md`.

### Variables de entorno

Una sola toca a HoYoLAB, y es opcional:

| Variable | Campo | Default | Para qué |
|---|---|---|---|
| `ZZZ_API_TOKEN` | `api_token` | `""` | bearer **opcional** del import: reja extra encima de la account key, no la que autoriza. Vacío = no se pide; seteado = además hay que mandarlo o 401. Se rota cambiando la env |

Las que había —`ZZZ_CREDENTIALS_KEY`, `ZZZ_HOYOLAB_BASE_URL`, `ZZZ_HOYOLAB_LANGUAGE`,
`ZZZ_HOYOLAB_SYNC_TTL_SECONDS`, `ZZZ_HOYOLAB_BACKOFF_SECONDS`— se borraron con el cliente. El
idioma de los nombres que se persisten ahora lo elige la extensión (`x-rpc-lang`, `en-us` por
defecto), que es quien hace la petición. La lista completa de settings, con sus defaults, está
en `.env.example`.

### No hay cron, y es a propósito

El tracker no sincroniza solo. No hay proceso, no hay `ZZZ_HOYOLAB_SYNC_TTL_SECONDS` que
respetar y no hay backoff que armar, porque no hay ninguna petición nuestra que frenar: el
import ocurre cuando una persona aprieta un botón en su navegador.

La razón es el captcha. Las peticiones a HoYoLAB desde **IPs de datacenter compartidas** —que
es lo único que hay en un serverless— disparan el geetest (`app_key: game_record_zzz`, retcodes
1034/10035/10041) y el rate limit mucho más que desde una IP residencial, y **el captcha no se
puede resolver headless**: no hay plan B automático. Un sync server-side en Vercel iba a fallar
de a ratos, sin forma de recuperarse solo, y arrastraba todo lo demás: guardar las cookies del
usuario en nuestra base, cifrarlas, un secreto obligatorio para eso, un TTL, un backoff, una
marca de cookies rechazadas y un cron en una máquina propia para esquivar el problema.

Nada de eso existe ya. En el navegador del usuario el captcha se puede **mostrar y resolver**,
las cookies son las suyas y nunca salen de ahí, la IP es residencial y el ritmo lo pone él. El
precio es que el Chronicle está tan fresco como el último import manual, y es un precio
barato: las temporadas duran semanas.

Lo que la extensión sí hace, y hay que mantener, es no golpear en ráfaga: `avatar/info` acepta
un id por request, así que las builds van serializadas y con jitter de 300–800 ms, y el import
es **incremental** contra `avatar/basic`. Y ante `rate_limited`, `captcha`, `invalid_session` o
`hard_limit` corta y avisa: **nunca reintenta sola**.

## Tests

Fixtures en `tests/fixtures/`, una por sección del bundle y sin red: `hoyolab_record_card.json`,
`hoyolab_index.json`, `hoyolab_avatar_basic.json`, `hoyolab_avatar_info.json`,
`hoyolab_buddy_info.json`, `hoyolab_shiyu_v1.json`, `hoyolab_shiyu_v2.json`,
`hoyolab_deadly_assault.json` y `hoyolab_lost_void.json`.

> **Mitad capturas reales, mitad escritas a mano.** `avatar_info` y `record_card` salieron de
> la fase 0 (`extension/scripts/capture.js`, con la sesión del usuario, 2026-08-30); el resto
> sigue siendo lo que imaginamos que devuelve la API. Lo que verifican esas es que el mapper se
> comporte como dice comportarse, no que HoYoLAB mande eso — y en al menos dos casos ya se sabe
> que **no** manda eso: el `index` real no trae `role` y el payload real de Lost Void no trae
> ninguna de las claves de la fixture. Ver *El contrato, verificado a medias*.

`tests/test_chronicle_import.py` arma el paquete de `POST /accounts/{uid}/chronicle/import` con
**estas mismas fixtures**, que es exactamente lo que sube la extensión: reemplazar una por una
captura real verifica el contrato del import sin tocar los tests.

Las dos de Shiyu existen precisamente para cubrir los dos esquemas: `hoyolab_shiyu_v1.json`
trae `hadal_ver: "v1"` con fechas como dict de partes, y `hoyolab_shiyu_v2.json` trae
`hadal_ver: "v2"` con epochs y la errata `fitfh_layer_detail`. Si alguna vez hay que tocar el
mapper, esas dos son la red de seguridad.

`tests/test_hoyolab_mapper.py` cubre el parseo de las secciones y
`tests/test_hoyolab_build_mapper.py` el de las builds de `avatar/info`, las dos trampas de
escala incluidas. Del transporte ya no hay nada que testear acá: lo hace la extensión, y sus
tests viven en `extension/lib/*.test.ts`.

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

Consecuencias visibles, las dos correctas:

| Dónde | Qué se ve |
|---|---|
| `ChallengeRun.rating` | `""` (`_best_rating` sobre intentos sin rating devuelve vacío) |
| `ChallengeRunRead.rating` | `""`, string vacío, no `null` |

Si algún día la clave aparece, **no hay que tocar el mapper**:
`_parse_deadly_assault_entry` ya lee `info.get("rating")` de forma tolerante y `_best_rating`
lo levantaría solo. Alcanzaría con actualizar la fixture y borrar esta sección.

### El contrato, verificado a medias (2026-08-30)

Hasta agosto de 2026 las fixtures estaban **escritas a mano**: nadie tenía cookies, así que el
mapper estaba probado contra *nuestra idea* del payload. Los helpers `_first_present` existen
por eso — la mayoría de los nombres alternativos que prueban son conjeturas.

Las capturas de la fase 0 de la extensión (`extension/scripts/capture.js`, con la sesión del
usuario) resolvieron una parte. Lo verificado:

| Conjetura | Veredicto |
|---|---|
| `avatar/info` y el mapeo entero de builds | **verificado**, contra las builds que Enka ya tenía de los mismos seis agentes: 137 substats, 36 discos, 6 W-Engines y 36 skills idénticos. Ver *`avatar/info`: la build completa* |
| La errata `fitfh_layer_detail` de Shiyu V2 | **existe**, tal cual, junto a `fourth_layer_detail` |
| Las claves `brief.*` de Shiyu V2 (`score`, `rank_percent`, `rating`, `max_score`) | **existen** en la raíz de `hadal_info_v2` |
| Ausencia de rating en Deadly Assault | **confirmada** sobre payload real: se puntúa con `total_score` y `star` |
| Ids de discos y W-Engines compartidos con Enka | **confirmado**: `StaticData` resuelve los ids de HoYoLAB sin tabla nueva |
| Regiones por prefijo de UID | **confirmado** para `10` → `prod_gf_us` |

Y lo refutado, que es lo que importa:

| Conjetura | Qué pasa de verdad |
|---|---|
| El `index` trae el perfil (`PROFILE_KEYS`: `role`, `profile`, `player`, `cur_role`, `account`, `game_role`) | **Ninguna de esas claves existe.** El `index` real solo trae `stats`, `avatar_list`, `buddy_list`, `cat_notes_list`, `game_data_show`, `area_collections`, `award_state` y `challenge_schedule_list`: **no hay nickname, ni nivel, ni UID**. *Arreglado*: salen de `getGameRecordCard`, que la extensión manda como sección `record_card`, y de ahí sale también el UID contra el que se valida el path. `PROFILE_KEYS` queda de respaldo por si alguna región sí manda perfil |
| `BANGBOO_ICON_KEYS` (`bangboo_rectangle_url`, `square_icon`, `role_square_url`, `icon`) | La clave real es **`bangboo_square_url`**, que no estaba en la lista: los 34 bangboos se guardaban con el ícono vacío. *Arreglado*: va primera, las conjeturas quedan de respaldo |
| Las claves de Lost Void (`exploration_log`, `commission_progress`, `license_level`, `ultimate_challenge`, `data_collected`) | **Ninguna existe.** El payload real trae `abyss_level {cur_level, max_level}`, `abyss_task {cur_task, max_task}`, `abyss_duty {cur_duty, max_duty}`, `abyss_collect[]`, `abyss_max`, `special_mission` y `unlock`. `parse_lost_void` devuelve **todo en cero** contra datos reales, exactamente el fallo silencioso que esta sección predecía. **Sin arreglar**: remapearlo necesita saber qué muestra cada número en la página de HoYoLAB, y el modelo `LostVoidProgress` tiene campos con otros nombres. El `raw` sí se guarda entero, así que el dato no se pierde |

Lo que sigue sin verificar: los nombres de campo de las **capas** de Shiyu V2
(`layer_challenge_info_list`, `monster_pic`, dónde viven `name`/`boss_name`/`boss_icon`), porque
la cuenta capturada no jugó la temporada y las dos capas vinieron en `null`; qué capa pertenece
a qué nodo; y la **lectura del Chronicle de terceros**.

### Checklist para la próxima captura

Lo que falta confirmar ya no necesita cookies pegadas a mano: necesita a alguien con la sesión
abierta corriendo `extension/scripts/capture.js`, o simplemente importando y mirando lo que
quedó guardado. En orden, parando en el primero que falle:

1. **Guardar los payloads.** Sacar los `raw` de `challenge_runs`, `lost_void_progress` y
   `agent_build_snapshots` y **diffearlos contra las fixtures**. Ese diff es el resultado más
   valioso de la sesión: convierte las fixtures inventadas que quedan en fixtures reales.
2. **Lost Void.** Es el mapeo que ya se sabe roto: el payload real trae `abyss_level`,
   `abyss_task`, `abyss_duty`, `abyss_collect[]`, y `parse_lost_void` devuelve todo en cero.
   Remapearlo necesita mirar qué número muestra la página de HoYoLAB al lado de cada campo.
3. **Shiyu V2.** Chequear `hadal_ver`, si la errata `fitfh_layer_detail` sigue viva, y si
   `name` / `boss_name` / `boss_icon` llegan en el item, en el layer, o en ninguno. **Listar
   todas las claves que terminan en `_layer_detail`**: confirma cómo se llaman las capas bajas
   y si el barrido las está agarrando. Con esas capas a la vista, anotar cuál cae en qué nodo —
   es el dato que falta para separar Estable, Disputado e Inestable en la UI. Hace falta una
   cuenta que **haya jugado** la temporada; la capturada no la jugó y las capas vinieron `null`.
4. **Deadly Assault.** Buscar cualquier clave de rating. Si aparece, actualizar la fixture y
   borrar la sección de arriba.
5. **`rank_percent`.** Comparar el número crudo con el porcentaje que muestra la app oficial:
   confirma o tira abajo lo de las centésimas.
6. **Región.** Si hay UIDs de más de un servidor, verificar el prefijo de cada uno contra la
   tabla — está escrita dos veces y las dos tienen que decir lo mismo.
7. **Retcodes.** Anotar cualquiera que caiga en el `error` genérico y sumarlo a la familia que
   corresponda en `extension/lib/hoyolab.ts`.

Cada punto que se confirme se pasa a la sección que corresponda de este documento y se saca de
acá.

## Limitaciones conocidas

- **Notorious Hunt no existe en la API.** No hay endpoint; si se quiere, es carga manual.
- **China no soportada.** Otro host (`api-takumi-record.mihoyo.com`), cookies de Miyoushe y
  header `ds` obligatorio: es una integración entera aparte. La extensión no le arma URL a un
  UID chino (`regionForUid` devuelve `null`) y el backend lo rechaza igual con
  `ValidationError` (422).
- **Solo dos temporadas.** `schedule_type` no acepta más que `1` y `2`; todo lo anterior está
  perdido salvo que ya esté en `challenge_runs`. Por eso la base es el histórico y ningún
  import borra filas.
- **Lectura de terceros no probada, y hoy sin uso.** Está razonada sobre el comportamiento de
  la app oficial, pero no se verificó de punta a punta, y la extensión importa solamente el UID
  de la sesión abierta. Ver *Leer el Chronicle de otro UID*.
- **Deadly Assault no expone rating**, y no se puede derivar de las estrellas. Ver *Lo que no
  se sabe todavía*.
- **El captcha no se puede resolver headless.** Por eso el import corre en el navegador del
  usuario, que es donde el geetest se puede mostrar y resolver; cuando aparece, ese import se
  corta y hay que reintentarlo a mano.
- **El Chronicle está tan fresco como el último import.** No hay sync automático: nada se
  actualiza mientras el usuario no abra la extensión.
- **`/note` es solo de la cuenta propia** (retcode 10104), a diferencia del resto del
  Chronicle. El tracker no lo usa.
- **`element` queda como número en string** (`"201"`), sin resolver a nombre de elemento.
- **La rareza de los agentes queda como letra** (`"S"`), sin traducir a la escala numérica de
  Enka; solo los bangboos se traducen.
- **Sin contrato ni versionado.** El esquema puede cambiar sin aviso; por eso `raw`,
  `schema_version` y los helpers tolerantes del mapper.
