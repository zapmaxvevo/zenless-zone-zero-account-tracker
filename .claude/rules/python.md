---
description: Python/Django coding standards for the backend
paths:
  - "**/*.py"
---

# Python / Django standards

<!-- ADAPTAR:
  1. Acotar `paths:` al directorio del backend (ej. "backend/**/*.py").
  2. Completar el bloque "Version constraints" con las versiones reales del proyecto.
     Ejemplo para un proyecto legacy: "Django 2.2 / Python 3.9 — never use newer APIs;
     for 3.9-incompatible generics (list[str], X | None) use `from __future__ import annotations`
     or typing (List, Optional)."
-->

## Version constraints

**Declare here the project's Django/Python versions and stick to them.** Before using any API, verify it exists in those versions. If the project is on an older Python without modern generics support, prefer `from __future__ import annotations` at the top of the file over `typing.List`/`Optional`.

When editing existing files, match their local style; the rules below are the go-forward standard for new code.

## Language split
- **Spanish for domain code, English for development of `/lib` and other functionalities that may be reused on other projects (e.g. a WhatsApp API client, geolocation, an external CRM integration).** Domain classes/methods/attributes in Spanish (`obtener_vendedor()`, `marcar_como_leida()`); infra/lib code in English (`call()`, `headers()`, `serialize()`, `parse()`). This applies to names, not comments.

## Object design
- Favor classes with **dependency injection** over module-level functions. Inject collaborators (senders, repos, services) so they can be mocked in tests.
- Construct via **named constructor classmethods**, not bare `__init__`. Spanish in domain (`nuevo`, `nuevo_con`, `nuevo_para`, `para`), English in lib/infra (`new`, `new_to`). `nuevo()` reads config from `settings`; `nuevo_con(collaborator)` injects for tests.
- Private methods/attributes use a single `_` prefix.
- For new APIs/clients under `lib/`, follow the **`crear-api` skill** exactly (ApiClient subclass, errors hierarchy, mocks).

## Errors & logging
- Raise custom exceptions from a base class (e.g. `ClientComunicationError` for lib; per-app bases like `ErrorDeServicioDeChat`), constructed via factory (`ErrorDeServicioDeChat.nuevo(...)`). Domain code should catch connection errors (e.g. `ClientConnectionError`) and degrade gracefully (e.g. return `None`) rather than let them bubble to the view.
- **Prefer a centralized logger class** for any code that talks to external CRMs/APIs — e.g. a `LoggerDeCRMs` class with one constant + one `para_xxx()` method per integration, so every external call logs through the same place. For other app code, use a module-level `logging.getLogger('<descriptive-domain-name>')`. Don't sprinkle `getLogger(__name__)` in domain code.

Example of the centralized logger pattern:

```python
class LoggerDeCRMs(object):
    GEOLOCALIZACION = 'geolocalizacion'

    def para_geolocalizacion(self):
        return self._logging_para(self.GEOLOCALIZACION)

    def _logging_para(self, nombre):
        return logging.getLogger(nombre)
```

## DRF
- Class-based `APIView`s with explicit `parser_classes` / `permission_classes` / `authentication_classes`.
- Serializers use a factory `@classmethod para(...)` with subclass variants per case.

## Style (prescribed for new code)
- **Single quotes** for strings.
- **Use f-strings** for new interpolation (don't add new `%` or `.format()` usage).
- **Add type hints** on new public method signatures (respecting the version constraints declared above).
- **FORBIDDEN TO WRITE COMMENTS** YOU WILL BE PUNISHED. DO NOT WRITE COMMENTS UNLESS SPECIFICALLY REQUESTED.

## Tests
- Run with the `/run-tests` skill (uv + the project's test settings module).
- Use Django `TestCase` (not pytest).
- **When writing or generating tests, follow `tests.md`** — it is the detailed standard. Core idea:
  test **domain behavior** (real gestores/servicios, assert observable outcomes), not methods in
  isolation; inject mocks for the external edge instead of `@patch`. Reserve `@patch` /
  `assert_called_*` / payload-shape checks for the boundary unit test of the sender/cliente itself.
