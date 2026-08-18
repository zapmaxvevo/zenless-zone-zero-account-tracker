import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AgentRead, DriveDiscRead } from '../api/types';
import AgentCard from './AgentCard';
import DiscCard from './DiscCard';

/** Datos con la forma que devuelve el backend (ver `tests/test_agents_api.py`). */
const AGENT: AgentRead = {
  id: 7,
  account_uid: '1300000000',
  game_id: 1041,
  name: 'Soldier 11',
  icon_url: 'https://enka.network/ui/zzz/IconRoleCircle05.png',
  rarity: 4,
  profession: 'Attack',
  elements: ['Fire'],
  level: 60,
  promotion_level: 5,
  mindscape_level: 2,
  core_skill_enhancement: 6,
  source: 'enka',
  wengine: {
    game_id: 14104,
    name: 'The Brimstone',
    icon_url: null,
    rarity: 4,
    level: 60,
    modification_level: 5,
    phase: 1,
  },
  disc_count: 6,
};

const DISC: DriveDiscRead = {
  slot: 1,
  game_id: 31041,
  set_id: 31000,
  set_name: 'Woodpecker Electro',
  set_icon_url: 'https://enka.network/ui/zzz/SuitWoodpeckerElectro.png',
  rarity: 4,
  level: 15,
  roll_count: 5,
  main_stat: {
    prop_id: 11103,
    name: 'HP',
    format: '{0:0}',
    value: 550,
    rolls: 0,
    total: 2200,
  },
  substats: [
    { prop_id: 20103, name: 'CRIT Rate', format: '{0:0.#%}', value: 240, rolls: 3, total: 720 },
    { prop_id: 12103, name: 'ATK', format: '{0:0.#}', value: 19, rolls: 1, total: 19 },
  ],
};

function render(node: ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

describe('AgentCard', () => {
  it('muestra nombre, nivel, mindscape y el W-Engine', () => {
    const html = render(<AgentCard agent={AGENT} />);

    expect(html).toContain('Soldier 11');
    expect(html).toContain('Nv. 60');
    expect(html).toContain('M2');
    expect(html).toContain('The Brimstone');
    expect(html).toContain('Fuego');
    expect(html).toContain('/account/1300000000/agents/7');
  });

  it('cae en el game id y avisa la falta de W-Engine cuando el backend no resolvió nada', () => {
    const html = render(
      <AgentCard agent={{ ...AGENT, name: null, icon_url: null, elements: [], wengine: null }} />,
    );

    expect(html).toContain('Agente 1041');
    expect(html).toContain('Sin W-Engine');
  });
});

describe('DiscCard', () => {
  it('formatea el stat principal y los substats con el formato de cada uno', () => {
    const html = render(<DiscCard disc={DISC} />);

    expect(html).toContain('Woodpecker Electro');
    // Lo que muestra el juego, no la base que manda Enka: 550 escalado a nivel 15 y tres
    // rolls de 2,4% de CRIT Rate.
    expect(html).toContain('2.200');
    expect(html).toContain('7,2%');
    expect(html).toContain('+3');
    expect(html).toContain('19');
  });

  it('renderiza un disco sin set ni stats resueltos', () => {
    const html = render(
      <DiscCard disc={{ ...DISC, set_id: null, set_name: null, main_stat: null, substats: [] }} />,
    );

    expect(html).toContain('Disco 31041');
    expect(html).toContain('Sin stat principal');
    expect(html).toContain('Sin substats');
  });
});
