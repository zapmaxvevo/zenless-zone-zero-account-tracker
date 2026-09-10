import type { WEngineRead } from '../api/types';
import { nameOr, rarityLabel } from '../lib/labels';
import StatusMessage from './StatusMessage';

export default function BuildWEngine({ wengine }: { wengine: WEngineRead | null }) {
  if (!wengine) return <StatusMessage kind="empty">Sin W-Engine equipado.</StatusMessage>;

  const rank = rarityLabel(wengine.rarity);

  return (
    <div className="ne-build-list">
      <div className="ne-section-title">
        <span className="ne-tick ne-tick-sm" aria-hidden="true" />
        <span className="ne-display ne-display-sm">
          {nameOr(wengine.name, 'W-Engine', wengine.game_id)}
        </span>
      </div>
      <span className="ne-label">
        Nv.{wengine.level} · Fase {wengine.phase}
      </span>
      <span className="ne-label">
        Mod. {wengine.modification_level}
        {rank && ` · Rango ${rank}`}
      </span>
    </div>
  );
}
