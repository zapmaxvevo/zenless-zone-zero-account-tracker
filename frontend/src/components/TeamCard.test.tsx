import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AgentRead, TeamRead } from '../api/types';
import TeamCard from './TeamCard';

function agent(id: number, element: string, profession: string): AgentRead {
  return {
    id,
    account_uid: '1300000000',
    game_id: 1000 + id,
    name: `Agente ${id}`,
    icon_url: null,
    rarity: 4,
    profession,
    elements: [element],
    level: 60,
    promotion_level: 5,
    mindscape_level: 0,
    core_skill_enhancement: 0,
    source: 'enka',
    wengine: null,
    disc_count: 6,
  };
}

const TEAM: TeamRead = {
  id: 3,
  account_uid: '1300000000',
  name: 'Hielo',
  notes: 'Para el escudo',
  members: [
    { slot: 1, agent: agent(11, 'Ice', 'Attack') },
    { slot: 2, agent: agent(22, 'Ice', 'Support') },
  ],
  created_at: null,
  updated_at: null,
};

function render(team: TeamRead): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TeamCard team={team} busy={false} art={() => null} onDelete={() => {}} />
    </MemoryRouter>,
  );
}

describe('TeamCard', () => {
  it('dibuja los tres slots aunque el equipo tenga dos miembros', () => {
    const html = render(TEAM);

    expect(html).toContain('Hielo');
    expect(html).toContain('Para el escudo');
    expect(html).toContain('Agente 11');
    expect(html).toContain('Libre');
    expect(html).toContain('2/3');
    expect(html).toContain('/account/1300000000/agents/22');
  });

  it('un equipo incompleto no llega a Media, por más que resuene', () => {
    expect(render(TEAM)).toContain('Baja · Slot vacío');
  });

  it('promedia el score y el nivel de los miembros presentes', () => {
    const html = render({
      ...TEAM,
      members: [
        { slot: 1, agent: { ...agent(11, 'Ice', 'Attack'), level: 60 } },
        { slot: 2, agent: { ...agent(22, 'Ice', 'Support'), level: 40 } },
        { slot: 3, agent: { ...agent(33, 'Fire', 'Stun'), level: 50 } },
      ],
    });

    expect(html).toContain('Alta · Hielo x2');
    expect(html).toContain('>50<');
  });
});
