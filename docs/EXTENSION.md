# Plan — Extensión de navegador para importar el Battle Chronicle

Escrito el 2026-08-18. Complementa a `HOYOLAB.md` y a `PLAN.md`. Cuando algo de acá se
implementa, la referencia técnica pasa a `HOYOLAB.md`; este documento es el plan, no la
memoria.

**Actualización del 2026-09-09 — la extensión dejó de ser una alternativa.** Este plan se
escribió proponiéndola como el camino *recomendado* al lado del sync server-side. Ese sync ya
no existe: se borraron el cliente de HoYoLAB, las cookies guardadas, su cifrado, el TTL, el
backoff, el cron y los tres comandos de CLI que lo manejaban. **Importar desde la extensión es
la única forma de que un dato de HoYoLAB entre al tracker**, y también la única de que una
cuenta consiga dueño. El porqué está en `HOYOLAB.md`, *No hay cron, y es a propósito*; el
recuento de lo que se borró, en `PLAN.md`.

**Y la auth del import cambió.** Donde este plan dice que `ZZZ_API_TOKEN` es obligatorio, ya no
lo es: quien autoriza a escribir una cuenta es su **account key** (`X-Account-Key`), una por
UID, y el token quedó como reja opcional encima. El modelo completo está en
`docs/OWNERSHIP.md`, y lo que hace la extensión con la key (dónde la guarda, cómo se copia a
otro navegador) en `extension/README.md`.

Las secciones de abajo quedan como se escribieron, con las correcciones marcadas donde la
afirmación vieja confundiría.

## Por qué una extensión

Cuando se escribió esto, el tracker sincronizaba desde el servidor. `HOYOLAB.md` documentaba
tres límites de ese camino que **no se arreglaban desde el backend**, y son los que terminaron
matándolo:

| Límite hoy | Causa | Con la extensión |
|---|---|---|
| Solo `level` + `mindscape` de cada agente | `avatar/basic` es lo único que se llama | `avatar/info` trae discos con substats, W-Engine, skills, stats finales — de **todo** el roster, no solo los exhibidos en Enka |
| Captcha (geetest) irresoluble headless; rate limit desde IPs de Vercel | las peticiones salen de datacenter, sin usuario delante | salen del navegador del usuario (IP residencial, cookies y headers idénticos al cliente oficial) y el geetest **se puede mostrar y resolver** |
| Cookies pegadas a mano, `ltoken_v2` caduca, guardadas cifradas en nuestra base | necesitamos las cookies para salir a HoYoLAB | la extensión usa la sesión viva del navegador; **el backend nunca ve las cookies** |
| Fixtures escritas a mano, contrato nunca verificado | nadie tuvo cookies válidas | el primer sync real produce los payloads crudos que faltan (checklist de `HOYOLAB.md`, *Lo que no se sabe todavía*) |

El plan decía acá que la integración server-side no se borraba, que quedaba para quien
prefiriera pegar cookies y para el cron. **Se borró igual**, el 2026-09-09: mantener dos
caminos costaba una tabla de cookies cifradas, un secreto obligatorio, un TTL, un backoff y un
cron en una máquina propia, todo para un camino que en Vercel iba a comerse el captcha de a
ratos. La cuenta no cerraba.

## Qué se sabe (verificado) y qué no

Verificado por el relevamiento del 2026-08-18 sobre el bundle desminificado de
`act.hoyolab.com/app/zzz-game-record`, sondas HTTP en vivo y el código de `genshin.py`:

- **`GET …/api/zzz/avatar/info`** con `id_list[0]=<id>&need_wiki=<bool>&role_id=<uid>&server=<region>`.
  Convención **`role_id` + `server`** (va en esa familia de la tabla de `HOYOLAB.md`, hay que
  agregarlo). `qs` serializa el array como `id_list[0]`; genshin.py manda `id_list[]` y también
  funciona. Respuesta: `data.avatar_list[]` (siempre array), más `avatar_wiki` /
  `strategy_wiki` / `equip_wiki` / `weapon_wiki` solo con `need_wiki=true` (links a la wiki,
  ruido para nosotros → mandar `false`).
- **Forma de `avatar_list[i]`** (modelo `ZZZFullAgent` de genshin.py): `id`, `level`, `rank`
  (mindscape), `element_type` (200 físico … 205 éter, **300** lumiflux), `avatar_profession`
  (1..5, **6** ruptura), `rarity` (`"S"`/`"A"`), `name_mi18n`, iconos, `properties[]`
  (`property_id`, `base`, `add`, `final`), `equip[]` (discos: `id`, `level`, `rarity`,
  `equipment_type` = slot 1..6, `main_properties[]`, `properties[]` = substats,
  `equip_suit{suit_id,…}`), `weapon` (`id`, `level`, `star` = fase, `rarity`,
  `main_properties[]`, `properties[]`; nullable), `skills[]` (`skill_type`, `level`),
  `ranks[]` (`is_unlocked`), `skill_awaken`.
- **No hace falta `ds`**: el bundle no lo genera en ningún lado. Headers que sí manda:
  `x-rpc-lang`, `x-rpc-language`, `x-rpc-platform`, `x-rpc-page`, `x-rpc-geetest_ext`,
  `x-rpc-challenge` (tras un captcha); `x-rpc-device_id` y `x-rpc-device_fp` **vacíos**.
- **`role_id` + `server` se descubren solos**:
  `GET https://sg-act-public-api.hoyolab.com/game_record/card/wapi/getGameRecordCard?uid=<ltuid_v2>`
  devuelve `game_role_id`, `region`, `nickname`. El usuario no tipea UID ni región.
- **CORS**: la API responde `access-control-allow-origin` **solo** para `https://act.hoyolab.com`
  y `https://www.hoyolab.com` (+ `allow-credentials: true`). Para `chrome-extension://…` no
  devuelve nada.
- **Captcha**: retcode `10035` → el cliente oficial llama
  `GET /event/toolcomsrv/risk/createGeetest` (`app_key: game_record_zzz`), muestra el widget,
  `POST …/verifyGeetest`, y reintenta con `x-rpc-challenge`. **`10041`** lo trata como límite
  duro y cierra la página (no reintenta). `5003` no aparece en el bundle de ZZZ (en genshin.py
  es "ya reclamado" de recompensas diarias) → revisar `RETCODES_CAPTCHA` en `client.py`.
- HTTP 200 siempre; `x-trace-id` viene expuesto y es lo único para correlacionar un fallo.

**Verificado en la fase 0** (2026-08-30, capturas reales con la sesión del usuario; los
scripts quedaron en `extension/scripts/`):

1. **`id_list` NO acepta varios ids: uno por request.** Con 3 y con 36 devuelve `-400005`
   "Parameter Error". Y los corchetes van **repetidos** (`id_list[]=1091`), no indexados
   (`id_list[0]=` también da `-400005`) — o sea que la lectura del bundle desminificado que
   decía `qs` → `id_list[0]` estaba mal. Un roster de 36 agentes son 36 requests, ~50 s
   serializados con jitter. Por eso el sync incremental dejó de ser optimización y pasó a ser
   parte del diseño.
2. **Los valores de las propiedades** son strings (`"38"`, `"4.8%"`), con los porcentajes ×100
   al pasarlos a entero — exactamente la escala de Enka. Y **sí hay conteo de tiradas**:
   `properties[].level` es el total (incluida la inicial) y `properties[].add` son las mejoras
   posteriores. El `rolls` del modelo es `level`. Ojo con la otra mitad: HoYoLAB manda el valor
   **acumulado** y el modelo guarda el **paso por tirada**, así que `value = base / level`.
   Todo esto se verificó contra los seis agentes que ya estaban guardados por Enka: coinciden
   los 137 substats, los 36 discos, los 6 W-Engines y los 36 skills. Detalle completo en
   `HOYOLAB.md`, *`avatar/info`: la build completa*.
3. **Tasa de captcha desde IP residencial**: ni un captcha ni un rate limit en ~17 requests
   seguidos, en tres corridas. No es una medición larga, pero despeja el riesgo principal.
4. **Firefox + Total Cookie Protection**: las tres capturas se corrieron en Firefox sobre
   `act.hoyolab.com` sin problema. No se probó dentro de un `<iframe>` porque el diseño usa
   una pestaña real.

Y una que no estaba en la lista y salió sola: **el `index` real no trae perfil**. No tiene
`role`, ni UID, ni nickname, ni nivel — solo `stats`, `avatar_list`, `buddy_list` y compañía.
Las `PROFILE_KEYS` del mapper eran conjeturas y las fixtures inventadas las tenían, así que los
tests pasaban contra una forma que la API no devuelve. El nickname, el nivel y el UID salen de
`getGameRecordCard`, que la extensión ya pide para descubrir el `role_id`: por eso el paquete
de import suma una sección `record_card` con la entrada de ZZZ (solo esa, que la card trae
también las otras cuentas de HoYoverse del usuario).

## Arquitectura

```
┌────────────────────────── navegador del usuario ───────────────────────────┐
│                                                                            │
│  popup (React)  ──mensajes──►  service worker  ──mensajes──►  content      │
│  "Importar",                    orquesta el sync,             script en    │
│  progreso, token                arma el paquete,              act.hoyolab  │
│  del tracker                    hace el POST al tracker       .com         │
│                                       │                          │         │
└───────────────────────────────────────┼──────────────────────────┼─────────┘
                                        │ POST /chronicle/import   │ fetch same-site
                                        │ X-Account-Key: zzk_…     │ credentials: include
                                        ▼                          ▼
                              tracker (FastAPI)          sg-act-public-api.hoyolab.com
                              parse_* + _upsert_*
```

Decisiones:

- **El fetch a HoYoLAB corre en un content script inyectado en `https://act.hoyolab.com/*`.**
  Es el único lugar donde CORS pasa legítimamente, las cookies son same-site, `Origin`/`Referer`
  son auténticos y el geetest se puede renderizar. El service worker con `host_permissions`
  (`credentials: 'include'`) queda como *fast path* opcional para después: depende de que el
  usuario no bloquee cookies de terceros y no tiene salida ante captcha.
  - Chrome: la página no manda `X-Frame-Options` ni `frame-ancestors` → se puede cargar en un
    `<iframe>` dentro de una página de la extensión (Chrome no bloquea cookies de terceros en
    subframes cuando el top-level es `chrome-extension://`). Alternativa: pestaña en segundo
    plano con `chrome.tabs.create({active:false})` + `scripting.executeScript`, cerrada al final.
  - Firefox: pestaña real, no iframe.
- **La extensión sube payloads crudos, no datos parseados.** El backend ya tiene el mapper
  tolerante y las dataclasses `Parsed*`; duplicar el parseo en TypeScript sería mantener dos
  mappers de un contrato sin versionar. Además el `raw` es exactamente lo que necesitamos para
  convertir las fixtures inventadas en reales.
- **El backend no sale a la red en la importación.** `POST /accounts/{uid}/chronicle/import`
  recibe el paquete y reutiliza `_upsert_roster_agent`, `_upsert_bangboo`,
  `_upsert_challenge_run`, `_upsert_lost_void` y (fase 3) `_upsert_agent`. Nada de esto toca
  `HoyolabClient` ni credenciales.
- **Auth: bearer token estático** (`ZZZ_API_TOKEN`), obligatorio en el endpoint de import y
  configurable en las opciones de la extensión. Es la primera pieza de auth del proyecto
  (`PENDIENTES.md` §4); no resuelve el problema general, pero evita que cualquiera escriba
  builds en cualquier UID. Cuando haya auth de verdad, el import se cuelga de ella.
  → **Eso pasó** (2026-09-09): el import se cuelga ahora de la account key del UID, y el
  token pasó a ser opcional. Vacío, la extensión ni manda el `Authorization`; seteado, se
  exige además de la key. El campo sigue en las opciones, explicado como lo que es.
- **CORS en el backend: no hace falta.** El POST lo hace el service worker con
  `host_permissions` sobre el dominio del tracker, y eso saltea CORS. Sí hay que declarar
  ese host en el manifest (configurable: local `http://127.0.0.1:8000/*` y el dominio de Vercel).
- **Empaquetado: WXT** (`0.21.x`, soporta Vite 8, cross-browser) en `extension/`, hermano de
  `frontend/`, con `package.json` propio. **Sin imports relativos a `frontend/src/`**: la regla
  de separación estricta del repo se extiende a la extensión; si hace falta compartir tipos o
  el design system, se hace como paquete (como `design-system/`). Firefox con `--mv3` explícito
  (WXT apunta a MV2 por defecto en Firefox), `browser_specific_settings.gecko.id`, y ambas
  claves `background.service_worker` + `background.scripts`.
- **Serializar y espaciar `avatar/info`** (300–800 ms de jitter), nunca `Promise.all`; y hacer el
  sync **incremental**: `avatar/basic` es un solo request y da `level` + `rank` de todo el
  roster → pedir `avatar/info` solo de los agentes cuyo `level`/`rank` cambió desde el último
  import (o de los que el tracker no tiene build). Si la fase 0 confirma batch, esto se
  simplifica.

## Contrato del import

`POST /accounts/{uid}/chronicle/import` — `X-Account-Key: <key del UID>`, que hace falta sólo
si la cuenta ya tiene dueño (el primer import de un UID libre lo reclama y recibe la key), más
`Authorization: Bearer <ZZZ_API_TOKEN>` sólo si el backend tiene el token seteado.

```jsonc
{
  "source": "extension",
  "extension_version": "0.1.0",
  "captured_at": "2026-08-18T20:15:00Z",
  "region": "prod_gf_us",
  "language": "en-us",
  "payloads": {
    "record_card":         { /* entrada de ZZZ de getGameRecordCard, recortada */ },
    "index":               { /* data crudo de index */ },
    "avatar_basic":        { /* data crudo de avatar/basic */ },
    "avatar_info":         [ { /* data crudo de avatar/info, uno por request */ } ],
    "buddy_info":          { /* … */ },
    "shiyu_defense":       { "1": { /* schedule_type=1 */ }, "2": { /* schedule_type=2 */ } },
    "deadly_assault":      { "1": { }, "2": { } },
    "lost_void":           { /* abysss2_abstract */ }
  }
}
```

Esta sección se mantiene al día contra `src/zzz_tracker/web/schemas.py`: es contrato, no plan.

- Cada valor de `payloads` es **el `data` ya desenvuelto** de la respuesta de HoYoLAB, así los
  `parse_*` se aplican sin adaptador. Una sección que el navegador no pudo traer viene ausente
  o `null`, y el backend la salta y la nombra en `skipped_sections`. `unavailable_modes` es
  otra cosa: son las temporadas que **sí** llegaron pero vienen con `has_data == false`.
- **`index` es la única clave obligatoria**, y alcanza con que esté y no venga vacía; sin ella,
  **422**. No es de donde salen el nickname y el nivel —el `index` real no trae perfil—: eso
  sale de `record_card`, que la extensión arma desde `getGameRecordCard` recortando la entrada
  de ZZZ. `avatar_info` es una **lista** de respuestas crudas, una por agente, no un merge,
  para no perder la forma exacta.
- **El UID del path se valida contra `record_card` primero y contra el `index` después**
  (`parse_chronicle_uid`: `game_role_id` / `game_uid` / `uid` / `role_id`). Si lo que encuentra
  no coincide → **422**. Si el bundle no nombra ningún UID, se acepta igual: nombrarlo no
  prueba nada —es público— y exigirlo sólo castigaría al usuario cuya captura de `record_card`
  falló. La cuenta **se crea si no existe**, porque el flujo de la extensión no pasa por la
  home del tracker.
- **`region` se valida contra las regiones que existen**: vacío significa "deducila del UID",
  y cualquier string que no sea una región conocida lo rechaza el schema con **422**.
- **`source`, `extension_version`, `captured_at` y `language` se aceptan y hoy se ignoran.**
  El backend fija `chronicle_import_source = "extension"` por su cuenta. Están en el contrato
  para que la extensión pueda mandarlos sin que el import los rechace, no porque hagan algo.
  Cualquier clave desconocida también se ignora (`extra="ignore"`), así la extensión puede ir
  adelante del backend.
- **Respuesta: `ChronicleImportResponse`**, un schema propio —`ChronicleSyncResponse` se borró
  con el sync server-side—: `account_uid`, `agents_synced`, `bangboos_synced`, `builds_synced`,
  `lost_void_synced`, `unavailable_modes`, `skipped_sections`, `runs` y `account_key`.
  `account_key` viene con la key **una sola vez en la vida de la cuenta**: en el import que le
  dio dueño. Todo import posterior presenta esa key y recibe `null`, así un cliente nunca
  guarda una key que no le están entregando.
- **Errores**: **401** si falta el `Bearer` o está mal, *sólo* donde `ZZZ_API_TOKEN` está
  configurado; **403** si la cuenta ya tiene dueño y el bundle no trae su key —no rota nada, no
  escribe nada—; **422** si falta `index`, si el UID no coincide o si la región no existe. Los
  422 que arma FastAPI por el schema no traen `code`; los del dominio sí.
- **El import no toca nada más.** No hay credenciales que actualizar, ni TTL, ni backoff: el
  backend no salió a la red. Escribe `chronicle_synced_at`, `region`, `chronicle_public = True`
  y `chronicle_import_source = "extension"`, en una sola transacción con todo lo demás.

### Precedencia de fuentes con builds de HoYoLAB

Hoy la regla es una: `manual` nunca se pisa; entre `enka` y `hoyolab` gana la última en
correr, y HoYoLAB solo escribe `level` + `mindscape_level`. Con `avatar/info` HoYoLAB pasa a
escribir builds enteras (W-Engine + discos), de todo el roster. Decisión:

- Se mantiene la regla única: **`manual` inmune, el resto último-en-escribir gana.**
- `_upsert_agent` (Enka) y el nuevo `_upsert_hoyolab_build` escriben ambos `source` con su
  valor; `AgentSource` en el frontend suma `'hoyolab'` (hoy falta y el backend ya lo escribe).
- Un import de HoYoLAB pisa la build de Enka del mismo agente y viceversa: son la misma verdad
  con distinta latencia (Enka lee el showcase, HoYoLAB lee la cuenta). Si aparece un conflicto
  real (p. ej. HoYoLAB sin conteo de rolls y Enka con él), se resuelve en la fase 3 con datos
  en la mano, no ahora.

→ **Salió tal cual.** La regla sigue siendo la única (`_write_build` es el cuerpo compartido de
`_upsert_agent` y `_upsert_hoyolab_build`, y los dos se saltan al agente `manual`),
`AgentSource` ya incluye `'hoyolab'`, y el conflicto de los rolls no apareció: HoYoLAB sí trae
el conteo, en `properties[].level`. El detalle está en `HOYOLAB.md`, *Qué pisa qué*.

## Fases

### Fase 0 — Espiga: payloads reales, sin código de extensión (½ día)

Desde DevTools en `act.hoyolab.com/app/zzz-game-record` con la sesión iniciada, correr un
snippet que haga los fetch (`getGameRecordCard`, `index`, `avatar/basic`, `avatar/info` con 1
id y con N ids, `buddy/info`, `hadal_info_v2` ×2, `hadal_mem_detail_v2` ×2,
`abysss2_abstract`) y descargue un JSON. Objetivos, en orden:

1. Resolver las incógnitas: **batch de `id_list`**, forma de los valores de propiedades,
   `Referer` obligatorio o no, headers `x-rpc-*` mínimos.
2. Reemplazar las fixtures inventadas de `tests/fixtures/` por capturas reales (anonimizando
   `role_id`/nickname) y correr el checklist de `HOYOLAB.md` (hoy *Checklist para la próxima
   captura*). Cada punto confirmado se mueve de "no se sabe" a la sección que
   corresponda.
3. Guardar el snippet en `extension/scripts/capture.js`: es el prototipo del content script y
   la herramienta de diagnóstico de acá en más.

Salida: fixtures reales + `HOYOLAB.md` corregido (`avatar/info` en la tabla, retcodes `5003` /
`10041`, y lo que se confirme). **Sin esto no se arranca la fase 3.**

### Fase 1 — Backend: endpoint de import (1 día)

- `Settings.api_token` (`ZZZ_API_TOKEN`, default `""` = import deshabilitado con 503, igual que
  el cipher). → Terminó al revés: el default vacío **no** deshabilita nada, sólo saltea la reja
  del token (`web/deps.py::require_api_token`), porque el import ya está protegido por la
  account key.
- `web/deps.py::require_api_token` (Bearer); `errors.py`: `UnauthorizedError` 401.
- `web/schemas.py`: `ChronicleImportWrite` (el contrato de arriba, `payloads` como
  `dict[str, Any]` tolerante, con `extra="ignore"`), `ChronicleImportResponse`.
- `tracker/service.py`: separar `_run_chronicle_sync` en dos: **fetch** (queda) y
  **`_persist_chronicle(account, payloads: ChroniclePayloads) -> ChronicleSyncReport`**, que
  recibe los `data` crudos y hace parse + upsert + bookkeeping + commit. `sync_chronicle` pasa a
  armar `ChroniclePayloads` desde el cliente y llamar a la misma función: **un solo camino de
  persistencia** para CLI, cron y extensión. Nuevo `import_chronicle(uid, payload) ->
  ChronicleSyncReport` que crea la cuenta si falta, valida el UID contra `index` y llama a
  `_persist_chronicle`. Guarda `avatar_info` crudo en `raw` de… (ver fase 3; en fase 1 se
  ignora, pero se acepta). → De ese reparto quedó sólo `_persist_chronicle`, que hoy no tiene
  con quién compartirse: el fetch, `sync_chronicle` y el cron se borraron, y el tipo que
  devuelve se llama `ChronicleImportReport`.
- Router `chronicle.py`: `POST /accounts/{uid}/chronicle/import`.
- Tests: `tests/test_chronicle_import.py` con las fixtures reales de la fase 0: import
  completo, parcial, sin token, UID que no coincide, cuenta nueva, agentes `manual` intactos,
  builds de Enka intactas (en fase 1 HoYoLAB sigue sin escribir builds).
- `HOYOLAB.md`: sección *Import desde la extensión* y la ruta en la tabla de la API HTTP.

### Fase 2 — Extensión MVP (2–3 días)

`extension/` con WXT + React + TS (ESLint/Prettier/vitest como en `frontend/`).

```
extension/
  wxt.config.ts
  entrypoints/
    background.ts            # orquesta: abre act.hoyolab.com, pide el sync, sube al tracker
    hoyolab.content.ts       # matches https://act.hoyolab.com/*  — todos los fetch a HoYoLAB
    popup/                   # React: estado de sesión, botón Importar, progreso, último import
    options/                 # URL del tracker + token opcional + keys por UID (chrome.storage.sync)
  lib/
    hoyolab.ts               # URLs, headers x-rpc-*, retcodes, jitter, tipos crudos
    chronicle.ts             # armado del paquete de import
    tracker.ts               # cliente del backend
  scripts/capture.js         # de la fase 0
```

Flujo del usuario: instalar → opciones (URL; el token sólo si el backend lo pide) → estar
logueado en hoyolab.com → popup
"Importar" → progreso por sección → "Importado: N agentes, M bangboos, runs…" → link a la
cuenta en el tracker.

Alcance del MVP: `getGameRecordCard` → `index`, `avatar/basic`, `buddy/info`, Shiyu ×2, Deadly
Assault ×2, Lost Void → POST. **Sin `avatar/info` todavía** (llega en la fase 3): el MVP ya
reemplaza al flujo de cookies y valida toda la cadena de punta a punta.

Manejo de errores en el content script: `-100`/`10001` → "iniciá sesión en HoYoLAB";
`10101`/429 → esperar y avisar (sin reintento automático); `10035` → flujo geetest
(`createGeetest` → widget → `verifyGeetest` → reintento con `x-rpc-challenge`), en el MVP al
menos mostrar el mensaje y dejar el reintento manual; `10041` → cortar el sync entero y avisar.
Loguear siempre `x-trace-id`.

Tests: unitarios de `lib/` con vitest (armado del paquete, mapeo de retcodes, jitter/serialización,
descubrimiento de `role_id`/`server` con fallback por prefijo de UID). E2E manual con checklist
en `extension/README.md` (Chrome + Firefox).

### Fase 3 — Builds completas desde `avatar/info` (2 días, después de la fase 0)

- Extensión: tras `avatar/basic`, pedir `avatar/info` (batch si la fase 0 lo confirmó; si no,
  serializado con jitter e **incremental** contra el último import guardado en
  `chrome.storage.local`: `{game_id: {level, rank}}`). Adjuntar en `payloads.avatar_info`.
- Backend: `hoyolab/build_mapper.py::parse_agent_builds(data) -> tuple[ParsedAgent, ...]`
  reutilizando `enka.mapper.ParsedAgent/ParsedWEngine/ParsedDisc/ParsedStat` (misma escala de
  `property_id`, mismos ids de piezas). Mapeo: `equipment_type` → `slot`, `equip_suit.suit_id`
  → `set_id`, `rarity` letra → número (`RARITY_BY_LETTER`, hoy solo para bangboos), `weapon.star`
  → `phase`, `skills[].skill_type` → índice de `skill_levels`, `rank` → `mindscape_level`,
  `ranks[]` cuenta de `is_unlocked` como verificación. Los `rolls` de los substats: solo si el
  payload real los trae; si no, `0` y se documenta en `HOYOLAB.md`. `promotion_level` y
  `core_skill_enhancement`: derivar de `level` / `skills[skill_type=5].level` si el payload no
  los trae explícitos — a confirmar en la fase 0.
- `TrackerService._upsert_hoyolab_build(account, parsed)`: mismo cuerpo que `_upsert_agent`
  con `source = SOURCE_HOYOLAB` (extraer el común a `_write_build`).
- Guardar el `data` crudo de cada `avatar/info` en una tabla nueva `agent_build_snapshots`
  (`account_uid`, `game_id`, `captured_at`, `raw`) — es el equivalente al `raw` de las runs:
  la válvula de escape si el mapper se queda corto.
- Frontend: `AgentSource` suma `'hoyolab'`; `AgentPage`/`AgentCard` muestran la fuente con la
  paleta de `lib/palette.ts` (nada hardcodeado; ver `DESIGN.md`); `palette.ts` cubre `300`
  (lumiflux) y profesión `6` (ruptura), que hoy no existen en la app.

### Fase 4 — Frontend del tracker (1 día)

- `CredentialsPage` pasa a ser "Conectar HoYoLAB" con dos caminos: **extensión** (recomendado:
  link de instalación, token a copiar, "último import: fecha, N agentes") y **cookies**
  (el flujo actual, marcado como alternativo).
- `AccountRead` expone `chronicle_import_source` (`extension` / `server`) y la fecha; el
  frontend deja de deducir "tiene credenciales" de que vuelvan datos (hueco de `PENDIENTES.md` §1).
- `ChronicleNav`: el botón de sync solo aparece si hay credenciales guardadas; si la cuenta
  vino por extensión, muestra "importar de nuevo desde la extensión".

→ **Salió distinto, y más simple.** Sin cookies que pegar no hay dos caminos que ofrecer:
`CredentialsPage` se borró y en su lugar está `AccountKeyPage` (`/account/:uid/key`), que es
donde se pega la key que trajiste de otra máquina y donde se ve si esta cuenta ya tiene dueño.
`chronicle_import_source` quedó, pero sólo puede valer `extension`; el botón de sync no existe
en ningún lado, y lo que muestran las pantallas de Chronicle cuando no hay nada importado es
que hay que importar desde la extensión.

### Fase 5 — Endurecimiento (según uso)

- Fast path por service worker con `host_permissions` + `credentials: 'include'`, con caída
  automática al content script cuando vuelve `-100` con sesión viva o `10035`.
- Sync programado desde la extensión (`chrome.alarms`, diario, solo si el usuario lo activa).
  Sigue en pie, y ahora es **la única** forma posible de que algo se actualice solo: el TTL del
  tracker que este punto proponía respetar ya no existe, así que el ritmo lo tendría que poner
  la propia extensión.
- Publicación en Chrome Web Store / AMO (`extension/README.md` con el proceso; hasta entonces,
  carga como "unpacked" / "temporary add-on").
- Telemetría mínima en el popup: retcodes vistos, `x-trace-id` del último fallo.

## Reparto para dos teammates + integración

| Quién | Qué | Depende de |
|---|---|---|
| **Backend** | Fase 1 entera; fase 3 lado backend (`build_mapper`, `_upsert_hoyolab_build`, snapshots, tests); `HOYOLAB.md` | fixtures reales de la fase 0 |
| **Extensión** | Fase 0 (snippet de captura, con la sesión del usuario), fase 2, fase 3 lado extensión, fase 5 | contrato del import (arriba), token |
| **Integración** (yo) | contrato + tipos compartidos por espejo (`ChronicleImportWrite` ↔ `lib/chronicle.ts`), fase 4, revisión de PRs, actualizar `PENDIENTES.md`/`README.md` | ambos |

Orden real: **fase 0 primero y con la sesión del usuario** (es lo único que no puede hacer un
agente solo); fases 1 y 2 en paralelo contra el contrato; fase 3 recién con las fixtures
reales; 4 y 5 después.

## Riesgos y cómo se cortan

- **HoYoLAB cambia el esquema o los headers**: `raw` guardado siempre, mapper tolerante,
  constantes de headers en un solo módulo (`lib/hoyolab.ts`), y `capture.js` para re-mirar en
  minutos.
- **Ráfaga de `avatar/info` dispara `10101`**: serialización + jitter + incremental; y si la
  fase 0 confirma batch, desaparece.
- **Captcha**: solo se ve en el content script, y ahí es resoluble. Nunca reintentar en bucle.
- **Token filtrado**: es un secreto de una sola cuenta de tracker; se rota cambiando la env.
  Cuando llegue auth real, se reemplaza. → Ya no es el riesgo que importa: el token filtrado
  no alcanza para escribir ninguna cuenta. El riesgo equivalente hoy es la **key filtrada**,
  y se corta con `zzz-tracker rotate-key <uid>`, que emite una nueva y mata la anterior.
- **Firefox + iframe**: no se usa iframe en Firefox; pestaña real.
- **Deriva de contrato entre `payloads` y el mapper**: los tests del backend corren contra las
  mismas fixtures que la extensión produce (`capture.js` escribe en `tests/fixtures/`), así
  cualquier cambio de forma rompe un test antes que producción.
