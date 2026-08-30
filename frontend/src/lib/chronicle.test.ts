import { describe, expect, it } from 'vitest';
import type { ChallengeEntryRead, ChallengeRunRead } from '../api/types';
import {
  bangbooRankLabel,
  formatClearTime,
  formatRankPercent,
  groupEntriesByLayer,
  groupRunsByMode,
  layerSummary,
} from './chronicle';

function entry(overrides: Partial<ChallengeEntryRead> = {}): ChallengeEntryRead {
  return {
    position: 1,
    layer_index: 1,
    layer_id: 101,
    name: 'Piso',
    rating: 'S',
    score: 100,
    max_score: 100,
    stars: 3,
    clear_time_seconds: 120,
    challenged_at: '2026-08-01T10:00:00Z',
    boss_name: 'Notorious',
    boss_icon: '',
    buffs: [],
    agents: [],
    bangboo_id: null,
    ...overrides,
  };
}

function run(overrides: Partial<ChallengeRunRead> = {}): ChallengeRunRead {
  return {
    id: 1,
    account_uid: '1300000000',
    mode: 'shiyu_defense',
    schedule_id: 10,
    begin_time: '2026-08-01T00:00:00Z',
    end_time: '2026-08-15T00:00:00Z',
    rating: 'S',
    score: 100,
    max_score: 100,
    total_stars: 9,
    rank_percent: 2.5,
    clear_time_seconds: 272,
    schema_version: '1',
    synced_at: '2026-08-10T00:00:00Z',
    entries: [],
    ...overrides,
  };
}

describe('formatClearTime', () => {
  it('muestra minutos y segundos', () => {
    expect(formatClearTime(272)).toBe('4 min 32 s');
    expect(formatClearTime(3661)).toBe('61 min 1 s');
  });

  it('omite los minutos abajo del minuto y los segundos cuando son cero', () => {
    expect(formatClearTime(58)).toBe('58 s');
    expect(formatClearTime(0)).toBe('0 s');
    expect(formatClearTime(300)).toBe('5 min');
  });

  it('devuelve el guion si el Chronicle no trae el tiempo', () => {
    expect(formatClearTime(null)).toBe('—');
    expect(formatClearTime(-5)).toBe('—');
  });
});

describe('formatRankPercent', () => {
  it('arma el percentil con coma decimal', () => {
    expect(formatRankPercent(2.5)).toBe('Top 2,5%');
    expect(formatRankPercent(10)).toBe('Top 10%');
    expect(formatRankPercent(0.8)).toBe('Top 0,8%');
    expect(formatRankPercent(0.16)).toBe('Top 0,2%');
  });

  it('devuelve el guion si la temporada no tiene ranking', () => {
    expect(formatRankPercent(null)).toBe('—');
  });
});

describe('groupRunsByMode', () => {
  it('deja solo el modo pedido, de la temporada más nueva a la más vieja', () => {
    const vieja = run({ id: 1, begin_time: '2026-06-01T00:00:00Z' });
    const nueva = run({ id: 2, begin_time: '2026-08-01T00:00:00Z' });
    const asalto = run({ id: 3, mode: 'deadly_assault', begin_time: '2026-07-01T00:00:00Z' });

    expect(groupRunsByMode([vieja, asalto, nueva], 'shiyu_defense').map((item) => item.id)).toEqual(
      [2, 1],
    );
    expect(
      groupRunsByMode([vieja, asalto, nueva], 'deadly_assault').map((item) => item.id),
    ).toEqual([3]);
  });

  it('manda al final las corridas sin fecha de inicio', () => {
    const conFecha = run({ id: 1, begin_time: '2026-06-01T00:00:00Z' });
    const sinFecha = run({ id: 2, begin_time: null });

    expect(groupRunsByMode([sinFecha, conFecha], 'shiyu_defense').map((item) => item.id)).toEqual([
      1, 2,
    ]);
  });

  it('no toca la lista original', () => {
    const runs = [run({ id: 1, begin_time: '2026-06-01T00:00:00Z' }), run({ id: 2 })];
    groupRunsByMode(runs, 'shiyu_defense');
    expect(runs.map((item) => item.id)).toEqual([1, 2]);
  });
});

describe('groupEntriesByLayer', () => {
  it('agrupa por capa de mayor a menor y ordena por posición', () => {
    const entries = [
      entry({ layer_index: 1, position: 2 }),
      entry({ layer_index: 2, position: 1 }),
      entry({ layer_index: 1, position: 1 }),
    ];

    expect(
      groupEntriesByLayer(entries).map((group) => [
        group.layerIndex,
        group.entries.map((item) => item.position),
      ]),
    ).toEqual([
      [2, [1]],
      [1, [1, 2]],
    ]);
  });

  it('junta al final, sin etiqueta, los pisos que no declaran capa', () => {
    const entries = [entry({ layer_index: null, position: 2 }), entry({ layer_index: 3 })];
    const groups = groupEntriesByLayer(entries);

    expect(groups.map((group) => group.layerIndex)).toEqual([3, null]);
    expect(groups[1].entries).toHaveLength(1);
  });

  it('sin pisos no devuelve grupos', () => {
    expect(groupEntriesByLayer([])).toEqual([]);
  });
});

describe('layerSummary', () => {
  it('suma las estrellas de cada capa', () => {
    const entries = [
      entry({ layer_index: 1, stars: 3 }),
      entry({ layer_index: 1, position: 2, stars: 2 }),
      entry({ layer_index: 2, stars: 3 }),
    ];

    expect(layerSummary(entries)).toEqual({ 1: 5, 2: 3 });
  });

  it('ignora los pisos sin capa', () => {
    expect(layerSummary([entry({ layer_index: null, stars: 3 })])).toEqual({});
  });
});

describe('bangbooRankLabel', () => {
  it('usa la escala de rangos del juego', () => {
    expect(bangbooRankLabel(4)).toBe('S');
    expect(bangbooRankLabel(3)).toBe('A');
    expect(bangbooRankLabel(2)).toBe('B');
    expect(bangbooRankLabel(null)).toBeNull();
  });
});
