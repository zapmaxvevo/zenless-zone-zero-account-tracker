# Pendientes — ZZZ Account Tracker

Relevamiento del 2026-08-14, sobre la rama `design-system-sync`.
Rehecho el 2026-09-09, sobre la rama `pendientes`, y **actualizado ese mismo día** después del
cambio de rumbo: el backend ya no sincroniza nada por su cuenta, todo lo de HoYoLAB entra por
la extensión y reclamar un UID es cosa de la extensión también. Lo de agosto que quedó cerrado
se resume en una línea; lo que sigue abierto está abajo con el detalle que haga falta.

Los checks los corre CI en cada push (`.github/workflows/ci.yml`): lint, formato, tipos y
tests de las dos mitades, más un job que aplica y revierte las migraciones contra Postgres y
comprueba que no haya deriva contra los modelos. En local sigue estando `/verify`.

Diagnóstico general: no queda deuda de producto, y el cambio de rumbo se llevó puesta la mitad
de la que había. Lo que falta es publicar —y eso ya no es código, son pasos con credenciales
que sólo puede correr Maxi—, un mapeo roto que sólo se arregla con datos en la mano, y un resto
chico de duplicación latente y de limpieza.

## Lo que se cerró desde agosto

- **El hueco de UI** (§1 de agosto): lo cerró el rediseño New Eridu. El hueco de contrato que
  quedaba —el frontend deducía "esta cuenta tiene credenciales" de que no volviera ningún
  dato— se cerró primero con un endpoint de estado y después de la forma definitiva: no hay
  credenciales que consultar.
- **La duplicación de `.zui-button*`** (§3): las cuatro clases se fueron de `index.css`, que
  quedó como reset puro, y viven una sola vez en `styles/eridu.css`. La puerta hacia ellas es
  `components/ui/Button.tsx` (`Button` y `LinkButton`, con `tone` y `size`); ninguna pantalla
  escribe la clase a mano. Anotado en `docs/DESIGN.md` y en `.design-sync/NOTES.md`, que es
  quien tiene que saberlo en el próximo sync.
- **La falta de auth** (§4): la reemplazó el modelo de propiedad de `docs/OWNERSHIP.md` — leer
  es público, escribir pide la key de la cuenta. Y el riesgo que la hacía urgente —que
  cualquiera que supiera un UID disparara un sync con las cookies de HoYoLAB de otro— dejó de
  existir por otro lado: no hay cookies guardadas ni sync que disparar.
- **La falta de CI** (§4): existe `.github/workflows/ci.yml`.
- **Las docs desfasadas** (§4): esto, más `README.md`, `docs/PLAN.md`, `docs/HOYOLAB.md`,
  `docs/EXTENSION.md` y `docs/DESIGN.md`, al día al 2026-09-09 y ya con el cambio de rumbo
  adentro.

## 1. El deploy está preparado, no hecho

Todo lo que era código ya está en la rama: `vercel.json` con el ruteo de las dos mitades,
`api/index.py`, `api/requirements.txt` exportado del lock, `.env.example` con cada setting
explicado, los estáticos de Enka commiteados bajo `data/static/` y las migraciones verificadas
contra Postgres 17 por CI.

**El cambio de rumbo lo simplificó justo donde estaba más flojo.** Ya no hay que generar ni
custodiar `ZZZ_CREDENTIALS_KEY` —el único secreto obligatorio que tenía el deploy, y el que
descifraba cookies ajenas—, ni hostear un cron fuera de Vercel, ni convivir con el riesgo de
que el captcha de HoYoLAB frenara el sync desde IPs de datacenter: no hay sync. Lo que queda es
una base y unas variables.

Falta correr los pasos de `docs/DEPLOY.md`, que son los que piden credenciales y no puede dar
un agente: crear la base Postgres y copiar la connection string **pooleada**, correr
`alembic upgrade head` contra esa base, cargar las variables en Vercel e importar el proyecto.
Y después, las cuentas que ya existían: la migración las dejó sin dueño, así que son de sólo
lectura hasta que alguien importe su Chronicle o hasta que `zzz-tracker claim <uid>` les dé una
key.

Lo único que sigue quedando afuera del serverless es `sync-static`, porque el filesystem de
Vercel es de sólo lectura: los JSON de Enka viajan commiteados y se refrescan a mano.

Y un cabo suelto que se ata recién cuando exista el dominio real: `extension/wxt.config.ts`
declara `https://personal-zzz.vercel.app` como placeholder en los `host_permissions`. Con el
dominio verdadero hay que reemplazarlo y volver a buildear la extensión.

## 2. La propiedad de cuentas, recién aterrizada

Está implementada de punta a punta en esta rama: el backend (modelo, migraciones `0006` y
`0007`, dependencias por cuenta y por fila, `claim` y `rotate-key` en el CLI,
`GET /accounts/{uid}/ownership` para validar una key sin escribir), la extensión (una key por
UID, el header en el import, el `#key=` en el link de vuelta) y el frontend (`AccountKeyPage`,
la key guardada por UID, el header sólo en las escrituras y las pantallas en modo lectura
cuando no hay key). Lo que queda es mergear la rama.

Lo que se decidió y conviene no perder: **una cuenta con dueño no se toma con un import**, por
completo que venga el bundle (403). El precio es que perder la key no se arregla desde el
navegador —importar de nuevo ya no devuelve una nueva—: se arregla con
`zzz-tracker rotate-key <uid>`, que exige acceso a la base. Y **trackear un UID desde la web no
lo reclama**: escribir un número público en un formulario no dice de quién es la cuenta. El
porqué de las dos reglas está en `docs/OWNERSHIP.md`.

## 3. Lost Void se guarda en cero

El único bug de datos conocido, y está diagnosticado. `parse_lost_void` busca claves
(`exploration_log`, `commission_progress`, `license_level`, `ultimate_challenge`,
`data_collected`) que **el payload real no tiene**: el de verdad trae `abyss_level`,
`abyss_task`, `abyss_duty`, `abyss_collect[]`, `abyss_max`, `special_mission` y `unlock`. El
mapper no falla, devuelve todo en cero — exactamente el fallo silencioso contra el que existe
la sección *Lo que no se sabe todavía* de `docs/HOYOLAB.md`.

No se arregla a ciegas: hace falta ver qué número muestra la página de HoYoLAB al lado de cada
campo para saber a qué campo de `LostVoidProgress` va cada uno, y los nombres no coinciden. El
dato no se pierde mientras tanto: el `raw` se guarda entero en cada import.

## 4. `.zui-input*` sigue duplicado en potencia

Los botones dejaron de estar en dos lados; los inputs nunca llegaron a estarlo, pero pueden.
El design system publica `.zui-input` (más `-mono` y `-invalid`) con sus componentes
`TextInput` y `Select`, y la app estila sus formularios con `.field input/select/textarea` de
`App.css`, a partir de la línea 435. Hoy no hay divergencia porque no hay copia: hay dos
implementaciones distintas del mismo control.

Adoptar el paquete entero seguiría costando lo mismo que en agosto: `design-system/dist/` está
gitignoreado, así que el build del frontend pasaría a depender de
`cd design-system && npm install && npm run build`. Con CI eso ya es visible cuando se rompe,
que era la mitad de la objeción; la otra mitad —que los tokens ya están sincronizados y no
ganamos nada moviéndolos— sigue en pie. Es una decisión de gusto, no una deuda que sangre.

## 5. Limpieza

`design-system-sync` sigue existiendo en `origin` (local ya no está). Está mergeada en `main`
desde `2e006f8`; borrarla es un comando.

## Orden sugerido

1. Mergear la rama con la propiedad de cuentas (§2).
2. Deploy (§1), que es lo único que separa al proyecto de estar publicado; con el dominio real
   en la mano, reemplazar el placeholder de la extensión.
3. Lost Void (§3), la próxima vez que haya una cuenta con progreso a la vista.
4. Lo de §4 y §5 cuando molesten.
