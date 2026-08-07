import { Button, Field, FieldRow, Select, TextInput } from 'zzz-ui';

export function TresCampos() {
  return (
    <FieldRow>
      <Field label="Nivel" htmlFor="r-nivel">
        <TextInput id="r-nivel" mono defaultValue="60" />
      </Field>
      <Field label="Mindscape" htmlFor="r-m">
        <TextInput id="r-m" mono defaultValue="2" />
      </Field>
      <Field label="Rareza" htmlFor="r-rank">
        <Select id="r-rank" defaultValue="S">
          <option value="S">S</option>
          <option value="A">A</option>
          <option value="B">B</option>
        </Select>
      </Field>
    </FieldRow>
  );
}

export function ConBoton() {
  return (
    <FieldRow>
      <Field label="UID de la cuenta" htmlFor="r-uid">
        <TextInput id="r-uid" mono placeholder="1300000123" />
      </Field>
      <Button variant="accent">Buscar</Button>
    </FieldRow>
  );
}
