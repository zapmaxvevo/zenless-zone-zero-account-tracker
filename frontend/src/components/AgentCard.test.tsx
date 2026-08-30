import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AgentRead } from '../api/types';
import AgentCard from './AgentCard';

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

const ART = 'https://enka.network/ui/zzz/IconRole05.png';

function render(node: ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

describe('AgentCard', () => {
  it('muestra nombre, meta, W-Engine y el arte que le pasa la página', () => {
    const html = render(<AgentCard agent={AGENT} art={ART} />);

    expect(html).toContain('Soldier 11');
    expect(html).toContain('Nv. 60');
    expect(html).toContain('M2');
    expect(html).toContain('6 discos');
    expect(html).toContain('The Brimstone');
    expect(html).toContain('Fuego');
    expect(html).toContain(ART);
    expect(html).toContain('/account/1300000000/agents/7');
  });

  it('pinta el score aproximado del build y la letra de rango', () => {
    const html = render(<AgentCard agent={AGENT} art={ART} />);

    // Nivel 60, seis discos, W-Engine y M2: el tope de la aproximación del roster.
    expect(html).toContain('95');
    expect(html).toContain('>S<');
  });

  it('cae en el game id cuando no hay arte y avisa la falta de W-Engine', () => {
    const html = render(
      <AgentCard agent={{ ...AGENT, name: null, icon_url: null, elements: [], wengine: null }} />,
    );

    expect(html).toContain('Agente 1041');
    expect(html).toContain('ne-portrait-fallback');
    expect(html).not.toContain('<img');
    expect(html).toContain('Sin W-Engine');
  });

  it('marca la fuente cuando no es el showcase de Enka', () => {
    expect(render(<AgentCard agent={{ ...AGENT, source: 'manual' }} />)).toContain('Manual');
    expect(render(<AgentCard agent={{ ...AGENT, source: 'hoyolab' }} />)).toContain('HoYoLAB');
  });

  it('no etiqueta a todo el roster: el import de Enka no lleva marca', () => {
    expect(render(<AgentCard agent={AGENT} />)).not.toContain('Enka');
  });
});
