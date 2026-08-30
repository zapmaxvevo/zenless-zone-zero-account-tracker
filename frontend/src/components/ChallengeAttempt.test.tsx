import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChallengeEntryRead } from '../api/types';
import ChallengeAttempt from './ChallengeAttempt';

const ENTRY: ChallengeEntryRead = {
  position: 1,
  layer_index: 7,
  layer_id: 70,
  name: 'Capa 7 · Nodo crítico',
  rating: 'S',
  score: 3400,
  max_score: 4000,
  stars: 2,
  clear_time_seconds: 272,
  challenged_at: '2026-08-01T18:30:00Z',
  boss_name: 'Marionette Ritter',
  boss_icon: '',
  buffs: [{ title: 'Sheer Force', text: 'Sheer DMG increases by 20%.', icon: '' }],
  agents: [
    { game_id: 1041, level: 60, rarity: 'S', element: '201', mindscape: 2, icon: '' },
    { game_id: 1091, level: 55, rarity: 'A', element: '203', mindscape: 0, icon: '' },
  ],
  bangboo_id: 53001,
};

function render(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

describe('ChallengeAttempt', () => {
  it('muestra el piso, las métricas, los buffs y el equipo', () => {
    const html = render(
      <ChallengeAttempt
        entry={ENTRY}
        mode="shiyu"
        agentName={(gameId) => (gameId === 1041 ? 'Soldier 11' : `Agente ${gameId}`)}
        bangbooName="Amillion"
      />,
    );

    expect(html).toContain('Capa 7 · Nodo crítico');
    expect(html).toContain('Jefe: Marionette Ritter');
    expect(html).toContain('3400');
    expect(html).toContain('4 min 32 s');
    expect(html).toContain('Sheer Force');
    expect(html).toContain('Sheer DMG increases by 20%.');
    expect(html).toContain('Soldier 11');
    expect(html).toContain('Nv.60 · M2 · S');
    expect(html).toContain('Amillion');
  });

  it('prende una estrella por estrella ganada y ninguna más', () => {
    const html = render(<ChallengeAttempt entry={ENTRY} mode="shiyu" />);

    expect(html.split('ne-star is-on').length - 1).toBe(2);
    expect(html).toContain('2 de 3 estrellas');
  });

  it('en Asalto no hay rating y la subline es solo la fecha', () => {
    const html = render(<ChallengeAttempt entry={{ ...ENTRY, rating: '' }} mode="assault" />);

    expect(html).not.toContain('ne-figure-md');
    expect(html).not.toContain('Jefe:');
  });

  it('sin buffs no dibuja el bloque, y sin bangboo lo dice', () => {
    const html = render(
      <ChallengeAttempt entry={{ ...ENTRY, buffs: [], bangboo_id: null }} mode="shiyu" />,
    );

    expect(html).not.toContain('ne-buffs');
    expect(html).toContain('Sin bangboo');
  });

  it('cae en el game id cuando la página no resolvió los nombres', () => {
    const html = render(<ChallengeAttempt entry={ENTRY} mode="shiyu" />);

    expect(html).toContain('Agente 1041');
  });
});
