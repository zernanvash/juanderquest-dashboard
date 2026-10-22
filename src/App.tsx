import { RouterProvider, useRouter } from './router';
import { AuthProvider, useAuth } from './auth';
import { AppShell } from './AppShell';
import { economyLabEnabled } from './navigation';
import { LoginPage } from './pages/LoginPage';
import { DeniedPage } from './pages/DeniedPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { DestinationsPage } from './pages/DestinationsPage';
import { QuestsPage } from './pages/QuestsPage';
import { SpotReportsPage } from './pages/SpotReportsPage';
import { PlazaModerationPage } from './pages/PlazaModerationPage';
import { QuizzesPage } from './pages/QuizzesPage';
import { MerchantsPage } from './pages/MerchantsPage';
import { VouchersPage } from './pages/VouchersPage';
import { JuanChoicePage } from './pages/JuanChoicePage';
import { AffiliatesPage } from './pages/AffiliatesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { GovernancePage } from './pages/GovernancePage';
import { EconomyLabPage } from './pages/EconomyLabPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { ChainPage } from './pages/ChainPage';
import { FundingPage } from './pages/FundingPage';

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </RouterProvider>
  );
}

function AppRoot() {
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <div className="login-screen">
        <div className="stitch-panel login-panel login-checking" role="status">
          <img src="/logo.png" alt="" className="login-logo" />
          <p className="login-copy">Checking administrator session…</p>
        </div>
      </div>
    );
  }

  if (status === 'anonymous' || status === 'unavailable') return <LoginPage />;
  if (status === 'denied') return <DeniedPage />;

  return (
    <AppShell>
      <RouteOutlet />
    </AppShell>
  );
}

function RouteOutlet() {
  const { path } = useRouter();

  switch (path) {
    case '/':
      return <OverviewPage />;
    case '/submissions':
      return <SubmissionsPage />;
    case '/destinations':
      return <DestinationsPage />;
    case '/quests':
      return <QuestsPage />;
    case '/spot-reports':
      return <SpotReportsPage />;
    case '/plaza-moderation':
      return <PlazaModerationPage />;
    case '/quizzes':
      return <QuizzesPage />;
    case '/juanchoice':
      return <JuanChoicePage />;
    case '/partners/affiliates':
      return <AffiliatesPage />;
    case '/partners/merchants':
      return <MerchantsPage />;
    case '/partners/vouchers':
      return <VouchersPage />;
    case '/economy/funding':
      return <FundingPage />;
    case '/insights/analytics':
      return <AnalyticsPage />;
    case '/insights/governance':
      return <GovernancePage />;
    case '/chain':
      return <ChainPage />;
    case '/system/status':
      return <SystemStatusPage />;
    case '/system/settings':
      return <SettingsPage />;
    case '/system/economy-lab':
      return economyLabEnabled ? <EconomyLabPage /> : <NotFoundPage />;
    default:
      return <NotFoundPage />;
  }
}
