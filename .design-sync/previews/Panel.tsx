import { Button, LinkButton, MetaList, Panel, StatList } from 'zzz-ui';

export function ConTitulo() {
  return (
    <Panel title="Cuenta">
      <MetaList
        items={[
          { label: 'UID', value: '1300000123' },
          { label: 'Nivel Inter-Knot', value: '55' },
          { label: 'Última sincronización', value: 'hace 2 horas' },
        ]}
      />
    </Panel>
  );
}

export function ConAcciones() {
  return (
    <Panel
      title="Roster"
      actions={
        <>
          <Button size="sm">Filtrar</Button>
          <LinkButton size="sm" href="#" variant="accent">
            Agregar agente
          </LinkButton>
        </>
      }
    >
      <p className="dim">32 agentes · 6 equipos guardados</p>
    </Panel>
  );
}

export function SinTitulo() {
  return (
    <Panel>
      <StatList
        items={[
          { label: 'Crítico', value: '9.6%', note: '+3' },
          { label: 'Daño crítico', value: '19.2%', note: '+2' },
        ]}
      />
    </Panel>
  );
}
