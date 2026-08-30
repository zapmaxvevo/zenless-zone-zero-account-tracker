import { ElementTag, RankBadge, Tag, TagList } from 'zzz-ui';

export function Mezclada() {
  return (
    <TagList>
      <RankBadge rank="S" />
      <ElementTag element="electric" />
      <Tag>Atacante</Tag>
      <Tag tone="accent">Manual</Tag>
    </TagList>
  );
}

export function VariasLineas() {
  return (
    <div style={{ maxWidth: 280 }}>
      <TagList>
        <ElementTag element="fire" />
        <Tag>Anomalía</Tag>
        <Tag>Victoria</Tag>
        <Tag>Cunning Hares</Tag>
        <Tag tone="accent">Manual</Tag>
      </TagList>
    </div>
  );
}
