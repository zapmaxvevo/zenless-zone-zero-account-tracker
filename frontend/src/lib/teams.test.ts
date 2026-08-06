import { describe, expect, it } from 'vitest';
import type { AgentRead, TeamRead } from '../api/types';
import { draftFromTeam, emptyTeamDraft, teamErrors, toTeamWrite } from './teams';

function agent(id: number): AgentRead {
  return {
    id,
    account_uid: '1300000000',
    game_id: 1000 + id,
    name: `Agente ${id}`,
    icon_url: null,
    rarity: 4,
    profession: 'Attack',
    elements: ['Fire'],
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
  name: 'Fuego',
  notes: 'Para el escudo',
  members: [
    { slot: 1, agent: agent(11) },
    { slot: 3, agent: agent(22) },
  ],
  created_at: '2026-08-05T12:00:00Z',
  updated_at: '2026-08-05T12:00:00Z',
};

describe('teamErrors', () => {
  it('no se queja de un equipo completo', () => {
    expect(teamErrors({ name: 'Fuego', notes: '', members: [1, 2, 3] })).toEqual([]);
  });

  it('acepta un equipo de un solo agente', () => {
    expect(teamErrors({ name: 'Solo', notes: '', members: [1, null, null] })).toEqual([]);
  });

  it('exige un nombre que no sea espacios', () => {
    expect(teamErrors({ name: '   ', notes: '', members: [1, null, null] })).toContain(
      'Poné un nombre al equipo.',
    );
  });

  it('corta el nombre en 64 caracteres', () => {
    const errors = teamErrors({ name: 'x'.repeat(65), notes: '', members: [1, null, null] });
    expect(errors).toContain('El nombre no puede pasar de 64 caracteres.');
  });

  it('exige al menos un agente', () => {
    expect(teamErrors(emptyTeamDraft())).toContain('Elegí al menos un agente.');
  });

  it('detecta el mismo agente en dos slots antes de que el backend tire 422', () => {
    const errors = teamErrors({ name: 'Repetido', notes: '', members: [7, null, 7] });
    expect(errors).toContain('Hay un agente repetido: cada uno puede ocupar un solo slot.');
  });
});

describe('toTeamWrite', () => {
  it('numera los slots por posición y descarta los vacíos', () => {
    const payload = toTeamWrite({ name: 'Fuego', notes: 'nota', members: [11, null, 22] });

    expect(payload).toEqual({
      name: 'Fuego',
      notes: 'nota',
      members: [
        { slot: 1, agent_id: 11 },
        { slot: 3, agent_id: 22 },
      ],
    });
  });

  it('recorta los espacios del nombre y las notas', () => {
    const payload = toTeamWrite({ name: '  Fuego  ', notes: '  nota  ', members: [1, null, null] });

    expect(payload.name).toBe('Fuego');
    expect(payload.notes).toBe('nota');
  });
});

describe('draftFromTeam', () => {
  it('coloca cada miembro en su slot y deja el resto vacío', () => {
    expect(draftFromTeam(TEAM)).toEqual({
      name: 'Fuego',
      notes: 'Para el escudo',
      members: [11, null, 22],
    });
  });

  it('vuelve al mismo payload si no se toca nada', () => {
    expect(toTeamWrite(draftFromTeam(TEAM))).toEqual({
      name: 'Fuego',
      notes: 'Para el escudo',
      members: [
        { slot: 1, agent_id: 11 },
        { slot: 3, agent_id: 22 },
      ],
    });
  });
});
