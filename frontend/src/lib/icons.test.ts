import { describe, expect, it } from 'vitest';
import { attackIcon, elementIcon, professionIcon, rankIcon, skillIcon } from './icons';
import { SKILL_KEYS } from './labels';

describe('elementIcon', () => {
  it('resuelve todos los atributos que traduce labels.ts', () => {
    for (const element of ['Physics', 'Fire', 'Ice', 'Electric', 'Ether', 'Frost', 'AuricInk']) {
      expect(elementIcon(element), element).not.toBeNull();
    }
  });

  it('parte el CamelCase de Enka para dar con el archivo', () => {
    expect(elementIcon('AuricInk')).toContain('auric-ink');
  });

  it('resuelve los alias con los que Enka publica el mismo atributo', () => {
    expect(elementIcon('Elec')).toBe(elementIcon('Electric'));
    expect(elementIcon('AuricEther')).toBe(elementIcon('AuricInk'));
    expect(elementIcon('FireFrost')).toBe(elementIcon('Frost'));
  });

  it('devuelve null para un atributo que la wiki todavía no tiene', () => {
    expect(elementIcon('Quantum')).toBeNull();
  });
});

describe('professionIcon y attackIcon', () => {
  it('resuelven las seis especialidades', () => {
    for (const p of ['Attack', 'Stun', 'Anomaly', 'Support', 'Defense', 'Rupture']) {
      expect(professionIcon(p), p).not.toBeNull();
    }
  });

  it('resuelven los tres tipos de ataque', () => {
    for (const a of ['Slash', 'Strike', 'Pierce']) {
      expect(attackIcon(a), a).not.toBeNull();
    }
  });

  it('dejan pasar el null de un agente sin especialidad conocida', () => {
    expect(professionIcon(null)).toBeNull();
    expect(attackIcon(null)).toBeNull();
  });
});

describe('rankIcon', () => {
  it('busca por la letra que ya resolvieron rarityLabel y agentRankLabel', () => {
    expect(rankIcon('S')).toContain('/s');
    expect(rankIcon('A')).toContain('/a');
    expect(rankIcon('B')).toContain('/b');
  });

  it('cubre el rango propio de Pyrois, que no está en la escala 2..4', () => {
    expect(rankIcon('I')).toContain('/i');
  });

  it('no inventa un icono para un rango que no existe', () => {
    expect(rankIcon('R5')).toBeNull();
    expect(rankIcon(null)).toBeNull();
  });
});

describe('skillIcon', () => {
  it('cubre todos los índices de habilidad que usa la app', () => {
    for (const key of SKILL_KEYS) {
      expect(skillIcon(key), key).not.toBeNull();
    }
  });

  it('devuelve null para el índice 4, que el juego no usa', () => {
    expect(skillIcon('4')).toBeNull();
  });
});
