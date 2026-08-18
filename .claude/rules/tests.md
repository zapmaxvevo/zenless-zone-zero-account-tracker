---
description: How to write backend tests — favor domain/business tests over over-unit tests
paths:
  - "**/test_*.py"
  - "**/tests_*.py"
  - "**/tests/**/*.py"
---

# Testing standards (backend)

<!-- ADAPTAR: acotar `paths:` al backend, y completar la sección final "Golden references" con los ejemplares del nuevo proyecto. Los ejemplos de este archivo usan un dominio inventado (reportes a supervisores por mensajería) — son el modelo de forma, no clases que existan en el repo. -->

These rules exist because the default instinct — write a unit test per method, mock every
collaborator, assert "method X was called with Y" — produces **fragile tests that don't prove
the business works**. This codebase tests **domain behavior**, not implementation. Follow that.

**Follow the gold standard, not the file you're next to.** There may be old/divergent test code in
the repo; do not copy a weak local style just because it's nearby. Write to the standard below.
If the surrounding tests clash with this standard and consistency seems to matter, **ask whether
to refactor them** rather than silently matching them.

## Two kinds of test — know which one you're writing

Almost everything you write is **(1)**. Reach for **(2)** only for the boundary object itself.

**(1) Domain / behavior test** — the default, the bulk of the suite.
Run the real domain (gestores, servicios, generadores, reports, querysets, models, the DB) and
assert the **observable outcome**. Mock only the external edge. **Never** `@patch`, **never**
`assert_called_*` here — those check wiring, not business.

**(2) Boundary unit test** — only for the object whose job *is* to talk to an external service
(a sender / cliente / proveedor that makes the HTTP request). Its responsibility is to build and
send the correct request, so here — and **only** here — it is correct to `@patch` the HTTP layer
and use `assert_called_with` / `call_args`, and to assert the exact request payload shape.
Cover **ok + connection-fail + malformed-response**. Everything that *uses* this object gets a
type-(1) test that injects a mock of it and asserts the domain outcome — not the payload.

### Where does each assertion belong?

| What you want to guarantee | Test type | How to assert it |
|---|---|---|
| The exact payload/headers sent to the external service | (2) on the cliente itself | `@patch` the HTTP layer, inspect `call_args` |
| The cliente survives connection failure / garbage response | (2) on the cliente itself | `side_effect` / malformed `HTTPResponseMock`, `assertRaises` |
| The business reacted correctly (records created, states changed) | (1) | real domain + DB state (`refresh_from_db`, queryset asserts) |
| Something was/wasn't sent to the outside | (1) | a **domain query on the injected mock** (`envio_un_mensaje_a(...)`) |
| The business degrades gracefully when the service fails | (1) | inject the fail-mock, assert resulting domain state |

## The one rule that matters: test a business scenario, not a method

Before writing a test, name the **scenario** in one sentence — one set of conditions and what
should observably happen ("a supervisor without a phone doesn't receive the report"; "when a
message arrives for a vendedor, an outgoing template message is started and the message is
persisted with accepted status"). That sentence *is* the test name and drives the assertions.
If you can't state it without naming a method or argument, you're about to write a unit test —
step back up a level.

### One scenario per test — but assert the whole outcome of that scenario
- A test fixes **one** set of `# Dado` conditions and asserts **all** the observable effects that
  scenario produces. If sending a message both starts an outgoing message *and* writes a log,
  assert **both** — that is one scenario, not two. Don't split one assertion per test.
- What you split across separate tests is the **variation in conditions**: supervisor con/sin
  teléfono, ventana abierta/cerrada, the external service failing, multiple users. Each
  distinct condition is its own test. Don't cram several distinct conditions into one test either.
- Structure every test `# Dado` / `# Cuando` / `# Entonces`.

## Full worked example — type (1) domain test

The mock is a hand-rolled project mock that implements the real cliente's interface **and exposes
domain query methods** to assert against (instead of `Mock` call introspection):

```python
class ClienteDeMensajeriaMock(object):
    def __init__(self):
        self._enviados = []

    def enviar(self, telefono, texto):
        self._enviados.append({'telefono': telefono, 'texto': texto})
        return {'id': f'mock-{len(self._enviados)}'}

    def envio_un_mensaje_a(self, telefono):
        return any(m['telefono'] == telefono for m in self._enviados)

    def cantidad_de_mensajes_enviados(self):
        return len(self._enviados)


class ClienteDeMensajeriaConnectionFailMock(object):
    def enviar(self, telefono, texto):
        raise ClientConnectionError('mock: servicio caido')
```

The suite runs the **real** notificador against the **real** DB; only the external cliente is
mocked, and it is **injected** via the named constructor — no `@patch` anywhere:

```python
@freeze_time('2026-03-16')
class EnvioDeReporteSemanalTest(BaseFixturedTest):

    def setUp(self):
        super().setUp()
        self.cliente_mock = ClienteDeMensajeriaMock()
        self.notificador = NotificadorDeReportes.nuevo_con(cliente=self.cliente_mock)

    def test_el_reporte_llega_a_los_supervisores_con_celular_y_queda_registrado(self):
        # Dado
        supervisor = SupervisoresFactory(celular='+5492610000001')

        # Cuando
        self.notificador.enviar_reporte_semanal()

        # Entonces
        self.assertTrue(self.cliente_mock.envio_un_mensaje_a('+5492610000001'))
        envio = EnvioDeReporte.objects.get(destinatario=supervisor)
        self.assertEqual(envio.estado, EnvioDeReporte.ENVIADO)

    def test_el_reporte_no_se_manda_a_supervisores_sin_celular(self):
        # Dado
        supervisor = SupervisoresFactory(celular=None)

        # Cuando
        self.notificador.enviar_reporte_semanal()

        # Entonces
        self.assertEqual(self.cliente_mock.cantidad_de_mensajes_enviados(), 0)
        self.assertFalse(EnvioDeReporte.objects.filter(destinatario=supervisor).exists())

    def test_si_la_mensajeria_falla_el_envio_queda_pendiente_de_reintento(self):
        # Dado
        supervisor = SupervisoresFactory(celular='+5492610000001')
        notificador = NotificadorDeReportes.nuevo_con(
            cliente=ClienteDeMensajeriaConnectionFailMock())

        # Cuando
        notificador.enviar_reporte_semanal()

        # Entonces
        envio = EnvioDeReporte.objects.get(destinatario=supervisor)
        self.assertEqual(envio.estado, EnvioDeReporte.PENDIENTE_DE_REINTENTO)
```

Why this is the model:
- The **real** `NotificadorDeReportes` and the **real** models/DB run — nothing in-domain is mocked.
- Only the external edge (`ClienteDeMensajeria`) is replaced, **injected** via `nuevo_con(...)`.
- Assertions are observable outcomes: the mock's **domain queries** + **DB state**. Zero
  `assert_called_*`, zero `@patch`.
- Each test is one condition (con celular / sin celular / servicio caído), and each asserts **all**
  the effects of its scenario (mensaje enviado **y** registro persistido).
- Test names read as business sentences.

## Full worked example — type (2) boundary test

Only the cliente itself gets this style. Here `@patch`, `call_args` and payload-shape assertions
are **correct** — the payload is this object's contract with the external service:

```python
class ClienteDeMensajeriaTest(TestCase):

    def setUp(self):
        self.cliente = ClienteDeMensajeria.new_to('https://api.mensajeria.example/v1')

    @patch('lib.api_mensajeria.api.requests.post')
    def test_arma_y_envia_el_payload_que_espera_el_servicio(self, post_mock):
        post_mock.return_value = HTTPResponseMock.ok_with_json_content({'id': 'msg-1'})

        resultado = self.cliente.enviar(telefono='+5492610000001', texto='hola')

        payload = post_mock.call_args.kwargs['json']
        self.assertEqual(payload['destinatario']['telefono'], '+5492610000001')
        self.assertEqual(payload['mensaje']['texto'], 'hola')
        self.assertEqual(resultado['id'], 'msg-1')

    @patch('lib.api_mensajeria.api.requests.post')
    def test_si_el_servicio_no_responde_levanta_error_de_conexion(self, post_mock):
        post_mock.side_effect = requests.ConnectionError()

        with self.assertRaises(ClientConnectionError):
            self.cliente.enviar(telefono='+5492610000001', texto='hola')

    @patch('lib.api_mensajeria.api.requests.post')
    def test_si_la_respuesta_no_es_json_valido_levanta_error_de_parseo(self, post_mock):
        post_mock.return_value = HTTPResponseMock.ok_with_content('<html>gateway error</html>')

        with self.assertRaises(MensajeriaParseResponseError):
            self.cliente.enviar(telefono='+5492610000001', texto='hola')
```

The three cases (ok + connection-fail + malformed-response) are the **minimum** for a boundary
test. Everything that *uses* `ClienteDeMensajeria` (the notificador above) never repeats these
payload assertions — it gets type-(1) tests with the mock injected.

## The anti-pattern, side by side

❌ A "domain" test that reaches into implementation — fragile, proves nothing observable
(passes even if the real effect is broken, breaks on harmless refactors):

```python
@patch('reportes.notificador.ClienteDeMensajeria')
def test_envia_reporte(self, cliente_mock):
    NotificadorDeReportes.nuevo().enviar_reporte_semanal()
    cliente_mock.return_value.enviar.assert_called_once()
```

✅ The same intent, done right — see `test_el_reporte_llega_a_los_supervisores_con_celular_y_queda_registrado`
above: inject the mock, run the real domain, assert the message reached the phone **and** the
`EnvioDeReporte` row exists with the right state.

## Mocking — only the external edge, and inject it (don't @patch)

Real (never mock) in type-1 tests: domain models, gestores, servicios, generadores, reports,
querysets, the DB. **Never mock the object under test or its in-domain collaborators** — if you're
mocking a gestor to test a notificador that uses it, the test no longer proves anything; use the
real one. And don't add a mock you never assert on; that's noise.

Mock **only** what crosses the process boundary, and prefer **injecting** a project mock (like
`ClienteDeMensajeriaMock` above) over `@patch` (reserve `@patch` for type-2 boundary tests):
- **External services** — CRMs, WhatsApp/Meta, SMS, IA, payment gateways. The injecting
  constructor is often `nuevo_con(...)` / `nuevo_para(..., colaborador=...)`, **but the name varies
  per object** — the point is you instantiate it with the mock, not that the method is literally
  `nuevo_con`.
- **The clock** — `@freeze_time(...)` (class-level if the whole suite shares a date, method-level
  for case-specific timing). Advance with `with freeze_time(...) as t: t.tick(timedelta(...))`.

## Naming

Spanish for domain tests; the name tells the business story, not the method.
- ✅ `test_el_reporte_no_se_manda_a_supervisores_sin_celular`,
  `test_cuando_no_existe_una_conversacion_se_inicia_con_el_primer_mensaje`,
  `test_cancelar_venta_debe_cambiar_de_estado_de_venta_y_pasar_prospecto_a_en_proceso`
- ❌ `test_valida_cantidad`, `test_update_status`, `test_should_fails_communication`,
  `test_returns_true` — say nothing about the case or its outcome.

Classes: `<LoQueTesteo>Test`. Files: **`test_*.py`** for new files (legacy `tests_*.py` may exist).

## Setup — reuse the existing scaffolding

- Inherit the project's fixtured base test class (e.g. a `BaseFixturedTest` that gives
  `self.fixture` with users and domain objects pre-built, plus a context creator for dynamic
  scenarios). Use a logged-in variant (e.g. `BaseLoggedTest`) when the case depends on the
  logged-in user's role (access/visibility tests).
- Suites with heavy shared setup get their own base or a **scenario fixture object** — a
  hand-rolled object exposing domain-vocabulary methods, e.g.:

  ```python
  class ConversacionFixture(object):
      def __init__(self):
          self._servicio = ServicioDeMensajeriaMock()
          self.vendedor_uno = VendedoresFactory()
          self.prospecto_uno = ProspectosFactory(vendedor=self.vendedor_uno)

      def enviar_mensaje_a_prospecto_uno_de_vendedor_uno(self, texto='hola'):
          gestor = GestorDeConversaciones.nuevo_con(servicio=self._servicio)
          return gestor.enviar(prospecto=self.prospecto_uno, texto=texto)

      def servicio_de_mensajeria(self):
          return self._servicio
  ```

- Build data with `factory_boy` factories (e.g. `ProspectosFactory`, `VendedoresFactory`) and
  domain builder helpers (e.g. `un_vendedor_con_prospectos_del_mes()`).
- Extract repeated scenario setup and assertions into `_`-prefixed helpers that speak the domain
  (`_registrar_actividad_de(vendedor)`, `_assert_reporte_contiene(reporte, *fragmentos)`).

## Don't write these

- Trivial serialization / `__str__` / "field was saved verbatim" tests with no business meaning.
  If serialization matters, prove it through a behavior ("sending the SMS produces a successful send").
- Tests coupled to exact list indices or deep dict keys of internal structures (outside the
  type-2 boundary test that owns that structure).

## Before finishing — the "this smells like a unit test" checklist

1. Can I state the scenario without naming a method/argument? If not, go up a level.
2. Is this a type-1 test? Then my assertions check an **observable outcome** (DB state, query
   result, report content, raised exception, a mock's domain query) — not `assert_called*`.
3. Am I injecting the mock for the external edge (not `@patch`), with the real domain running?
4. Did I assert the **whole** outcome of the scenario (every observable effect), and split only
   the **conditions** into separate tests?
5. Would this test still pass after a harmless internal refactor that preserves behavior?
6. Does the test name read as a sentence a product person would recognize?

## Golden references (ADAPTAR per project)

Pick — or create — one exemplar of each of these in the new project, and list their real paths
here so tests for a new area start from the right model:

- **Domain tests over an external service**: a suite shaped like `EnvioDeReporteSemanalTest` above
  (scenario fixture or fixtured base + injected mock + assertions via domain queries and DB state).
- **The type-2 boundary test done right**: a suite shaped like `ClienteDeMensajeriaTest` above
  (payload shape + connection-fail + malformed-response on the cliente itself).
- **Use cases asserting model state**: a gestor test that runs the use case and asserts DB state.
- **Role/visibility via observable results**: logged-in-user tests asserting what each role sees.
- **The base classes, fixtures and factories to reuse**: the project's test base module.
