# ZZZ Tracker — Extensión de navegador

Extensión MV3 (WXT + React + TypeScript) que importa el Battle Chronicle de Zenless Zone Zero
desde la sesión viva de HoYoLAB del navegador al tracker, sin que el backend vea nunca las
cookies. Es la fase 2 del plan `docs/EXTENSION.md`; la referencia técnica de la API de HoYoLAB
está en `docs/HOYOLAB.md`.

## Comandos

```bash
npm install            # también corre `wxt prepare` (genera .wxt/)
npm run dev            # Chrome con recarga en vivo
npm run dev:firefox    # Firefox (MV3 explícito)
npm run build          # tsc --noEmit && build de Chrome → .output/chrome-mv3
npm run build:firefox  # build de Firefox MV3 → .output/firefox-mv3
npm run lint
npm run test
npm run format
```

## Instalación como unpacked / temporary add-on

**Chrome**

1. `npm run build`
2. `chrome://extensions` → activar *Developer mode* → *Load unpacked* →
   elegir `extension/.output/chrome-mv3`.

**Firefox**

1. `npm run build:firefox`
2. `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* →
   elegir `extension/.output/firefox-mv3/manifest.json`.
3. En Firefox MV3 los `host_permissions` son opcionales por defecto: en
   `about:addons` → la extensión → *Permissions*, habilitar el acceso a
   `act.hoyolab.com` y al dominio del tracker.

El manifest declara el tracker local (`http://127.0.0.1:8000`) y un placeholder del dominio de
Vercel (`https://personal-zzz.vercel.app`); cuando exista el deploy real hay que reemplazarlo en
`wxt.config.ts`.

## Configuración

1. Abrir las opciones de la extensión (o el link "Abrir opciones" del popup).
2. **URL del tracker**: la del backend, `http://127.0.0.1:8000` en local.
3. **URL del frontend del tracker** (opcional): la del SPA, `http://localhost:5173` en dev.
   Es la base del link "Ver la cuenta en el tracker" (`/account/<uid>`); si queda vacía el
   popup no muestra el link (la URL del backend daría un 404 del SPA).
4. **Token de la API**: el valor de `ZZZ_API_TOKEN` del backend. Sin token el endpoint de
   import responde 401 (y 503 si el backend no tiene la variable configurada).

## Uso

1. Iniciar sesión en `https://www.hoyolab.com` (cookies `ltuid_v2`/`ltoken_v2` vivas).
2. Popup → **Importar**. La extensión abre `act.hoyolab.com` en una pestaña en segundo plano,
   descubre el UID con `getGameRecordCard`, lee perfil, roster, bangboos, Shiyu Defense ×2,
   Deadly Assault ×2 y Lost Void (en serie, con jitter de 300-800 ms), y sube los payloads
   crudos a `POST /accounts/{uid}/chronicle/import`.
3. El popup muestra el progreso por sección, el resumen ("Importado: N agentes, M bangboos,
   X runs…") y el link a la cuenta en el tracker.

Errores esperables: sesión vencida → "Iniciá sesión en HoYoLAB" (la pestaña queda abierta para
loguearse); rate limit (retcode `10101` o HTTP 429) → esperar y reintentar a mano, nunca se
reintenta solo; captcha (`10035`) → resolverlo en `act.hoyolab.com` y reintentar (el flujo
geetest integrado es fase 5); `10041` → HoYoLAB cortó el acceso y el import entero se cancela.
Cada request loguea su `x-trace-id` en la consola de la pestaña de HoYoLAB.

## Fase 0 — `scripts/capture.js`

Snippet autocontenido para capturar los payloads reales desde DevTools (instrucciones en el
encabezado del archivo). Resuelve las incógnitas del plan (batch de `id_list`, forma de los
valores de propiedades, headers mínimos) y produce el JSON del que salen las fixtures reales de
`tests/fixtures/`. Es también la herramienta de diagnóstico si HoYoLAB cambia el esquema.

## Checklist E2E manual

En Chrome y en Firefox, con un build fresco:

1. **Opciones vacías**: popup recién instalado → el botón Importar está deshabilitado y el
   aviso lleva a las opciones.
2. **Guardar opciones**: URL + token quedan persistidos al cerrar y reabrir (storage.sync).
3. **Sin sesión de HoYoLAB**: Importar → mensaje "Iniciá sesión en HoYoLAB" y la pestaña de
   act.hoyolab.com queda abierta y activa para loguearse.
4. **Import feliz**: con sesión y backend corriendo (`ZZZ_API_TOKEN` seteado) → progreso por
   sección en orden, resumen final con agentes/bangboos/runs, el link "Ver la cuenta en el
   tracker" abre `/account/<uid>` del frontend (no el JSON del backend), y la pestaña de
   HoYoLAB en segundo plano se cierra sola.
5. **Cuenta nueva**: importar un UID que el tracker no tiene → la cuenta se crea
   (`GET /accounts/{uid}` la devuelve).
6. **Token inválido**: cambiar el token en opciones → Importar → error 401 con el detail del
   backend, sin payload persistido.
7. **Backend caído**: parar el backend → Importar → "No se pudo conectar con el tracker…".
8. **Popup cerrado a mitad**: cerrar el popup durante el import → al reabrirlo el botón vuelve
   deshabilitado en "Importando…" (el popup le consulta el estado al background, que además
   rechaza cualquier segundo start con "Ya hay un import en curso"); al terminar, el resultado
   aparece igual (lo guardó el background en storage.local).
9. **x-trace-id**: en la consola de la pestaña de HoYoLAB, cada sección logueó
   `http=… retcode=… x-trace-id=…`.
10. **Solo Firefox**: verificar en `about:debugging` que el background corre (event page via
    `background.scripts`) y que los permisos de host están concedidos en `about:addons`.

## Estructura

```
extension/
  wxt.config.ts             # MV3, host_permissions, gecko.id, ambas claves de background
  entrypoints/
    background.ts           # orquesta: abre la pestaña, pide el sync, POST al tracker
    hoyolab.content.ts      # matches act.hoyolab.com — todos los fetch a HoYoLAB salen de acá
    popup/                  # React: estado, Importar, progreso, último import
    options/                # URL del tracker + ZZZ_API_TOKEN (chrome.storage.sync)
  lib/
    hoyolab.ts              # URLs, headers x-rpc-*, retcodes, jitter, descubrimiento de rol
    chronicle.ts            # armado del paquete del contrato de import
    tracker.ts              # cliente del backend
    messages.ts             # protocolo de mensajes popup ↔ background ↔ content
  scripts/capture.js        # fase 0
```

Regla estricta del repo: cero imports desde `frontend/src/`. Si algún día hay que compartir
tipos o el design system, se hace como paquete (como `design-system/`).
