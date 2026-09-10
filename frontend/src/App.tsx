import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import AppShell from './components/ui/AppShell';
import AccountKeyPage from './pages/AccountKeyPage';
import AccountPage from './pages/AccountPage';
import AgentFormPage from './pages/AgentFormPage';
import AgentPage from './pages/AgentPage';
import BangboosPage from './pages/BangboosPage';
import ChroniclePage from './pages/ChroniclePage';
import HomePage from './pages/HomePage';
import LostVoidPage from './pages/LostVoidPage';
import NotFoundPage from './pages/NotFoundPage';
import RosterPage from './pages/RosterPage';
import TeamEditorPage from './pages/TeamEditorPage';
import TeamsPage from './pages/TeamsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />

          <Route path="/account/:uid" element={<AccountPage />} />
          <Route path="/account/:uid/agents" element={<RosterPage />} />
          <Route path="/account/:uid/agents/new" element={<AgentFormPage />} />
          <Route path="/account/:uid/agents/:agentId" element={<AgentPage />} />
          <Route path="/account/:uid/agents/:agentId/edit" element={<AgentFormPage />} />
          <Route path="/account/:uid/teams" element={<TeamsPage />} />
          <Route path="/account/:uid/teams/new" element={<TeamEditorPage />} />
          <Route path="/account/:uid/teams/:teamId/edit" element={<TeamEditorPage />} />

          <Route path="/account/:uid/key" element={<AccountKeyPage />} />
          <Route path="/account/:uid/chronicle" element={<Navigate to="shiyu" replace />} />
          <Route path="/account/:uid/chronicle/shiyu" element={<ChroniclePage mode="shiyu" />} />
          <Route
            path="/account/:uid/chronicle/assault"
            element={<ChroniclePage mode="assault" />}
          />
          <Route path="/account/:uid/chronicle/void" element={<LostVoidPage />} />
          <Route path="/account/:uid/chronicle/bangboos" element={<BangboosPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
