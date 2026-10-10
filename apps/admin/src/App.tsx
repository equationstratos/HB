import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { AuditPage } from './pages/AuditPage';
import { GuardDetailPage } from './pages/GuardDetailPage';
import { GuardsPage } from './pages/GuardsPage';
import { LivePage } from './pages/LivePage';
import { LoginPage } from './pages/LoginPage';
import { MissionDetailPage } from './pages/MissionDetailPage';
import { MissionsPage } from './pages/MissionsPage';
import { PlansPage } from './pages/PlansPage';
import { RatingsPage } from './pages/RatingsPage';
import { UsersPage } from './pages/UsersPage';
import { RealtimeProvider } from './lib/realtime';
import { useSession } from './lib/session';

export function App() {
  const { user, restoring } = useSession();
  if (restoring) return <Loading label="Reprise de la session…" />;
  if (!user || user.role !== 'ADMIN') return <LoginPage />;

  return (
    <RealtimeProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LivePage />} />
          <Route path="missions" element={<MissionsPage />} />
          <Route path="missions/:id" element={<MissionDetailPage />} />
          <Route path="guards" element={<GuardsPage />} />
          <Route path="guards/:userId" element={<GuardDetailPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="ratings" element={<RatingsPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  );
}
