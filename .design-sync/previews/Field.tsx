import { Field, Select, TextInput } from 'zzz-ui';

export function ConAyuda() {
  return (
    <Field label="UID" htmlFor="p-uid" hint="Nueve dígitos, lo ves en el perfil del juego.">
      <TextInput id="p-uid" mono placeholder="1300000123" />
    </Field>
  );
}

export function Invalido() {
  return (
    <Field label="Nivel" htmlFor="p-nivel" hint="El máximo es 60." invalid>
      <TextInput id="p-nivel" mono defaultValue="99" invalid />
    </Field>
  );
}

export function ConDesplegable() {
  return (
    <Field label="Atributo" htmlFor="p-attr">
      <Select id="p-attr" defaultValue="ice">
        <option value="fire">Fuego</option>
        <option value="ice">Hielo</option>
        <option value="electric">Eléctrico</option>
      </Select>
    </Field>
  );
}
