---
description: Backend standards — FastAPI + SQLAlchemy in src/zzz_tracker, run through uv
paths:
  - "src/**/*.py"
  - "api/**/*.py"
  - "alembic/**/*.py"
---

# Backend (FastAPI + SQLAlchemy) standards

El backend vive en `src/zzz_tracker/`, se maneja con **uv** y no tiene nada de Django. Todo
comando pasa por `uv run`:

```bash
uv run pytest
uv run ruff check .        # y `uv run ruff format .`
uv run mypy src api
uv run alembic upgrade head
uv run zzz-tracker serve --reload
```

Dependencias con `uv add` / `uv add --dev`, nunca editando `pyproject.toml` ni `uv.lock` a mano.

> El frontend es Vite + React y vive en `frontend/`; la extensión, en `extension/`. Backend y
> frontend hablan **solo por HTTP** y no comparten código. Las reglas de `frontend.md` no aplican acá.

## Versión y tipado

- **Python 3.12+** (`requires-python = ">=3.12"`). No hay restricción de APIs viejas: se usan
  genéricos nativos (`list[str]`, `dict[str, Any]`, `X | None`), `match`, `Self`.
- **`from __future__ import annotations` como primera línea de todo archivo `.py`.** Es la regla
  que ya sigue el 100% del backend; un archivo nuevo sin eso desentona.
- **mypy en `strict`**, con el plugin de pydantic. Toda función lleva anotación de argumentos y de
  retorno, incluidas las que devuelven `None`. Nada de `Any` suelto donde se puede nombrar el tipo;
  el `Any` legítimo es el JSON crudo que llega de una API externa antes de mapearse.
- `TYPE_CHECKING` sólo si hace falta romper un ciclo de imports.

## La regla de capas

```
web/routers/  →  tracker/  →  storage/
                    ↑
        enka/  y  hoyolab/  (mappers de borde)
```

- **`web/routers/` no toca modelos.** Un router recibe schemas de pydantic, llama a
  `TrackerService` y devuelve schemas. No importa nada de `storage.models` ni arma un `select()`.
  La conversión modelo → schema vive en el schema (`AccountRead.from_account(...)`), no en el router.
- **`tracker/`** es el dominio: `TrackerService` es lo único que orquesta sesión, mappers y
  modelos. Es donde se levantan los errores de dominio.
- **`storage/`** son los modelos de SQLAlchemy, el `DatabaseManager` y `keys`. No sabe que existe HTTP.
- **`enka/` y `hoyolab/` son mappers de borde: no tocan la sesión.** Reciben JSON crudo y devuelven
  dataclasses `Parsed*` (`ParsedAgent`, `ParsedRosterAgent`, `ParsedChallengeRun`…). Que importen
  una constante de `storage.models` (`MODE_SHIYU_DEFENSE`) está bien; que abran una `Session`, no.
  `EnkaClient` es el único que hace I/O de red, y se inyecta.
- Los helpers de parseo defensivo (`as_int`, `as_dict`, `as_list`, `timestamp_to_datetime`) están en
  `parsing.py` y los usan los dos mappers. Un tercer `int(x or 0)` a mano es duplicación.

## Inyección por `Depends`

Nada se construye dentro de un handler. Todo colaborador entra por `Depends`, y los alias viven en
`web/deps.py` — usá el alias, no repitas el `Annotated[..., Depends(...)]`:

`SettingsDep`, `DatabaseManagerDep`, `SessionDep`, `EnkaClientDep`, `StaticDataDep`,
`RequiredStaticDataDep`, `TrackerServiceDep`, más los path/header types `UidPath`, `AgentIdPath`,
`TeamIdPath`, `AccountKeyHeader`.

```python
@router.get("/{uid}", response_model=AccountRead)
def get_account(uid: UidPath, service: TrackerServiceDep) -> AccountRead:
    return AccountRead.from_account(service.get_account(uid))
```

Los guards de escritura (`require_account_key`, `require_agent_owner_key`,
`require_team_owner_key`) van en `dependencies=[Depends(...)]` del decorador, no en el cuerpo.
Un alias nuevo se agrega a `deps.py`; no se define ad hoc en un router.

Esto es también lo que hace testeable el backend: los tests arman la app con `create_app(settings,
enka=..., static=...)` y sustituyen el borde externo sin parchear nada.

## Errores de dominio

Todo error que el cliente tiene que poder distinguir es una subclase de `ZZZTrackerError`
(`errors.py`), con su `status_code`, su `code` y su `default_detail`. Se levantan desde `tracker/`
o desde los guards; **nunca** se hace `raise HTTPException` en un router.

```python
raise ConflictError(f"Agent {game_id} is already tracked for account {uid}")
```

- El `detail` es para una persona y puede cambiar de palabras cuando quieras.
- **El `code` es contrato: renombrarlo rompe a los clientes.** `tests/test_errors.py` pinea cada
  uno. Un error nuevo se agrega con un `code` nuevo; uno existente no se renombra.
- Un status por sí solo no alcanza: 409 es a la vez `conflict` y `unclaimed_account`. Por eso el
  código, y no el status, es lo que se mira del otro lado.

## Pydantic sólo en el borde HTTP

Los schemas de `web/schemas/` (`accounts`, `agents`, `catalog`, `chronicle`, `common`, `teams`) son
la forma de entrada y salida de la API, y nada más. El dominio no habla pydantic: `tracker/` y los
mappers usan dataclasses. La validación de forma (patrones de UID, rangos) va en el schema o en el
`Path(...)`; la validación que necesita mirar la base es `ValidationError` desde el servicio.

Un endpoint declara siempre `response_model`, y sus errores esperados en `responses=`.

## Migraciones

Un cambio en `storage/models.py` necesita su revisión de Alembic en el mismo cambio:

```bash
uv run alembic revision --autogenerate -m "lo que cambia"
uv run alembic upgrade head && uv run alembic check && uv run alembic downgrade base
```

`alembic check` es lo que CI corre contra Postgres para detectar deriva. Toda revisión tiene
`downgrade()` real. Producción es Postgres y los tests corren en SQLite: nada de tipos exclusivos
de un motor sin mirar el otro.

## Estilo

- **ruff** con `line-length = 100`, `target-version = "py312"`, reglas `E, F, I, UP, B, C4, SIM`.
  `uv run ruff format .` antes de terminar; el import order lo arregla ruff (`I`).
- **Comillas dobles.** Es lo que formatea ruff, y reformatear a comillas simples te lo va a revertir.
- f-strings para interpolar.
- Nombres en **inglés**, que es el idioma del backend entero (`sync_account`, `verify_key`,
  `parse_shiyu_defense`). Los docstrings y comentarios también.
- Privados con un `_` de prefijo.

## Comentarios: el código dice *qué*, el *por qué* va a `docs/reference/`

Un comentario o docstring se queda **sólo si dice algo que el código no puede decir en una línea**.

Se queda:
- La primera línea del docstring de una función pública, diciendo qué hace.
- Un comentario de **una** línea que avisa de algo no obvio: un límite de una API externa, una
  unidad, un orden que importa, una comparación en tiempo constante hecha a propósito.

Se va:
- Todo párrafo de rationale y toda justificación de diseño.
- Toda historia ("antes esto era X y se cambió porque…").
- Todo comentario que repite lo que el código ya dice.

Lo que se va **no se tira**: se muda a `docs/reference/`. Esa es la mitad de la documentación que
describe el presente del sistema; el resto de `docs/` (`PLAN.md`, `EXTENSION.md`, `PENDIENTES.md`,
`DISC_SCORE*.md`) son planes e historia y no describen necesariamente lo que hay hoy.

## Tests

`uv run pytest`. La forma la manda **`.claude/rules/tests.md`**, que es el estándar detallado. En
una línea: se testea **comportamiento de dominio** — la app real contra la base real, con
`TestClient`, afirmando el resultado observable — y se stubbea sólo el borde externo (Enka y
HoYoLAB). Nada de `assert_called_*` ni de mockear un colaborador interno.
