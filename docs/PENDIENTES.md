# Pendientes — ZZZ Account Tracker

Relevamiento del 2026-08-14, sobre la rama `design-system-sync`.
Rehecho el 2026-09-09, sobre la rama `pendientes`, después de la propiedad de cuentas, el
deploy preparado y el botón unificado. Lo de agosto que quedó cerrado se resume en una línea;
lo que sigue abierto está abajo con el detalle que haga falta.

Los checks los corre CI en cada push (`.github/workflows/ci.yml`): lint, formato, tipos y
tests de las dos mitades, más un job que aplica y revierte las migraciones contra Postgres y
comprueba que no haya deriva contra los modelos. En local sigue estando `/verify`.

Diagnóstico general: no queda deuda de producto. Lo que falta es publicar —y eso ya no es
código, son pasos con credenciales que sólo puede correr Maxi— más un resto chico de
duplicación latente y de limpieza.

## Lo que se cerró desde agosto

- **El hueco de UI** (§1 de agosto): lo cerró el rediseño New Eridu. Y el hueco de contrato que
  quedaba —el frontend deducía "esta cuenta tiene credenciales" de que no volviera ningún
  dato— también: existe `GET /accounts/{uid}/credentials` y `client.ts` lo consume con
  `getCredentialsStatus`.
- **La duplicación de `.zui-button*`** (§3): las cuatro clases se fueron de `index.css`, que
  quedó como reset puro, y viven una sola vez en `styles/eridu.css`. La puerta hacia ellas es
  `components/ui/Button.tsx` (`Button` y `LinkButton`, con `tone` y `size`); ninguna pantalla
  escribe la clase a mano. Anotado en `docs/DESIGN.md` y en `.design-sync/NOTES.md`, que es
  quien tiene que saberlo en el próximo sync.
- **La falta de auth** (§4): la reemplazó el modelo de propiedad de `docs/OWNERSHIP.md` — leer
  es público, escribir pide la key de la cuenta. Ya no cualquiera que sepa un UID dispara
  `chronicle/sync` con las cookies de HoYoLAB de otro.
- **La falta de CI** (§4): existe `.github/workflows/ci.yml`.
- **Las docs desfasadas** (§4): esto, más `README.md`, `docs/PLAN.md`, `docs/DESIGN.md` y
  `docs/EXTENSION.md`, al día al 2026-09-09.

## 1. El deploy está preparado, no hecho

Todo lo que era código ya está en la rama: `vercel.json` con el ruteo de las dos mitades,
`api/index.py`, `api/requirements.txt` exportado del lock, `.env.example` con cada setting
explicado, los estáticos de Enka commiteados bajo `data/static/` y las migraciones verificadas
contra Postgres 17 por CI.

Falta correr los pasos de `docs/DEPLOY.md`, que son los que piden credenciales y no puede dar
un agente: crear la base Postgres y copiar la connection string **pooleada**, generar la clave
de credenciales con `new-credentials-key`, correr `alembic upgrade head` contra esa base,
cargar las variables en Vercel e importar el proyecto. Después, el paso 8: las cuentas que ya
existían quedaron `unclaimed` por la migración, así que son de sólo lectura hasta que
`zzz-tracker claim <uid>` les dé una key.

Dos cosas quedan afuera del serverless a propósito, y están explicadas allá: el cron de
Chronicle —desde IPs de Vercel el captcha de HoYoLAB es cuestión de tiempo— y `sync-static`,
porque el filesystem es de sólo lectura. Las dos van a una máquina propia.

Y un cabo suelto que se ata recién cuando exista el dominio real: `extension/wxt.config.ts`
declara `https://personal-zzz.vercel.app` como placeholder en los `host_permissions`. Con el
dominio verdadero hay que reemplazarlo y volver a buildear la extensión.

## 2. La propiedad de cuentas, recién aterrizada

Está implementada de punta a punta en esta rama: el backend (modelo, migración `0006`,
dependencias por cuenta y por fila, `claim` y `rotate-key` en el CLI), la extensión (una key
por UID, el header en el import, el `#key=` en el link de vuelta) y el frontend (la key
guardada por UID, el header sólo en las escrituras, el cartel que la muestra una vez y las
pantallas en modo lectura cuando no hay key). Lo que queda es mergear la rama.

Lo que se decidió y conviene no perder: una cuenta `verified` **no** se puede tomar con un
import que no presente la key vigente (403). El precio es que perder la key no se arregla desde
el navegador: se arregla con `zzz-tracker rotate-key <uid>`, que exige acceso a la base. El
porqué está en `docs/OWNERSHIP.md`; sin esa regla, forjar un bundle alcanzaba para robarse una
cuenta y quedarse con las cookies de HoYoLAB guardadas.

## 3. `.zui-input*` sigue duplicado en potencia

Los botones dejaron de estar en dos lados; los inputs nunca llegaron a estarlo, pero pueden.
El design system publica `.zui-input` (más `-mono` y `-invalid`) con sus componentes
`TextInput` y `Select`, y la app estila sus formularios con `.field input/select/textarea` de
`App.css`, a partir de la línea 435. Hoy no hay
divergencia porque no hay copia: hay dos implementaciones distintas del mismo control.

Adoptar el paquete entero seguiría costando lo mismo que en agosto: `design-system/dist/` está
gitignoreado, así que el build del frontend pasaría a depender de
`cd design-system && npm install && npm run build`. Con CI eso ya es visible cuando se rompe,
que era la mitad de la objeción; la otra mitad —que los tokens ya están sincronizados y no
ganamos nada moviéndolos— sigue en pie. Es una decisión de gusto, no una deuda que sangre.

## 4. Limpieza

`design-system-sync` sigue existiendo en `origin` (local ya no está). Está mergeada en `main`
desde `2e006f8`; borrarla es un comando.

## Orden sugerido

1. Mergear la rama con la propiedad de cuentas (§2).
2. Deploy (§1), que es lo único que separa al proyecto de estar publicado.
3. Después del deploy, el dominio real en la extensión y el cron de Chronicle en la máquina
   propia.
4. Lo de §3 y §4 cuando molesten.
