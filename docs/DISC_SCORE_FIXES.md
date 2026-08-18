# Correcciones pendientes del score de discos — orden de trabajo

Documento de traspaso. Asume que no leíste la conversación donde salió esto.

**Contexto mínimo:** el plan completo está en `docs/DISC_SCORE.md`. Los pasos 1 y 2 de ese plan
están implementados; una revisión posterior con cuatro revisores encontró lo que sigue. Nada de
esto está arreglado todavía. La suite está verde (backend 103, frontend 72), así que **todo lo
de acá pasa los tests actuales** — los tests no lo detectan, ese es parte del problema.

Antes de tocar nada, orientate con:

```bash
uv run pytest                      # 103 pasan
cd frontend && npm run test        # 72 pasan  (node_modules ya instalado)
```

---

## Reglas del dominio que hacen falta para entender todo esto

Discos de Zenless Zone Zero. Enka.Network sirve **valores base**, no los que muestra el juego.

- `PropertyValue` = base. `PropertyLevel` = cantidad de rolls. Ambos textuales en la doc de Enka.
- main stat mostrado = `base × (1 + escala/10000)`, escala por rareza y nivel, tope `30000` (×4,0)
- substat mostrado = `base × rolls` — cada roll suma lo mismo, sin rango aleatorio
- rareza: **4=S, 3=A, 2=B**
- **nivel máximo por rareza: S 15, A 12, B 9**
- un proc cada 3 niveles → **S 5 procs, A 4, B 3**. Es el `BreakLevel` de Enka.
- un disco cae con 3 o 4 substats y tope en 4; el `PropertyLevel` de un substat va de 1 a 6
- `Σ PropertyLevel de los substats = cantidad_inicial + BreakLevel`
- un substat nunca repite el prop del main stat del disco

Todo eso ya está codificado y testeado en `src/zzz_tracker/discs/values.py`. El problema
recurrente es que **está codificado y no está conectado**.

---

## Bloque 1 — Dato mal extraído: main stats de 35 de 59 agentes

**Severidad: alta. Bloquea los pasos 3 y 5 del plan.**

`docs/disc-score-data.json`, bloque `agent_reco`, campos `main4` / `main5` / `main6`.

### Qué está mal

La extracción asumió que `EquipmentAutoTemplateTb.json` trae **tres** props de main stat, una por
slot, en orden. Trae **cuatro**, y **no están ordenadas por slot**. Se cableó
`main4=campo1, main5=campo2, main6=campo3` y se descartó el cuarto.

Resultado: **64 asignaciones inválidas en 35 de las 59 filas**. Ejemplos: Lighter con
`main4 = Impact%` (que solo existe en slot 6), Astra con `main4 = Energy Regen%` (solo slot 6),
Nicole con `main6 = Anomaly Proficiency` (solo slot 4).

Consecuencia colateral: el ejemplo que `docs/DISC_SCORE.md` usa para justificar el override
manual —*"Miyabi oficial main6 = CRIT DMG, Prydwen = ATK%"*— **es este bug, no una divergencia**.
CRIT DMG no puede ser main de slot 6. El cuarto campo de Miyabi, el descartado, es ATK%, que
coincide con Prydwen.

### El modelo correcto, ya verificado

No es "una prop por slot". Es **un conjunto de mains aceptables por slot**:

```
acceptable_mains[slot] = { p ∈ los 4 campos : p es main legal de ese slot }
```

Verificado sobre las 59 filas: **ningún agente queda sin candidato en ningún slot**. Distribución
real: slot 4 tiene 2–4 candidatos siempre; slot 5 tiene 1 en 12 filas y 2–3 en el resto; slot 6
tiene 1 en 24 filas y 2–3 en el resto.

Comprobación de que da bien: Miyabi → slot4 `{CR, CD, ATK%}`, slot5 `{Ice DMG, ATK%}`,
slot6 `{ATK%}`. Ese slot6 coincide con Prydwen.

### Cómo re-extraerlo

Los cuatro campos, en el orden en que aparecen en cada fila:
`IBNGHIPKLMN`, `BKGOEIGHIBO`, `PNPJFMCFKHJ`, `MIFNILNFHJJ`.

Fuentes (ambas alcanzables con `curl` desde el sandbox):

- `https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/EquipmentAutoTemplateTb.json`
  — clave de agente en `DALBKGGEJEF`, sets recomendados en `MKJJICLOEDI`/`HLJOPMNNKNC`/`BGLPBLIBEMD`
  (el primero es el candidato a 4pc), substats recomendados en `OMCLJDMFJEG`
- `https://git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/RandPropertyLibraryTemplateTb.json`
  — mains legales por slot en el grupo `rareza*100 + slot` (para S: 404, 405, 406);
  `DALBKGGEJEF` = grupo, `BFOANGEBHAP` = prop id, `BAPODCDPJJN` = valor base

**Escribí el script de extracción y dejalo versionado.** Hoy `disc-score-data.json` es un
snapshot hecho a mano sin nada que lo regenere — el plan afirma que "se actualiza sola" y es
falso. Sin script, este bug no se vuelve a detectar solo.

### Dos cosas más del mismo archivo

- La fila `1000` **no es un agente** (es el placeholder/Proxy) y trae `substats: []`. Filtrala o
  documentá que hay que ignorarla.
- `mainstat_base` y `agent_reco` viven solo en `docs/`. `mainstat_base` es justo lo que el paso 5
  necesita para chequear el main stat. Decidí si se mueven a `src/zzz_tracker/discs/`.

### Al terminar

Actualizá en `docs/DISC_SCORE.md` la sección 4: la descripción del campo (son 4 props, conjunto
por slot) y **borrá el ejemplo de Miyabi**, que era este bug. Re-derivá la comparación
oficial-vs-Prydwen de main stats con el dato corregido antes de afirmar que divergen. La columna
de **substats** de esa tabla sí fue verificada como correcta, 7 de 7 filas: no la toques.

---

## Bloque 2 — Tres bugs de código

**Severidad: alta. El primero reintroduce el bug que el paso 2 vino a arreglar.**

### 2.1 Los topes de validación son ciegos a la rareza

`src/zzz_tracker/web/schemas.py:31,35` y `frontend/src/lib/agentDraft.ts:19,21,23`.

`MAX_DISC_LEVEL = 15`, `MAX_DISC_PROCS = 5` y `MAX_SUBSTAT_ROLLS = 6` son constantes planas, pero
los topes reales dependen de la rareza:

| rareza | nivel | procs | rolls de un substat |
|---|---|---|---|
| S (4) | 15 | 5 | 6 |
| A (3) | 12 | 4 | 5 |
| B (2) | 9 | 3 | 4 |

Reproducción:

```python
DriveDiscWrite(slot=1, game_id=31041, rarity=2, level=15, roll_count=5,
               main_stat_id=11103, main_stat_value=183,
               substats=[SubstatWrite(prop_id=20103, value=80, rolls=6)])
# aceptado: las tres cosas son imposibles para un disco B
```

**Por qué importa de verdad.** `main_stat_total` sí es consciente de la rareza, así que al leer
ese disco de vuelta devuelve `None`, y entonces `frontend/src/lib/stats.ts:49`
(`stat.total ?? stat.value`) imprime **la base sin escalar como si fuera el valor del juego**:

```
S nv15 main : <strong>2.200</strong>
A nv15 main : <strong>550</strong>        ← 4x mal
A nv15 head : <p class="dim small">A · Nv. 15</p>
```

El nombre resuelve, el formato resuelve, la cabecera se ve normal. **Cero señal.** Alcanzable
desde el formulario de la app en tres clics: Rango = A, Nivel = 15, guardar.

Segunda vía, independiente del formulario: `src/zzz_tracker/enka/mapper.py:171` guarda
`rarity=None` si sincronizás antes de bajar los datos estáticos. El nombre se resuelve en cada
request, así que después de bajarlos el disco muestra un `HP 550` perfectamente etiquetado con
`total: null` para siempre.

**Tampoco hay chequeo cruzado**: 4 substats × 6 rolls = 24 rolls con `roll_count: 5` valida sin
problema, violando `Σ rolls = inicial + procs`.

**Qué hacer.** `procs_for(rarity)` y el dict `MAX_DISC_LEVEL` de `values.py` ya existen y están
testeados; conectalos. Un validador de modelo en `DriveDiscWrite` que cruce rareza contra nivel,
procs y rolls. Y decidí qué hacer con el fallback de `stats.ts:49` — hoy inventa un número que
sabe que está mal. O la UI marca visiblemente el `total: null`, o no muestra número.

También acá: `MAX_RARITY = 5` (`schemas.py:30`) acepta rareza 1 y 5, cuando la rareza de disco es
solo 2/3/4. Es el mismo modo de falla y contradice el commit `4c0f149`.

### 2.2 Un substat con `rolls: 0` renderiza `0%`

`substat_total(base, rolls) = base * rolls`, así que `rolls=0` da `total=0`, y `??` no cae a
`value` porque 0 no es nullish. **Antes del cambio mostraba `4,8%`; ahora muestra `0%`.**
Estrictamente peor que antes.

Es alcanzable: `frontend/src/components/DiscFields.tsx` crea cada substat nuevo con `rolls: '0'`,
`LIMITS.substatRolls` es `[0, 6]` (mínimo 0), y `agentDraft.ts` mapea el campo vacío a 0. El
usuario agrega un substat, elige CRIT DMG, escribe 480, no toca Rolls, guarda → `0%`. El badge
`+N` además se oculta porque exige `rolls > 0`, así que nada explica el cero.

Causa de fondo: **guardas asimétricas**. `main_stat_total` devuelve `None` cuando no puede
calcular; `substat_total` devuelve un 0 confiado. Un substat con 0 rolls no existe en el juego:
el mínimo real es 1, en los dos lados.

### 2.3 Colisión de nombres `MAX_DISC_LEVEL`

`values.py:94` es `dict[rareza, int]`; `schemas.py:31` es el escalar `15`. `schemas.py:9` ya
importa de `values.py`. Agregar ese nombre al import lo rebindea en silencio. Renombrá uno.

---

## Bloque 3 — Corregir `docs/DISC_SCORE.md`

**Severidad: media, salvo el último punto que es de método.**

### 3.1 La sección 0 está en presente describiendo bugs ya arreglados

Y tres de sus citas ya no aplican:

- `web/schemas.py:158-166`, citado como donde se sirve el valor crudo, hoy es `WEngineRead.from_wengine`
- `stats.test.ts:63` ya no espera `'0,2%'`, espera `'7,2%'`
- *"`MAX_DISC_ROLLS = 5` se usa como tope del `rolls` de **cada** substat"* — **nunca fue cierto
  de ese archivo.** En `git show HEAD:src/zzz_tracker/web/schemas.py` (los cambios están sin commitear) se usa solo para
  `DriveDiscWrite.roll_count`; `SubstatWrite.rolls` no tenía cota superior. El tope malo era solo
  del frontend (`LIMITS.rollCount`).
- la tabla de síntomas dice *"substat CRIT DMG con 3 rolls → se ve 1 roll"*: falso, `DiscCard`
  siempre mostró `+3`. Lo que estaba mal era el valor, no el conteo.

Pasala a pasado como registro de qué se arregló, con las citas corregidas.

### 3.2 Un ejemplo es un disco imposible

En §3.2: `| S, slot 4 CRIT DMG | ok | 5 de 9 — 3 CD, 2 CR |`. Un substat no puede repetir el main
del disco, regla que la §6 del mismo documento enuncia. Las otras dos filas de esa tabla están bien.

### 3.3 El argumento de CRIT es circular

*"CRIT Rate y CRIT DMG comparten peso 1,0 (…bajo `1 CR = 2 CD` valen lo mismo)"* asume la
conclusión. Con multiplicador esperado `1 + CR·CD`, un roll de CR vale `2,4·CD` y uno de CD vale
`4,8·CR` — iguales solo donde `CD = 2·CR`. En los objetivos que el propio documento cita dos
párrafos después (Ellen CR 90–100 %, CD 120–180 %) la relación es ~1,5, o sea **los rolls de CR
valen más ahí**. Es una aproximación razonable en un punto de la curva; presentala como tal, no
como derivación.

Relacionado, en §2: *"Esto confirma la premisa de la sección 1"* es un non-sequitur — la premisa
de §1 es que los rolls son **deterministas**, y que tres herramientas coincidan en un peso no
dice nada sobre eso.

### 3.4 Los percentiles tienen un supuesto sin declarar y un número mal atribuido

El documento declara dos supuestos de la simulación; son **tres**. El que falta es que los
substats iniciales se sortean **uniforme** entre los candidatos, y en ZZZ no es así (HP/ATK/DEF
planos salen más que CRIT). Es el más consecuente de los tres.

Además, *"el 27 % de los discos saca cero rolls relevantes"* es solo el perfil crítico; para el
perfil de anomalía es **11,9 %**. Está enunciado como si cubriera los dos.

### 3.5 DECISIÓN NECESARIA — el ratio puede rankear una rareza baja por encima de una alta

Este es el único hallazgo que toca el **método**, no la implementación. El ejemplo está en la
propia §3.2 del plan:

| | ratio |
|---|---|
| S, 5 de 9 | 0,556 |
| B, 4 de 7 | **0,571** |

El disco B puntúa mejor siendo un tercio del valor real (un roll de CRIT DMG en B da 1,6 %; en S,
4,8 %). El plan afirma que el denominador variable *"resuelve solo el tope distinto por rareza"* —
resuelve el **conteo de procs**, no el **valor del roll**. La marca de rareza queda como nota al
pie al lado de un número que apunta al revés.

Opciones, en orden de cuánto cambian el método:

1. Multiplicador por rareza sobre el ratio (S ×1, A ×0,75, B ×0,55 — Wisplight publica justo
   esos). Es lo mínimo y ya estaba anotado en el plan para otra cosa.
2. Nunca comparar discos de distinta rareza en la misma lista; ordenar por rareza primero.
3. Aceptarlo y que la UI muestre siempre rareza junto al ratio, sin ranking global.

**Esto lo decide el usuario, no lo resuelvas por tu cuenta.**

### 3.6 La postura de licencias es incoherente

El plan dice que no se vendorizaron las tablas de pesos de terceros, pero la §6 reproduce seis
vectores de pesos con coeficientes y agentes, más `SUBSTAT_ROLL_VALUES` y `calculateRollCount` de
southxpaw textuales. "No vendorizado" ahí significa "no está en un `.json`". Además llama
*"bloqueante"* a la cuestión sin nombrar la licencia de ninguna de las tres herramientas — es un
archivo `LICENSE` de distancia. Y afirma que el dato del juego *"se puede usar sin problema"*, que
es una conclusión legal sin respaldo sobre config de HoYoverse obtenida por datamining, mientras
bloquea pesos derivados de terceros. La precaución corre al revés.

Nota: `SUBSTAT_ROLL_VALUES` de southxpaw es el grupo 4000 de `RandPropertyLibraryTemplateTb`
dividido por 100 — los mismos números que la §1 derivó por su cuenta. Presentarlo como cita de un
tercero exagera el enredo.

`docs/disc-score-data.json` sí está limpio: los cuatro bloques trazan a archivos del juego.

---

## Bloque 4 — Tests y decisiones abiertas

**Severidad: baja, salvo las decisiones, que bloquean el paso 3.**

### 4.1 Tests que pasan con la implementación rota

- `tests/test_disc_values.py:95-100` — lee el literal `MAIN_STAT_SCALE` y no llama a nada. Cambiá
  `RARITY_A` índice 6 de `15000` a `1500` y **la suite sigue verde**. Quedan sin fijar 11 valores
  interiores de A, 8 de B y 13 de los 14 de S. Además `[16, 13, 10]` depende del orden de
  inserción del dict, y `sorted()` no es estricto (una meseta pasa).
- `tests/test_disc_values.py:89-92` — solo compara conjuntos de claves, nunca un valor, y no llama
  a `substat_base()`. Cambiá la base de HP en S de `112` a `12` y **la suite sigue verde**. 24 de
  las 30 entradas de la tabla no las verifica nada.
- `tests/test_disc_values.py:26-36` — los cuatro casos parametrizados son la misma cuenta
  (`base × 4` en el tope). La rama de truncamiento de `base * (10000 + scale) // 10000` nunca se
  ejecuta: todos los casos dividen exacto. Falta algo como `main_stat_total(23, RARITY_S, 1)` → 27.
- `substat_total(x, 0)` no se testea en ningún lado — y es el bug 2.2.
- `frontend/src/components/render.test.tsx:95` — `expect(html).toContain('19')` con un fixture
  donde `value === total === 19`: pasa igual leyendo `total` o `value`, no protege de nada. Dale
  al substat de ATK `rolls: 2, total: 38` y afirmá `'38'`.
- `tests/test_agent_editing_api.py` afirma el `total` del main stat pero nunca el del substat
  (debería leerse `720`). Ese camino escritura→storage→lectura es lo que ese archivo cubre en
  exclusiva.

### 4.2 Comentarios y nombres que mienten

- `tests/test_disc_values.py:46` — *"B discs stop at 15"*. Paran en 9. La aserción de abajo es
  correcta; el comentario dice lo contrario de lo que la hace pasar.
- `tests/test_disc_values.py:71` — el nombre dice *"worth the same"*, la aserción dice `21103 == 2 * 20103`.
- `frontend/src/lib/agentDraft.ts:22-23` — el comentario dice "1 inicial más los 5 procs"
  (mínimo 1) y el rango declarado es `[0, 6]`.
- `src/zzz_tracker/web/schemas.py` docstring de `StatRead` — dice que `total` es `None` solo
  cuando rareza o nivel son "desconocidos". El caso que realmente se dispara es nivel **fuera de
  rango para la rareza**, que no es desconocido.
- `frontend/src/lib/agentDraft.ts:10` — dice "Mismos límites que los `Field(ge=..., le=...)` del
  backend", pero `skillLevel: [0, 12]` no espeja nada: el backend no acota los skill levels y
  acepta 9999. `MAX_SUBSTATS = 4` tampoco se valida server-side.

### 4.3 El fixture perdió variedad

`tests/fixtures/enka_account.json` se regeneró y quedó con los 6 discos en rareza S y exactamente
4 substats. Antes eran 4/3/2/3/2/2. El caso de **3 substats iniciales** (`MIN_SUBSTATS` en
`values.py:102`) y las rarezas **A y B** no se ejercitan en ningún lado del pipeline
mapper→storage→StatRead. Y `tests/test_mapper.py:72` afirma `sum(rolls) == 4 + roll_count`, donde
ese `4` es una propiedad de cómo se regeneró el fixture, no un invariante del dominio.

### 4.4 El formulario manual invita a corromper el dato

`DiscFields.tsx` muestra el campo del main stat con la **base** (`550`) al lado de una tarjeta que
muestra `2.200`, sin ninguna leyenda. El usuario "corrige" 550 → 2200, el backend reescala, y
quedan **8800 HP**. El contrato de escritura en base es el correcto (si no, la columna
significaría cosas distintas según venga de Enka o de la mano), pero el formulario debería aceptar
el valor que se ve en el juego y convertirlo — las tablas de `values.py` ya lo permiten.

Relacionado: `agentDraft.ts:139` hace `rarity: disc.rarity === null ? '4' : ...`, o sea **inventa
rango S** al abrir el formulario sobre un disco sin rareza. Guardar sin tocar nada manda `discs`,
lo que según el docstring de `AgentUpdate` pasa el agente a `source = manual` para siempre.

### 4.5 DECISIONES QUE BLOQUEAN EL PASO 3

Ninguna está definida en el plan. **Preguntale al usuario, no las resuelvas solo.**

- **"Build" no existe en el modelo de datos.** El plan dice en dos lugares que la prioridad
  pertenece a la build y no al agente (por Astra Yao, que tiene build Anomaly y build CRIT). El
  modelo de `docs/PLAN.md` es `Agent` con un set de discos: no hay entidad build, ni id, ni dónde
  colgar el override manual.
- **Las dos fuentes del nivel 2 no tienen regla de conflicto.** `agent_reco.substats` y
  `HighlightProps` están en el mismo nivel de precedencia sin decir si es unión, intersección o
  gana-el-primero. Para Lycaon se contradicen: `ATK%, CR` contra Impact.
- **`HighlightProps` no es usable como está.** Usa ids del espacio `[Base]` (`xxx01`), no los de
  substat (`xxx03`/`xxx02`): Ellen es `[12101, 20101, 21101]`, no `[12102, 20103, 21103]`.
  Los 58 de 58 agentes necesitan traducción de ids. Y aun traduciendo, **8 agentes mapean a
  conjunto vacío** porque su highlight no es un substat: Anby, Nicole, Caesar, Ōkuma Mari, Lycaon,
  Lighter, Rina, Qingyi — todos los Stun entre ellos. Además `12101` (ATK base) mapea ambiguo a
  ATK% **y** a ATK plano, igual que HP y DEF.
- **El fallback por profession (nivel 3) no tiene tabla ni disparador.** Seis nombres de
  profession, cero conjuntos de stats. Y si el nivel 2 cubre 58/58 nunca se activa, salvo para los
  8 agentes de arriba — conexión que el plan no hace.
- **`rolls_totales == 0`** es alcanzable (ver 2.2) → denominador cero. Sin regla.
- **§3.3 del plan dice que 2 piezas dan un stat fijo (`SetBonusProps`), y es falso en 4 de 30
  sets**: Proto Punk, Shadow Harmony, King of the Summit y Dawn's Bloom lo tienen vacío. El
  veredicto *"2pc+2pc+2pc, todos recomendados → aceptable"* los sobrevalora.
- **Mains de elemento en slot 5.** `agent_reco` nombra un elemento por agente; no está dicho si
  otro elemento en slot 5 es "main incorrecto" o queda sin juzgar. Misma pregunta para los slots
  con dos candidatos del bloque 1.

---

## Orden sugerido

1. **Bloque 1** — el dato está mal en el repo hoy y bloquea los pasos 3 y 5.
2. **Bloque 2** — 2.1 y 2.2 son un bug reintroducido y una regresión.
3. **Bloque 3** — pero 3.5 es decisión del usuario, no la tomes vos.
4. **Bloque 4** — 4.5 hay que preguntarlo antes de arrancar el paso 3 del plan.

## Verificación final

```bash
uv run ruff check src tests && uv run ruff format --check src tests
uv run mypy src
uv run pytest
cd frontend && npm run lint && npm run build && npm run test
```

Nota: `uv run ruff check .` (el comando de `CLAUDE.md`) falla por `.claude/hooks/`, que no es
código del proyecto. O se excluye `.claude` en `pyproject.toml` o se arregla ese script.

Nota 2: `.claude/settings.json` apunta los hooks a `$HOME/.claude/hooks/run_relevant_tests.py`,
que no existe — el script está en `.claude/hooks/` del repo. Con la ruta rota, el hook de
`PreToolUse` sale con código 2 y **bloquea toda llamada a `Write`/`Edit`**. Se puede trabajar por
Bash, o corregir la ruta a `$CLAUDE_PROJECT_DIR/.claude/hooks/`.
