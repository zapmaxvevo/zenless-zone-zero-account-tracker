import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDiscDraft } from '../lib/agentDraft';
import type { DiscDraft } from '../lib/agentDraft';
import DiscFields from './DiscFields';

const SETS = [{ set_id: 31000, name: 'Polar Metal', icon_url: null, bonus_props: {} }];

const PROPERTIES = [
  { prop_id: 20103, name: 'Prob. CRIT', format: '{0:0.#%}' },
  { prop_id: 21103, name: 'DAÑO CRIT', format: '{0:0.#%}' },
];

function render(disc: DiscDraft): string {
  return renderToStaticMarkup(
    <DiscFields disc={disc} discSets={SETS} properties={PROPERTIES} onChange={() => {}} />,
  );
}

function equipped(overrides: Partial<DiscDraft> = {}): DiscDraft {
  return { ...emptyDiscDraft(3), equipped: true, set_id: '31000', ...overrides };
}

describe('el disco sin equipar', () => {
  it('muestra su slot y nada más: no pide datos que no existen', () => {
    const html = render(emptyDiscDraft(3));

    expect(html).toContain('>3</span>');
    expect(html).toContain('Equipado');
    expect(html).not.toContain('Substats');
    expect(html).not.toContain('Stat principal');
  });
});

describe('el disco equipado', () => {
  it('pide set, rango, nivel y rolls, con los topes del juego', () => {
    const html = render(equipped());

    expect(html).toContain('Polar Metal');
    expect(html).toContain('max="15"');
    expect(html).toContain('max="5"');
    expect(html).toContain('Stat principal');
  });

  it('ofrece los tres rangos que existen para un disco', () => {
    const html = render(equipped());

    expect(html).toContain('>S</option>');
    expect(html).toContain('>A</option>');
    expect(html).toContain('>B</option>');
  });

  it('sin substats cargados igual deja agregar el primero', () => {
    const html = render(equipped());

    expect(html).toContain('Agregar substat');
    expect(html).not.toContain('Quitar');
  });

  it('cada substat cargado se puede quitar', () => {
    const html = render(
      equipped({
        substats: [
          { prop_id: '20103', value: '240', rolls: '2' },
          { prop_id: '21103', value: '384', rolls: '1' },
        ],
      }),
    );

    expect(html.split('>Quitar<')).toHaveLength(1 + 2);
    expect(html).toContain('value="240"');
    expect(html).toContain('Agregar substat');
  });

  it('con los cuatro substats no se puede agregar un quinto', () => {
    const substats = ['20103', '21103', '12103', '13103'].map((prop_id) => ({
      prop_id,
      value: '100',
      rolls: '1',
    }));

    expect(render(equipped({ substats }))).not.toContain('Agregar substat');
  });

  it('avisa que el valor va crudo como lo manda Enka', () => {
    expect(render(equipped())).toContain('480 es 4,8%');
  });
});
