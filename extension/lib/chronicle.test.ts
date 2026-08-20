import { describe, expect, it } from 'vitest';
import {
  buildImportPayload,
  summarizeImport,
  EXTENSION_VERSION,
  type ChroniclePayloads,
} from './chronicle';

describe('buildImportPayload', () => {
  const sections: ChroniclePayloads = {
    index: { role: { nickname: 'proxy' } },
    avatar_basic: { avatar_list: [] },
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
