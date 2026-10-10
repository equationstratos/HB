import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Shield,
  ShieldCheck,
  Star,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { api, client } from '../lib/client';
import { useRealtime } from '../lib/realtime';
import { useSession } from '../lib/session';

export function Layout() {
  const { user } = useSession();
  const { connected, soundOn, setSoundOn } = useRealtime();
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: api.admin.overview,
    refetchInterval: 30_000,
  });
  const o = overview.data;
  const alerts = (o?.openSos ?? 0) + (o?.openDeviations ?? 0);

  const links = [
    { to: '/', label: 'Supervision', icon: LayoutDashboard, count: alerts, end: true },
    {
      to: '/missions',
      label: 'Protections',
      icon: CalendarClock,
      count: o?.unassignedMissions ?? 0,
    },
    { to: '/guards', label: 'Gardes', icon: ShieldCheck, count: o?.pendingGuards ?? 0 },
    { to: '/users', label: 'Utilisateurs', icon: Users },
    { to: '/ratings', label: 'Notes', icon: Star },
    { to: '/plans', label: 'Formules', icon: CreditCard },
    { to: '/audit', label: 'Journal d’audit', icon: ScrollText },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Shield size={18} />
          </span>
          <span>
            HB<small>Supervision</small>
          </span>
        </div>
        <nav className="stack tight" aria-label="Navigation principale">
          {links.map(({ to, label, icon: Icon, count, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={17} />
              {label}
              {count ? <span className="count">{count}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="row">
            {connected ? <Wifi size={14} color="#3cc48a" /> : <WifiOff size={14} color="#f2555a" />}
            {connected ? 'Temps réel connecté' : 'Temps réel déconnecté'}
          </div>
          <button
            className="nav-link"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '6px 0',
            }}
            onClick={() => setSoundOn(!soundOn)}
          >
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            Alertes sonores {soundOn ? 'activées' : 'coupées'}
          </button>
          <div className="row" style={{ color: '#fff' }}>
            <span style={{ flex: 1 }}>
              {user?.firstName} {user?.lastName}
            </span>
            <button
              className="icon-btn"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              onClick={() => void client.logout()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        {!connected && user && (
          <div className="banner">
            Connexion temps réel interrompue : les alertes peuvent arriver en retard.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
