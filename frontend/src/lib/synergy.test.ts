import { describe, expect, it } from 'vitest';
import type { AgentRead } from '../api/types';
import { teamSynergy } from './synergy';

function agent(element: string | null, profession: string | null): AgentRead {
  return {
    id: 1,
    account_uid: '1300000000',
    game_id: 1041,
    name: 'Agente',
    icon_url: null,
    rarity: 4,
    profession,
    elements: element ? [element] : [],
    level: 60,
    promotion_level: 5,
    mindscape_level: 0,
    core_skill_enhancement: 0,
    source: 'enka',
    wengine: null,
    disc_count: 6,
  };
}

describe('teamSynergy', () => {
  it('un equipo incompleto no llega a Media, aunque lo que tenga sea bueno', () => {
    const synergy = teamSynergy([agent('Ice', 'Attack'), agent('Ice', 'Support')]);

    expect(synergy.label).toBe('Baja · Slot vacío');
  });

  it('dos del mismo elemento y roles cubiertos es la sinergia más alta', () => {
    const synergy = teamSynergy([
      agent('Ice', 'Attack'),
      agent('Ice', 'Support'),
      agent('Fire', 'Stun'),
    ]);

    expect(synergy.level).toBe('Alta');
    expect(synergy.label).toBe('Alta · Hielo x2');
  });

  it('cuenta los tres cuando el elemento se repite en todo el equipo', () => {
    const synergy = teamSynergy([
      agent('Electric', 'Attack'),
      agent('Electric', 'Support'),
      agent('Electric', 'Stun'),
    ]);

    expect(synergy.label).toBe('Alta · Eléctrico x3');
  });

  it('tres elementos distintos con los roles cubiertos se quedan en Media', () => {
    const synergy = teamSynergy([
      agent('Ice', 'Attack'),
      agent('Fire', 'Support'),
      agent('Ether', 'Stun'),
    ]);

    expect(synergy.label).toBe('Media');
  });

  it('sin resonancia y con un rol duplicado la sinergia es baja, y dice cuál', () => {
    const synergy = teamSynergy([
      agent('Ice', 'Attack'),
      agent('Fire', 'Attack'),
      agent('Ether', 'Stun'),
    ]);

    expect(synergy.label).toBe('Baja · Ataque x2');
  });

  it('la resonancia sola alcanza para Alta y es la que explica el nivel', () => {
    const synergy = teamSynergy([
      agent('Fire', 'Attack'),
      agent('Fire', 'Attack'),
      agent('Ice', 'Stun'),
    ]);

    expect(synergy).toMatchObject({ level: 'Alta', detail: 'Fuego x2' });
  });

  it('sin elementos ni especialidades no opina: muestra un guion', () => {
    const synergy = teamSynergy([agent(null, null), agent(null, null), agent(null, null)]);

    expect(synergy).toEqual({ level: null, detail: null, label: '—' });
  });
});
