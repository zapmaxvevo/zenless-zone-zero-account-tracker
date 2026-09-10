# Notas de los mappers del backend

Lo que el código de `src/zzz_tracker/enka/`, `src/zzz_tracker/hoyolab/`,
`src/zzz_tracker/discs/` y `src/zzz_tracker/parsing.py` no puede decir en una línea.

Son los **mappers de borde**: reciben JSON crudo de Enka.Network o de la Battle Chronicle de
HoYoLAB y devuelven dataclasses `Parsed*`. No tocan la sesión de base ni saben que existe HTTP.
Casi todo lo de acá sale de **medir payloads reales**, porque ninguna de las dos APIs tiene
contrato publicado.

---

## `src/zzz_tracker/parsing.py` — las coerciones

### `as_int`, `as_optional_int`, `as_str`, `as_dict`, `as_list`

**No obvio:** ninguna de estas funciones levanta excepción, nunca. Un payload roto no aborta un
import: el campo se lee como `0`, `None` o `""` y el resto de la sincronización sigue. Es una
decisión, no un descuido — ver "La tolerancia del mapper" más abajo.

Detalles que sí importan:

- Los strings numéricos se leen **tolerando espacios**: `" 12 "` es `12`. HoYoLAB los manda
  padeados en algunos campos.
- `bool` **no** es un entero acá, aunque en Python lo sea. `True` no se convierte en `1`: cae al
  default. Un `has_data: true` leído por accidente como número sería un `1` silencioso.
- `as_str` de un `int` devuelve el número como texto (los UIDs llegan a veces como int y a veces
  como string), pero de un `bool` devuelve `""`.

**Si lo ignorás:** hasta 2026-09 había **dos copias** de estas funciones, una en cada mapper, y
ya habían divergido: la de `hoyolab` hacía `.strip()` y la de `enka` no, así que `" 12 "` se leía
`12` de un lado y `0` del otro. Por eso viven en un solo módulo que usan los dos.

### `timestamp_to_datetime`

**No obvio:** un timestamp `0` devuelve `None`, no la época Unix. En estos payloads el cero
significa "nunca", no "1970-01-01".

---

## `src/zzz_tracker/enka/mapper.py` — valores base, no lo que muestra el juego

### `parse_stat` — `PropertyValue` y `PropertyLevel`

**No obvio:** Enka **nunca manda un valor mostrado**. Sus propios docs dicen qué son los dos
campos: `PropertyValue` es el **valor base** y `PropertyLevel` es la **cantidad de rolls**
("Amount of rolls, only matters if substat"). El `ParsedStat` guarda eso tal cual: `value` es la
base y `rolls` el conteo. La reconstrucción es de `discs/values.py`, y cada stat tiene su regla:

- **main stat**: `base * (1 + escala / 10000)`, con la escala sacada de una tabla indexada por
  rareza y nivel;
- **substat**: `base * rolls`, plano.

**Si lo ignorás:** mostrás la base como si fuera el número del juego. Un CRIT DMG de disco S+15
se ve como el 4.8% de un solo roll en vez del valor real.

---

## `src/zzz_tracker/discs/values.py` — la matemática de los discos

### El substat es plano: `substat_total(base, rolls) = base * rolls`

**No obvio:** en ZZZ **no hay rango aleatorio por roll**. Cada roll de un stat dado, en una
rareza dada, suma exactamente lo mismo — al revés de Genshin o HSR. Esa propiedad es la que
permite que el tracker **cuente rolls** en vez de medir valores, y es de lo que depende todo el
modelo de score.

**Si lo ignorás:** te ponés a inferir rolls a partir del valor mostrado, que acá es información
redundante, y metés error donde no había ninguno.

### Las tablas `SUBSTAT_BASE` y `MAIN_STAT_SCALE`

**No obvio:** son tablas **del juego**, leídas de `RandPropertyLibraryTemplateTb` (bases de
substat, una library por rareza) y `EquipmentLevelTemplateTb` (escalas de main stat). El store de
Enka no publica ninguna de las dos, así que están vendoreadas acá a mano.

La escala de main stat topea en `30000` — es decir `x4.0` — para las **tres** rarezas, cada una
en su propio nivel máximo.

**Si lo ignorás:** buscás estos números en la API de Enka y no están; o los actualizás desde una
wiki y no coinciden con los del juego.

### `MAX_DISC_LEVEL`, `procs_for` y por qué `MAX_SUBSTAT_ROLLS` es 6 y no 5

**No obvio:** el tope de nivel depende de la rareza: **S llega a 15, A a 12, B a 9**
(`MAX_DISC_LEVEL` se deriva del largo de cada fila de `MAIN_STAT_SCALE`). Hay un proc de substat
cada tres niveles, así que `procs_for` da **5 para S, 4 para A y 3 para B**.

Los dos números que parecen el mismo y no lo son:

- **procs de un disco S = 5.** Es cuántas veces sube el disco de 0 a 15.
- **`MAX_SUBSTAT_ROLLS` = 6.** Es cuántos rolls puede acumular **un solo substat**.

La diferencia es el roll inicial: un disco cae con tres o cuatro substats y topea en cuatro. Cada
proc suma exactamente uno al conteo total de rolls, ya sea que mejore un substat existente o que
cree el cuarto. Entonces un substat llega a 6 sólo en un disco que **cayó con cuatro** substats:
1 inicial + 5 procs.

**Si lo ignorás:** validás rolls contra 5 y rechazás builds legítimas, o mostrás "6/5".

### `main_stat_total` devuelve `None` cuando el nivel excede la rareza

**No obvio:** pedir un nivel que esa rareza no alcanza — un B a nivel 12, por ejemplo — devuelve
`None`, no la base sin escalar. Devolver la base haría pasar un valor de nivel 0 por el valor
real, en silencio. Lo mismo con `rarity=None`: un disco sin rareza conocida no tiene main stat
calculable, y eso se ve.

**Si lo ignorás:** un disco sin static data muestra números plausibles pero falsos, que es peor
que no mostrar nada. El test de `tests/test_disc_values.py` lo pinea.

---

## `src/zzz_tracker/hoyolab/build_mapper.py` — traducir la Chronicle al vocabulario de Enka

### Por qué existe el módulo

**No obvio:** Enka sólo expone los pocos agentes que el jugador puso en el showcase; la Battle
Chronicle responde por **todo el roster**, un request por id de agente, y cada respuesta trae un
`data.avatar_list` con un solo agente. Las dos fuentes describen la misma build con palabras
distintas, así que las de HoYoLAB se traducen a los mismos dataclasses `Parsed*` de `enka.mapper`
y se guardan por el mismo camino. Hay una sola escritura de builds en todo el backend.

**Si lo ignorás:** aparece un segundo modelo de build paralelo y dos caminos de escritura.

### `parse_substat` — la división que no es obvia

**No obvio:** un substat de HoYoLAB llega como el valor **acumulado** (`base`) más la cantidad de
rolls que lo construyeron (`level`, el roll inicial incluido), mientras que Enka reporta el paso
de **un** roll. Por eso el paso es el cociente `base / level`.

Los 137 substats capturados hasta ahora dividen exacto; el redondeo (half away from zero, la
lectura que ve el jugador: `2.5` es `3`) está sólo por si alguno futuro no divide.

**Si lo ignorás:** guardás el acumulado como si fuera el paso y todas las builds importadas por
la extensión quedan con substats inflados por su cantidad de rolls.

### Lo que HoYoLAB **no** manda y se deriva

**No obvio:** tres valores no vienen en el payload y se calculan:

- **`promotion_level`**: no se manda. Se deriva del nivel — una promoción cada diez niveles,
  topeado en seis. En un múltiplo exacto de diez la cuenta puede errar por uno (un agente de
  nivel 30 puede estar todavía esperando su tercera promoción); el próximo sync de Enka lo
  corrige.
- **`core_skill_enhancement`**: es el nivel de la skill 5 **menos uno**, porque HoYoLAB cuenta la
  core skill base como el primer nivel.
- **`modification_level`** de la W-Engine: se deriva del nivel, una modificación cada diez
  niveles, así que nivel 60 es la quinta y última.

Y dos que se quedan vacíos porque la Chronicle nunca los menciona: `weapon_effect_state` y
`obtained_at`. Tampoco manda el uid por ítem que sí manda Enka (`item_uid=None`).

**Si lo ignorás:** tratás un `promotion_level` derivado como dato duro, o buscás en el payload
campos que no existen.

### `parse_disc` — el roll count tampoco se manda

**No obvio:** `equip_suit.suit_id` y la letra de rareza ya nombran el set y el grado, así que a la
static data sólo se le pregunta lo que el payload no trae. El conteo de rolls **no viene**: se
deriva del nivel, un roll cada tres niveles, así que nivel 15 son los cinco rolls que reporta
Enka (`LEVELS_PER_ROLL`).

### `_stat_value` — la escala de porcentajes

**No obvio:** los stats llegan como texto y se leen a la escala entera de Enka: `"38"` es `38` y
`"4.8%"` es `480`. El `%` multiplica por 100.

**Si lo ignorás:** los porcentajes importados quedan 100 veces más chicos que los de Enka y las
dos fuentes dejan de ser comparables.

---

## `src/zzz_tracker/hoyolab/` — la tolerancia del mapper

### Qué se saltea en silencio, y por qué

**No obvio:** la API de HoYoLAB **no tiene contrato**. No hay documentación oficial, las formas
cambian entre versiones y regiones, y varias claves que el código lee son conjeturas que nunca se
vieron en un payload real. Por eso **ningún** parser de acá rechaza un payload entero: descarta la
parte que no entiende y devuelve el resto.

Concretamente, se saltea en silencio:

- **Una entrada sin `id`.** Agente, bangboo o disco sin id se descartan (`_parse_challenge_agent`,
  `_parse_roster_agent`, `_parse_bangboo`, `parse_disc`) y los demás entran igual.
- **Un agente repetido dentro de una run.** `_parse_challenge_agents` deduplica por `game_id`
  manteniendo el primero, porque los dos nodos de un piso de Shiyu v1 suelen repetir el equipo.
- **Un buff sin título y sin texto.** Se descarta; un buff con sólo icono no dice nada.
- **Una fecha imposible.** `to_datetime` devuelve `None` ante un mes 13 o un timestamp fuera de
  rango, en vez de explotar.
- **Un `schedule_id` ausente.** Eso sí corta: `parse_shiyu_defense` y `parse_deadly_assault`
  devuelven `None`, porque una run sin ciclo no se puede guardar ni deduplicar.
- **Un `index` sin perfil.** `parse_chronicle_account` devuelve `None` y el nombre lo pone el
  record card.

**Si lo ignorás:** agregás una validación estricta "para estar seguros" y un campo nuevo del lado
de HoYoLAB rompe el import entero de todas las cuentas en vez de perder un dato.

---

## `src/zzz_tracker/hoyolab/profile.py`

### `PROFILE_KEYS` y los demás grupos de claves

**No obvio:** el `index` que un browser realmente recibe **no trae perfil alguno**. Lo verificado
contra la API real es que trae `stats`, `avatar_list`, `buddy_list`, `cat_notes_list`,
`game_data_show`, `area_collections`, `award_state` y `challenge_schedule_list`, y ni nickname, ni
nivel, ni UID. Ninguna de las claves de `PROFILE_KEYS` se confirmó nunca: quedan como cortesía
para la región o versión que sí mande un perfil.

Quien realmente nombra a la cuenta es el **record card** (`parse_record_card`), y el fallback más
barato es `parse_challenge_nickname`: tanto `hadal_info_v2` como `hadal_mem_detail_v2` firman su
respuesta con `nick_name`, así que un sync sin record card igual aprende el nombre de la cuenta
que está escribiendo.

**Si lo ignorás:** esperás que el `index` traiga el UID, no lo traés de la extensión, y las
cuentas importadas quedan sin dueño.

### `BANGBOO_ICON_KEYS`

**No obvio:** la única clave observada contra la API real (2026-08-30) es `bangboo_square_url`.
Las otras cuatro son conjeturas de antes de que alguien tuviera cookies y están sólo de fallback.

### `parse_record_card` chequea `game_id == 8`

**No obvio:** el card es la lista de juegos de un perfil de HoYoLAB, así que se verifica que sea
el de ZZZ (`ZZZ_GAME_ID = 8`) antes de creerle el UID. Un card de otro juego, si no, rechazaría un
import perfectamente bueno. Un card que no dice nada (sin uid, sin nickname y sin nivel) no es un
card: devuelve `None`.

### `avatar/basic` no trae equipamiento

**No obvio:** el endpoint del roster (`parse_roster_agents`) responde nivel, mindscape, rareza,
elemento, nombre e icono — y **nada del equipo**. Las builds salen de `avatar/info`, un request
por agente (ver `build_mapper.py`). Son dos llamadas distintas a propósito.

**Si lo ignorás:** buscás discos en la respuesta del roster, no los encontrás, y concluís que la
cuenta no tiene builds.

---

## `src/zzz_tracker/hoyolab/challenges.py`

### `RATING_STARS` — `S` y `S+` valen las mismas 3 estrellas

**No obvio:** `RATING_ORDER` ordena `B < A < S < S+` para elegir el mejor rating, pero
`RATING_STARS` le da 3 estrellas tanto a `S` como a `S+`. El juego no da una cuarta estrella: el
`S+` es un rating mejor con el mismo puntaje de estrellas.

### `LAYER_ORDINALS` y `fitfh`

**No obvio:** HoYoLAB escribe mal el quinto piso: la clave real es `fitfh_layer_detail`, no
`fifth_`. Se leen las dos grafías. Además de los ordinales conocidos, `_shiyu_v2_layers` barre
cualquier clave que termine en `_layer_detail` y no esté en la lista, con `layer_index=None`, para
que un piso nuevo entre igual.

**Si lo ignorás:** "corregís" el typo y el quinto piso deja de aparecer.

### Shiyu v1 vs v2 son dos esquemas distintos en el mismo endpoint

**No obvio:** `parse_shiyu_defense` mira `hadal_ver` para elegir, pero **no le cree del todo**: si
la versión declarada no coincide con la sección que llegó, gana la sección presente
(`hadal_info_v2` primero, `hadal_info_v1` después). Los dos esquemas describen la misma temporada
con formas distintas — v1 tiene `all_floor_detail` con dos nodos por piso, v2 tiene un
`*_layer_detail` por piso con su `layer_challenge_info_list` — y ambos terminan en el mismo
`ParsedChallengeRun`.

v1 tampoco trae score: el `score`/`max_score` de la run quedan en `0` y las estrellas salen de
`rating_list` (o, si no está, de la suma de los pisos).

**Si lo ignorás:** confiás en `hadal_ver` y una respuesta con la versión mal declarada se parsea
vacía.
