---
name: run-tests
description: Run the Django test suite with the correct test settings via uv. Use when asked to run tests, verify a change, or check a specific app/test. Optionally pass an app label or test path (e.g. "prospectos" or "prospectos.tests.TestFoo").
---

<!-- ADAPTAR: reemplazar `backend/` por el directorio donde vive manage.py, y `miproyecto.test_settings` por el settings module de tests del proyecto (u omitir --settings si los default sirven). -->

Run Django tests for this project. If the project has a dedicated test settings module, the runner needs it explicitly — default settings may point at the dev DB.

Always run from the directory containing `manage.py` using `uv`:

```bash
cd backend && uv run python manage.py test --settings=miproyecto.test_settings
```

If `$ARGUMENTS` is provided, scope the run to that app or test path:

```bash
cd backend && uv run python manage.py test $ARGUMENTS --settings=miproyecto.test_settings
```

Examples of `$ARGUMENTS`: `prospectos`, `conversaciones.tests`, `prospectos.tests.test_models.TestProspecto`.

After running, report pass/fail counts and surface any failures with their tracebacks. Do not modify test settings or the database config to make tests pass.
