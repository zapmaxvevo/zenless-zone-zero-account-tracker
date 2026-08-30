import { Panel, StatList } from 'zzz-ui';

export function SubestadisticasDeUnDisco() {
  return (
    <StatList
      items={[
        { label: 'Prob. crítico', value: '9.6%', note: '+3' },
        { label: 'Daño crítico', value: '19.2%', note: '+2' },
        { label: 'Ataque', value: '38' },
        { label: 'Penetración', value: '9' },
      ]}
    />
  );
}

export function SinAnotaciones() {
  return (
    <StatList
      items={[
        { label: 'HP', value: '8.421' },
        { label: 'Ataque', value: '2.937' },
        { label: 'Defensa', value: '694' },
        { label: 'Impacto', value: '118' },
      ]}
    />
  );
}

export function DentroDeUnPanel() {
  return (
    <Panel title="Disco 4">
      <StatList
        items={[
          { label: 'Prob. crítico', value: '9.6%', note: '+3' },
          { label: 'Ataque %', value: '9%', note: '+1' },
        ]}
      />
    </Panel>
  );
}
