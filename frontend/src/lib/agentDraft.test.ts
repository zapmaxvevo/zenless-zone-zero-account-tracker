import { describe, expect, it } from 'vitest';
import type { AgentDetailRead } from '../api/types';
import {
  agentDraftErrors,
  discGameId,
  draftFromAgent,
  emptyAgentDraft,
  emptyWEngineDraft,
  toAgentUpdate,
  toAgentWrite,
} from './agentDraft';

/** Soldier 11 con un Woodpecker S en el slot 1, con la forma que sirve el backend. */
const AGENT: AgentDetailRead = {
  id: 7,
  account_uid: '1300000000',
  game_id: 1041,
  name: 'Soldier 11',
  icon_url: null,
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
    rarity: 5,
    level: 60,
    modification_level: 5,
    phase: 1,
  },
  disc_count: 1,
  image_url: null,
  skill_levels: { '0': 12, '3': 10 },
  weapon_effect_state: 2,
  obtained_at: null,
  discs: [
    {
      slot: 1,
      game_id: 31041,
      set_id: 31000,
      set_name: 'Woodpecker Electro',
      set_icon_url: null,
      rarity: 4,
      level: 15,
      roll_count: 5,
      main_stat: { prop_id: 11103, name: 'HP', format: '{0:0}', value: 2200, rolls: 0 },
      substats: [{ prop_id: 20103, name: 'CRIT Rate', format: '{0:0.#%}', value: 480, rolls: 3 }],
    },
  ],
  equipped_sets: [],
};

describe('discGameId', () => {
  it('codifica set, rareza y slot como lo hace Enka', () => {
    expect(discGameId(31000, 4, 1)).toBe(31041);
    expect(discGameId(31000, 2, 6)).toBe(31026);
    expect(discGameId(32800, 3, 4)).toBe(32834);
  });
});

describe('toAgentUpdate', () => {
  it('no manda nada si el draft sale del agente y no se toca', () => {
    expect(toAgentUpdate(draftFromAgent(AGENT), AGENT)).toEqual({});
  });

  it('manda solo el campo que cambió', () => {
    const draft = { ...draftFromAgent(AGENT), mindscape_level: '6' };

    expect(toAgentUpdate(draft, AGENT)).toEqual({ mindscape_level: 6 });
  });

  it('no arrastra los discos cuando solo se cambió un nivel', () => {
    const draft = { ...draftFromAgent(AGENT), level: '50' };

    expect(toAgentUpdate(draft, AGENT)).not.toHaveProperty('discs');
    expect(toAgentUpdate(draft, AGENT)).not.toHaveProperty('wengine');
  });

  it('manda los discos enteros en cuanto se toca uno', () => {
    const draft = draftFromAgent(AGENT);
    draft.discs[0].level = '12';

    const update = toAgentUpdate(draft, AGENT);

    expect(update.discs).toHaveLength(1);
    expect(update.discs?.[0]).toEqual({
      slot: 1,
      game_id: 31041,
      set_id: 31000,
      rarity: 4,
      level: 12,
      roll_count: 5,
      main_stat_id: 11103,
      main_stat_value: 2200,
      substats: [{ prop_id: 20103, value: 480, rolls: 3 }],
    });
  });

  it('manda una lista vacía al desequipar todos los discos', () => {
    const draft = draftFromAgent(AGENT);
    draft.discs[0].equipped = false;

    expect(toAgentUpdate(draft, AGENT).discs).toEqual([]);
  });

  it('manda wengine en null al desequiparlo, que es lo que el backend lee como sacarlo', () => {
    const draft = { ...draftFromAgent(AGENT), wengine: null };
    const update = toAgentUpdate(draft, AGENT);

    expect(update.wengine).toBeNull();
    expect('wengine' in update).toBe(true);
  });

  it('deriva el id de la pieza al cambiarle el set a un disco', () => {
    const draft = draftFromAgent(AGENT);
    draft.discs[0].set_id = '32800';

    expect(toAgentUpdate(draft, AGENT).discs?.[0].game_id).toBe(32841);
  });

  it('incluye skill_levels solo si cambiaron', () => {
    const draft = draftFromAgent(AGENT);
    expect(toAgentUpdate(draft, AGENT)).not.toHaveProperty('skill_levels');

    draft.skill_levels['0'] = '11';
    expect(toAgentUpdate(draft, AGENT).skill_levels).toEqual({ '0': 11, '3': 10 });
  });
});

describe('toAgentWrite', () => {
  it('arma el alta con los defaults del backend', () => {
    const draft = { ...emptyAgentDraft(), game_id: '1041' };

    expect(toAgentWrite(draft)).toEqual({
      game_id: 1041,
      level: 1,
      promotion_level: 0,
      mindscape_level: 0,
      core_skill_enhancement: 0,
      skill_levels: {},
      wengine: null,
      discs: [],
    });
  });

  it('solo incluye los discos equipados', () => {
    const draft = emptyAgentDraft();
    draft.game_id = '1041';
    draft.discs[2] = { ...draft.discs[2], equipped: true, set_id: '31000', rarity: '4' };

    const payload = toAgentWrite(draft);

    expect(payload.discs).toHaveLength(1);
    expect(payload.discs[0].slot).toBe(3);
    expect(payload.discs[0].game_id).toBe(31043);
  });
});

describe('agentDraftErrors', () => {
  it('no se queja de un agente real', () => {
    expect(agentDraftErrors(draftFromAgent(AGENT))).toEqual([]);
  });

  it('pide elegir el agente solo en el alta', () => {
    const draft = emptyAgentDraft();

    expect(agentDraftErrors(draft, { requireGameId: true })).toContain('Elegí un agente.');
    expect(agentDraftErrors(draft)).toEqual([]);
  });

  it('marca los valores fuera de rango', () => {
    const draft = { ...emptyAgentDraft(), game_id: '1041', level: '61', mindscape_level: '7' };
    const errors = agentDraftErrors(draft);

    expect(errors).toContain('El nivel va de 1 a 60.');
    expect(errors).toContain('El mindscape va de 0 a 6.');
  });

  it('exige elegir el W-Engine si el formulario lo tiene abierto', () => {
    const draft = { ...emptyAgentDraft(), wengine: emptyWEngineDraft() };

    expect(agentDraftErrors(draft)).toContain('Elegí un W-Engine o sacalo del formulario.');
  });

  it('exige el set de un disco equipado y detecta substats repetidos', () => {
    const draft = emptyAgentDraft();
    draft.discs[0] = {
      ...draft.discs[0],
      equipped: true,
      substats: [
        { prop_id: '20103', value: '480', rolls: '3' },
        { prop_id: '20103', value: '240', rolls: '1' },
      ],
    };

    const errors = agentDraftErrors(draft);

    expect(errors).toContain('El disco 1: elegí un set.');
    expect(errors).toContain('El disco 1: hay un substat repetido.');
  });

  it('ignora los discos que no están equipados', () => {
    const draft = emptyAgentDraft();
    draft.discs[0] = { ...draft.discs[0], equipped: false, level: '99' };

    expect(agentDraftErrors(draft)).toEqual([]);
  });
});
