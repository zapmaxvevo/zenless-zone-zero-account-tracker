import { ElementTag, EmptySlot, EntityCard, Panel, TagList } from 'zzz-ui';

export function SlotSuelto() {
  return <EmptySlot>Sin agente</EmptySlot>;
}

export function EquipoIncompleto() {
  return (
    <Panel title="Equipo de hielo">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.6rem',
        }}
      >
        <EntityCard title="Ellen Joe" subtitle="Nv. 60 · M2" portraitFallback="1091" rank="S">
          <TagList>
            <ElementTag element="ice" />
          </TagList>
        </EntityCard>
        <EmptySlot>Sin agente</EmptySlot>
        <EmptySlot>Sin agente</EmptySlot>
      </div>
    </Panel>
  );
}

export function DiscosFaltantes() {
  return (
    <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 320 }}>
      <EmptySlot>Disco 4 vacío</EmptySlot>
      <EmptySlot>Disco 5 vacío</EmptySlot>
      <EmptySlot>Disco 6 vacío</EmptySlot>
    </div>
  );
}
