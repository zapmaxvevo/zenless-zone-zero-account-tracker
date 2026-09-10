import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError, isRateLimited } from '../api/errors';
import type { AccountRead, AgentRead, TeamRead } from '../api/types';
import StatusMessage from '../components/StatusMessage';
import Banner from '../components/ui/Banner';
import Button, { LinkButton } from '../components/ui/Button';
import Face from '../components/ui/Face';
import Hero from '../components/ui/Hero';
import IconTag from '../components/ui/IconTag';
import PortraitCard from '../components/ui/PortraitCard';
import SectionHead from '../components/ui/SectionHead';
import Tile from '../components/ui/Tile';
import { useAccountAccess } from '../hooks/useAccountAccess';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { useAgentArt } from '../hooks/useAgentArt';
import { useApi } from '../hooks/useApi';
import { useCountdown } from '../hooks/useCountdown';
import { elementIcon, professionIcon } from '../lib/icons';
import { agentRankLabel, elementLabel, nameOr, professionLabel, regionLabel } from '../lib/labels';
import {
  elementColor,
  elementsColor,
  gradeColor,
  gradeLabel,
  initials,
  rankColor,
} from '../lib/palette';
import type { ScoredAgent } from '../lib/score';
import { rosterScore } from '../lib/score';
import { useSync } from '../lib/syncContext';
import { formatCountdown, formatDateTime } from '../lib/time';

const EMPTY = '—';

const TOP_BUILDS = 3;
const TOP_TEAMS = 2;

export default function AccountPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();
  const [refresh, setRefresh] = useState(0);

  const key = `${uid}:${version}:${refresh}`;
  const account = useApi(() => api.getAccount(uid), key);
  const agents = useApi(() => api.listAgents(uid), key);
  const teams = useApi(() => api.listTeams(uid), key);
  const access = useAccountAccess(uid, account.data);

  return (
    <div className="ne-stack">
      {account.loading && <StatusMessage kind="loading">Cargando la cuenta…</StatusMessage>}

      {!account.loading && account.error && (
        <StatusMessage kind="error" onRetry={account.reload}>
          {account.error}
        </StatusMessage>
      )}

      {account.data && (
        <Dashboard
          account={account.data}
          access={access}
          agents={agents.data?.items ?? []}
          teams={teams.data?.items ?? []}
          onSynced={() => setRefresh((token) => token + 1)}
        />
      )}
    </div>
  );
}

function quantity(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface SyncNotice {
  title: string;
  text: string;
  tone: 'info' | 'warn';
}

interface DashboardProps {
  account: AccountRead;
  access: AccountAccess;
  agents: AgentRead[];
  teams: TeamRead[];
  onSynced: () => void;
}

function Dashboard({ account, access, agents, teams, onSynced }: DashboardProps) {
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

      <Tiles account={account} agents={agents} score={score} />

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
            {scored.slice(0, TOP_BUILDS).map(({ agent, score: build }) => {
              const rank = agentRankLabel(agent.rarity, agent.game_id);
              const profession = professionLabel(agent.profession);

              return (
                <PortraitCard
                  key={agent.id}
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
                      {profession && (
                        <IconTag icon={professionIcon(agent.profession)} label={profession} />
                      )}
                    </span>
                  }
                  score={build}
                  footNote={agent.wengine?.name ?? 'Sin W-Engine'}
                />
              );
            })}
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

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps) {
  return (
    <div className="ne-stat-box">
      <span className="ne-label ne-label-sm">{label}</span>
      <span className="ne-value">{value}</span>
    </div>
  );
}

interface TilesProps {
  account: AccountRead;
  agents: AgentRead[];
  score: number | null;
}

function Tiles({ account, agents, score }: TilesProps) {
  const roster = agents.length;
  const topRank = agents.filter((agent) => agent.rarity === 4).length;
  const discs = agents.reduce((total, agent) => total + agent.disc_count, 0);
  const withoutEngine = agents.filter((agent) => agent.wengine === null).length;
  const level = roster
    ? Math.round(agents.reduce((total, agent) => total + agent.level, 0) / roster)
    : null;

  return (
    <div className="ne-grid-tiles">
      <div className="ne-tile ne-tile-ink ne-tile-ring ne-cut ne-cut-md">
        <span
          className="ne-ring"
          style={{ ['--ring-turn' as string]: `${(score ?? 0) / 100}turn` }}
        >
          <span className="ne-figure ne-figure-md">{score ?? EMPTY}</span>
        </span>
        <span className="ne-tile-ring-body">
          <span className="ne-label ne-label-sm">Score de cuenta</span>
          <span
            className="ne-label"
            style={score === null ? undefined : { color: gradeColor(score) }}
          >
            {score === null ? EMPTY : gradeLabel(score)}
          </span>
        </span>
      </div>

      <Tile
        label="Agentes"
        value={account.agent_count}
        note={roster ? `${topRank} en rango S` : EMPTY}
      />
      <Tile
        label="Discos"
        value={roster ? discs : EMPTY}
        note={
          roster ? (withoutEngine ? `${withoutEngine} sin W-Engine` : 'Todos con W-Engine') : EMPTY
        }
      />
      <Tile label="Nivel medio" value={level ?? EMPTY} note="Tope 60" />
    </div>
  );
}

interface TeamRowProps {
  team: TeamRead;
  art: (gameId: number) => string | null;
}

function TeamRow({ team, art }: TeamRowProps) {
  const members = [...team.members].sort((left, right) => left.slot - right.slot);
  const score = members.length
    ? Math.round(
        members.reduce((total, member) => total + rosterScore(member.agent), 0) / members.length,
      )
    : null;

  return (
    <article className="ne-row ne-cut ne-cut-lg">
      <Flares color={elementsColor(members[0]?.agent.elements)} />

      <div className="ne-row-body is-flared">
        <div className="ne-row-main">
          <h4 className="ne-display ne-display-sm">{team.name}</h4>
          <span className="ne-label">
            {members.length} de 3 slots{team.notes && ` · ${team.notes}`}
          </span>
        </div>

        <div className="ne-faces">
          {members.map((member) => (
            <Face
              key={member.slot}
              art={art(member.agent.game_id)}
              fallback={initials(nameOr(member.agent.name, 'Agente', member.agent.game_id))}
              ring={elementsColor(member.agent.elements)}
              size={42}
            />
          ))}
        </div>

        <div className="ne-row-figure">
          <span className="ne-label ne-label-sm">Score</span>
          <span className="ne-figure ne-figure-md ne-accent">{score ?? EMPTY}</span>
        </div>
      </div>
    </article>
  );
}

function Flares({ color }: { color: string }) {
  return (
    <span aria-hidden="true">
      <span
        className="ne-row-flare"
        style={{ left: '-4px', width: '7px', ['--flare' as string]: color, opacity: 0.9 }}
      />
      <span
        className="ne-row-flare"
        style={{ left: '10px', width: '4px', ['--flare' as string]: color, opacity: 0.55 }}
      />
      <span
        className="ne-row-flare"
        style={{ left: '19px', width: '2px', ['--flare' as string]: color, opacity: 0.32 }}
      />
    </span>
  );
}
