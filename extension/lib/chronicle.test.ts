import { describe, expect, it } from 'vitest';
import {
  buildImportPayload,
  recordCardSection,
  summarizeImport,
  EXTENSION_VERSION,
  type ChroniclePayloads,
} from './chronicle';

describe('buildImportPayload', () => {
  const sections: ChroniclePayloads = {
    record_card: { game_role_id: '1500123456', nickname: 'proxy', level: 60 },
    index: { role: { nickname: 'proxy' } },
    avatar_basic: { avatar_list: [] },
    avatar_info: [{ avatar_list: [{ id: 1091 }] }, { avatar_list: [{ id: 1311 }] }],
    buddy_info: { list: [] },
    shiyu_defense: { '1': { hadal_ver: 'v2' }, '2': null },
    deadly_assault: { '1': { zone_id: 5 } },
    lost_void: { abyss_level: 1 },
  };

  it('arma el contrato completo del import', () => {
    const payload = buildImportPayload({
      region: 'prod_gf_eu',
      language: 'en-us',
      sections,
      capturedAt: new Date('2026-08-19T12:00:00Z'),
    });
    expect(payload.source).toBe('extension');
    expect(payload.extension_version).toBe(EXTENSION_VERSION);
    expect(payload.captured_at).toBe('2026-08-19T12:00:00.000Z');
    expect(payload.region).toBe('prod_gf_eu');
    expect(payload.language).toBe('en-us');
    expect(payload.payloads).toEqual(sections);
  });

  it('cada valor es el data ya desenvuelto, no el sobre retcode/message', () => {
    const payload = buildImportPayload({ region: 'r', language: 'l', sections });
    expect(payload.payloads.index).not.toHaveProperty('retcode');
    expect(payload.payloads.shiyu_defense?.['1']).toEqual({ hadal_ver: 'v2' });
  });

  it('un endpoint que falló viaja como null y uno no pedido no aparece', () => {
    const payload = buildImportPayload({
      region: 'prod_gf_us',
      language: 'en-us',
      sections: { index: { ok: true }, buddy_info: null },
    });
    expect(payload.payloads.buddy_info).toBeNull();
    expect('avatar_basic' in payload.payloads).toBe(false);
    expect('avatar_info' in payload.payloads).toBe(false);
    expect('lost_void' in payload.payloads).toBe(false);
  });

  it('sin capturedAt usa ahora, en ISO con Z', () => {
    const payload = buildImportPayload({ region: 'r', language: 'l', sections: {} });
    expect(payload.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('summarizeImport', () => {
  it('resume agentes, bangboos y runs', () => {
    expect(
      summarizeImport({
        agents_synced: 12,
        bangboos_synced: 5,
        runs: [{}, {}],
        lost_void_synced: true,
      }),
    ).toBe('Importado: 12 agentes, 5 bangboos, 2 runs, Lost Void');
  });

  it('lista lo saltado y lo que vino sin datos', () => {
    expect(
      summarizeImport({
        agents_synced: 0,
        skipped_sections: ['buddy_info'],
        unavailable_modes: ['deadly_assault'],
      }),
    ).toBe(
      'Importado: 0 agentes, 0 bangboos, 0 runs — secciones saltadas: buddy_info — sin datos: deadly_assault',
    );
  });
});

describe('recordCardSection', () => {
  const zzz = {
    game_id: 8,
    game_role_id: '1500123456',
    nickname: 'proxy',
    region: 'prod_gf_eu',
    level: 60,
    is_public: true,
    has_role: true,
  };

  it('recorta la entrada de ZZZ a los campos que el tracker usa', () => {
    expect(recordCardSection({ list: [{ ...zzz, region_name: 'Europe', data: [] }] })).toEqual({
      game_role_id: '1500123456',
      nickname: 'proxy',
      region: 'prod_gf_eu',
      level: 60,
      is_public: true,
      has_role: true,
    });
  });

  it('con varios juegos manda sólo ZZZ: las otras cuentas del usuario no viajan', () => {
    const section = recordCardSection({
      list: [
        { game_id: 2, game_role_id: '700000001', nickname: 'viajero', level: 58 },
        zzz,
        { game_id: 6, game_role_id: '800000002', nickname: 'trailblazer', level: 70 },
      ],
    });
    expect(section).toEqual({
      game_role_id: '1500123456',
      nickname: 'proxy',
      region: 'prod_gf_eu',
      level: 60,
      is_public: true,
      has_role: true,
    });
    expect(JSON.stringify(section)).not.toContain('viajero');
    expect(JSON.stringify(section)).not.toContain('trailblazer');
  });

  it('sin cuenta de ZZZ o sin card devuelve null: la sección es opcional', () => {
    expect(recordCardSection({ list: [{ game_id: 2, nickname: 'viajero' }] })).toBeNull();
    expect(recordCardSection({ list: [] })).toBeNull();
    expect(recordCardSection(null)).toBeNull();
    expect(recordCardSection({})).toBeNull();
  });

  it('omite los campos que la card no trajo en vez de mandarlos undefined', () => {
    expect(recordCardSection({ list: [{ game_id: 8, game_role_id: '1500123456' }] })).toEqual({
      game_role_id: '1500123456',
    });
  });
});
