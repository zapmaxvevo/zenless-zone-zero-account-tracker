# Score de discos — plan

Estado: **propuesta**. Hoy el proyecto no calcula ningún score y, además, muestra mal
los valores de los discos. Este documento fija la matemática, de dónde salen los
números y en qué orden implementarlo.

**Método decidido: base + conteo de rolls (sección 3).** Un disco se lee como dos cosas que no
se mezclan — una *base* inmutable (rareza, main stat, set), que se marca con su motivo pero
nunca anula nada, y un *conteo* de cuántas mejoras cayeron en los substats que el agente
prefiere, mostrado con desglose. No necesita pesos, así que no depende de ninguna tabla de
terceros: se puede implementar ya. El score ponderado queda documentado como capa 2 opcional en
la sección 6.

---

## 0. Punto de partida: los valores de disco están mal

La doc de Enka (`docs/zzz/api.md`) dice textualmente:

- `PropertyValue` — *"Property Base Value"*
- `PropertyLevel` — *"Amount of rolls, only matters if substat"*

Enka manda **valores base**, no los que se ven en el juego:

```
main stat:  total = PropertyValue * (1 + scale(rareza, nivel) / 10000)
substat:    total = PropertyValue * PropertyLevel
```

El proyecto guarda `PropertyValue` crudo (`tracker/service.py:337-339`) y lo sirve tal cual
(`web/schemas.py:158-166`). Nunca aplica ninguna de las dos fórmulas. Efectos:

| Síntoma | Se ve | Debería verse |
|---|---|---|
| Main stat HP slot 1, S nivel 15 | 550 | 2200 |
| Substat CRIT DMG con 3 rolls | 1 roll | 3 rolls (14,4 %) |

Detalles relacionados:

- `formatStatValue` (`frontend/src/lib/stats.ts`) **está bien**: los porcentuales son `raw/100`
  (bonus de set 800 → 8 %, main CRIT Rate S15 2400 → 24 %). El bug es que se le pasa la base.
- `frontend/src/lib/stats.test.ts:63` congela el error: espera `'0,2%'` para un CRIT Rate.
- `tests/fixtures/enka_account.json` usa bases falsas para los porcentuales (CRIT Rate 24,
  CRIT DMG 48; las reales son 240 y 480). Los planos sí son correctos (ATK 19, DEF 15).
- `MAX_DISC_ROLLS = 5` (`web/schemas.py:31`) se usa como tope del `rolls` de **cada** substat,
  pero un substat llega a `PropertyLevel` 6. Son dos límites distintos.

**Nada de esto es opcional: sin arreglarlo el score puntúa sobre datos incorrectos.**

---

## 1. Los números, verificados contra los archivos del juego

Fuentes alcanzables y estables:

- `raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/zzz/*.json`
- `git.mero.moe/dimbreath/ZenlessData/raw/branch/master/FileCfg/*.json`

### Substat base por roll — `RandPropertyLibraryTemplateTb`, grupo `rareza * 1000`

| prop id | stat | S (4) | A (3) | B (2) |
|---|---|---|---|---|
| 11103 | HP plano | 112 | 75 | 37 |
| 11102 | HP % | 300 (3 %) | 200 | 100 |
| 12103 | ATK plano | 19 | 13 | 6 |
| 12102 | ATK % | 300 (3 %) | 200 | 100 |
| 13103 | DEF plano | 15 | 10 | 5 |
| 13102 | DEF % | 480 (4,8 %) | 320 | 160 |
| 23203 | PEN plano | 9 | 6 | 3 |
| 20103 | CRIT Rate | 240 (2,4 %) | 160 | 80 |
| 21103 | CRIT DMG | 480 (4,8 %) | 320 | 160 |
| 31203 | Anomaly Proficiency | 9 | 6 | 3 |

### Escala del main stat — `EquipmentLevelTemplateTb`

`scale/10000`, nivel máximo por rareza: B 0..9, A 0..12, S 0..15. Las tres terminan en
`30000`, o sea **base × 4,0** al máximo.

### Mecánica de rolls

**Verificado en los archivos:**

- `PropertyLevel` de un substat va de **1 a 6** (`RandPropertyLevelTemplateTb` tiene 6 filas,
  multiplicador `(N-1)×10000` → total = base × N).
- `BreakLevel` de Enka es *"Amount of random stat procs"*, textual en su doc.
- Nivel máximo por rareza: **S 15, A 12, B 9** (`EquipmentRarityTemplateTb`).
- Cada proc suma exactamente 1 a la suma de `PropertyLevel` del disco — sea porque sube un
  substat existente o porque crea uno nuevo con nivel 1.

**Inferido, no probado:**

- *Un proc cada 3 niveles* → S = 5 procs, A = 4, B = 3. Sale de cruzar `EDKFGPLIKKM = 3`
  (constante en las tres rarezas) con el nivel máximo. Es coherente y coincide con el saber
  común, pero el campo está ofuscado y no está confirmado que signifique eso.
- *Cuántos substats trae un disco al caer.* *No está en los archivos que pude leer.* Se suele
  decir que un S sale con 3 o 4. Como consecuencia, **un S nivel 15 tiene 8 o 9 rolls, no
  siempre 9.**

**Por qué esto no rompe nada:** el método por defecto calcula `rolls_totales` sumando los
`PropertyLevel` del disco concreto, así que nunca necesita saber la cantidad inicial — se
autocorrige, haya salido con 3 o con 4. Las dos inferencias solo afectan la **calibración de
tiers** (sección 5), no el cálculo.

Como control: el disco de `tests/fixtures/enka_account.json` tiene `PropertyLevel` 3+1+2+1 = 7 y
`BreakLevel` 5, lo que implicaría 2 substats iniciales — imposible. Otra confirmación de que ese
fixture es sintético.

### Lo que hace fácil el score

**Todos los rolls del mismo stat valen exactamente lo mismo.** No hay rango aleatorio
como en Genshin. Contar rolls *es* el score: no hace falta ningún "roll value" fraccionario.

---

## 2. Qué usa la comunidad

Se revisaron Prydwen y las tres herramientas que sí calculan un score.

### Prydwen: no publica ninguna fórmula

Ni score, ni pesos, ni normalización, ni umbrales. Sus guías de discos siguen fechadas en 2024.
Lo único cuantitativo del sitio son los sets rankeados como % del mejor (BiS = 100 %), que es
otra cosa. Lo que sí publica es **prioridad ordinal por agente**, con tres operadores
(`=`, `>`, `>=`). Ej. Ellen: `CRIT DMG >= CRIT Rate > ATK% > PEN = ATK`.

Tres detalles de esas cadenas que condicionan el diseño:

- Están **truncadas**: HP %, DEF %, HP plano y DEF plano no aparecen en ninguna. Ausencia = peso 0.
- Tienen **caps condicionales en texto libre**: Miyabi `CRIT RATE (Until 80%)`,
  Astra `Until Ability Cap`. Un vector de pesos fijo sobrevalora CRIT Rate pasado el cap.
- **Un agente puede tener varias builds** con cadenas distintas (Astra Yao: Anomaly y CRIT).
  La prioridad pertenece a la build, no al agente.

### Las tres tools: no hay fórmula canónica, pero sí una forma canónica

No existe un estándar publicado — cada tool inventó la suya. Pero las tres convergen en la
misma estructura:

```
score = Σ (rolls_del_substat × peso_del_stat_para_ese_agente),  normalizado contra un máximo
```

**Ninguna hace RV por valor con máximos por stat. Las tres cuentan rolls.** Y las tres le dan
a CRIT Rate y CRIT DMG **el mismo peso**, sin factor de corrección — porque la relación 2:1 de
valor ya queda absorbida en la unidad "roll". Esto confirma la premisa de la sección 1.

| | southxpaw/zzz.optimizer | Otameta | Wisplight |
|---|---|---|---|
| Unidad | rolls | rolls | rolls |
| Escala | 0–144 absoluta | 0–55, 55 = disco perfecto | 0–100, build completa |
| Normaliza contra un máximo | **no** | sí, disco alcanzable | sí, disco "excelente realista" |
| Pesos | 57 agentes, 2 builds c/u | 45 agentes, arquetipo de rol | no publicados |
| Grados | VH/PHT/SSS/SS/S/A/B/C/D/F | ninguno | GOD/S+/S/A/B/C/D |

- **southxpaw** es el más expresivo pero sus bonus de god-roll y "all good substats" están
  calibrados a mano — su propio código dice *"calibrated against real account data, not
  derived — retune with care"*. Difícil de justificar ante un usuario.
- **Otameta** es el más limpio: ~30 líneas y un denominador honesto (abajo).
- **Wisplight** puntúa la build entera, no el disco: sets 20 %, main stats 25 %, substats 35 %,
  objetivos de stats 20 %. Publica la metodología pero **no los pesos** (corre server-side).
  De ahí sí se pueden copiar decisiones concretas: main stat equivocado en slots 4–6 → **×0,3**;
  multiplicador por rareza **S ×1, A ×0,75, B ×0,55**; curva `calidad^0,8` para que los discos
  medios no se amontonen abajo.

Vale la pena saber que **frzyc/zenless-optimizer** no usa heurística: corre la fórmula de daño
real y optimiza DPS. Es la alternativa "hacerlo bien de verdad", con otro orden de esfuerzo.

---

## 3. El método por defecto: base + conteo de rolls

**Esta es la métrica que calcula el proyecto.** El score ponderado de la sección 6 queda como
capa opcional, para después.

La idea: un disco tiene dos cosas que no se mezclan.

| | qué es | ¿se puede cambiar? |
|---|---|---|
| **base** | rareza, main stat, set | **no** — queda fijo en el drop |
| **rolls** | dónde cayeron las mejoras | sí, mejora al subir nivel |

La base contesta *¿vale la pena invertir en este disco?* y los rolls *¿cómo salió la inversión?*
No son dos componentes de un mismo puntaje: son **un portón y un puntaje**. Sumarlos o
promediarlos deja que un disco compense con rolls algo que no tiene arreglo posible.

### 3.1 Los rolls

```
rolls_totales    = Σ PropertyLevel   (sobre todos los substats)
rolls_relevantes = Σ PropertyLevel   (solo los substats preferidos del agente)
```

Sale **entero de Enka, sin ninguna tabla estática**. No necesita pesos: solo un *conjunto* de
stats preferidos, binario, que es exactamente lo que da el dato oficial del juego (sección 4).

El denominador **no se fija en un número**. Un disco nivel 0 tiene 3–4 rolls y uno nivel 15
tiene 8 o 9 (según con cuántos substats haya salido); si comparás contra una constante, todo
disco sin subir aparece como basura cuando en realidad solo está sin invertir. Usando `rolls_totales` real, "2 de 4" en un disco nuevo se lee bien y "2 de 9" en
uno maxeado se lee mal — que es lo correcto. Como efecto secundario, también resuelve solo el
tope distinto por rareza (B tope a 3 procs, A a 4, S a 5).

Se muestra **con desglose**, no como número suelto:

> **4 de 7** — 3 CRIT Rate, 1 CRIT DMG

Esto recupera casi todo lo que se pierde al no tener pesos. Un "5 de 9 — 5 ATK%" se lee al
instante como mediocre aunque el número diga 5, cosa que un promedio ponderado escondería.

### 3.2 La base

Tres señales, las tres inmutables. Se reportan con el motivo, **nunca anulan el conteo**:

```
base_ok: bool        # rareza S  Y  main correcto  Y  aporta a un set activo
base_issues: []      # el motivo, cuando no
```

**Rareza** — esperado S. Un disco A o B se **marca**, no se pone en cero. En una cuenta nueva
lo que tenés equipado *son* discos A y B; si el tracker devuelve 0 en todo deja de servir justo
cuando más lo necesitás, que es para saber cuál reemplazar primero.

**Main stat** — se compara contra el recomendado del slot. Los slots 1, 2 y 3 tienen main fijo
(HP / ATK / DEF planos, idéntico en las tres rarezas), así que ahí no hay nada que evaluar: la
señal solo aplica a los slots 4, 5 y 6.

**Set** — ver 3.3.

Ejemplos para Ellen (preferidos: CRIT Rate, CRIT DMG, ATK %):

| Disco | base | rolls |
|---|---|---|
| S, slot 4 CRIT DMG | ok | 5 de 9 — 3 CD, 2 CR |
| B, slot 4 CRIT DMG | rareza B | 4 de 7 — 4 CR |
| S, slot 4 DEF % | main DEF % (se espera CRIT Rate / CRIT DMG) | 6 de 9 — 4 CD, 2 ATK % |

La tercera fila es la que justifica todo el diseño: 6 de 9 es percentil 99 de rolls y aun así el
disco no sirve. Un promedio ponderado lo habría mostrado como muy bueno.

### 3.3 Sets — se evalúa a nivel build, no a nivel pieza

El set cumple el mismo criterio que rareza y main (fijo en el drop, imposible de cambiar), pero
con una diferencia que no hay que borrar: **rareza y main se juzgan mirando el disco solo; el
set solo tiene sentido mirando los 6 juntos.** Un disco de Woodpecker no está bien ni mal por sí
mismo — depende de si completás 4 piezas.

En ZZZ hay dos bonus: **2 piezas** dan un stat fijo (`SetBonusProps` en `equipments.json`) y
**4 piezas** dan un efecto condicional. Las builds reales son `4pc + 2pc` o `2pc + 2pc + 2pc`.

La recomendación oficial (`agent_reco.sets`) trae 3 sets por agente **y el orden importa: el
primero es el candidato a 4pc**. Verificado contra el ranking de Prydwen — Miyabi → Branch &
Blade Song (su BiS al 100 %), Ellen → Polar Metal, Zhu Yuan → Chaotic Metal.

Evaluación a nivel build:

| Situación | Veredicto |
|---|---|
| 4pc del primer set recomendado + 2pc de otro recomendado | óptimo |
| 4pc de un set recomendado (cualquiera) | bien |
| 2pc + 2pc + 2pc, todos recomendados | aceptable |
| piezas sueltas que no completan ningún bonus | desperdicio — se marca cuáles |

Y de ahí sale una señal **derivada** por disco: `aporta_a_set: bool` — si esta pieza forma parte
de algún bonus activo o está desperdiciada. `AgentDetailRead._equipped_sets`
(`web/schemas.py:249`) ya cuenta las piezas por set, así que el cálculo tiene dónde vivir.

---

## 4. De dónde salen los stats preferidos

El método por defecto **no necesita pesos**, solo un conjunto binario de stats preferidos por
agente. Eso elimina el único bloqueo real que tenía el plan: no hace falta resolver ninguna
licencia de terceros para arrancar.

Tres niveles, de mayor a menor precedencia:

1. **Override manual por agente/build.** Tabla curada en el repo. Es la que gana.
2. **Recomendación oficial del juego.** Cubre **58 de 58 agentes** y se actualiza sola:
   - `EquipmentAutoTemplateTb.json` de ZenlessData — por agente: 3 sets recomendados (el primero
     es el 4pc), main stat de slots 4/5/6 y **lista de substats recomendados**.
     Ellen (1191) → sets `[Polar Metal, Woodpecker Electro, Hormone Punk]`, main4 `CRIT Rate`,
     main5 `Ice DMG`, main6 `ATK%`, substats `[CRIT Rate, CRIT DMG, ATK%]`.
   - `HighlightProps` en `avatars.json` de Enka — *el proyecto ya lo descarga y lo ignora*.
     Ellen → `[Atk_base, Crit, CritDmg]`; Anby → `[BreakStun_base]`.
3. **Fallback por `profession`** (Attack / Stun / Anomaly / Support / Defense / Rupture).

### Cuánto coincide la fuente oficial con el meta

Contrastado contra las cadenas de Prydwen:

| Agente | Oficial | Prydwen | |
|---|---|---|---|
| Ellen | CR, CD, ATK% | CD >= CR > ATK% | coincide |
| Zhu Yuan | CR, CD, ATK% | CR = CD = ATK% | coincide |
| Miyabi | CR, CD, ATK% | CR >= CD = ATK% | coincide |
| Jane Doe | AP, ATK% | AP >= ATK% | coincide |
| Nicole | ATK%, AP | AP = ATK% | coincide |
| Lycaon | ATK%, CR | CR = CD > ATK% | **omite CRIT DMG** |
| Lighter | ATK%, CR | CR > CD > ATK% | **omite CRIT DMG** |

Los main stats divergen más (Miyabi oficial main6 = CRIT DMG, Prydwen = ATK%).

**Por eso existe el nivel 1.** La fuente oficial es un default honesto y sin mantenimiento, no un
oráculo. El override manual cubre los Stun y cualquier otro caso donde el meta se separe.

---

## 5. Tiers

Los dos scorers que publican grados no coinciden en nada (southxpaw 0–144 con 10 bandas,
Wisplight 0–100 con 7). Sin consenso, los umbrales salen de la distribución real.

Simulando 200 000 discos S nivel 15 contra un perfil de 3 stats relevantes. **Dos supuestos que
no pude verificar** (ver sección 1) y que conviene revisar contra datos reales antes de fijar
los cortes: que el disco sale con 4 substats iniciales, y que los 5 procs se reparten uniforme
entre ellos.

| | rolls relevantes de 9 |
|---|---|
| media | ~2,0 (perfil crítico) / ~3,0 (perfil anomalía) |
| p50 | 2–3 |
| p75 | 3–4 |
| p90 | 4–6 |
| p95 | 5–6 |
| p99 | 6–8 |

**El 27 % de los discos saca cero rolls relevantes** y llegar a 6/9 es percentil 99. La
distribución es muy sesgada, así que los tiers salen de percentiles, no de bandas parejas.
Wisplight llega a lo mismo por otro camino: aplica `calidad^0,8` *"para que los discos medios se
repartan entre B y A en vez de amontonarse abajo"*.

**No reutilizar las letras S/A/B.** En este proyecto y en el juego significan rareza — el commit
`4c0f149` fue justamente sobre no inventar escalas que el juego no usa. Mostrar el percentil o
un vocabulario propio.

---

## 6. Capa 2 opcional: score ponderado

Queda documentado pero **no se implementa en la primera pasada**. Lo único que agrega sobre el
conteo es distinguir prioridades dentro de los stats preferidos (para Ellen, `CD >= CR > ATK%`
en vez de tratarlos igual). A cambio pide una tabla de pesos por agente, que es justamente el
problema sin resolver.

```
puntos_sub  = Σ_substats  rolls_s × peso(prop_s)
puntos_main = 3 × peso(main)      # 0 en slots 1/2/3
score       = 100 × (puntos_main + puntos_sub) / máximo(disco, agente)
```

El denominador correcto **no es** `9 × peso_máximo`: un substat tope a 6 rolls, así que el mejor
disco alcanzable es `6 + 1 + 1 + 1` repartido entre los cuatro mejores stats disponibles.

```
máximo_sub = W[0]×6 + W[1] + W[2] + W[3]      # W ordenado desc
```

Es la normalización de Otameta, **con dos correcciones que Otameta no hace**:

1. `W` debe restringirse a los stats que **pueden ser substat** (los 10 de la sección 1). Otameta
   mete en el top-4 cosas como `element_dmg` y `pen_ratio`, que en ZZZ son solo main stat —
   infla el denominador y deprime todos los scores.
2. Hay que **excluir el main stat del propio disco**: un substat nunca repite el main.

CRIT Rate y CRIT DMG comparten peso 1,0 (un roll de CR da 2,4 % y uno de CD 4,8 %; bajo
`1 CR = 2 CD` valen lo mismo). Las tres tools coinciden.

### De dónde saldrían los pesos

southxpaw publica `agent-breakpoints.json` con un vector plano por agente, 57 agentes:

| Perfil | Pesos | Agentes |
|---|---|---|
| CRIT | `CR 1, CD 1, ATK% 0,85, ATK 0,15, PEN 0,15` | 23 (Ellen, Zhu Yuan, Lycaon, Qingyi…) |
| Anomalía | `AP 1,35, ATK% 1,25, ATK 0,15, PEN 0,15` | 9 (Jane, Yanagi, Burnice…) |
| Anomalía pura | `AP 1,5, ATK% 1,5, ATK 0,15, PEN 0,15` | 8 (Aria, Cissia, Velina…) |
| Híbrido | `CR 1, CD 1, ATK% 1, ATK 0,15, PEN 0,15` | Soukaku, Lucy, Pan Yinhu |
| HP scaler | `CR 1, CD 1, HP% 0,85/1/1,5` | Yixuan, Banyue, Zhao, Yidhari |
| Especiales | Miyabi `CR 1, CD 1, AP 0,55, ATK% 0,85`; Ben `CR 1, CD 1, DEF% 1` | |

Miyabi tiene un perfil propio que ningún fallback por profession produciría.

**Bloqueante:** esa tabla está acreditada a *"Interknot Network"*, no es de southxpaw. Copiarla
tiene implicancias de atribución/licencia que hay que resolver **antes**. Alternativas:
derivarla de la fuente oficial o curarla a mano desde las cadenas de Prydwen.

### Cap blando de CRIT Rate

El peso de CRIT Rate debería decaer una vez que el CR total del agente cruza su cap
(Prydwen: Miyabi `CRIT RATE (Until 80%)`). Necesita las stats agregadas del agente, no solo las
del disco. Dos fuentes independientes de breakpoints: los objetivos de nivel 60 de Prydwen
(Ellen CR 90–100 %, CD 120–180 %) y `agent-breakpoints.json` de southxpaw (Ellen CR 50/60,
CD 99/120, ATK 1900/2200; Jane AP 180/220, AM 120/140, CR/CD **0**).

---

## 7. Orden de implementación

1. ~~**Tabla de datos estáticos.**~~ **Hecho** — `src/zzz_tracker/discs/values.py`, sin
   dependencias. Verificado contra el ejemplo de la propia doc de Enka (550 a nivel 14 = 2090).
2. ~~**Valores reales.**~~ **Hecho** — `total` en `StatRead`, `value` intacto. `MAX_DISC_ROLLS`
   partido en `MAX_DISC_PROCS` (5, el disco) y `MAX_SUBSTAT_ROLLS` (6, un substat); el frontend
   los separó igual (`LIMITS.discProcs` / `LIMITS.substatRolls`), donde antes capaba los
   substats en 5 y rechazaba discos válidos.

   Al hacerlo apareció que `tests/fixtures/enka_account.json` estaba peor de lo detectado: los
   main stats mezclaban base y valor mostrado (slots 1/2/3 en base, 4/5/6 ya escalados), los
   porcentuales estaban 10x chicos y los conteos de rolls eran imposibles (discos que implicaban
   −1 substats iniciales). Se regeneró consistente: `ΣPropertyLevel = 4 + BreakLevel`,
   `BreakLevel = nivel // 3`, bases de las tablas reales.

   **Pendiente de decisión (no bloquea):** la escritura manual toma `main_stat_value` y
   `substats[].value` como **base**, que es lo correcto para que la columna signifique lo mismo
   venga de Enka o de la mano. Pero nadie sabe de memoria que un main stat de HP "es 550". El
   formulario debería aceptar el valor que se ve en el juego y convertirlo — las tablas del paso
   1 ya lo permiten. Va con el paso 7.
3. **Stats preferidos.** Cargar `agent_reco` + `HighlightProps`; fallback por profession; hook
   para el override manual.
4. **Conteo de rolls.** `rolls_relevantes / rolls_totales` + desglose por stat. Funciones puras
   en `src/zzz_tracker/discs/`, sin DB ni HTTP. Se calcula al leer, no se persiste: cambiar la
   lista de preferidos no debe pedir migración.
5. **Base.** Rareza y main por disco; sets a nivel build reusando `_equipped_sets`, con la señal
   derivada `aporta_a_set` por pieza.
6. **API.** Conteo + base en `DriveDiscRead`; agregado y veredicto de sets en `AgentDetailRead`.
7. **Frontend.** Mostrarlo en `DiscCard` y en `AgentPage`.
8. **Después.** Capa 2 ponderada (sección 6), cap blando de CRIT Rate, builds múltiples por
   agente, objetivos de stats a nivel 60.

---

## Anexo — datos

`docs/disc-score-data.json` trae ya extraído y listo para vendorizar:

- `substat_base` — valor base por roll, por rareza (3 rarezas × 10 stats)
- `mainstat_base` — main stats posibles por rareza y slot, con su base
- `mainstat_scale` — escala por rareza y nivel (39 filas)
- `agent_reco` — recomendación oficial: 59 filas, 58/58 agentes, sets ordenados con el 4pc primero

Todo eso sale de los archivos del juego, así que es dato del juego y se puede usar sin problema.

**No se vendorizaron** las tablas de pesos de terceros (southxpaw / "Interknot Network",
Otameta). Sus números principales están en la sección 6 para poder decidir, pero copiarlas es
una decisión de licencia pendiente — y con el método por defecto no hacen falta.

### Fórmulas de referencia, textuales

Otameta, la más limpia de las tres:

```
main(d)  = 0                si main ∈ {HP plano, ATK plano, DEF plano}
         = 3 × W[main]      si no
sub(d)   = Σ_s (valor_s / base_s) × W[s]     ≡  Σ_s rolls_s × W[s]
Max(d)   = main(d) + Σ_{i=0..3} sortDesc(W)[i] × [6,1,1,1][i]
score(d) = 55 × (main(d) + sub(d)) / Max(d)
```

southxpaw, el núcleo de conteo de rolls:

```ts
SUBSTAT_ROLL_VALUES = { CRIT_Rate: 2.4, CRIT_DMG: 4.8, 'ATK%': 3.0, 'HP%': 3.0, 'DEF%': 4.8,
                        ATK: 19, HP: 112, DEF: 15, PEN: 9, Anomaly_Proficiency: 9 }
calculateRollCount(stat, valor) = Math.round(valor / SUBSTAT_ROLL_VALUES[stat])
```

Coincide exactamente con la tabla de la sección 1, que salió de los archivos del juego. Su
comentario de cabecera explica la premisa: *"In ZZZ, substat upgrades are STATIC — each roll
always gives the same amount. This differs from HSR where rolls have min/max ranges."*
