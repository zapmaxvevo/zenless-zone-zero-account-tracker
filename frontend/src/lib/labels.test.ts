import { describe, expect, it } from 'vitest';
import { regionLabel } from './labels';

describe('regionLabel', () => {
  it('traduce los códigos de servidor del backend', () => {
    expect(regionLabel('prod_gf_us')).toBe('América');
    expect(regionLabel('prod_gf_eu')).toBe('Europa');
  });

  it('un servidor desconocido se muestra crudo en vez de inventarle nombre', () => {
    expect(regionLabel('prod_gf_mars')).toBe('prod_gf_mars');
  });

  it('sin servidor no hay etiqueta', () => {
    expect(regionLabel(null)).toBeNull();
  });
});
import {
  agentRankLabel,
  elementLabel,
  nameOr,
  professionLabel,
  rarityLabel,
  skillLabel,
} from './labels';

describe('rarityLabel', () => {
  it('traduce la escala 2..4 al rango por letra que usa el juego', () => {
    expect(rarityLabel(4)).toBe('S');
    expect(rarityLabel(3)).toBe('A');
    expect(rarityLabel(2)).toBe('B');
  });

  it('no inventa una letra para valores fuera de la escala', () => {
    expect(rarityLabel(5)).toBe('R5');
    expect(rarityLabel(1)).toBe('R1');
  });

  it('deja pasar el null de un id que los datos estáticos no resolvieron', () => {
    expect(rarityLabel(null)).toBeNull();
  });
});

describe('agentRankLabel', () => {
  it('para un agente común es el rango de su rareza', () => {
    expect(agentRankLabel(4, 1041)).toBe('S');
    expect(agentRankLabel(3, 1011)).toBe('A');
    expect(agentRankLabel(2, 1121)).toBe('B');
  });

  // Enka le pone rareza 4, igual que a cualquier S; el rango propio solo se sabe por el id.
  it('Pyrois tiene su propio rango, no el de su rareza', () => {
    expect(agentRankLabel(4, 1551)).toBe('I');
  });

  it('un agente sin rareza resuelta sigue sin rango', () => {
    expect(agentRankLabel(null, 1041)).toBeNull();
  });
});

describe('elementLabel y professionLabel', () => {
  it('traducen lo que Enka publica en inglés', () => {
    expect(elementLabel('Fire')).toBe('Fuego');
    expect(elementLabel('AuricInk')).toBe('Tinta áurica');
    expect(professionLabel('Anomaly')).toBe('Anomalía');
  });

  it('traducen también los nombres crudos de los datos estáticos', () => {
    expect(elementLabel('Elec')).toBe('Eléctrico');
    expect(elementLabel('AuricEther')).toBe('Tinta áurica');
    expect(elementLabel('FireFrost')).toBe('Escarcha');
    expect(elementLabel('Lumen')).toBe('Lumiflujo');
    expect(professionLabel('Rupture')).toBe('Ruptura');
  });

  it('muestran crudo un valor nuevo en vez de romperse', () => {
    expect(elementLabel('Plasma')).toBe('Plasma');
    expect(professionLabel('Trickster')).toBe('Trickster');
    expect(professionLabel(null)).toBeNull();
  });
});

describe('skillLabel', () => {
  it('nombra los índices de habilidad de Enka', () => {
    expect(skillLabel('0')).toBe('Ataque básico');
    expect(skillLabel('6')).toBe('Asistencia');
    expect(skillLabel('9')).toBe('Habilidad 9');
  });
});

describe('nameOr', () => {
  it('cae en el id crudo cuando el backend no resolvió el nombre', () => {
    expect(nameOr('Soldier 11', 'Agente', 1041)).toBe('Soldier 11');
    expect(nameOr(null, 'Agente', 1041)).toBe('Agente 1041');
  });
});
