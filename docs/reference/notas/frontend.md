# Notas del frontend

Lo que el código de `frontend/src/` no puede decir en una línea. La filosofía visual entera está
en `docs/DESIGN.md` y no se repite acá: esto es sólo el porqué de decisiones que en el código se
ven como una elección arbitraria. El modelo de propiedad está en `docs/OWNERSHIP.md`; el
contrato con el backend, en `docs/reference/05-CONTRATO-API.md`.

Tres ideas atraviesan casi todo lo que sigue:

- **Leer es público, escribir pide la key.** No hay login. La `account key` vive en el navegador
  y es lo único que separa mirar de editar.
- **El frontend nunca comparte código con el backend.** Los tipos de `api/types.ts` son una copia
  a mano del contrato; cuando el backend cambia, alguien los actualiza acá.
- **Los tests corren sin DOM por default.** Casi todo se renderiza con `renderToStaticMarkup`, en
  un solo paso. `jsdom` existe, pero acotado por pragma a dos archivos: no es el default y no debe
  volverse global.

---

## `src/api/client.ts`

### `request` / `send` — el parámetro `owner`

**No obvio:** la key no se manda en toda request, sino sólo en las que pasan un `owner` (el UID
dueño del recurso), y sale de `localStorage` en el momento del envío, no de un estado de React.
Un `get` nunca manda key: leer es público y mandarla de más la expondría en pedidos que no la
necesitan.

**Si lo ignorás:** o mandás la key en todo (y cualquier proxy intermedio la ve en pedidos de
lectura), o te olvidás de mandarla en una escritura y el backend responde 403 sin motivo visible.

### `ApiError.sentKey`

**No obvio:** el 403 se guarda junto con *si se mandó una key o no*. Es la única forma de
distinguir «no tengo la key de este UID» de «la key que tengo no es la de este UID»: el backend
responde lo mismo en los dos casos, y el mensaje al usuario es completamente distinto.

**Si lo ignorás:** a quien pegó una key vieja le decís «pegá tu key», y la pega otra vez, y otra.

---

## `src/api/errors.ts`

**No obvio:** el mensaje se elige primero por `code` y recién después por status. Los códigos
(`forbidden`, `unclaimed_account`, `rate_limited`, `not_found`) son el contrato estable; el
status HTTP se comparte entre casos que para el usuario no tienen nada que ver — un 409 puede ser
«ese agente ya existe» o «ese UID no lo reclamó nadie».

**Si lo ignorás:** el día que el backend mueva un caso de 409 a 422 los mensajes se mezclan.

---

## `src/components/ui/AsyncSection.tsx`

**No obvio:** el orden de los tres estados no es cosmético, es el contrato. `loading` gana sobre
todo, `error` gana sobre `empty`, y el estado vacío sólo se dibuja cuando la carga terminó **bien**.
Antes esto estaba copiado en once pantallas con la condición escrita a mano
(`!loading && !error && items.length === 0`), y alcanzaba con olvidarse un `!error` para que un
backend caído se leyera como «esta cuenta no tiene agentes».

**Si lo ignorás:** el usuario ve «no tenés nada» cuando en realidad no se pudo averiguar si tiene
algo, y deja de buscar.

**No obvio (2):** el `empty` es opcional y el componente devuelve `null` cuando no lo hay. Hay
pantallas cuyo bloque de datos ya trae su propio vacío (el panel de cuenta, el formulario de
agente): ésas pasan sólo `loading`.

---

## `src/hooks/useApi.ts`

### El `requestId` en vez de un `AbortController`

**No obvio:** el hook no cancela la request vieja; la deja terminar y descarta su resultado
comparando un `requestId` (`${reloadToken}:${key}`) con el que está vigente al momento de
guardar. La respuesta ya viajó y ya se pagó; abortarla no ahorra nada del lado del servidor, y sí
convierte cada navegación rápida en un `AbortError` que hay que filtrar a mano en cada `catch`
para no mostrarlo como si fuera una falla real del backend.

**Si lo ignorás:** o cambiás a `AbortController` y aparecen «errores» fantasma cada vez que
alguien cambia de pantalla antes de que cargue, o sacás el `requestId` y una respuesta lenta de la
pantalla anterior pisa los datos de la pantalla nueva.

**No obvio (2):** el `key` es lo que define qué es «la misma consulta». Por eso las pantallas lo
arman con todo lo que debería disparar una recarga —`${uid}:${version}`— y el efecto depende sólo
de él, no del `fetcher`. El `fetcher` vive en un ref justamente para que redefinirlo en cada
render no vuelva a disparar la consulta.

**No obvio (3):** `loading` es «no hay resultado para *este* `requestId`», no un flag propio. Al
cambiar de UID el hook queda en carga sin pasar por un render con los datos del UID anterior.

---

## `src/hooks/useAccountAccess.ts`

**No obvio:** el segundo parámetro distingue `undefined` de `null`. `undefined` significa «nadie
me pasó la cuenta, buscala vos» y el hook hace su propia consulta; `null` significa «la cuenta se
está buscando en la pantalla, todavía no llegó». Es lo que evita que el panel de cuenta y el
formulario de agente pidan la misma cuenta dos veces.

**Si lo ignorás:** cada pantalla que ya tiene la cuenta dispara una segunda consulta idéntica.

**No obvio (2):** `untracked` sólo puede ser `true` cuando el hook consulta por su cuenta. Cuando
la cuenta llega prestada y su consulta falló con 404, el hook no lo sabe: la pantalla se queda en
`resolving`. Se nota en la pantalla de key de un UID inexistente, que muestra `—` en vez de «UID
sin trackear». Es un hueco conocido, no una decisión.

---

## `src/hooks/useAccountKey.ts` y `src/lib/accountKey.ts`

### `zzz.key.<uid>` en `localStorage`

**No obvio:** una key por UID, no una sola global, porque el mismo navegador puede ser dueño de
varias cuentas y cada una tiene la suya. Y va en `localStorage` y no en una cookie porque el
backend no debe recibirla nunca sin que la app lo decida: en una cookie viajaría sola en cada
pedido, incluidos los de lectura.

**No obvio (2):** todo acceso al storage pasa por `usableStorage()`, envuelto en `try`. Un
navegador en modo privado, o con el almacenamiento del sitio bloqueado, tira al *leer* la
propiedad `localStorage`, no al usarla. Sin ese `try` la app entera no arranca en ese navegador.

**Si lo ignorás:** pantalla en blanco para cualquiera que navegue con el storage bloqueado.

### `useSyncExternalStore` en vez de `useState`

**No obvio:** la key es estado compartido fuera de React —la escriben `saveKey`/`forgetKey` desde
un handler, la lee cualquier pantalla— así que hay un `Set` de listeners propio. Con `useState`
por componente, guardar la key en la pantalla de key no despertaría al roster.

**No obvio (2):** el tercer argumento (el *server snapshot*) no está de adorno: sin él el
renderizado de servidor —que es como corren todos los tests— explota.

### La key por fragmento de URL

**No obvio:** `consumeKeyFromUrl` acepta la key en el fragmento (`#key=zzk_…`) y lo primero que
hace después de guardarla es borrarlo de la barra con `replaceState`. Es el fragmento y no el
query string porque **el fragmento no viaja al servidor**: no queda en el log de acceso, ni en el
`Referer`, ni en el historial del proxy. Sirve para pasar la key de la extensión a la pestaña, o
de una máquina a otra por un link.

**Si lo ignorás:** poniéndola en el query string la key queda escrita en los logs de todo lo que
haya entre el navegador y el backend; no borrándola de la barra, queda en el historial y en
cualquier captura de pantalla.

---

## `src/hooks/useCompactHeader.ts`

**No obvio:** mide el ancho del **contenedor** con un `ResizeObserver` y no la ventana con una
media query, para que el shell sea correcto también embebido en algo más angosto que la pantalla.
El `Math.min` contra `window.innerWidth` está porque un contenedor sin ancho todavía calculado
mide 0 y arruinaría la medición.

**No obvio (2):** el header se esconde con umbrales (`6px` de delta, `90px` de scroll mínimo)
porque sin ellos el rebote del scroll en móvil lo hace parpadear.

---

## `src/lib/elements.ts`

**No obvio:** el mismo atributo llega con tres nombres distintos según de dónde vengan los datos.
Enka manda `Elec` y `AuricEther`; HoYoLAB manda códigos numéricos (`"203"`); la wiki y los iconos
usan otro juego de nombres. `elementKey()` es el único lugar donde eso se normaliza, y por eso
normaliza agresivamente: saca todo lo que no sea letra y baja a minúsculas antes de buscar el
alias.

**Si lo ignorás:** el mismo agente aparece con dos colores distintos según haya entrado por Enka
o por el Chronicle, y los sub-atributos (Escarcha, Tinta áurica, Embestida) pierden el color de
su elemento padre.

**No obvio (2):** un atributo nuevo se agrega **una sola vez, acá**. La paleta
(`palette.ts`), las etiquetas (`labels.ts`) y los iconos (`icons.ts`) están indexados por
`ElementKey`, así que lo heredan solos. Agregarlo en los cuatro lados es el error a evitar.

---

## `src/lib/score.ts`

### El modelo de score

Son **dos scores distintos** y conviene no confundirlos:

- `buildScore(discs, profession)` — qué tan buena es la build de un agente. Suma el
  `discScore` de cada disco y lo normaliza contra un techo de `6 slots × 55 puntos`, recortado a
  100.
- `rosterScore(agent)` — qué tan armado está un agente, para ordenar el roster y promediar la
  cuenta. Es una combinación de progreso, no de calidad: `discos 50% + nivel 28% + W-Engine 14% +
  mindscape 8%`.

**No obvio:** el score de una build se calcula con los *rolls* de cada substat, no con su valor.
Un substat que salió con un número alto de fábrica no es lo mismo que uno que se comió cuatro
subidas, y el valor crudo de Enka no distingue las dos cosas; `rolls` sí.

**No obvio (2):** un substat que no sirve para la especialidad del agente no vale cero, vale un
cuarto (`* 0.25`). Que un disco tenga PV% en un Ataque es peor que tener crítico, pero no es lo
mismo que tener el slot vacío, y ponerlo en cero haría que dos builds muy distintas empataran.

**No obvio (3):** el techo de 55 puntos por disco («55 = disco perfecto») y los cortes de
`discGrade` (42 / 32 / 22) son calibración, no una fórmula: son los números que hacen que las
notas caigan donde uno espera al mirar builds reales. Moverlos le cambia el orden del roster a
todo el mundo. El análisis del que salen, y un modelo más fino que todavía no está implementado
acá, están en `docs/DISC_SCORE.md`.

**No obvio (4):** `subKey()` busca primero por `prop_id` y recién después por nombre. Los IDs son
el dato estable de Enka; los nombres cambian de idioma y de fuente. `pen` aparece dos veces en la
tabla de IDs (`23103` y `23203`) porque PEN plana y PEN% son el mismo eje para el score.

---

## `src/lib/roster.ts`

**No obvio:** el orden por defecto es por `rosterScore` y el desempate es siempre por nombre,
en los tres órdenes. Sin desempate, dos agentes con el mismo score se intercambian de lugar entre
renders y la grilla parpadea.

**No obvio (2):** las opciones de los filtros salen de los agentes que la cuenta *tiene*, no de un
catálogo fijo. Un filtro que ofrece «Lumiflujo» a quien no tiene ningún agente de ese atributo
sólo sirve para dar cero resultados.

---

## `src/lib/agentDraft/`

**No obvio:** el draft guarda todo como `string`, incluidos los números. Es lo que deja escribir
un campo vacío o a medias (`""`, `"1"` camino a `"12"`) sin que React reescriba el input debajo
del cursor. La conversión a números pasa una sola vez, en `write.ts`.

**No obvio (2):** `toAgentUpdate` compara contra el agente original y manda sólo lo que cambió.
El backend trata un `discs` presente como «reemplazá los discos», así que mandar el objeto entero
en cada guardado reescribiría la build completa aunque sólo se haya tocado el nivel.

**No obvio (3):** `discGameId(setId, rarity, slot)` reconstruye el ID del juego con aritmética
(`set + rarity*10 + slot`). No es un invento: es cómo Enka numera los discos. Cuando el disco ya
existía y no se cambió el set, se usa el `known_game_id` que vino, no la cuenta.

---

## `src/test/`

**No obvio:** el entorno por default es `node`, **sin DOM**, y las pantallas se renderizan con
`renderToStaticMarkup`, un solo paso de servidor. Eso significa que en esos archivos **los efectos
nunca corren**: un `useEffect` no se ejecuta, un `onClick` no se puede disparar, un estado no
cambia. Todo lo que se afirma es lo que la pantalla dibuja *la primera vez*, dado un estado.

**Si lo ignorás:** vas a escribir un test que espera que un botón haga algo, y va a pasar en verde
sin haber probado nada.

**La excepción, y por qué es una excepción:** `pages/interactions.test.tsx` y
`pages/writeActions.test.tsx` piden `jsdom` con un pragma `@vitest-environment` por archivo, porque
lo que prueban *es* el ciclo de vida (el `onRetry`, un submit, el editor rechazando el cuarto
agente). El entorno **no se pone global**: los tests de funciones puras andan bien en `node` y son
más rápidos así.

### `fakeClient.ts` + `fakeUseApi.ts`

**No obvio:** como los efectos no corren, `useApi` nunca resolvería su promesa y toda pantalla se
vería «cargando» para siempre. Por eso los tests de pantalla mockean dos módulos: `api/client`
—reemplazando sólo `api`, para que `ApiError` siga siendo la clase real y `instanceof` funcione—
y `hooks/useApi`, por una versión que resuelve **sincrónicamente**.

Eso se apoya en que las respuestas de `fakeClient` no son promesas de verdad sino *thenables*
síncronos: llaman al `then` en el acto. Es lo que permite que `stubApi({ listAgents: {…} })` y un
render den una pantalla con datos, sin instalar `jsdom` ni `@testing-library`.

**No obvio (2):** una clave ausente en `stubApi` significa **«todavía no volvió»** (queda en
carga), y un valor que sea `Error` significa que la consulta falló. Es lo que deja probar los tres
estados de `AsyncSection` en cada pantalla.

**No obvio (3):** `fakeUseApi` devuelve `loading: true` si el `fetcher` entrega una `Promise`
nativa. Pasa con `Promise.resolve(null)`, que es lo que usan el formulario de agente y el editor
de equipo cuando no hay id (alta en vez de edición). Por eso esos dos casos se prueban contra el
componente (`AgentForm`, `TeamForm`) y no contra la pantalla.

### Lo que queda sin cubrir por esto

Lo que depende del ciclo de vida sólo se prueba en los dos archivos con `jsdom`. En todos los
demás, la regla que hay detrás se prueba como función pura (`teamErrors`, `agentDraftErrors`,
`visibleAgents`) y no a través de la pantalla. Si agregás un escenario que necesita un click o un
efecto, va a uno de esos dos archivos, no a un pragma nuevo repartido por todo el árbol.

### Un test afirma lo que se ve, no una clase de CSS

**No obvio:** que `expect(html).toContain('ne-key is-masked')` sea la forma más corta de probar que
la key se muestra tapada no la hace la correcta. Renombrar esa clase en `eridu.css` rompe el test
sin romper nada, y borrar el enmascarado lo deja pasar si la clase sigue ahí.

**La regla:** se afirma lo que un usuario leería —el texto, el `href`, el `alt`, los puntos de la
key tapada, el rótulo de la píldora—. Un componente puede mirar su propio markup cuando la pieza
es **decoración sin texto**: las tres barras del hero, las estrellas de un intento, la capa de
scanlines. Lo que no se hace nunca es que una **pantalla** afirme la clase de un componente
anidado: ahí la clase es un detalle de otro archivo.

**Si lo ignorás:** los diez tests que se reescribieron el 2026-09-10 vuelven a aparecer de a uno,
y el `docs/DESIGN.md` deja de poder mover una clase sin romper la suite.
