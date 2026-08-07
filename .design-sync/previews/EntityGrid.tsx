import { ElementTag, EntityCard, EntityGrid, Tag, TagList } from 'zzz-ui';

export function RosterCompleto() {
  const agentes = [
    { id: '1091', nombre: 'Ellen Joe', nivel: 'Nv. 60 · M2', rank: 'S' as const, el: 'ice' as const },
    { id: '1241', nombre: 'Zhu Yuan', nivel: 'Nv. 60 · M1', rank: 'S' as const, el: 'ether' as const },
    { id: '1131', nombre: 'Nicole', nivel: 'Nv. 50 · M6', rank: 'A' as const, el: 'ether' as const },
    { id: '1101', nombre: 'Koleda', nivel: 'Nv. 55 · M0', rank: 'S' as const, el: 'fire' as const },
    { id: '1121', nombre: 'Ben Bigger', nivel: 'Nv. 40 · M3', rank: 'A' as const, el: 'fire' as const },
  ];

  return (
    <EntityGrid>
      {agentes.map((a) => (
        <EntityCard
          key={a.id}
          href="#"
          title={a.nombre}
          subtitle={a.nivel}
          portraitFallback={a.id}
          rank={a.rank}
        >
          <TagList>
            <ElementTag element={a.el} />
          </TagList>
        </EntityCard>
      ))}
    </EntityGrid>
  );
}

export function DosElementos() {
  return (
    <EntityGrid>
      <EntityCard href="#" title="Ellen Joe" subtitle="Nv. 60 · M2" portraitFallback="1091" rank="S">
        <TagList>
          <ElementTag element="ice" />
          <Tag>Atacante</Tag>
        </TagList>
      </EntityCard>
      <EntityCard href="#" title="Koleda" subtitle="Nv. 55 · M0" portraitFallback="1101" rank="S">
        <TagList>
          <ElementTag element="fire" />
          <Tag>Aturdidor</Tag>
        </TagList>
      </EntityCard>
    </EntityGrid>
  );
}
