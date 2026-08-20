import type { DriveDiscRead } from '../api/types';
import { nameOr, rarityLabel } from '../lib/labels';
import { gradeLetterColor, rarityColor } from '../lib/palette';
import { discFill, discGrade, discScore, effectiveRolls, isKeySub } from '../lib/score';
import { formatStat, statLabel } from '../lib/stats';

/** Seis marquitas por substat: las tiradas que un disco de nivel 15 puede llegar a tener. */
const PIPS = [0, 1, 2, 3, 4, 5];

interface DiscCardProps {
  /** Casillero de la grilla: sin disco la card se dibuja igual, vacía (regla 11). */
  slot: number;
  disc: DriveDiscRead | null;
  /** Especialidad del agente: decide qué subestadísticas suman al score. */
  profession: string | null;
  /** Color del elemento del agente, para el borde del stat principal (regla 7). */
  elementColor: string;
}

export default function DiscCard({ slot, disc, profession, elementColor }: DiscCardProps) {
  if (!disc) {
    return (
      <article className="ne-disc ne-cut ne-cut-md">
        <header className="ne-build-disc-head">
          <span className="ne-slot ne-slot-empty">{slot}</span>
          <span className="ne-label ne-label-sm">Sin equipar</span>
        </header>
        <div className="ne-empty">Slot vacío</div>
      </article>
    );
  }

  const score = discScore(disc, profession);
  const letter = discGrade(score);
  const noteColor = gradeLetterColor(letter);
  const rarity = rarityLabel(disc.rarity);
  const setName =
    disc.set_id === null ? `Disco ${disc.game_id}` : nameOr(disc.set_name, 'Set', disc.set_id);

  return (
    <article className="ne-disc ne-cut ne-cut-md" style={{ ['--grade' as string]: noteColor }}>
      <header className="ne-build-disc-head">
        <span className="ne-slot">{slot}</span>
        {disc.set_icon_url && <img className="ne-build-disc-icon" src={disc.set_icon_url} alt="" />}
        <div className="ne-build-disc-id">
          <span className="ne-value">{setName}</span>
          <span className="ne-label ne-label-sm" style={{ color: rarityColor(disc.rarity) }}>
            Rango {rarity ?? '—'} · +{disc.level}
          </span>
        </div>
        <div className="ne-build-disc-score">
          <span className="ne-figure ne-figure-md" style={{ color: noteColor }}>
            {score}
          </span>
          <span className="ne-label ne-label-sm" style={{ color: noteColor }}>
            {letter}
          </span>
        </div>
      </header>

      <div className="ne-disc-main" style={{ ['--element' as string]: elementColor }}>
        <span className="ne-label">
          {disc.main_stat ? statLabel(disc.main_stat) : 'Sin stat principal'}
        </span>
        <span
          className={disc.main_stat ? 'ne-value ne-value-lg ne-accent' : 'ne-value ne-value-lg'}
        >
          {disc.main_stat ? formatStat(disc.main_stat) : '—'}
        </span>
      </div>

      <div className="ne-build-subs">
        {disc.substats.map((substat) => (
          <div
            key={substat.prop_id}
            className={isKeySub(substat, profession) ? 'ne-sub is-key' : 'ne-sub'}
          >
            <span className="ne-sub-label">{statLabel(substat)}</span>
            <span className="ne-pips" aria-hidden="true">
              {PIPS.map((pip) => (
                <span
                  key={pip}
                  className={pip < effectiveRolls(substat) ? 'ne-pip is-on' : 'ne-pip'}
                />
              ))}
            </span>
            <span className="ne-sub-value">{formatStat(substat)}</span>
          </div>
        ))}
        {disc.substats.length === 0 && <div className="ne-empty">Sin substats</div>}
      </div>

      <div className="ne-bar" aria-hidden="true">
        <span style={{ ['--fill' as string]: noteColor, width: `${discFill(score)}%` }} />
      </div>
    </article>
  );
}
