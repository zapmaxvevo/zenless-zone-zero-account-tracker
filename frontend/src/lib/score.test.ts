import { describe, expect, it } from 'vitest';
import type { AgentRead, DriveDiscRead, StatRead } from '../api/types';
import {
  buildScore,
  discFill,
  discGrade,
  discScore,
  effectiveRolls,
  isKeySub,
  keySubs,
  rosterScore,
  subKey,
} from './score';

function stat(prop_id: number, rolls: number, name: string | null = null): StatRead {
  return { prop_id, name, format: '{0:0.#%}', value: 0, rolls, total: 0 };
}

function disc(substats: StatRead[], slot = 1): DriveDiscRead {
  return {
    slot,
    game_id: 31041,
    set_id: 31000,
    set_name: 'Woodpecker Electro',
    set_icon_url: null,
    rarity: 4,
    level: 15,
    roll_count: 5,
    main_stat: null,
    substats,
  };
}

const AGENT: AgentRead = {
  id: 1,
  account_uid: '1300000000',
  game_id: 1041,
  name: 'Soldier 11',
  icon_url: null,
  rarity: 4,
  profession: 'Attack',
  elements: ['Fire'],
  level: 60,
  promotion_level: 5,
  mindscape_level: 6,
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

describe('subKey', () => {
  it('reconoce las subestadísticas por su prop id de Enka', () => {
    expect(subKey(stat(20103, 0))).toBe('crit');
    expect(subKey(stat(21103, 0))).toBe('critdmg');
    expect(subKey(stat(12102, 0))).toBe('atkp');
    expect(subKey(stat(31203, 0))).toBe('ap');
  });

  it('cae en el nombre crudo si el id no está en la tabla', () => {
    expect(subKey({ prop_id: 999999, name: 'PenDelta' })).toBe('pen');
  });

  it('una propiedad que no puntúa devuelve null', () => {
    expect(subKey({ prop_id: 999999, name: 'CritRes' })).toBeNull();
  });
});

describe('keySubs', () => {
  it('cada especialidad tiene sus cuatro', () => {
    expect(keySubs('Anomaly')).toContain('ap');
    expect(keySubs('Defense')).toContain('defp');
  });

  it('una especialidad desconocida usa las de Ataque', () => {
    expect(keySubs('Ninguna')).toEqual(keySubs('Attack'));
    expect(keySubs(null)).toEqual(keySubs('Attack'));
  });

  it('marca como clave solo lo que le sirve a la especialidad', () => {
    expect(isKeySub(stat(20103, 0), 'Attack')).toBe(true);
    expect(isKeySub(stat(11102, 0), 'Attack')).toBe(false);
    expect(isKeySub(stat(11102, 0), 'Defense')).toBe(true);
  });
});

describe('effectiveRolls', () => {
  it('usa el total de tiradas, que ya incluye la inicial', () => {
    expect(effectiveRolls({ rolls: 1 })).toBe(1);
    expect(effectiveRolls({ rolls: 5 })).toBe(5);
  });

  it('un rolls negativo no resta', () => {
    expect(effectiveRolls({ rolls: -2 })).toBe(0);
  });
});

describe('discScore', () => {
  it('las subestadísticas clave valen entero y el resto un cuarto', () => {
    const clave = discScore(disc([stat(21103, 4)]), 'Attack');
    const relleno = discScore(disc([stat(21103, 4)]), 'Defense');

    expect(clave).toBe(24);
    expect(relleno).toBe(clave / 4);
  });

  it('una subestadística que no puntúa no suma', () => {
    expect(discScore(disc([{ ...stat(0, 5), name: 'CritRes' }]), 'Attack')).toBe(0);
  });

  it('un disco sin substats vale cero', () => {
    expect(discScore(disc([]), 'Attack')).toBe(0);
  });
});

describe('discGrade y discFill', () => {
  it('corta en 42, 32 y 22 sobre el score crudo', () => {
    expect(discGrade(42)).toBe('S');
    expect(discGrade(41)).toBe('A');
    expect(discGrade(32)).toBe('A');
    expect(discGrade(22)).toBe('B');
    expect(discGrade(21)).toBe('C');
  });

  it('la barra se llena contra un disco excelente y no se pasa de 100', () => {
    expect(discFill(55)).toBe(100);
    expect(discFill(80)).toBe(100);
    expect(discFill(0)).toBe(0);
  });
});

describe('buildScore', () => {
  it('mide los seis discos contra seis discos excelentes', () => {
    const bueno = disc([stat(20103, 5), stat(21103, 5)]);
    expect(buildScore([bueno, bueno, bueno, bueno, bueno, bueno], 'Attack')).toBe(100);
  });

  it('media build es media nota: los slots que faltan cuentan cero', () => {
    const uno = disc([stat(20103, 3)]);
    expect(buildScore([uno], 'Attack')).toBe(11);
    expect(buildScore([], 'Attack')).toBe(0);
  });
});

describe('rosterScore', () => {
  it('un agente al tope puntúa 100', () => {
    expect(rosterScore(AGENT)).toBe(100);
  });

  it('sin discos ni W-Engine el score se desploma', () => {
    expect(rosterScore({ ...AGENT, disc_count: 0, wengine: null })).toBe(36);
  });

  it('no se va de escala con valores fuera de rango', () => {
    const score = rosterScore({ ...AGENT, level: 999, disc_count: 99, mindscape_level: 99 });
    expect(score).toBe(100);
  });
});
