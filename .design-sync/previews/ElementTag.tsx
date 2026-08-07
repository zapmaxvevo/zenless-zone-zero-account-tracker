import { ElementTag, TagList } from 'zzz-ui';

export function LosCincoAtributos() {
  return (
    <TagList>
      <ElementTag element="fire" />
      <ElementTag element="ice" />
      <ElementTag element="electric" />
      <ElementTag element="physics" />
      <ElementTag element="ether" />
    </TagList>
  );
}

export function ConEtiquetaPropia() {
  return (
    <TagList>
      <ElementTag element="electric" label="Eléc." />
      <ElementTag element="physics" label="Fís." />
    </TagList>
  );
}
