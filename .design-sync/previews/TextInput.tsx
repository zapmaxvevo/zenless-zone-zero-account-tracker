import { Field, TextInput } from 'zzz-ui';

export function Monoespaciada() {
  return (
    <Field label="UID" htmlFor="t-uid">
      <TextInput id="t-uid" mono defaultValue="1300000123" />
    </Field>
  );
}

export function Texto() {
  return (
    <Field label="Nombre del equipo" htmlFor="t-nombre">
      <TextInput id="t-nombre" defaultValue="Equipo de hielo" />
    </Field>
  );
}

export function Placeholder() {
  return (
    <Field label="Buscar agente" htmlFor="t-buscar">
      <TextInput id="t-buscar" placeholder="Ellen, Zhu Yuan…" />
    </Field>
  );
}

export function Invalido() {
  return (
    <Field label="Nivel" htmlFor="t-nivel" hint="El máximo es 60." invalid>
      <TextInput id="t-nivel" mono defaultValue="99" invalid />
    </Field>
  );
}
