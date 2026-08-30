import type { CSSProperties, ReactNode } from 'react';
import type { ChallengeAgentRead, ChallengeEntryRead } from '../api/types';
import { formatClearTime } from '../lib/chronicle';
import { elementColor, initials, rankColor } from '../lib/palette';
import { formatDateTime } from '../lib/time';
import '../styles/chronicle.css';

interface ChallengeAttemptProps {
  entry: ChallengeEntryRead;
  /** Shiyu puntúa con rating y nombra al jefe aparte; Asalto no tiene rating. */
  mode: 'shiyu' | 'assault';
  /** Nombre del agente por game id; sin catálogo queda el id crudo. */
  agentName?: (gameId: number) => string;
  /** Nombre del bangboo, ya cruzado por la página con el roster de bangboos. */
  bangbooName?: string | null;
}

const STAR_SLOTS = [0, 1, 2];

/** Un intento del Chronicle: quién lo jugó, contra qué y con qué buffs. */
export default function ChallengeAttempt({
  entry,
  mode,
  agentName,
  bangbooName = null,
}: ChallengeAttemptProps) {
  const buffs = entry.buffs.map(readBuff).filter((buff) => buff !== null);
  const boss = entry.boss_name || entry.name;

  return (
    <article className="ne-attempt ne-cut ne-cut-md">
      <div className="ne-attempt-head">
        <span className="ne-attempt-boss" aria-hidden="true">
          {entry.boss_icon ? <img src={entry.boss_icon} alt="" loading="lazy" /> : initials(boss)}
        </span>

        <div className="ne-attempt-title">
          <span className="ne-value ne-value-lg ne-attempt-name">{entry.name}</span>
          <span className="ne-label ne-label-sm">{subline(entry, mode)}</span>
        </div>

        <div className="ne-attempt-metrics">
          {mode === 'shiyu' && entry.rating && (
            <Metric label="Rating">
              <span className="ne-figure ne-figure-md" style={{ color: ratingColor(entry.rating) }}>
                {entry.rating}
              </span>
            </Metric>
          )}

          <Metric label="Estrellas">
            <span className="ne-stars" aria-label={`${entry.stars} de 3 estrellas`}>
              {STAR_SLOTS.map((slot) => (
                <span
                  key={slot}
                  className={slot < entry.stars ? 'ne-star is-on' : 'ne-star'}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
            </span>
          </Metric>

          <Metric label="Score">
            <span className="ne-value ne-value-lg">
              {entry.score} <span style={{ color: 'var(--text-dim)' }}>/ {entry.max_score}</span>
            </span>
          </Metric>

          <Metric label="Combate">
            <span className="ne-value ne-value-lg">
              {formatClearTime(entry.clear_time_seconds)}
            </span>
          </Metric>
        </div>
      </div>

      {buffs.length > 0 && (
        <div className="ne-buffs">
          {buffs.map((buff, index) => (
            <p key={`${buff.title}-${index}`} className="ne-prose">
              {buff.title && <span className="ne-buff-title">{buff.title}</span>}
              {buff.title && buff.text && ' — '}
              {buff.text}
            </p>
          ))}
        </div>
      )}

      <div className="ne-squad">
        {entry.agents.map((agent) => (
          <SquadChip
            key={agent.game_id}
            agent={agent}
            name={agentName ? agentName(agent.game_id) : `Agente ${agent.game_id}`}
          />
        ))}

        <div className="ne-bangboo-slot">
          <span className="ne-label ne-label-sm">Bangboo //</span>
          <span className="ne-value">
            {bangbooName ?? (entry.bangboo_id === null ? 'Sin bangboo' : `#${entry.bangboo_id}`)}
          </span>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ne-metric">
      {children}
      <span className="ne-label ne-label-sm">{label}</span>
    </div>
  );
}

function SquadChip({ agent, name }: { agent: ChallengeAgentRead; name: string }) {
  // HoYoLAB manda `element_type` numérico (`"201"`); lo traduce `lib/elements.ts`.
  const style: CSSProperties = {
    ['--rank' as string]: rankColor(agent.rarity),
    ['--element' as string]: elementColor(agent.element),
  };

  return (
    <div className="ne-squad-chip">
      <span className="ne-squad-face" style={style} aria-hidden="true">
        {agent.icon ? <img src={agent.icon} alt="" loading="lazy" /> : initials(name)}
      </span>
      <span className="ne-squad-body">
        <span className="ne-value">{name}</span>
        <span className="ne-label ne-label-sm">
          Nv.{agent.level} · M{agent.mindscape} · {agent.rarity || '—'}
        </span>
      </span>
    </div>
  );
}

/** `S+` es el techo de Shiyu, no una cuarta letra: comparte el amarillo de la S. */
function ratingColor(rating: string): string {
  return rankColor(rating.replace('+', ''));
}

function subline(entry: ChallengeEntryRead, mode: 'shiyu' | 'assault'): string {
  const date = formatDateTime(entry.challenged_at);
  if (mode === 'assault' || !entry.boss_name) return date;
  return `${date} · Jefe: ${entry.boss_name}`;
}

/** Los buffs vienen crudos del Chronicle: `{title, text, icon}`, con las tres claves opcionales. */
function readBuff(buff: Record<string, unknown>): { title: string; text: string } | null {
  const title = typeof buff.title === 'string' ? buff.title : '';
  const text = typeof buff.text === 'string' ? buff.text : '';
  return title || text ? { title, text } : null;
}
