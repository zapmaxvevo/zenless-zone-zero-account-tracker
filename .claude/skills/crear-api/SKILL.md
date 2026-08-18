---
name: crear-api
description: Crea una nueva API en lib/ siguiendo la filosofía del proyecto (ApiClient, wrapper de dominio, errors, mocks, logger centralizado)
---

Cuando el usuario pide crear una nueva API en `lib/` (el directorio de librerías reutilizables del backend), seguí exactamente esta filosofía.

> **Requisito previo (ADAPTAR por proyecto):** este skill asume que el proyecto tiene un módulo base `lib/api_client` con una clase `ApiClient` (capa HTTP con `call(request)`, constantes `GET`/`POST`, `headers()`, `serialize()`, `logger()`), errores genéricos `ClientConnectionError` / `ClientComunicationError`, y un `HTTPResponseMock` para tests. Si el proyecto nuevo no lo tiene, portarlo primero desde el proyecto de origen. También asume un logger centralizado tipo `LoggerDeCRMs` (ver sección 3) — si no existe, crearlo o usar `logging.getLogger('<nombre-descriptivo>')`.

## Preguntas previas (OBLIGATORIO antes de generar código)

Antes de arrancar, hacé estas dos preguntas al usuario:

**1. ¿Cómo se va a llamar la API?**
Explicá que el nombre puede ir en español o inglés dependiendo del alcance:
- En español si es exclusiva del dominio de este proyecto
- En inglés si puede reutilizarse en otros proyectos

Esperá la respuesta y usá ese nombre en todo lo que generes.

**2. ¿Cómo se llama el wrapper de dominio?**
Explicá que no siempre es un "proveedor". Ofrecé ejemplos según el caso:
- `ProveedorDe<Concepto>` — cuando la API provee datos o recursos externos (ej: proveedor de clima, proveedor de geolocalización)
- `ServicioDe<Concepto>` — cuando orquesta lógica de negocio sin ser puramente un proveedor externo
- `ClienteDe<Concepto>` — cuando es un cliente genérico sin semántica de dominio fuerte
- Otro nombre que el usuario proponga

Usá exactamente el nombre que diga el usuario para el archivo y la clase del wrapper.

---

## Estructura de módulo

```
lib/api_<nombre>/
  __init__.py                      # exporta las clases principales
  api.py                           # capa de transporte HTTP
  errors.py                        # jerarquía de errores propia
  <wrapper_de_dominio>.py          # wrapper de dominio (usa el api.py) — nombre definido por el usuario
  tests/
    __init__.py                    # exporta los mocks
    mocks.py                       # clases mock del servicio
    tests_<nombre>.py              # tests unitarios con mocks
    tests_<nombre>_real.py         # tests de integración real (no corren en CI)
```

---

## 1. `api.py` — Capa de transporte (subclase de `ApiClient`)

Siempre extender `ApiClient` de `lib.api_client`. Es el patrón preferido.

```python
from lib.api_client import ApiClient


class APISolicitud<Nombre>(ApiClient):
    _HEADERS = {'Content-type': 'application/json', 'Accept': 'application/json'}

    def __init__(self, url, request_type=None):
        super().__init__(url, request_type)

    @classmethod
    def new_to(cls, url):
        return cls(url, cls.POST)

    def name(self):
        return 'APISolicitud<Nombre>'

    def headers(self):
        return self._HEADERS

    def serialize(self, request):
        # transformar el request antes de enviarlo (opcional)
        return request
```

**Reglas:**
- `new_to(cls, url, ...)` es el factory classmethod — recibe la URL y credenciales si las hay
- `headers()` siempre devuelve JSON content-type salvo que sea un protocolo especial (XML, form-data)
- `serialize()` transforma el request dict antes de enviarlo — solo sobreescribirlo si hay campos fijos que agregar
- `name()` devuelve un string identificador para logging
- Si tiene credenciales, recibirlas en `__init__` y agregarlas en `serialize()`

---

## 2. `errors.py` — Jerarquía de errores (opcional)

En la mayoría de los casos **no hace falta crear errores propios**. Los errores genéricos de `lib.api_client` (`ClientConnectionError`, `ClientComunicationError`) son suficientes para manejar fallos de conexión y respuestas malformadas.

Solo crear un `errors.py` propio cuando:
- Hay que distinguir casos de error específicos de esta API en el código que la consume
- El caller necesita atrapar un error concreto de este módulo sin atrapar errores de otros módulos
- La API tiene respuestas de error con semántica de negocio propia (ej: respuesta 200 con un campo `status: rejected`)

Si se decide crear errores propios, el patrón es:

```python
from lib.api_client.errors import ClientComunicationError


class <Nombre>ApiError(ClientComunicationError):
    pass


class <Nombre>ConnectionError(<Nombre>ApiError):
    @classmethod
    def error_type(cls):
        return 'El servicio no responde'


class <Nombre>ParseResponseError(<Nombre>ApiError):
    @classmethod
    def error_type(cls):
        return 'Respuesta inesperada'
```

**Reglas (si se crean):**
- Heredar de `ClientComunicationError` (no de `RuntimeError` — ese es el patrón viejo)
- `error_type()` en español, describe qué falló
- No crear errores "por las dudas" — solo los que el código realmente va a atrapar de forma diferente

---

## 3. Loggers — logger centralizado (`LoggerDeCRMs`)

Todos los loggers de APIs pasan por una clase centralizadora tipo `LoggerDeCRMs` (en este patrón vive en el módulo de utils del área de integraciones, ej. `crms/utils/loggers.py` — ADAPTAR a la ubicación del proyecto). Nunca usar `logging.getLogger(__name__)` directamente en código de dominio.

**Paso 1:** Agregar una constante y un método `para_xxx()` en `LoggerDeCRMs`:

```python
class LoggerDeCRMs(object):
    # ... constantes existentes ...
    <NOMBRE_API> = '<nombre-api>'          # ej: 'foto-perfil-whatsapp-cover'

    def para_<nombre_api>(self):
        return self._logging_para(self.<NOMBRE_API>)
```

**Paso 2:** Usarlo en el `api.py` sobreescribiendo `logger()`:

```python
from crms.utils.loggers import LoggerDeCRMs
from lib.api_client import ApiClient


class APISolicitud<Nombre>(ApiClient):
    # ...
    def logger(self):
        return LoggerDeCRMs().para_<nombre_api>()
```

**Paso 3:** Usarlo en el wrapper de dominio:

```python
from crms.utils.loggers import LoggerDeCRMs

class ProveedorDe<Concepto>(object):
    def __init__(self, sender):
        self._sender = sender
        self._logger = LoggerDeCRMs().para_<nombre_api>()
```

**Reglas:**
- El nombre del logger (la constante string) usa kebab-case: `'foto-perfil-whatsapp-cover'`
- El nombre del método usa snake_case con prefijo `para_`: `para_foto_perfil_whatsapp()`
- Agregar ambos (constante + método) aunque al principio no haya handler configurado en `settings.py` — es el punto de extensión para el futuro
- Si es un servicio de infraestructura sin dominio claro, se puede logear con `logging.getLogger(__name__)` igual que hace `ApiClient` por defecto

---

## 4. `<wrapper_de_dominio>.py` — Wrapper de dominio

El nombre del archivo y la clase lo define el usuario en las preguntas previas. Puede ser `proveedor_de_<concepto>.py`, `servicio_de_<concepto>.py`, `cliente_de_<concepto>.py`, u otro.

```python
from django.conf import settings

from crms.utils.loggers import LoggerDeCRMs
from lib.api_client import ClientConnectionError
from lib.api_<nombre>.api import APISolicitud<Nombre>


class <NombreWrapper>(object):

    def __init__(self, sender):
        self._sender = sender
        self._logger = LoggerDeCRMs().para_<nombre_api>()

    @classmethod
    def nuevo_con(cls, sender):
        return cls(sender)

    @classmethod
    def nuevo(cls):
        sender = APISolicitud<Nombre>.new_to(
            url=settings.API_<NOMBRE>_URL
        )
        return cls.nuevo_con(sender)

    @classmethod
    def nombre(cls):
        return '<nombre_wrapper>'

    def evaluar(self, entidad):
        request = self._request_para(entidad)
        try:
            self._logger.info(f'Request: {request}')
            response = self._sender.call(request)
            self._logger.info(f'Response: {response.text}, para request: {request}')
            return response.json()
        except ClientConnectionError as error:
            self._logger.error(error)
            return None

    def _request_para(self, entidad):
        return {
            "Campo": entidad.valor
        }
```

**Reglas:**
- El nombre de la clase y el archivo viene de la respuesta del usuario a la pregunta previa — respetarlo exactamente
- `nuevo()` lee de `settings` y construye el sender — nunca hardcodear URLs/credenciales
- `nuevo_con(sender)` inyecta el sender para tests
- El método de dominio principal habla en términos del negocio, no de HTTP
- Capturar `ClientConnectionError` (de `lib.api_client`) — no dejar que explote hacia arriba
- Loggear request y response con `info`, errores con `error`
- `nombre()` classmethod para identificación en logs

---

## 5. `tests/mocks.py` — Mocks para testing

```python
from lib.api_client import ClientConnectionError
from lib.api_client.http_response_mock import HTTPResponseMock


class <Nombre>ServiceConnectionFailMock(object):
    def call(self, request=None, **kwargs):
        raise ClientConnectionError('mock error', request=request, response=None)
        # Si el módulo tiene errores propios, usar <Nombre>ConnectionError en su lugar


class <Nombre>ServiceMock(object):
    def __init__(self, response):
        self._response = response

    def call(self, request=None, **kwargs):
        return self._response

    @classmethod
    def respuesta_ok(cls, json_content):
        return cls(HTTPResponseMock.ok_with_json_content(json_content))

    @classmethod
    def respuesta_vacia(cls):
        return cls(HTTPResponseMock.http_200_ok())

    @classmethod
    def respuesta_error_http(cls):
        return cls(HTTPResponseMock.http_400_bad_request())
```

**Reglas:**
- El mock implementa la misma interfaz que el servicio real (mismo `call()`)
- Usar `HTTPResponseMock` de `lib.api_client.http_response_mock` para simular respuestas HTTP
- Named constructors descriptivos: `respuesta_ok()`, `respuesta_vacia()`, `respuesta_error_http()`
- El `ConnectionFailMock` lanza el error del módulo (no el genérico)

---

## 6. `tests/tests_<nombre>.py` — Tests unitarios

```python
from unittest import TestCase

from lib.api_<nombre>.proveedor_de_<concepto> import ProveedorDe<Concepto>
from lib.api_<nombre>.errors import <Nombre>ConnectionError
from lib.api_<nombre>.tests.mocks import <Nombre>ServiceMock, <Nombre>ServiceConnectionFailMock


class Test<Nombre>Proveedor(TestCase):

    def test_evalua_correctamente_la_respuesta(self):
        mock = <Nombre>ServiceMock.respuesta_ok({'campo': 'valor'})
        proveedor = ProveedorDe<Concepto>.nuevo_con(mock)
        resultado = proveedor.evaluar(entidad_de_prueba)
        self.assertEqual(resultado['campo'], 'valor')

    def test_retorna_none_cuando_falla_la_conexion(self):
        mock = <Nombre>ServiceConnectionFailMock()
        proveedor = ProveedorDe<Concepto>.nuevo_con(mock)
        resultado = proveedor.evaluar(entidad_de_prueba)
        self.assertIsNone(resultado)
```

**Reglas:**
- Testear el `Proveedor`, no el `ApiClient` directamente
- Inyectar el mock via `nuevo_con(mock)`
- Siempre cubrir: conexión falla, respuesta bien formada, respuesta malformada
- Tests en español si son de dominio, en inglés si son de infraestructura (copiar estilo del módulo existente)

---

## 7. `__init__.py` — Exports

```python
from lib.api_<nombre>.api import APISolicitud<Nombre>
from lib.api_<nombre>.errors import <Nombre>ApiError, <Nombre>ConnectionError, <Nombre>ParseResponseError
```

Solo exportar lo que va a ser usado desde fuera del módulo.

---

## Naming conventions

El nombre base (`<Nombre>`) lo define el usuario en las preguntas previas. Puede estar en español o inglés.

| Concepto | Patrón | Ejemplo (español) | Ejemplo (inglés) |
|---|---|---|---|
| Clase API | `APIVerbo<Nombre>` | `APISolicitudTranscripcionDeMeta` | `APISolicitudWhatsAppChecker` |
| Wrapper dominio | definido por el usuario | `ProveedorDe<Concepto>`, `ServicioDe<Concepto>` | `<Concepto>Service`, `<Concepto>Client` |
| Error base | `<Nombre>ApiError` | `TranscripcionMetaApiError` | `WhatsAppCheckerApiError` |
| Error conexión | `<Nombre>ConnectionError` | `TranscripcionMetaConnectionError` | `WhatsAppCheckerConnectionError` |
| Error parse | `<Nombre>ParseResponseError` | `TranscripcionMetaParseResponseError` | `WhatsAppCheckerParseResponseError` |
| Mock servicio | `<Nombre>ServiceMock` | `TranscripcionMetaServiceMock` | `WhatsAppCheckerServiceMock` |
| Mock fallo | `<Nombre>ServiceConnectionFailMock` | `TranscripcionMetaConnectionFailMock` | `WhatsAppCheckerConnectionFailMock` |

**Idioma de métodos:** los métodos de infraestructura siempre en inglés (`call`, `headers`, `serialize`, `name`). Los métodos de dominio siguen el idioma del nombre elegido (`evaluar` / `evaluate`, `nuevo` / `new`, etc.).

---

## Checklist al crear una API nueva

- [ ] Preguntar el nombre de la API al usuario (español o inglés según alcance del proyecto)
- [ ] Preguntar cómo se llama el wrapper de dominio (`ProveedorDe...`, `ServicioDe...`, `ClienteDe...`, u otro)
- [ ] `api.py` extiende `ApiClient`, tiene `new_to()`, `headers()`, `name()`
- [ ] `errors.py` solo si hay errores específicos que el caller necesita distinguir — en la mayoría de los casos no hace falta
- [ ] Agregar constante + método `para_xxx()` en el logger centralizado (`LoggerDeCRMs`)
- [ ] Wrapper de dominio tiene `nuevo()` (desde settings) y `nuevo_con(sender)` (para tests), usa el logger centralizado
- [ ] `api.py` sobreescribe `logger()` para usar `LoggerDeCRMs().para_xxx()`
- [ ] `tests/mocks.py` tiene mock de fallo y mock de éxito usando `HTTPResponseMock`
- [ ] `tests/tests_xxx.py` testea el wrapper inyectando el mock, no el cliente HTTP directo
- [ ] Agregar la URL/credenciales en `settings.py` con el prefijo `API_<NOMBRE>_`
- [ ] `__init__.py` exporta lo necesario
