import { Tag, TagList } from 'zzz-ui';

export function Tonos() {
  return (
    <TagList>
      <Tag>Atacante</Tag>
      <Tag tone="accent">Manual</Tag>
      <Tag tone="success">Sincronizado</Tag>
      <Tag tone="danger">Desactualizado</Tag>
    </TagList>
  );
}

export function EnUnAgente() {
  return (
    <TagList>
      <Tag>Anomalía</Tag>
      <Tag>Victoria</Tag>
      <Tag tone="accent">Manual</Tag>
    </TagList>
  );
}
