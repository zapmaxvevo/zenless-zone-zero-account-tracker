import { Field, Select } from 'zzz-ui';

export function Atributo() {
  return (
    <Field label="Atributo" htmlFor="s-attr">
      <Select id="s-attr" defaultValue="ice">
        <option value="fire">Fuego</option>
        <option value="ice">Hielo</option>
        <option value="electric">Eléctrico</option>
        <option value="physics">Físico</option>
        <option value="ether">Éter</option>
      </Select>
    </Field>
  );
}

export function EstadisticaPrincipal() {
  return (
    <Field label="Estadística principal" htmlFor="s-main">
      <Select id="s-main" defaultValue="crit">
        <option value="atk">Ataque %</option>
        <option value="crit">Prob. crítico</option>
        <option value="critdmg">Daño crítico</option>
        <option value="pen">Penetración</option>
      </Select>
    </Field>
  );
}

export function Invalido() {
  return (
    <Field label="Ranura" htmlFor="s-slot" hint="Elegí una ranura del 1 al 6." invalid>
      <Select id="s-slot" defaultValue="" invalid>
        <option value="">—</option>
        <option value="1">1</option>
        <option value="2">2</option>
      </Select>
    </Field>
  );
}
