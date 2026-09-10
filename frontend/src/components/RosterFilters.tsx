import type { RosterFilter, RosterOption, RosterOrder } from '../lib/roster';

interface RosterFiltersProps {
  filter: RosterFilter;
  elements: RosterOption[];
  professions: RosterOption[];
  onChange: (filter: RosterFilter) => void;
}

export default function RosterFilters({
  filter,
  elements,
  professions,
  onChange,
}: RosterFiltersProps) {
  return (
    <div className="field-row ne-filters">
      <div className="field">
        <label className="ne-label" htmlFor="roster-search">
          Buscar
        </label>
        <input
          id="roster-search"
          type="search"
          value={filter.search}
          placeholder="Nombre del agente"
          onChange={(event) => onChange({ ...filter, search: event.target.value })}
        />
      </div>

      <Picker
        id="roster-element"
        label="Atributo"
        every="Todos"
        value={filter.element}
        options={elements}
        onChange={(element) => onChange({ ...filter, element })}
      />

      <Picker
        id="roster-profession"
        label="Especialidad"
        every="Todas"
        value={filter.profession}
        options={professions}
        onChange={(profession) => onChange({ ...filter, profession })}
      />

      <div className="field">
        <label className="ne-label" htmlFor="roster-order">
          Orden
        </label>
        <select
          id="roster-order"
          value={filter.order}
          onChange={(event) => onChange({ ...filter, order: event.target.value as RosterOrder })}
        >
          <option value="score">Score de build</option>
          <option value="level">Nivel</option>
          <option value="name">Nombre</option>
        </select>
      </div>
    </div>
  );
}

interface PickerProps {
  id: string;
  label: string;
  every: string;
  value: string;
  options: RosterOption[];
  onChange: (value: string) => void;
}

function Picker({ id, label, every, value, options, onChange }: PickerProps) {
  return (
    <div className="field">
      <label className="ne-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{every}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
