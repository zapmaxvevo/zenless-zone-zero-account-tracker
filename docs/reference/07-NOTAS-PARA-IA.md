# Notas para IA — el banco de rationale

**Leelo antes de "simplificar" cualquier cosa que te parezca rara.** Este es el documento que
evita que alguien deshaga una decisión deliberada por no saber que lo era.

## Qué es esto

El código de este repo dice **qué** hace. El **por qué** vive acá.

Hasta septiembre de 2026 el rationale estaba en el código, en docstrings y comentarios de tres
párrafos: `storage/keys.py` era 49 % docstring, `discs/values.py` 37 %, `hoyolab/build_mapper.py`
29 %, `extension/lib/roster.ts` 26 %. Leer una función costaba leer un ensayo. La limpieza los
sacó del código **sin tirar ni uno**: los 108 párrafos se mudaron acá.

La regla que quedó, y que vale para todo lo que escribas de ahora en más:

> Un comentario o docstring se queda **sólo si dice algo que el código no puede decir en una
> línea.** Se queda la primera línea del docstring, y el comentario de una línea que avisa de algo
> no obvio — un límite de una API externa, una unidad, un orden que importa, una comparación en
> tiempo constante hecha a propósito. Se va todo párrafo de rationale, toda justificación de
> diseño y toda historia. Y lo que se va **se muda acá**, no se tira.

## Los cinco archivos

| Archivo | Entradas | Qué cubre |
| --- | --- | --- |
| [`notas/backend-core.md`](notas/backend-core.md) | 32 | `tracker/`, `storage/`, `errors.py`, `web/deps.py`, `config.py` |
| [`notas/backend-mappers.md`](notas/backend-mappers.md) | 20 | `parsing.py`, `enka/`, `hoyolab/`, `discs/values.py` |
| [`notas/backend-web.md`](notas/backend-web.md) | 21 | `web/schemas/`, `web/routers/`, `api/index.py` |
| [`notas/extension.md`](notas/extension.md) | 26 | `extension/` entera, y los límites medidos de la API de HoYoLAB |
| [`notas/frontend.md`](notas/frontend.md) | 9 | `frontend/src/api/`, `hooks/`, `lib/` |

Está partido en cinco y no en uno porque cinco agentes lo escribieron en paralelo, cada uno dueño
de su archivo. Si agregás una entrada, va al archivo del área que corresponde.

## Lo que más se malinterpreta

Si sólo vas a leer una cosa antes de tocar el repo, que sea esta lista. Cada punto es una decisión
que **parece** un error y no lo es. El detalle completo está en el archivo que se indica.

**El backend no le habla a HoYoLAB. Nunca.** No tiene cliente HTTP, no guarda cookies, no tiene
cron. Todo lo del Battle Chronicle lo captura la extensión con la sesión que el usuario ya tiene
abierta y lo postea. Si estás por agregar un fetch a HoYoLAB en `src/`, pará: hay un motivo, y
está en `notas/extension.md` y en `docs/HOYOLAB.md`.

**Enka manda valores base, no los que muestra el juego.** `PropertyValue` es la base y
`PropertyLevel` la cantidad de rolls. Mostrar el número crudo es el bug clásico de este dominio.
→ `notas/backend-mappers.md`

**`MAX_DISC_PROCS` (5) y `MAX_SUBSTAT_ROLLS` (6) no son el mismo número**, y no es un typo: son los
procs que recibe el disco contra los rolls que puede acumular un substat.
→ `notas/backend-mappers.md`, `notas/backend-web.md`

**El `code` de cada error es contrato; el `detail` no.** Un cliente branchea por `code` y nunca por
el texto. Renombrar un `code` rompe clientes, y `tests/test_errors.py` pinea cada uno. El status
solo no alcanza: 409 es a la vez `conflict` y `unclaimed_account`. → `notas/backend-core.md`

**"Sin dueño" (409) y "key equivocada" (403) son respuestas distintas a propósito.** Una cuenta que
nadie reclamó no tiene key que presentar; mandar 403 ahí dejaría al usuario buscando un secreto que
nunca se emitió. → `notas/backend-core.md`

**Los guards de agente y de equipo leen la fila antes de validar la key**, en vez de aceptar
cualquier key válida. Los ids son globales y reclamar un UID vacío es gratis: sin leer la fila,
cualquiera con *una* key escribiría *cualquier* agente. → `notas/backend-core.md`

**El catálogo contesta 503 y no `[]` cuando faltan los datos estáticos.** Un catálogo vacío es
indistinguible de un juego sin agentes y deja pickers rotos en silencio. → `notas/backend-web.md`

**`avatar/basic` de HoYoLAB no trae equipamiento.** Por eso un agente al que le cambiaste los discos
sin subirlo de nivel no se vuelve a pedir, y la única salida es "Reimportar todo". No es un bug del
sync incremental: es el techo de lo que la API expone. → `notas/extension.md`

**La pasada de builds se puede cortar a la mitad y eso no es fatal.** Para ese momento el paquete ya
tiene `index`, roster, bangboos y modos; el import sube incompleto y el snapshot deja pendientes a
los que faltaron. Una sección que **falló** viaja como `null`; una que el corte **no llegó a pedir**
no aparece: para el backend son cosas distintas. → `notas/extension.md`

**Los tests del frontend no podían existir antes.** Todo usaba `renderToStaticMarkup`, y en SSR
React no corre `useEffect`, así que una pantalla con datos era imposible de ver: por eso el único
test de páginas afirmaba dos clases de CSS. Hoy hay `jsdom`, **acotado por pragma** a los dos
archivos que necesitan ciclo de vida — no lo vuelvas global, los tests de funciones puras andan
bien en node y son más rápidos así. → `notas/frontend.md`

**Tres módulos existen sólo para re-exportar** (`web/schemas/__init__.py`, `hoyolab/mapper.py`,
`tracker/service.py`) y eso es deliberado: mantienen la superficie pública para que partir un
god-file no obligue a tocar 200 imports ni un solo test. No los "limpies".

## Cómo se agrega una entrada

Formato, en el archivo del área que corresponda:

```markdown
### `src/zzz_tracker/storage/keys.py` — `verify_key`

**No obvio:** la comparación es en tiempo constante a propósito.

**Si lo ignorás:** un `==` normal filtra por timing cuánto del prefijo de la key acertaste.
```

Prosa en español; símbolos, endpoints y códigos de error en inglés tal cual el código.
