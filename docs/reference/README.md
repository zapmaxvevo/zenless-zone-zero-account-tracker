# Referencia — el estado actual del sistema

Este directorio describe **cómo es el tracker hoy**. Se actualiza con cada cambio: si movés un
endpoint, una tabla o un flujo, el documento correspondiente se actualiza en el mismo cambio.

El resto de `docs/` no funciona así. Ver [Qué creerle a qué](#qué-creerle-a-qué) abajo.

## Empezá acá

**¿Volvés al proyecto después de un tiempo, o es tu primera vez?** →
[`01-ORIENTACION.md`](01-ORIENTACION.md). Quince minutos y podés tocar algo sin romperlo.

**¿Sos una IA y vas a cambiar código?** → [`07-NOTAS-PARA-IA.md`](07-NOTAS-PARA-IA.md), antes de
"simplificar" nada. Es el documento que evita deshacer una decisión deliberada por no saber que
lo era.

## Qué leer según lo que vas a hacer

| Vas a… | Leé |
| --- | --- |
| Entender cómo encajan las piezas | [`02-ARQUITECTURA.md`](02-ARQUITECTURA.md) |
| Tocar el import del Chronicle, el sync de Enka, o la propiedad de una cuenta | [`03-FLUJO-DE-DATOS.md`](03-FLUJO-DE-DATOS.md) |
| Agregar o cambiar una tabla, una columna o una migración | [`04-MODELO-DE-DATOS.md`](04-MODELO-DE-DATOS.md) |
| Agregar o cambiar un endpoint, o un código de error | [`05-CONTRATO-API.md`](05-CONTRATO-API.md) |
| Entender un número del juego que el código da por sabido | [`06-DOMINIO.md`](06-DOMINIO.md) |
| Cambiar algo que te parece mal hecho | [`07-NOTAS-PARA-IA.md`](07-NOTAS-PARA-IA.md) |
| Encontrar una carpeta, o entender una que no sabés qué es | [`08-MAPA-DEL-REPO.md`](08-MAPA-DEL-REPO.md) |
| Tocar **cualquier** pantalla | `../DESIGN.md`, entero, antes de escribir una línea |

`notas/` son los cinco archivos del banco de rationale; se leen a través de
[`07-NOTAS-PARA-IA.md`](07-NOTAS-PARA-IA.md), que es su índice.

## Qué creerle a qué

`docs/` tiene dos mitades y confundirlas cuesta caro:

| | |
| --- | --- |
| **Referencia viva** — describe el presente | `docs/reference/` (esto), `HOYOLAB.md`, `OWNERSHIP.md`, `DEPLOY.md`, `DESIGN.md` |
| **Planes e historia** — valen por el porqué, pueden mentir sobre el hoy | `PLAN.md`, `EXTENSION.md`, `PENDIENTES.md`, `DISC_SCORE.md`, `DISC_SCORE_FIXES.md` |

Los de la segunda columna se escribieron en su momento y se dejaron como quedaron. Cuando algo de
ahí se implementó, la verdad pasó a la primera columna. Si los dos se contradicen, **gana el
código**, y después esta carpeta.

## Por qué existe esta carpeta

Hasta septiembre de 2026 el *porqué* de cada decisión vivía adentro del código, en docstrings de
tres párrafos: algunos archivos eran mitad comentario. Leer una función costaba leer un ensayo, y
aun así nadie podía contestar "¿cómo funciona el import?" sin leer cuatro planes en orden
cronológico.

La limpieza sacó esos 108 párrafos del código **sin tirar ninguno** y los puso acá, junto con lo
que faltaba y nunca había estado escrito: la arquitectura, los diagramas, el flujo de datos, el
modelo de datos y el contrato de la API.

La regla que quedó, y que aplica a todo lo que escribas de ahora en más:

> El código dice **qué** hace. El **por qué** va a `docs/reference/`.
