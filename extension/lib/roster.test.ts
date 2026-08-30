import { describe, expect, it } from 'vitest';
import {
  agentsToFetch,
  collectBuilds,
  nextSnapshot,
  parseSnapshot,
  readRoster,
  type RosterAgent,
} from './roster';

const roster: RosterAgent[] = [
  { id: 1091, level: 60, rank: 1, name: 'Anby' },
  { id: 1311, level: 50, rank: 0, name: 'Ben' },
  { id: 1321, level: 60, rank: 6, name: 'Koleda' },
];

describe('readRoster', () => {
  it('lee id, nivel, mindscape y nombre del avatar_list', () => {
    expect(
      readRoster({
        avatar_list: [{ id: 1091, level: 60, rank: 1, name_mi18n: 'Anby' }],
      }),
    ).toEqual([{ id: 1091, level: 60, rank: 1, name: 'Anby' }]);
  });

  it('un roster vacío o ausente no rompe', () => {
    expect(readRoster(null)).toEqual([]);
    expect(readRoster(undefined)).toEqual([]);
    expect(readRoster({})).toEqual([]);
    expect(readRoster({ avatar_list: [] })).toEqual([]);
  });

  it('ignora las entradas sin id numérico y tolera campos faltantes', () => {
    expect(readRoster({ avatar_list: [{ name_mi18n: 'roto' }, { id: 1091 }] })).toEqual([
      { id: 1091, level: 0, rank: 0 },
    ]);
  });
});

describe('agentsToFetch', () => {
  it('sin snapshot pide el roster entero (primer import)', () => {
    expect(agentsToFetch(roster, {})).toEqual([1091, 1311, 1321]);
  });

  it('sin cambios no pide nada', () => {
    const snapshot = {
      '1091': { level: 60, rank: 1 },
      '1311': { level: 50, rank: 0 },
      '1321': { level: 60, rank: 6 },
    };
    expect(agentsToFetch(roster, snapshot)).toEqual([]);
  });

  it('pide sólo el agente nuevo', () => {
    const snapshot = { '1091': { level: 60, rank: 1 }, '1311': { level: 50, rank: 0 } };
    expect(agentsToFetch(roster, snapshot)).toEqual([1321]);
  });

  it('pide el que subió de nivel', () => {
    const snapshot = {
      '1091': { level: 60, rank: 1 },
      '1311': { level: 40, rank: 0 },
      '1321': { level: 60, rank: 6 },
    };
    expect(agentsToFetch(roster, snapshot)).toEqual([1311]);
  });

  it('pide el que subió de mindscape aunque el nivel no cambie', () => {
    const snapshot = {
      '1091': { level: 60, rank: 0 },
      '1311': { level: 50, rank: 0 },
      '1321': { level: 60, rank: 6 },
    };
    expect(agentsToFetch(roster, snapshot)).toEqual([1091]);
  });

  it('con reimportAll ignora el snapshot y pide todo', () => {
    const snapshot = {
      '1091': { level: 60, rank: 1 },
      '1311': { level: 50, rank: 0 },
      '1321': { level: 60, rank: 6 },
    };
    expect(agentsToFetch(roster, snapshot, { reimportAll: true })).toEqual([1091, 1311, 1321]);
  });

  it('un roster vacío no pide nada, ni siquiera con reimportAll', () => {
    expect(agentsToFetch([], {})).toEqual([]);
    expect(agentsToFetch([], {}, { reimportAll: true })).toEqual([]);
  });
});

describe('nextSnapshot', () => {
  it('avanza la marca de los agentes cuya build viajó', () => {
    expect(nextSnapshot({ previous: {}, roster, fetchedIds: [1091, 1311, 1321] })).toEqual({
      '1091': { level: 60, rank: 1 },
      '1311': { level: 50, rank: 0 },
      '1321': { level: 60, rank: 6 },
    });
  });

  it('el que falló conserva la marca vieja, así se vuelve a pedir', () => {
    const previous = {
      '1091': { level: 50, rank: 1 },
      '1311': { level: 50, rank: 0 },
      '1321': { level: 60, rank: 6 },
    };
    const snapshot = nextSnapshot({ previous, roster, fetchedIds: [1311, 1321] });
    expect(snapshot['1091']).toEqual({ level: 50, rank: 1 });
    expect(agentsToFetch(roster, snapshot)).toEqual([1091]);
  });

  it('un agente nuevo que falló no entra al snapshot', () => {
    const previous = { '1091': { level: 60, rank: 1 }, '1311': { level: 50, rank: 0 } };
    const snapshot = nextSnapshot({ previous, roster, fetchedIds: [] });
    expect(snapshot).not.toHaveProperty('1321');
    expect(agentsToFetch(roster, snapshot)).toEqual([1321]);
  });

  it('el que no se pidió porque no cambió mantiene su marca', () => {
    const previous = {
      '1091': { level: 60, rank: 1 },
      '1311': { level: 50, rank: 0 },
      '1321': { level: 60, rank: 6 },
    };
    expect(nextSnapshot({ previous, roster, fetchedIds: [] })).toEqual(previous);
  });

  it('un agente que ya no está en el roster se cae del snapshot', () => {
    const previous = { '1091': { level: 60, rank: 1 }, '9999': { level: 1, rank: 0 } };
    const snapshot = nextSnapshot({ previous, roster: [roster[0]!], fetchedIds: [] });
    expect(snapshot).toEqual({ '1091': { level: 60, rank: 1 } });
  });
});

describe('collectBuilds', () => {
  it('acumula un payload por respuesta OK', () => {
    expect(
      collectBuilds([
        { id: 1091, data: { avatar_list: [{ id: 1091 }] } },
        { id: 1311, data: { avatar_list: [{ id: 1311 }] } },
      ]),
    ).toEqual({
      payloads: [{ avatar_list: [{ id: 1091 }] }, { avatar_list: [{ id: 1311 }] }],
      fetchedIds: [1091, 1311],
    });
  });

  it('un fallo parcial no invalida a los demás y no marca al que falló', () => {
    const collected = collectBuilds([
      { id: 1091, data: { avatar_list: [{ id: 1091 }] } },
      { id: 1311, data: null },
      { id: 1321, data: { avatar_list: [{ id: 1321 }] } },
    ]);
    expect(collected.payloads).toHaveLength(2);
    expect(collected.fetchedIds).toEqual([1091, 1321]);
    // Y por lo tanto el que falló se vuelve a pedir en el próximo import.
    const snapshot = nextSnapshot({ previous: {}, roster, fetchedIds: collected.fetchedIds });
    expect(agentsToFetch(roster, snapshot)).toEqual([1311]);
  });

  it('sin resultados no manda nada', () => {
    expect(collectBuilds([])).toEqual({ payloads: [], fetchedIds: [] });
  });
});

describe('parseSnapshot', () => {
  it('acepta lo que guardó un import anterior', () => {
    expect(parseSnapshot({ '1091': { level: 60, rank: 1 } })).toEqual({
      '1091': { level: 60, rank: 1 },
    });
  });

  it('descarta basura de storage sin romper el import', () => {
    expect(parseSnapshot(undefined)).toEqual({});
    expect(parseSnapshot('nope')).toEqual({});
    expect(parseSnapshot([1, 2])).toEqual({});
    expect(parseSnapshot({ '1091': { level: '60', rank: 1 }, '1311': null })).toEqual({});
  });
});
