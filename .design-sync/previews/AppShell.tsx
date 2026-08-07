import { AppShell, MetaList, Panel, LinkButton, EntityCard, EntityGrid, ElementTag, TagList } from 'zzz-ui';

export function PantallaDeCuenta() {
  return (
    <AppShell>
      <h1>ZZZ Tracker</h1>

      <Panel title="Cuenta">
        <MetaList
          items={[
            { label: 'UID', value: '1300000123' },
            { label: 'Nivel Inter-Knot', value: '55' },
            { label: 'Agentes', value: '32' },
          ]}
        />
      </Panel>

      <Panel
        title="Roster"
        actions={
          <LinkButton size="sm" href="#">
            Agregar
          </LinkButton>
        }
      >
        <EntityGrid>
          <EntityCard title="Ellen Joe" subtitle="Nv. 60 · M2" portraitFallback="1091" rank="S">
            <TagList>
              <ElementTag element="ice" />
            </TagList>
          </EntityCard>
          <EntityCard title="Zhu Yuan" subtitle="Nv. 60 · M1" portraitFallback="1241" rank="S">
            <TagList>
              <ElementTag element="ether" />
            </TagList>
          </EntityCard>
        </EntityGrid>
      </Panel>
    </AppShell>
  );
}

export function ColumnaAngosta() {
  return (
    <AppShell maxWidth={420}>
      <Panel title="Agregar cuenta">
        <MetaList items={[{ label: 'UID', value: '1300000123' }]} />
      </Panel>
    </AppShell>
  );
}
