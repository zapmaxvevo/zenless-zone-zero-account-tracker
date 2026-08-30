import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DriveDiscRead } from '../api/types';
import DiscCard from './DiscCard';

const DISC: DriveDiscRead = {
  slot: 1,
  game_id: 31041,
  set_id: 31000,
  set_name: 'Woodpecker Electro',
  set_icon_url: 'https://enka.network/ui/zzz/SuitWoodpeckerElectro.png',
  rarity: 4,
  level: 15,
  roll_count: 5,
  main_stat: { prop_id: 11103, name: 'HP', format: '{0:0}', value: 550, rolls: 0, total: 2200 },
  substats: [
    { prop_id: 20103, name: 'CRIT Rate', format: '{0:0.#%}', value: 240, rolls: 3, total: 720 },
    { prop_id: 12103, name: 'ATK', format: '{0:0.#}', value: 19, rolls: 1, total: 19 },
  ],
};

function render(disc: DriveDiscRead | null, profession: string | null = 'Attack'): string {
  return renderToStaticMarkup(
    <DiscCard slot={1} disc={disc} profession={profession} elementColor="var(--element-fire)" />,
  );
}

describe('DiscCard', () => {
  it('formatea el stat principal y los substats con el formato de cada uno', () => {
    const html = render(DISC);

    expect(html).toContain('Woodpecker Electro');
    expect(html).toContain('2.200');
    expect(html).toContain('7,2%');
    expect(html).toContain('19');
    expect(html).toContain('Rango S · +15');
  });

  it('prende una marquita por tirada', () => {
    const html = render(DISC);

    expect(html.match(/ne-pip is-on/g)).toHaveLength(4);
  });

  it('marca las subestadísticas que suman al score de la especialidad', () => {
    const attack = render(DISC, 'Attack');

    expect(attack).toMatch(/ne-sub is-key"><span class="ne-sub-label">CRIT Rate/);
    expect(attack).toMatch(/ne-sub"><span class="ne-sub-label">ATK/);

    const stun = render(DISC, 'Stun');

    expect(stun).toMatch(/ne-sub is-key"><span class="ne-sub-label">ATK/);
  });

  it('renderiza un disco sin set ni stats resueltos', () => {
    const html = render({
      ...DISC,
      set_id: null,
      set_name: null,
      set_icon_url: null,
      main_stat: null,
      substats: [],
    });

    expect(html).toContain('Disco 31041');
    expect(html).toContain('Sin stat principal');
    expect(html).toContain('Sin substats');
  });

  it('dibuja el casillero igual cuando el slot está vacío', () => {
    const html = render(null);

    expect(html).toContain('ne-slot-empty');
    expect(html).toContain('Slot vacío');
  });
});
