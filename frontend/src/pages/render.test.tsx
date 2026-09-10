import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../components/ui/AppShell';
import AccountPage from './AccountPage';
import AgentFormPage from './AgentFormPage';
import AgentPage from './AgentPage';
import BangboosPage from './BangboosPage';
import ChroniclePage from './ChroniclePage';
import AccountKeyPage from './AccountKeyPage';
import HomePage from './HomePage';
import LostVoidPage from './LostVoidPage';
import NotFoundPage from './NotFoundPage';
import RosterPage from './RosterPage';
import TeamEditorPage from './TeamEditorPage';
import TeamsPage from './TeamsPage';

const SCREENS: [string, string, React.ReactElement][] = [
  ['Registro', '/', <HomePage />],
  ['Panel', '/account/1300000000', <AccountPage />],
  ['Roster', '/account/1300000000/agents', <RosterPage />],
  ['Alta de agente', '/account/1300000000/agents/new', <AgentFormPage />],
  ['Build', '/account/1300000000/agents/7', <AgentPage />],
  ['Equipos', '/account/1300000000/teams', <TeamsPage />],
  ['Editor de equipo', '/account/1300000000/teams/new', <TeamEditorPage />],
  ['Shiyu', '/account/1300000000/chronicle/shiyu', <ChroniclePage mode="shiyu" />],
  ['Asalto', '/account/1300000000/chronicle/assault', <ChroniclePage mode="assault" />],
  ['Vacío Perdido', '/account/1300000000/chronicle/void', <LostVoidPage />],
  ['Bangboos', '/account/1300000000/chronicle/bangboos', <BangboosPage />],
  ['Key de la cuenta', '/account/1300000000/key', <AccountKeyPage />],
  ['No encontrado', '/nada', <NotFoundPage />],
];

describe('pantallas', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(SCREENS)('%s se renderiza dentro del shell', (_label, path, element) => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path={path} element={element} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('ne-shell');
    expect(html).toContain('ne-scanlines');
  });
});
