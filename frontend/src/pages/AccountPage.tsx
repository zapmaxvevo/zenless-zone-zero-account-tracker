import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import AccountDashboard from '../components/AccountDashboard';
import AsyncSection from '../components/ui/AsyncSection';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';

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
      <AsyncSection state={account} loading="Cargando la cuenta…" />

      {account.data && (
        <AccountDashboard
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
