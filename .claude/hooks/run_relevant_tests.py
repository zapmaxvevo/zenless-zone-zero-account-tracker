#!/usr/bin/env python3
"""Hook GLOBAL de tests, agrupado: baseline ANTES de editar y corrida final al TERMINAR.

En vez de correr tests en cada edicion (que ademas correria toda la suite),
este hook funciona en dos momentos y SOLO sobre la app/paquete afectado:

- PreToolUse (Write|Edit): la PRIMERA vez que se edita una app en la sesion,
  corre sus tests como *baseline* (codigo aun sin modificar) y guarda si pasaban.
- Stop (Claude termino todas las modificaciones): corre una sola vez los tests
  de cada app tocada y los compara contra el baseline:
    * pasan                          -> OK
    * fallan y ya fallaban antes     -> preexistente (no lo rompiste vos)
    * fallan y antes pasaban         -> introducido por estos cambios (exit 2)

Deteccion de proyecto (subiendo desde el archivo editado, gana el marker mas cercano):
- `manage.py`                                   -> Django: `uv run python manage.py test <label>`
- `pyproject.toml` / `pytest.ini` / `setup.cfg` -> modo pytest: `uv run pytest <target>`
Sin marker (proyecto sin scaffolding, archivos sueltos) el hook no hace nada.

Mapeo archivo -> target: sube hasta la carpeta `tests/` (o `tests.py`, o archivos
`test_*.py`) mas cercana dentro del proyecto. En layout `src/` los tests suelen
vivir en `<root>/tests`, con lo cual el target termina siendo la suite completa.

Si la corrida no es concluyente (falta `uv`, timeout, pytest no pudo recolectar,
error de uso del runner) NO se registra baseline ni se declara regresion: se
reporta aparte, para no silenciar fallas reales ni inventarlas.

Configuracion por proyecto (solo Django): si la suite necesita un settings module
especial, exportar CLAUDE_TESTS_SETTINGS (ej. `miproyecto.test_settings`).

El estado se guarda en un archivo temporal por session_id, protegido con un lock
para que ediciones en paralelo no disparen N suites a la vez. Se borra cuando todo
queda en verde, para que la proxima sesion arranque limpia.
"""

import contextlib
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile

TIMEOUT_SEGUNDOS = 300
SETTINGS_DE_TESTS = os.environ.get("CLAUDE_TESTS_SETTINGS", "")

# rutas donde nunca corremos tests
IGNORAR = ("/migrations/", "/.venv/", "/node_modules/", "/site-packages/")

# pytest: 0 ok, 1 fallaron tests. 2/3/4/5 = no se pudo correr / nada recolectado.
RC_PYTEST_NO_CONCLUYENTE = {2, 3, 4, 5}


def _sid(data):
    sid = str(data.get("session_id") or "default")
    return re.sub(r"[^A-Za-z0-9_.-]", "_", sid)[:64] or "default"


def _estado_path(data):
    return os.path.join(tempfile.gettempdir(), f"claude_tests_{_sid(data)}.json")


def _lock_path(data):
    return os.path.join(tempfile.gettempdir(), f"claude_tests_{_sid(data)}.lock")


@contextlib.contextmanager
def _lock_de_sesion(data):
    try:
        fd = os.open(_lock_path(data), os.O_CREAT | os.O_RDWR, 0o600)
    except OSError:
        yield
        return
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        with contextlib.suppress(OSError):
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def _cargar_estado(path):
    try:
        with open(path) as f:
            estado = json.load(f)
    except Exception:
        estado = {}
    if not isinstance(estado, dict):
        estado = {}
    apps = estado.get("apps")
    estado["apps"] = apps if isinstance(apps, dict) else {}
    return estado


def _guardar_estado(path, estado):
    try:
        tmp = f"{path}.tmp{os.getpid()}"
        with open(tmp, "w") as f:
            json.dump(estado, f)
        os.replace(tmp, path)
    except Exception:
        pass


def _path_editado(data):
    return (
        data.get("tool_response", {}).get("filePath")
        or data.get("tool_input", {}).get("file_path")
        or ""
    )


def _detectar_proyecto(file_dir):
    """Sube desde file_dir. Devuelve (project_root, modo) o (None, None).

    En cada nivel `manage.py` gana sobre los markers de pytest, asi un proyecto
    Django con pyproject.toml en la raiz sigue usando `manage.py test`.
    """
    d = file_dir
    while True:
        if os.path.isfile(os.path.join(d, "manage.py")):
            return d, "django"
        for marker in ("pyproject.toml", "pytest.ini", "setup.cfg"):
            if os.path.isfile(os.path.join(d, marker)):
                return d, "pytest"
        padre = os.path.dirname(d)
        if padre == d:
            return None, None
        d = padre


def _resolver_target(fp):
    """Devuelve dict {project_root, modo, label, objetivo} o None si no aplica."""
    if not fp or not fp.endswith(".py"):
        return None
    fp = os.path.abspath(fp)
    if any(pat in fp for pat in IGNORAR):
        return None
    file_dir = os.path.dirname(fp)

    project_root, modo = _detectar_proyecto(file_dir)
    if not project_root:
        return None

    # archivos que matchean el prefijo test/s pero NO son tests
    NO_TESTS = {"test_settings.py", "test_ci_settings.py"}

    def tiene_tests(x):
        # carpeta tests/ o tests.py
        if os.path.isdir(os.path.join(x, "tests")) or os.path.isfile(os.path.join(x, "tests.py")):
            return True
        # management commands no son tests (ej. commands/test_email.py)
        if f"{os.sep}management{os.sep}" in x + os.sep:
            return False
        # archivos sueltos test_*.py / tests_*.py (cualquier prefijo test/s)
        try:
            for nombre in os.listdir(x):
                if not nombre.endswith(".py") or nombre in NO_TESTS:
                    continue
                if nombre.startswith("test_") or nombre.startswith("tests_"):
                    return True
        except OSError:
            pass
        return False

    app_dir = file_dir
    target = None
    while True:
        if tiene_tests(app_dir):
            target = app_dir
            break
        if app_dir == project_root:
            break
        padre = os.path.dirname(app_dir)
        if padre == app_dir:
            break
        app_dir = padre

    # caso comun en layout src/: el codigo vive en src/ y los tests en <root>/tests
    if not target and tiene_tests(project_root):
        target = project_root
    if not target:
        return None

    if modo == "django":
        label = os.path.relpath(target, project_root).replace(os.sep, ".")
        objetivo = label
    else:
        # para pytest apuntamos al dir/archivo de tests concreto
        if os.path.isdir(os.path.join(target, "tests")):
            objetivo = os.path.relpath(os.path.join(target, "tests"), project_root)
        elif os.path.isfile(os.path.join(target, "tests.py")):
            objetivo = os.path.relpath(os.path.join(target, "tests.py"), project_root)
        else:
            objetivo = os.path.relpath(target, project_root)
        label = objetivo
    return {
        "project_root": project_root,
        "modo": modo,
        "label": label,
        "objetivo": objetivo,
    }


def _correr_tests(info):
    """Devuelve (paso, salida). paso=None si la corrida no fue concluyente."""
    if info["modo"] == "django":
        cmd = ["uv", "run", "python", "manage.py", "test", info["objetivo"]]
        if SETTINGS_DE_TESTS:
            cmd.append(f"--settings={SETTINGS_DE_TESTS}")
    else:
        cmd = ["uv", "run", "pytest", info["objetivo"]]
    try:
        res = subprocess.run(
            cmd,
            cwd=info["project_root"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=TIMEOUT_SEGUNDOS,
        )
    except subprocess.TimeoutExpired:
        return None, f"(timeout > {TIMEOUT_SEGUNDOS}s)"
    except (FileNotFoundError, NotADirectoryError, PermissionError, OSError) as e:
        return None, f"(no se pudo ejecutar `{cmd[0]}`: {e})"
    salida = (res.stdout or "") + (res.stderr or "")
    if res.returncode == 0:
        return True, salida
    if info["modo"] == "pytest" and res.returncode in RC_PYTEST_NO_CONCLUYENTE:
        return None, salida
    return False, salida


def manejar_pre(data):
    info = _resolver_target(_path_editado(data))
    if not info:
        return 0
    path = _estado_path(data)
    clave = f"{info['project_root']}::{info['label']}"

    # el lock serializa ediciones en paralelo: solo la primera corre la suite
    with _lock_de_sesion(data):
        estado = _cargar_estado(path)
        if clave in estado["apps"]:
            return 0  # baseline ya tomado para esta app

        paso, salida = _correr_tests(info)
        if paso is None:
            print(
                f"[tests-hook] baseline `{info['label']}` ({info['modo']}): "
                f"no concluyente, no se registra.\n{salida.strip()[-500:]}"
            )
            return 0
        estado = _cargar_estado(path)
        estado["apps"][clave] = dict(info, baseline="passed" if paso else "failed")
        _guardar_estado(path, estado)
    print(
        f"[tests-hook] baseline `{info['label']}` ({info['modo']}): "
        f"{'verde' if paso else 'ya fallaba antes de tus cambios'}."
    )
    return 0


def manejar_stop(data):
    path = _estado_path(data)
    estado = _cargar_estado(path)
    apps = estado.get("apps", {})
    if not apps:
        return 0

    introducidos = []  # rompiste vos (antes pasaba)
    preexistentes = []  # ya fallaba antes
    indeterminados = []  # no se pudo correr / nada recolectado
    ok = []
    detalle = []
    for clave, info in apps.items():
        paso, salida = _correr_tests(info)
        label = info.get("label", clave)
        if paso is None:
            indeterminados.append(label)
            detalle.append(f"### `{label}` (no concluyente)\n{salida[-2000:]}")
            continue
        if paso:
            ok.append(label)
        elif info.get("baseline") == "failed":
            preexistentes.append(label)
        else:
            introducidos.append(label)
            detalle.append(f"### `{label}`\n{salida[-4000:]}")

    resumen = []
    if ok:
        resumen.append(f"OK: {', '.join(ok)}")
    if preexistentes:
        resumen.append(f"fallan (ya fallaban antes): {', '.join(preexistentes)}")
    if indeterminados:
        resumen.append(f"no se pudieron correr: {', '.join(indeterminados)}")
    if introducidos:
        resumen.append(f"ROTOS por estos cambios: {', '.join(introducidos)}")
    linea = "[tests-hook] " + " | ".join(resumen) if resumen else ""

    if not introducidos:
        # Todo lo que rompiste esta verde -> limpiamos estado
        if not indeterminados:
            with contextlib.suppress(OSError):
                os.remove(path)
            with contextlib.suppress(OSError):
                os.remove(_lock_path(data))
        if linea:
            print(linea)
        if indeterminados:
            print("\n\n".join(detalle))
        return 0

    # Hay regresiones introducidas por estos cambios
    if data.get("stop_hook_active"):
        # Ya reintentamos una vez; no bloqueamos de nuevo para evitar loops
        print(linea + "\n(quedan tests rojos; reintento del hook agotado)")
        return 0

    print(linea + "\n\n" + "\n\n".join(detalle), file=sys.stderr)
    return 2


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if not isinstance(data, dict):
        return 0
    evento = data.get("hook_event_name", "")
    try:
        if evento == "Stop":
            return manejar_stop(data)
        # PreToolUse, y fallback por path si no viene el nombre (modo PostToolUse)
        return manejar_pre(data)
    except Exception as e:
        print(f"[tests-hook] error interno: {e}", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())
