import { EntityCard, RankBadge, TagList } from 'zzz-ui';

export function LaEscala() {
  return (
    <TagList>
      <RankBadge rank="S" />
      <RankBadge rank="A" />
      <RankBadge rank="B" />
    </TagList>
  );
}

export function SobreUnRetrato() {
  return (
    <EntityCard title="Ellen Joe" subtitle="Nv. 60 · M2" portraitFallback="1091" rank="S" />
  );
}
