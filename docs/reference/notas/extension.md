# Notas de la extensión

Lo que el código de `extension/` no puede decir en una línea. La extensión es la **única**
puerta de entrada de datos de HoYoLAB al tracker y la única forma de que un UID consiga dueño:
el backend nunca sale a HoYoLAB. Referencia funcional en `extension/README.md`,
`docs/EXTENSION.md` y `docs/HOYOLAB.md`; el modelo de propiedad en `docs/OWNERSHIP.md`.

Casi todo lo de acá son **límites observados de una API sin contrato**. No hay documentación
oficial de HoYoLAB: estos números y estas formas se midieron a mano (la fecha de la medición
está donde importa) y son la única memoria escrita que tiene el proyecto.

---

## El límite que explica media arquitectura

### `extension/lib/hoyolab.ts` — `avatarInfoUrl`

**No obvio:** forma verificada el **2026-08-30** contra la API real, probando ocho variantes
(ver `scripts/probe-avatar-info.js`):

- Los corchetes de `id_list[]` van **literales y repetidos**, como en `genshin.py`. La forma
  indexada `id_list[0]=<id>` devuelve `-400005 "Parameter Error"`, y codificarlos (`%5B%5D`)
  también.
- El endpoint acepta **UN SOLO id por request**. Con 3 ids y con 36 devuelve igual `-400005`.
  No hay batch: no existe.

**Si lo ignorás:** "optimizar" el import mandando el roster entero en un request devuelve
`-400005` y ninguna build entra. El test `no usa la forma indexada id_list[0]` de
`lib/hoyolab.test.ts` está ahí para eso.

### `extension/lib/roster.ts` — el sync incremental entero

**No obvio:** de lo anterior sale el número que ordena todo lo demás. El roster son ~36
agentes, un request cada uno, ~1,4 s por agente entre request y jitter: **~50 s de import**.
Por eso el import es incremental y no pide siempre todo.

`avatar/basic` es **un solo request** y trae `level` y `rank` de todos los agentes. Se guarda
un snapshot de esos dos números por agente (`{ id: { level, rank } }`, en `storage.local`) y
sólo se pide la build de los agentes nuevos o cuya marca cambió.

**El agujero, que no se puede tapar desde acá:** `level` y `rank` es **todo** lo que da
`avatar/basic`. No trae **nada** del equipamiento. Un agente al que le cambiaste los discos o
el W-Engine sin subirlo de nivel ni de mindscape **no se vuelve a pedir nunca**. La única
salida es el botón **"Reimportar todo"**, que ignora el snapshot y pide los 36. No es un bug
que se pueda arreglar sin un request por agente, que es exactamente lo que el incremental
evita.

**Si lo ignorás:** el usuario cambia una build en el juego, importa, y el tracker le sigue
mostrando la vieja sin ningún aviso.

### `extension/lib/roster.ts` — `nextSnapshot`

**No obvio:** un agente sólo avanza a su marca actual si su build **viajó de verdad**. El que
falló conserva la marca vieja (y por eso se vuelve a pedir en el próximo import); el agente
nuevo que falló **ni entra** al snapshot, así que también queda pendiente.

**Si lo ignorás:** marcar a todos como al día después de un import con fallos parciales deja
agentes sin build para siempre, porque `agentsToFetch` no los va a volver a proponer.

### `extension/entrypoints/background.ts` — cuándo se guarda el snapshot

**No obvio:** el snapshot se escribe **recién después** de que el POST al tracker vuelve OK, no
al terminar la pasada de builds.

**Si lo ignorás:** guardarlo antes del POST hace que un import que falla en el backend deje a
esos agentes marcados como al día. Sus builds nunca llegaron al tracker y nunca se van a volver
a pedir.

---

## El corte a mitad de la pasada

### `extension/lib/builds.ts` — por qué vive en `lib/` y no en el content script

**No obvio:** la pasada de builds es lógica pura precisamente para poder testear el caso que
importa: **la pasada se corta a la mitad** (hard limit, sesión caída, rate limit, captcha) y lo
que ya se trajo **tiene que llegar igual** al tracker.

Un corte durante las builds **no es fatal**: para ese momento el paquete ya tiene `index`, el
roster, los bangboos y los modos. El import sube incompleto, las builds que faltaron quedan
pendientes en el snapshot y el próximo import las completa en vez de empezar de cero.

**Si lo ignorás:** tratar el corte como fatal tira el paquete entero y pierde también las
builds que sí viajaron —después de haberle hecho a HoYoLAB los requests que ya hizo.

Vale igual para todo `lib/`: la lógica es pura y testeable ahí, y el content script queda como
el único lugar que toca `fetch`, `document.cookie` y `browser.*`.

### `extension/lib/hoyolab.ts` — `STOP_KINDS`

**No obvio:** los cuatro retcodes que **cortan la pasada** en vez de contarse como un fallo
suelto son `invalid_session`, `hard_limit`, `rate_limited` y `captcha`. Seguir pidiendo después
de cualquiera de esos es pedirle a HoYoLAB que endurezca el bloqueo.

Retcodes por familia, todos observados:

| kind | retcodes | qué es |
| --- | --- | --- |
| `invalid_session` | `-100`, `10001` | sesión vencida; corta |
| `not_public` | `10102`, `10104` | Chronicle no público; **no** corta |
| `rate_limited` | `10101`, `-110`, `1028`, y HTTP **429** sin retcode | corta |
| `captcha` | `1034`, `10035` | corta |
| `hard_limit` | `10041` | HoYoLAB cortó el acceso; corta y cancela el import |
| `bad_params` | `-400005` | bug **nuestro** armando la URL; **no** corta |

**El `5003` no está en la familia captcha.** No aparece en el bundle de ZZZ (en `genshin.py` es
"ya reclamado" de recompensas diarias) y queda fuera hasta que se lo observe de verdad en ZZZ.

**El `-400005` no corta a propósito:** la sesión del usuario está bien, lo que está mal es la
URL que mandamos nosotros. Cortar castigaría al usuario por un bug de la extensión.

**Si lo ignorás:** meter `bad_params` en `STOP_KINDS` hace que un agente con un id raro cancele
el import entero de los otros 35.

### `extension/entrypoints/hoyolab.content.ts` / `lib/sync.ts` — de dónde sale el `fatal`

**No obvio:** el `fatal` sale **sólo** de las 8 secciones principales, y sólo de dos kinds:
`invalid_session` y `hard_limit`. Sin `index` no hay import válido. Un corte durante las builds
no lo prende nunca (ver arriba).

Las builds van **al final** de la pasada: dependen del roster que trae `avatar/basic` y son un
request por agente, así que si algo ya cortó el sync no se intentan siquiera.

### `extension/lib/builds.ts` — `collapseBuildFailures`

**No obvio:** 36 builds son 36 fallos posibles y el popup renderiza un `<li>` por fallo: veinte
líneas casi idénticas entierran el resumen del import. Por eso los fallos de `avatar_info`
viajan como **UNA** advertencia con lo único accionable: cuántas builds faltaron sobre cuántas
se pidieron, el motivo más frecuente con un agente de ejemplo, el `x-trace-id` de ése para
diagnosticar, y que reimportando se completan.

El faltante se cuenta **contra los pedidos, no contra los fallos**: un corte deja agentes que
nunca se llegaron a pedir y que también están sin build.

**Si lo ignorás:** contra los fallos, el mensaje dice "faltó 1 de 36" cuando en realidad faltan
6, y el usuario cree que está casi completo.

### `extension/lib/messages.ts` — `SectionFailure.text`

**No obvio:** el `text` opcional es el texto ya escrito para el usuario, para cuando quien arma
el fallo sabe más que el genérico por retcode de `userMessage`. Envolver una oración completa
en la explicación genérica sólo puede empeorarla: el `10041` de las builds diría "se canceló el
import entero" al lado de "volvé a importar para completarlas", **y la primera mitad ya no es
cierta** — el import no se canceló, subió incompleto.

Por eso `userMessage('hard_limit')` afirma que se canceló el import: sólo se usa en el camino
fatal (las 8 secciones principales). El `x-trace-id` se agrega igual en los dos caminos.

---

## MV3 y el service worker

### `extension/entrypoints/hoyolab.content.ts` — `runBuilds`, el progreso por agente

**No obvio:** se manda un `zzz-progress` **por cada agente**, no uno cada tantos. Además de
mover el contador del popup ("Builds 12/36"), es lo que **mantiene vivo al service worker de
MV3**. El background está esperando la respuesta de `tabs.sendMessage` durante los ~50 s que
tarda el roster completo, y Chrome lo termina a los **30 s de inactividad**; recibir un mensaje
resetea ese timer. A ~1,4 s por agente alcanza de sobra.

**Si lo ignorás:** "optimizar" esto a un mensaje cada diez agentes mata al worker en el medio y
pierde el import entero **después** de haberle hecho los 36 requests a HoYoLAB.

### `extension/entrypoints/popup/App.tsx` — el estado vive en el background

**No obvio:** el popup se cierra y el import sigue. Al reabrirlo le pregunta al background si
hay uno en curso (`zzz-import-status`) para mantener el botón deshabilitado, y el resultado lo
lee de `storage.local` porque lo guardó el background.

---

## HoYoLAB: formas y erratas

### `extension/lib/hoyolab.ts` — `ENDPOINTS`, las dos familias de parámetros

**No obvio:** los endpoints se dividen en dos familias que **no** usan los mismos nombres de
parámetro, y equivocarse devuelve error:

- `role_id` + `server`: `index`, `avatar/basic`, `avatar/info`, `buddy/info`, `hadal_info_v2`.
- `uid` + `region`: `hadal_mem_detail_v2` (Deadly Assault), `abysss2_abstract` (Lost Void).

**`abysss2_abstract` con tres eses es la errata real de HoYoLAB**, no un typo del repo. Hay un
test que lo fija para que nadie lo "arregle".

### `extension/lib/hoyolab.ts` — `SCHEDULE_CURRENT` / `SCHEDULE_PREVIOUS`

**No obvio:** Shiyu Defense y Deadly Assault sólo tienen `schedule_type` **1 (actual) y 2
(anterior)**. No hay más historia disponible: lo que no se importó a tiempo se perdió.

### `extension/lib/hoyolab.ts` — `hoyolabHeaders`

**No obvio:** son los headers `x-rpc-*` que manda el bundle oficial, y `x-rpc-device_id` /
`x-rpc-device_fp` van **vacíos a propósito**. Verificado: con eso alcanza, no hace falta
fingerprint.

### `extension/lib/hoyolab.ts` — `regionForUid`

**No obvio:** el fallback por prefijo de UID sólo se usa cuando `getGameRecordCard` no trae la
cuenta de ZZZ. Los UID de **8 dígitos son de China** y devuelven `null` en vez de inventar una
región: el tracker no los soporta.

### `extension/lib/hoyolab.ts` — `jitterMs` y `runSerialized`

**No obvio:** todos los requests van **en serie** con un jitter de 300-800 ms entre uno y otro,
nunca en ráfaga. Es lo que evita el rate limit y el captcha. Nada se reintenta solo: un rate
limit se le informa al usuario para que espere y reintente a mano.

### `extension/lib/chronicle.ts` — `recordCardSection`

**No obvio:** el `data` de `index` **no trae UID, ni nickname, ni nivel de cuenta**. Lo único
que los tiene es `getGameRecordCard`, y por eso su entrada de ZZZ viaja como una sección propia
del paquete de import.

Se recorta a seis campos (`game_role_id`, `nickname`, `region`, `level`, `is_public`,
`has_role`) por dos razones: la card trae **también las otras cuentas de HoYoverse del usuario**
(Genshin, HSR…) y el tracker no tiene por qué verlas, y de la entrada de ZZZ sólo importan esos
seis.

**Si lo ignorás:** mandar la card entera filtra al tracker los UID y nicknames de todos los
otros juegos del usuario.

### `extension/lib/chronicle.ts` — `ChronicleImportResponse`

**No obvio:** es el espejo de `ChronicleImportResponse` de `src/zzz_tracker/web/schemas.py`,
con **todos** los campos opcionales a propósito —el backend los manda todos salvo
`account_key`— para que un cambio de forma en el backend se degrade en un resumen incompleto y
no en una pantalla rota.

---

## Propiedad de la cuenta

### `extension/lib/tracker.ts` — `accountKeysAfterImport`, `withAccountKey`

**No obvio:** `account_key` viene en la respuesta **sólo** cuando el import reclama una cuenta
que no tenía dueño, que es el único momento en que la key rota. Se muestra una vez y hay que
guardarla: el backend la tiene **hasheada** y no la vuelve a devolver.

Un import con la key vigente no rota y no la trae. Uno sin key contra una cuenta con dueño ni
llega a esta respuesta: es un **403** y el backend no escribió nada. En los dos casos
`accountKeysAfterImport` devuelve **la misma referencia**, y por eso el background compara con
`!==` para decidir si hay algo que escribir en `storage.sync`.

El mapa está indexado por UID, así que una key rotada **reemplaza** a la anterior en vez de
acumularse: la vieja ya está muerta en el backend y guardarla sólo serviría para mandar una key
inválida en el próximo import.

**Si lo ignorás:** no persistir la key que vuelve deja la cuenta con dueño y sin ninguna
instalación que pueda escribirla. La única salida es `zzz-tracker rotate-key <uid>` en el
servidor; reimportar ya no la recupera.

### `extension/lib/tracker.ts` — `ownedAccountHelp`

**No obvio:** el 403 del import significa **una sola cosa**: esa cuenta ya tiene dueño y este
navegador no tiene su key. El backend no escribió nada y no emitió ninguna key nueva — la
propiedad **no se pierde con otro bundle**, porque un bundle es un JSON que elige el cliente y
el `role_id` es público, así que por sí solo no prueba nada.

Por eso el mensaje tiene que decir **cómo conseguir la key** (copiarla de la otra instalación,
o `zzz-tracker rotate-key <uid>`) en vez de dejar al usuario reintentando.

El texto se bifurca según si se mandó key o no: si mandamos key y aun así rebotó, ya no se la
puede haber llevado otro import —una cuenta con dueño no cambia de manos—, así que o la rotaron
en el servidor o nunca fue de este UID.

### `extension/lib/tracker.ts` — `accountUrl`

**No obvio:** la ruta del SPA es `/account/:uid` en **singular**; `/accounts/...` es la API JSON
del backend. Y la key viaja en el **fragmento** (`#key=…`), no en el query: el fragmento no
llega al servidor ni queda en sus logs. El frontend la guarda y limpia la URL con
`history.replaceState`.

### `extension/lib/tracker.ts` — `postChronicleImport`, el Bearer opcional

**No obvio:** el header `Authorization` sólo se manda si hay token configurado. Mandar
`Bearer ` vacío haría fallar al backend que tiene `ZZZ_API_TOKEN` seteado con "token inválido"
en vez de "falta token".

El token **no es lo que autoriza a escribir**: un token que viaja adentro de una extensión
publicada no es un secreto, así que no puede ser la única defensa. Quien autoriza es la key de
la cuenta; el token es una reja extra opcional.

### `extension/lib/tracker.ts` — `extractDetail`

**No obvio:** FastAPI manda `detail` como **string** en los errores propios pero como **lista**
de `{loc, msg, …}` cuando falla la validación del schema — el 422 del import, por ejemplo,
cuando la región no está en el allowlist. Sin desarmar esa lista el usuario lee sólo "El
tracker respondió 422." y no se entera de qué rechazó el backend.

---

## Los scripts de captura manual

`extension/scripts/` son snippets autocontenidos para pegar en la consola de DevTools estando
logueado en `https://act.hoyolab.com/app/zzz-game-record`. No los importa nadie, no se
buildean, no los cubre ningún test.

### `scripts/probe-avatar-info.js` — **resto de investigación, ya resuelto**

Existió por un motivo puntual y fechado: la captura del **2026-08-30** trajo `retcode 0` en
todos los endpoints menos `avatar/info`, que devolvía `-400005` con `id_list[0]=<id>`. La sonda
probó ocho variantes de parámetros (corchetes repetidos / indexados / planos, codificados o no,
`need_wiki` en sus cuatro formas), más tres rutas alternativas por si el problema era la ruta y
no los parámetros, y en cuanto una respondía `retcode 0` seguía con el batch de 3 y de 36 para
resolver de una si `id_list` aceptaba N ids.

**Ese resultado ya está incorporado** en `avatarInfoUrl` y arriba en este documento: forma
`id_list[]` repetida, un id por request. La sonda no tiene nada más que averiguar salvo que
HoYoLAB cambie la forma de los parámetros otra vez.

### `scripts/capture-avatar-info.js` — herramienta viva

Reproduce exactamente la pasada de builds del import y guarda `elapsed_ms`: es a la vez la
fuente de las fixtures de `avatar/info` para los tests del backend y **la medición real de
cuánto tarda un import completo** (de ahí sale el ~50 s).

La constante `IDS` acotada a los agentes que el tracker ya tiene por Enka
(`select game_id from agents where source='enka'`) deja **el mismo agente medido por dos
fuentes**, que es lo único que prueba de verdad que `value = base / level` y que el índice de
skills están bien y no sólo parecen bien.

### `scripts/capture.js` — herramienta viva

Captura los payloads de las 8 secciones principales en un JSON. Es la materia prima de las
fixtures de `tests/fixtures/` (anonimizando `role_id`, `ltuid`, `nickname`) y la herramienta de
diagnóstico si HoYoLAB cambia el esquema.

Qué mirar en la captura, que es lo que no se ve en el código:

- **Shiyu Defense**: `hadal_ver`, si la errata `fitfh_layer_detail` sigue viva, y todas las
  claves que terminan en `_layer_detail` (mapa capa → nodo).
- **Deadly Assault**: cualquier clave de *rating*. Hoy se asume que no existe (`docs/HOYOLAB.md`,
  "Lo que no se sabe todavía").
- **Lost Void**: que el mapeo no quede todo en 0 — así se ve un fallo silencioso.

El `x-trace-id` de cada request es lo único que sirve para correlacionar un fallo con HoYoLAB;
por eso se loguea siempre, tanto acá como en el import real.
