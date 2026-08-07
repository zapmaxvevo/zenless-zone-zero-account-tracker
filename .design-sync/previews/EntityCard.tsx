import { ElementTag, EntityCard, EntityGrid, Tag, TagList } from "zzz-ui";

export function Agente() {
  return (
    <EntityCard
      href="#"
      title="Ellen Joe"
      subtitle="Nv. 60 · M2"
      portraitFallback="1091"
      rank="S"
    >
      <TagList>
        <ElementTag element="ice" />
        <Tag>Atacante</Tag>
      </TagList>
      <p className="dim small">Deep Sea Visitor · Nv. 60 · P1</p>
      <p className="dim small">6 discos</p>
    </EntityCard>
  );
}

export function SinRetrato() {
  return (
    <EntityCard
      title="Agente 1211"
      subtitle="Nv. 45 · M0"
      portraitFallback="1211"
      rank="A"
    >
      <TagList>
        <ElementTag element="electric" />
        <Tag tone="accent">Manual</Tag>
      </TagList>
      <p className="dim small">Sin W-Engine</p>
    </EntityCard>
  );
}

export function EnGrilla() {
  return (
    <EntityGrid>
      <EntityCard
        href="#"
        title="Ellen Joe"
        subtitle="Nv. 60 · M2"
        portraitFallback="1091"
        rank="S"
      >
        <TagList>
          <ElementTag element="ice" />
        </TagList>
      </EntityCard>
      <EntityCard
        href="#"
        title="Zhu Yuan"
        subtitle="Nv. 60 · M1"
        portraitFallback="1241"
        rank="S"
      >
        <TagList>
          <ElementTag element="ether" />
        </TagList>
      </EntityCard>
      <EntityCard
        href="#"
        title="Nicole"
        subtitle="Nv. 50 · M6"
        portraitFallback="1131"
        rank="A"
      >
        <TagList>
          <ElementTag element="ether" />
        </TagList>
      </EntityCard>
    </EntityGrid>
  );
}
