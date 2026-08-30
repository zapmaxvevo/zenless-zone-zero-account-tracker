import { MetaList, Panel } from 'zzz-ui';

export function DatosDeCuenta() {
  return (
    <MetaList
      items={[
        { label: 'UID', value: '1300000123' },
        { label: 'Nivel Inter-Knot', value: '55' },
        { label: 'Agentes', value: '32' },
        { label: 'Última sincronización', value: 'hace 2 horas' },
      ]}
    />
  );
}

export function DentroDeUnPanel() {
  return (
    <Panel title="Cuenta">
      <MetaList
        items={[
          { label: 'UID', value: '1300000123' },
          { label: 'Nivel Inter-Knot', value: '55' },
        ]}
      />
    </Panel>
  );
}
