import { describe, expect, it } from 'vitest';
import {
  elementColor,
  elementsColor,
  grade,
  gradeColor,
  gradeLabel,
  gradeLetterColor,
  initials,
  rankColor,
  rarityColor,
} from './palette';

describe('elementColor', () => {
  it('traduce las claves que publica Enka', () => {
    expect(elementColor('Fire')).toBe('var(--element-fire)');
    expect(elementColor('Electric')).toBe('var(--element-electric)');
    expect(elementColor('AuricInk')).toBe('var(--element-ether)');
  });

  it('escarcha comparte el celeste del hielo', () => {
    expect(elementColor('Frost')).toBe(elementColor('Ice'));
  });

  it('acepta los nombres crudos de los datos estáticos de Enka', () => {
    expect(elementColor('Elec')).toBe('var(--element-electric)');
    expect(elementColor('AuricEther')).toBe(elementColor('Ether'));
    expect(elementColor('FireFrost')).toBe(elementColor('Ice'));
    expect(elementColor('ZhenZhenAssault')).toBe(elementColor('Physics'));
  });

  it('cubre los atributos que la app todavía no había visto', () => {
    expect(elementColor('Wind')).toBe('var(--element-wind)');
    expect(elementColor('Lumen')).toBe('var(--element-lumiflux)');
  });

  it('traduce el código numérico que manda HoYoLAB', () => {
    expect(elementColor('203')).toBe('var(--element-electric)');
    expect(elementColor('300')).toBe('var(--element-lumiflux)');
  });

  it('un atributo desconocido no rompe la pantalla', () => {
    expect(elementColor('Plasma')).toBe('var(--border-strong)');
    expect(elementColor(null)).toBe('var(--border-strong)');
  });
});

describe('elementsColor', () => {
  it('manda el primero de la lista', () => {
    expect(elementsColor(['Ice', 'Fire'])).toBe('var(--element-ice)');
  });

  it('sin atributos cae en el gris de borde', () => {
    expect(elementsColor([])).toBe('var(--border-strong)');
    expect(elementsColor(undefined)).toBe('var(--border-strong)');
  });
});

describe('rankColor y rarityColor', () => {
  it('usa la escala de letras del juego', () => {
    expect(rankColor('S')).toBe('var(--rank-s)');
    expect(rankColor('a')).toBe('var(--rank-a)');
  });

  it('el rango propio de Pyrois toma el dorado de la S, como su icono', () => {
    expect(rankColor('I')).toBe('var(--rank-s)');
  });

  it('convierte la rareza cruda con la misma escala 2..4', () => {
    expect(rarityColor(4)).toBe('var(--rank-s)');
    expect(rarityColor(3)).toBe('var(--rank-a)');
    expect(rarityColor(2)).toBe('var(--rank-b)');
  });

  it('una rareza fuera de escala no inventa color', () => {
    expect(rarityColor(5)).toBe('var(--border-strong)');
    expect(rarityColor(null)).toBe('var(--border-strong)');
  });
});

describe('grade', () => {
  it('corta en 88, 72 y 50', () => {
    expect(grade(100)).toBe('S');
    expect(grade(88)).toBe('S');
    expect(grade(87)).toBe('A');
    expect(grade(72)).toBe('A');
    expect(grade(71)).toBe('B');
    expect(grade(50)).toBe('B');
    expect(grade(49)).toBe('C');
  });

  it('la etiqueta y el color siguen a la letra', () => {
    expect(gradeLabel(90)).toBe('Rango S');
    expect(gradeColor(90)).toBe('var(--rank-s)');
    expect(gradeColor(60)).toBe(gradeLetterColor('B'));
  });
});

describe('initials', () => {
  it('toma la inicial de las dos primeras palabras', () => {
    expect(initials('Ellen Joe')).toBe('EJ');
    expect(initials('Marioneta del Titiritero')).toBe('MD');
  });

  it('con una sola palabra toma sus dos primeras letras', () => {
    expect(initials('Anby')).toBe('AN');
  });

  it('sin nombre devuelve un relleno en vez de romper', () => {
    expect(initials('   ')).toBe('??');
  });
});
