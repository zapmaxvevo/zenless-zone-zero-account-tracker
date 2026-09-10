---
description: How to write tests here — domain scenarios over per-method unit tests, in pytest and vitest
paths:
  - "tests/**/*.py"
  - "frontend/**/*.test.ts"
  - "frontend/**/*.test.tsx"
  - "extension/**/*.test.ts"
---

# Testing standards

Estas reglas existen porque el instinto por defecto — un test unitario por método, un mock por
colaborador, un `assert "se llamó a X con Y"` — produce **tests frágiles que no prueban que el
negocio funcione**. Acá se testea **comportamiento de dominio**, no implementación.

**Seguí el estándar, no el archivo que tenés al lado.** Si el test vecino choca con esto y la
consistencia parece importar, **preguntá si conviene refactorizarlo** en vez de copiar el estilo débil.

Comandos:

```bash
uv run pytest                    # backend, desde la raíz
cd frontend && npm run test      # vitest run
cd extension && npm run test     # vitest run
```

## Dos tipos de test — sabé cuál estás escribiendo

Casi todo lo que escribas es **(1)**. El **(2)** es sólo para el objeto de borde.

**(1) Test de dominio / comportamiento** — el default, el grueso de la suite.
Corre el dominio real (la app real, `TrackerService` real, los modelos reales, la base real) y
afirma el **resultado observable**. Se stubbea sólo el borde externo. **Nunca** `assert_called_*`,
**nunca** parchear un colaborador interno.

**(2) Test unitario de borde** — sólo para el objeto cuyo trabajo *es* hablar con un servicio
externo: `EnkaClient`. Su responsabilidad es armar y mandar el request correcto, así que ahí — y
**sólo ahí** — corresponde afirmar la URL, los headers y la forma del payload. Cubre
**ok + falla de conexión + respuesta malformada**. Todo lo que *usa* ese objeto recibe un test de
tipo (1) con el borde sustituido, y no repite las afirmaciones de payload.

### Dónde va cada afirmación

| Lo que querés garantizar | Tipo | Cómo se afirma |
|---|---|---|
| La URL / headers exactos que salen hacia Enka | (2) sobre `EnkaClient` | `httpx.MockTransport` que guarda los `Request` y se inspeccionan |
| Que el cliente sobrevive a una conexión caída o a basura | (2) sobre `EnkaClient` | handler que levanta `httpx.ConnectError`, o `text="<html>…"`, y `pytest.raises` |
| Que el negocio reaccionó bien (filas creadas, estados cambiados) | (1) | la respuesta HTTP real + un `GET` posterior, o estado en la sesión |
| Que se consultó (o no) al servicio externo | (1) | una **pregunta de dominio** al fake: `enka.times_queried(uid)`, `enka.was_queried()` |
| Que el negocio degrada bien cuando el servicio falla | (1) | el fake devuelve 429/404 y se afirma el `code` del error que sale |

## La regla que importa: testeá un escenario, no un método

Antes de escribir, nombrá el **escenario en una oración**: un conjunto de condiciones y qué debería
pasar de forma observable. Esa oración *es* el nombre del test y manda las afirmaciones. Si no
podés enunciarla sin nombrar un método o un argumento, estás por escribir un test unitario: subí
un nivel.

Los nombres de este repo ya son el modelo, y están **en inglés en el backend**:

- ✅ `test_a_full_import_stores_the_whole_chronicle_and_tracks_the_account_implicitly`
- ✅ `test_tracking_a_uid_from_the_web_owns_nothing_and_hands_out_no_key`
- ✅ `test_an_import_whose_record_card_belongs_to_another_uid_is_refused`
- ✅ `test_a_build_never_overwrites_an_agent_edited_by_hand`
- ❌ `test_import_ok`, `test_returns_true`, `test_update_status`, `test_validates_uid` — no dicen
  ni el caso ni el resultado.

En el frontend los nombres van **en castellano**, que es lo que ya usa la suite:
`it('un UID que no está trackeado manda al registro, no a buscar una key')`.

### Un escenario por test — pero afirmá todo el resultado de ese escenario

- Un test fija **un** conjunto de condiciones (`# Given`) y afirma **todos** los efectos
  observables que ese escenario produce. Si importar deja el roster cargado *y* devuelve la key,
  afirmá las dos cosas: es un escenario, no dos. No partas una afirmación por test.
- Lo que se parte en tests separados es la **variación de condiciones**: con key / sin key / con la
  key de otro; con record card / sin record card / con uno de otro UID; Enka que responde / Enka
  que tira 429. Cada condición distinta es su propio test.
- Estructurá con `# Given` / `# When` / `# Then`.

## Ejemplares de oro — mirá estos antes de escribir

| Qué modela | Archivo |
|---|---|
| **Autorización y propiedad**: la misma pregunta en varias formas, incluyendo "una key válida, pero de otra cuenta" | `tests/test_account_keys_api.py` |
| **El flujo completo de dominio**: importar un bundle y afirmar todo lo que quedó guardado | `tests/test_chronicle_import.py` |
| **Escrituras y sus reglas**: crear/editar un agente a mano y lo que un import puede o no pisar | `tests/test_agent_editing_api.py` |
| **El test de borde (tipo 2)**: URL + user agent, conexión caída, respuesta no-JSON, 404, 429 | `tests/test_enka_client.py` |
| **Frontend**: pantallas renderizadas a string, `localStorage` y `fetch` stubbeados | `frontend/src/pages/ownership.test.tsx` |
| **El andamiaje que se reusa**: fakes, builders de payload y fixtures | `tests/conftest.py` |

## El andamiaje del backend: `tests/conftest.py`

No armes tu propia app ni tu propia base. Pedí las fixtures que ya existen:

- `client` — `TestClient` sobre la app real, con base SQLite en `tmp_path`, `EnkaClient` apuntando
  al fake y la static data de `tests/fixtures/static`. Es el punto de entrada del 90% de los tests.
- `client_without_static_data` — la misma app sin catálogo, para los escenarios de
  `static_data_unavailable`.
- `service` / `session` — cuando el escenario es de dominio puro y no pasa por HTTP.
- `enka` — el `FakeEnkaNetwork`, para preguntarle cosas o cambiarle un perfil.
- `enka_payload`, `static_data` — los fixtures JSON recordados.

Y los helpers de dominio, que son la forma correcta de armar el escenario:
`track_account`, `import_chronicle`, `imported_account`, `owned_account`, `key_headers`,
`account_key_of`, `chronicle_bundle` y sus constructores por sección (`chronicle_profile`,
`chronicle_roster`, `roster_agent`, `chronicle_bangboos`, `shiyu_season`, `deadly_assault_season`).

Si tu escenario necesita un armado nuevo, agregá un helper que hable el dominio, con el nombre de
lo que hace (`unowned_account`, `own_another_account`, `first_agent_of`, `hand_written_build`), en
vez de repetir tres `client.post`.

## Mockear: sólo el borde externo, y sustituyéndolo, no parcheándolo

El borde externo real de este repo son **Enka.Network y HoYoLAB**. Nada más cruza el proceso.

- **Enka** se sustituye con `FakeEnkaNetwork` (`tests/conftest.py`), que sirve payloads recordados
  sobre un `httpx.MockTransport` y **expone preguntas de dominio** (`times_queried`, `was_queried`,
  `set_profile`) para afirmar contra ellas en vez de inspeccionar llamadas. Entra por
  `create_app(settings, enka=..., static=...)` — inyección, no `monkeypatch`.
- **HoYoLAB no se mockea: no existe del lado del servidor.** El backend nunca le habla; los datos
  entran como un bundle que postea la extensión. Un escenario de chronicle se arma con
  `chronicle_bundle(...)` y `import_chronicle(...)`, con los fixtures JSON de `tests/fixtures/`
  (`hoyolab_index.json`, `hoyolab_avatar_basic.json`, `hoyolab_shiyu_v2.json`, …) como referencia
  de la forma real.
- **Reales, nunca mockeados**: `TrackerService`, los mappers, los modelos, la sesión, la base.
  Si estás mockeando el servicio para testear un router, el test ya no prueba nada: usá el real.
- No agregues un mock sobre el que después no afirmás nada; es ruido.

En el frontend el borde es **`fetch`**, y se stubbea con `vi.stubGlobal('fetch', ...)`; lo mismo
`localStorage`. No se mockea un hook propio ni un componente propio: se renderiza el real.

## El anti-patrón, lado a lado

❌ Un "test de dominio" que se mete en la implementación — frágil, no prueba nada observable
(pasa aunque el efecto real esté roto, se rompe con cualquier refactor inocuo):

```python
def test_import(monkeypatch: pytest.MonkeyPatch) -> None:
    called = []
    monkeypatch.setattr(TrackerService, "import_chronicle", lambda self, **kw: called.append(kw))
    client.post(f"/accounts/{TRACKED_UID}/chronicle/import", json=...)
    assert called
```

✅ Lo mismo, bien: correr el dominio real y afirmar lo que quedó — ver
`test_a_full_import_stores_the_whole_chronicle_and_tracks_the_account_implicitly` en
`tests/test_chronicle_import.py`, que importa un bundle y después *lee la API* para comprobar que
el roster, los bangboos, el Lost Void y las dos temporadas están ahí, y que la cuenta quedó
trackeada y con dueño.

## Estilo mecánico

- `from __future__ import annotations` arriba de todo, igual que en `src/`.
- Anotaciones completas: los tests también pasan por `mypy` en modo strict (`uv run mypy src api`
  no los cubre, pero el estilo del repo los anota igual, incluido `-> None`).
- Constantes de dominio arriba del archivo con su nombre del juego (`SOLDIER_11 = 1041`,
  `ELLEN = 1191`, `WEEPING_CRADLE = 14121`), no números mágicos repartidos.
- `pytest.mark.parametrize` cuando el escenario es literalmente el mismo y sólo cambia un valor
  (`[400, 404]` que ambos son "Enka no conoce ese UID"). No para juntar escenarios distintos.
- Archivos `test_*.py`. Un docstring de módulo cuando el archivo entero responde una pregunta que
  vale la pena enunciar — ver el encabezado de `tests/test_account_keys_api.py`.

## No escribas esto

- Tests de serialización trivial, de `__str__`, de "el campo se guardó igual que como entró", sin
  significado de negocio. Si la serialización importa, probala a través de un comportamiento.
- Tests acoplados a índices exactos de listas o a claves profundas de estructuras internas (fuera
  del test de borde que es dueño de esa estructura).
- Tests que repiten en el nivel (1) las afirmaciones de payload que ya hace el nivel (2).

## Antes de terminar — el checklist "esto huele a test unitario"

1. ¿Puedo enunciar el escenario sin nombrar un método o un argumento? Si no, subí un nivel.
2. ¿Es un test de tipo (1)? Entonces mis afirmaciones son **resultado observable** (respuesta HTTP,
   estado leído de vuelta por la API, excepción levantada, una pregunta de dominio al fake) — no
   `assert_called_*`, no parcheo de un colaborador interno.
3. ¿Estoy sustituyendo sólo el borde externo, por inyección, con el dominio real corriendo?
4. ¿Afirmé **todo** el resultado del escenario, y partí en tests separados sólo las **condiciones**?
5. ¿Este test seguiría pasando después de un refactor inocuo que preserva el comportamiento?
6. ¿El nombre se lee como una oración que alguien de producto reconocería?
