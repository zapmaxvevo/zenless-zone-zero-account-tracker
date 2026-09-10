import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { describeError, isRateLimited } from '../api/errors';
import type { AccountRead, AgentRead, TeamRead } from '../api/types';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { useAgentArt } from '../hooks/useAgentArt';
import { useCountdown } from '../hooks/useCountdown';
import { elementIcon, professionIcon } from '../lib/icons';
import { agentRankLabel, elementLabel, nameOr, professionLabel, regionLabel } from '../lib/labels';
import { elementColor, elementsColor, rankColor } from '../lib/palette';
import type { ScoredAgent } from '../lib/score';
import { rosterScore } from '../lib/score';
import { formatCountdown, formatDateTime } from '../lib/time';
import AccountTiles from './AccountTiles';
import TeamRow from './TeamRow';
import Banner from './ui/Banner';
import Button, { LinkButton } from './ui/Button';
import Hero from './ui/Hero';
import IconTag from './ui/IconTag';
import PortraitCard from './ui/PortraitCard';
import SectionHead from './ui/SectionHead';
import StatBox from './ui/StatBox';

const EMPTY = '—';

const TOP_BUILDS = 3;
const TOP_TEAMS = 2;

interface SyncNotice {
  title: string;
  text: string;
  tone: 'info' | 'warn';
}

interface AccountDashboardProps {
  account: AccountRead;
  access: AccountAccess;
  agents: AgentRead[];
  teams: TeamRead[];
  onSynced: () => void;
}

export default function AccountDashboard({
  account,
  access,
  agents,
  teams,
  onSynced,
}: AccountDashboardProps) {
  const { art } = useAgentArt();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<SyncNotice | null>(null);
  const remaining = useCountdown(account.next_sync_available_at);
  const onCooldown = remaining > 0;

  const scored = useMemo<ScoredAgent[]>(
    () =>
      agents
        .map((agent) => ({ agent, score: rosterScore(agent) }))
        .sort((left, right) => right.score - left.score),
    [agents],
  );

  const uid = account.uid;
  const name = account.nickname || `UID ${uid}`;
  const best = scored[0] ?? null;
  const score = scored.length
    ? Math.round(scored.reduce((total, entry) => total + entry.score, 0) / scored.length)
    : null;

  async function handleSync() {
    setSyncing(true);
    setNotice(null);
    try {
      await api.syncAccount(uid);
      onSynced();
    } catch (caught) {
      const paused = isRateLimited(caught);
      setNotice({
        title: paused ? 'Sincronización en pausa' : 'No se pudo sincronizar',
        text: describeError(caught),
        tone: paused ? 'warn' : 'info',
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <Hero
        size="lg"
        watermark={name.split(' ').join('\n')}
        art={best ? art(best.agent.game_id) : null}
      >
        <span className="ne-eyebrow">Proxy // Hollow Special Ops</span>
        <h2 className="ne-display ne-display-xl">{name}</h2>

        <span className="ne-label ne-label-lg">
          Nivel Inter-Knot {account.level} · {quantity(account.agent_count, 'agente', 'agentes')} ·{' '}
          {quantity(teams.length, 'equipo', 'equipos')}
        </span>

        {account.signature && <p className="ne-prose">{account.signature}</p>}

        <div className="ne-grid-stats">
          <StatBox label="UID" value={uid} />
          <StatBox label="Servidor" value={regionLabel(account.region) ?? EMPTY} />
          <StatBox label="Última sincronización" value={formatDateTime(account.last_synced_at)} />
        </div>

        <div className="ne-actions">
          <LinkButton tone="accent" to={`/account/${uid}/agents`}>
            Ver roster
          </LinkButton>
          <LinkButton to={`/account/${uid}/teams`}>Armar equipo</LinkButton>
          <Button onClick={() => void handleSync()} disabled={syncing || onCooldown}>
            {syncing
              ? 'Sincronizando…'
              : onCooldown
                ? `Disponible en ${formatCountdown(remaining)}`
                : 'Sincronizar'}
          </Button>
          <LinkButton to={`/account/${uid}/key`}>
            {access.canWrite ? 'Key de la cuenta' : 'Modo lectura'}
          </LinkButton>
        </div>
      </Hero>

      {notice && (
        <Banner title={notice.title} tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}

      <AccountTiles account={account} agents={agents} score={score} />

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead
          title="Mejores builds"
          action={
            <LinkButton size="sm" to={`/account/${uid}/agents`}>
              Ver los {account.agent_count}
            </LinkButton>
          }
        />

        {scored.length === 0 ? (
          <p className="ne-empty">Todavía no hay agentes sincronizados</p>
        ) : (
          <div className="ne-grid-builds">
            {scored.slice(0, TOP_BUILDS).map(({ agent, score: build }) => (
              <BuildCard key={agent.id} uid={uid} agent={agent} score={build} art={art} />
            ))}
          </div>
        )}
      </section>

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead
          title="Equipos guardados"
          count={teams.length}
          action={
            <LinkButton size="sm" to={`/account/${uid}/teams`}>
              Ver equipos
            </LinkButton>
          }
        />

        {teams.length === 0 ? (
          <p className="ne-empty">Ningún equipo guardado</p>
        ) : (
          <div className="ne-stack">
            {teams.slice(0, TOP_TEAMS).map((team) => (
              <TeamRow key={team.id} team={team} art={art} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function quantity(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface BuildCardProps {
  uid: string;
  agent: AgentRead;
  score: number;
  art: (gameId: number) => string | null;
}

function BuildCard({ uid, agent, score, art }: BuildCardProps) {
  const rank = agentRankLabel(agent.rarity, agent.game_id);
  const profession = professionLabel(agent.profession);

  return (
    <PortraitCard
      to={`/account/${uid}/agents/${agent.id}`}
      name={nameOr(agent.name, 'Agente', agent.game_id)}
      art={art(agent.game_id)}
      fallback={agent.game_id}
      rank={rank}
      rankColor={rankColor(rank)}
      elementColor={elementsColor(agent.elements)}
      elementIcon={agent.elements[0] ? elementIcon(agent.elements[0]) : null}
      meta={`Nv. ${agent.level} · M${agent.mindscape_level}`}
      tags={
        <span className="ne-tag-row">
          {agent.elements.map((each) => (
            <IconTag
              key={each}
              icon={elementIcon(each)}
              label={elementLabel(each)}
              tint={elementColor(each)}
            />
          ))}
          {profession && <IconTag icon={professionIcon(agent.profession)} label={profession} />}
        </span>
      }
      score={score}
      footNote={agent.wengine?.name ?? 'Sin W-Engine'}
    />
  );
}
