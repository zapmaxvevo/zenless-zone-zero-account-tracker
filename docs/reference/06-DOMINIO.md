# Dominio: las reglas del juego que el código asume

Zenless Zone Zero tiene convenciones que el código da por sabidas y que nadie recuerda seis meses
después: por qué una rareza es un `4`, por qué un valor de Enka no es el que muestra el juego, por
qué hay dos constantes parecidas que valen 5 y 6. Leelo antes de tocar `discs/values.py`, los
mappers, o cualquier cosa que muestre un número de disco.

Fuentes: `src/zzz_tracker/discs/values.py`, `src/zzz_tracker/enka/mapper.py`,
`src/zzz_tracker/hoyolab/common.py`, `frontend/src/lib/score.ts`, `frontend/src/lib/labels.ts`,
`frontend/src/lib/elements.ts`. La derivación completa del score está en
[`docs/DISC_SCORE.md`](../DISC_SCORE.md) — no se copia acá.

---

## 1. Rareza: el número y la letra

En el juego la rareza es una letra. En los datos es un entero, y **no arranca en 1**:

| Número | Letra |
|---|---|
| `2` | B |
| `3` | A |
| `4` | S |

Vale para agentes, W-Engines, discos y bangboos. Está escrito tres veces, en los tres lugares que
lo necesitan:

- `RARITY_B = 2`, `RARITY_A = 3`, `RARITY_S = 4` en `discs/values.py`;
- `RARITY_BY_LETTER = {"B": 2, "A": 3, "S": 4}` en `hoyolab/common.py`, porque HoYoLAB manda la
  letra y hay que traducirla;
- `RARITIES = { 2: 'B', 3: 'A', 4: 'S' }` en `frontend/src/lib/labels.ts`, para volver a mostrarla.

Una rareza desconocida se muestra como `R<n>` (`rarityLabel`), no rompe nada.

### El caso del agente `1551`

```ts
const SPECIAL_RANKS: Record<number, string> = { 1551: 'I' };
```

`agentRankLabel(rarity, gameId)` mira primero el `game_id`: el agente **1551 se muestra con rango
`I`**, no con la letra que le corresponda por rareza. Es la única excepción por id que hay, y va
por `game_id` justamente porque la rareza del dato no la refleja.

---

## 2. Los seis slots de disco

Un agente equipa seis discos, uno por slot. Los slots **1, 2 y 3 tienen main stat fijo** —el mismo
en las tres rarezas— y los **4, 5 y 6 eligen**. Por eso una evaluación de "main stat correcto"
sólo tiene sentido en 4, 5 y 6.

| Slot | Main stats posibles |
|---|---|
| 1 | HP plano (`11103`) — fijo |
| 2 | ATK plano (`12103`) — fijo |
| 3 | DEF plano (`13103`) — fijo |
| 4 | ATK % (`12102`), HP % (`11102`), DEF % (`13102`), CRIT Rate (`20103`), CRIT DMG (`21103`), Anomaly Proficiency (`31203`) |
| 5 | ATK %, HP %, DEF %, PEN Ratio (`23103`), y el bonus de daño del elemento: Physics `31503`, Fire `31603`, Ice `31703`, Electric `31803`, Ether `31903`, Wind `32303` |
| 6 | ATK %, HP %, DEF %, Anomaly Mastery (`31402`), Impact (`12202`), Energy Regen (`30502`) |

Esa tabla sale de `mainstat_base` en `docs/disc-score-data.json`, extraída de los archivos del
juego.

> **Límite conocido:** esa tabla es dato vendorizado, **no la aplica ningún código hoy**. Ni el
> backend ni el frontend validan que el main stat elegido sea legal para el slot: un disco tipeado
> a mano con CRIT DMG en el slot 6 se guarda igual. `DriveDiscWrite` sólo valida que el slot esté
> entre 1 y 6.

Los ids de prop se resuelven a nombre y formato con los datos estáticos de Enka
(`data/static/property.json`), servidos por `GET /catalog/properties`.

---

## 3. La matemática de los valores — lo más traicionero

**Enka nunca manda un valor mostrado.** Su documentación dice, textualmente, qué son los dos
campos:

- `PropertyValue` — *"Property Base Value"*: el **valor base**.
- `PropertyLevel` — *"Amount of rolls, only matters if substat"*: la **cantidad de rolls**.

El tracker guarda esos dos crudos (`drive_discs.main_stat_value`, y `value`/`rolls` dentro del
JSON de `substats`) y reconstruye el número mostrado al servir. Las dos fórmulas están en
`src/zzz_tracker/discs/values.py` y son distintas entre sí:

### Main stat: escala con el nivel del disco

```
mostrado = base × (1 + escala(rareza, nivel) / 10000)
```

`main_stat_total(base, rarity, level)` busca `escala` en `MAIN_STAT_SCALE[rareza][nivel]`. Si la
rareza es `None` o el nivel se sale del rango de esa rareza, **devuelve `None`**, no el base sin
escalar: un dato incompleto se ve como faltante en vez de pasar por real un valor de nivel 0.

### Substat: lineal en los rolls

```
mostrado = base × rolls
```

`substat_total(base, rolls)`. Sin más. **Cada roll de un stat dado suma exactamente lo mismo**:
ZZZ no tiene rango aleatorio por roll, a diferencia de Genshin o HSR. Esa única propiedad es la
que permite que el score cuente rolls en vez de medir valores.

`SUBSTAT_BASE[rareza][prop_id]` dice cuánto vale un roll. Un stat ausente de una rareza **no puede
rollear ahí** (`substat_base` devuelve `None`).

### La escala de los porcentajes

Los porcentuales se guardan **×100**, la misma escala que usa Enka en todos lados: CRIT DMG `480`
es 4,8 %. El formato de cada prop (`{0:0.#%}` o `{0:0}`) viene de los datos estáticos y lo aplica
`frontend/src/lib/stats.ts`, que divide por 100 los porcentuales. El backend nunca formatea.

### `MAX_DISC_PROCS` (5) y `MAX_SUBSTAT_ROLLS` (6) no son el mismo número

Es la confusión más fácil de cometer y las dos constantes viven en archivos distintos:

- **`MAX_DISC_PROCS = 5`** (`web/schemas/common.py`) — los **procs que recibe el disco entero**.
  Es el `BreakLevel` de Enka, que su doc llama *"Amount of random stat procs"*. Se guarda en
  `drive_discs.roll_count`. Cinco es el tope de un disco S: un proc cada tres niveles
  (`LEVELS_PER_PROC = 3`), y S llega a nivel 15 → `procs_for(4) == 5`.
- **`MAX_SUBSTAT_ROLLS = 6`** (`discs/values.py`) — los **rolls que puede acumular UN substat**,
  el `PropertyLevel`. Va de 1 a 6.

Que 6 > 5 no es contradictorio: un disco cae ya **con 3 o 4 substats** (`MIN_SUBSTATS = 3`,
`MAX_SUBSTATS = 4`), y cada uno de esos cuenta como su primer roll. Los 5 procs se reparten arriba
de esa base, y cada proc suma exactamente 1 al total de rolls del disco, sea porque sube un
substat existente o porque crea el cuarto. Un substat sólo llega a 6 en un disco que cayó con
cuatro substats.

Un substat con `rolls = 0` no es un substat: `MIN_SUBSTAT_ROLLS = 1`.

### Topes por rareza

| Rareza | Nivel máximo | Procs | Tope de la escala |
|---|---|---|---|
| S (4) | 15 | 5 | `30000` → ×4,0 |
| A (3) | 12 | 4 | `30000` → ×4,0 |
| B (2) | 9 | 3 | `30000` → ×4,0 |

**Las tres llegan al mismo ×4,0**, cada una a su propio nivel máximo; lo que cambia es cuántos
escalones tarda (`MAIN_STAT_SCALE` tiene 16, 13 y 10 entradas). `MAX_DISC_LEVEL` en
`discs/values.py` se deriva de la longitud de cada fila, así que la tabla es la única fuente.

> **Límite conocido:** el tope de nivel que valida la API (`MAX_DISC_LEVEL = 15` en
> `web/schemas/common.py`) es plano y no mira la rareza. Un disco B de nivel 15 pasa la
> validación; `main_stat_total` devuelve `None` para esa combinación y el frontend muestra el
> valor sin escalar. Son dos constantes con el mismo nombre y distinto significado en dos
> archivos: la del schema es un tope de entrada, la de `values.py` es la tabla del juego.

---

## 4. El modelo de score de builds

Vive entero en `frontend/src/lib/score.ts`. El backend no calcula ningún score.

**Substats con peso.** `WEIGHTS` le pone un número a cada substat normalizado
(`crit` 2,0 · `critdmg` 1,0 · `atkp` 1,0 · `pen` 1,0 · `ap` 0,66 · `atk` 0,33 · `hpp`/`defp` 0,4 ·
`hp`/`def` 0,2). `subKey` normaliza primero por `prop_id` y, si no lo conoce, por el nombre que
mandó Enka.

**Substats clave por especialidad.** `KEY_SUBS` lista cuatro substats por profesión (`Attack`,
`Stun`, `Anomaly`, `Support`, `Defense`, `Rupture`); una profesión desconocida usa la de `Attack`.
Un substat que **no** es clave para esa profesión cuenta **×0,25**, no cero: en una cuenta nueva
lo que tenés equipado no es óptimo, y poner todo en cero deja de servir justo cuando más se
necesita.

```
discScore(disco) = round( Σ rolls × peso × (clave ? 1 : 0,25) × 6 )
```

`DISC_CEILING = 55` es el techo con el que se normaliza. De ahí salen las dos lecturas visuales:

- `discFill(score)` → porcentaje de barra, `min(100, round(score / 55 × 100))`;
- `discGrade(score)` → `S` ≥ 42, `A` ≥ 32, `B` ≥ 22, `C` el resto.

`buildScore(discos)` suma los seis y normaliza contra `6 × 55`.

**`rosterScore(agent)`** es otra cosa y no mira substats: es lo que ordena el roster cuando todavía
no se abrió la build. Pondera discos equipados 0,50, nivel 0,28, tener W-Engine 0,14 y mindscape
0,08.

Sobre eso se apoya la jerarquía visual del design system: el grado es lo que elige el color de la
pieza (`frontend/src/lib/palette.ts`) y el score es lo que decide qué agente va arriba.

> **Discrepancia con `docs/DISC_SCORE.md`:** ese documento está marcado *"Estado: propuesta"* y
> decide el método "base + conteo de rolls", explícitamente **sin pesos**. Lo implementado es un
> modelo **ponderado**, que en ese documento figura como "capa 2 opcional" (§6). Además su §0
> describe un estado ya superado ("hoy el proyecto no calcula ningún score y muestra mal los
> valores"): `discs/values.py` implementa las dos fórmulas y `score.ts` calcula el score. Cuando
> los dos no coincidan, **gana el código**.

---

## 5. Elementos: por qué hacen falta alias y códigos

`frontend/src/lib/elements.ts` normaliza a diez claves canónicas: `Physics`, `Fire`, `Ice`,
`Electric`, `Ether`, `Frost`, `AuricInk`, `Assault`, `Wind`, `Lumiflux`.

Hace falta normalizar porque **los dos orígenes nombran lo mismo distinto**, y a veces mandan un
número:

- **Alias por nombre** — Enka dice `elec`, el resto dice `electric`. Los elementos derivados
  llegan con nombres internos: `firefrost` → `Frost`, `auricether` → `AuricInk`,
  `zhenzhenassault` → `Assault`, `lumen` → `Lumiflux`.
- **Códigos numéricos** — algunos payloads mandan el elemento como número:
  `200` Physics, `201` Fire, `202` Ice, `203` Electric, `205` Ether, `300` Lumiflux.

`elementKey()` prueba primero el código y después el alias, tirando todo lo que no sea letra y
pasando a minúsculas. Lo que no reconoce devuelve `null`, y la UI cae al texto crudo.

> **Límite conocido:** `BY_CODE` no cubre los diez. `Frost`, `AuricInk`, `Assault` y `Wind` sólo
> se resuelven por nombre; si un payload los mandara como código, no se reconocerían.

El elemento y la especialidad **se muestran siempre como icono, nunca como su nombre escrito**
(`frontend/src/lib/icons.ts`; ver `docs/DESIGN.md`). Los nombres en español de
`frontend/src/lib/labels.ts` son para `alt`, tooltips y lectores de pantalla.

---

## 6. Glosario

Nombres del juego tal como aparecen en el código. La API de HoYoLAB responde en inglés (el idioma
lo fija `x-rpc-lang`), así que lo que llega son los nombres ingleses.

| Término | Qué es |
|---|---|
| **Inter-Knot** | La red social del juego. El "nivel Inter-Knot" es el nivel de cuenta: `accounts.level` |
| **Bangboo** | Los acompañantes robóticos. En la API son `buddy` (endpoint `buddy/info`); en la base, la tabla `bangboos` |
| **W-Engine** | El arma del agente. Tabla `wengines`. `modification_level` es su `BreakLevel`; `phase` su `UpgradeLevel` |
| **Drive Disc** | Las piezas de equipo, seis por agente, agrupadas en sets. Tabla `drive_discs` |
| **Mindscape** | Las "Mindscape Cinema", el equivalente a las constelaciones. En el JSON de HoYoLAB es `rank`; en el de Enka, `TalentLevel`; en la base, `agents.mindscape_level` |
| **Shiyu Defense** | Modo de fin de juego por temporadas. `MODE_SHIYU_DEFENSE = "shiyu_defense"`, endpoint `hadal_info_v2` |
| **Deadly Assault** | El otro modo por temporadas. `MODE_DEADLY_ASSAULT = "deadly_assault"`, endpoint `hadal_mem_detail_v2` |
| **Lost Void** | También llamado Hollow Zero. Tabla `lost_void_progress`, endpoint `abysss2_abstract` |
| **Critical Node** | En el juego en español, **"Nodo Inestable"**. Ver abajo |

### "Nodo Inestable" es **Critical Node**

Y no es un modo aparte ni es semanal. Es **la mitad rotativa de Shiyu Defense**: rota **cada 14
días** (viernes por medio, 04:00 hora de servidor), mientras que los nodos Estable (*Stable*) y
Disputado (*Disputed*) son permanentes. En la API no existe como endpoint propio: llega adentro
del payload de Shiyu, repartido entre las capas.

Por eso el mapper de Shiyu **no enumera capas**: recorre los ordinales conocidos (`first` …
`seventh`, con la errata `fitfh` de HoYoLAB además de `fifth`) y después barre la sección buscando
cualquier clave que termine en `_layer_detail` que no haya visto. Cada intento guarda de qué capa
salió en `challenge_run_entries.layer_index` / `layer_id`. Detalle en
[`docs/HOYOLAB.md`](../HOYOLAB.md).
