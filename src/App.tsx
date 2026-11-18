import { RouterProvider, useRouter } from './router';
import { AuthProvider, useAuth } from './auth';
import { AppShell } from './AppShell';
import { economyLabEnabled } from './navigation';
import { LoginPage } from './pages/LoginPage';
import { DeniedPage } from './pages/DeniedPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { QuestReviewsPage } from './pages/QuestReviewsPage';
import { DestinationsPage } from './pages/DestinationsPage';
import { QuestsPage } from './pages/QuestsPage';
import { SpotReportsPage } from './pages/SpotReportsPage';
import { SpotPhotosPage } from './pages/SpotPhotosPage';
import { StampsPage } from './pages/StampsPage';
import { PlazaModerationPage } from './pages/PlazaModerationPage';
import { QuizzesPage } from './pages/QuizzesPage';
import { MerchantsPage } from './pages/MerchantsPage';
import { VouchersPage } from './pages/VouchersPage';
import { JuanChoicePage } from './pages/JuanChoicePage';
import { JuanChoicePerksPage } from './pages/JuanChoicePerksPage';
import { JuanChoiceHistoryPage } from './pages/JuanChoiceHistoryPage';
import { FestivalCalendarPage } from './pages/FestivalCalendarPage';
import { AffiliatesPage } from './pages/AffiliatesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AreaAdminsPage } from './pages/AreaAdminsPage';
import { canOpenNavItem, findNavItem } from './navigation';
import { GovernancePage } from './pages/GovernancePage';
import { EconomyLabPage } from './pages/EconomyLabPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { ChainPage } from './pages/ChainPage';
import { FundingPage } from './pages/FundingPage';
import { FundingDetailPage } from './pages/FundingDetailPage';
import { MerchantFundingPage } from './pages/MerchantFundingPage';
import { GiveMjdqPage } from './pages/GiveMjdqPage';
import { ShopCosmeticsPage } from './pages/ShopCosmeticsPage';
import { ShopCosmeticEditorPage } from './pages/ShopCosmeticEditorPage';
import { TrailStudioPage } from './pages/TrailStudioPage';
import { DeveloperRolesPage } from './pages/DeveloperRolesPage';

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
  const { scope } = useAuth();
  const navItem = findNavItem(path);
  if (navItem && !canOpenNavItem(navItem, scope)) return <section className="stitch-panel notice-panel"><p className="eyebrow">Access denied</p><h1>Not available for your area</h1><p>Your account does not have permission to open this section.</p></section>;

  switch (path) {
    case '/':
      return <OverviewPage />;
    case '/submissions':
      return <SubmissionsPage />;
    case '/quest-reviews':
      return <QuestReviewsPage />;
    case '/destinations':
      return <DestinationsPage />;
    case '/area-admins':
      return <AreaAdminsPage />;
    case '/quests':
      return <QuestsPage />;
    case '/spot-reports':
      return <SpotReportsPage />;
    case '/spot-photos':
      return <SpotPhotosPage />;
    case '/stamps':
      return <StampsPage />;
    case '/plaza-moderation':
      return <PlazaModerationPage />;
    case '/quizzes':
      return <QuizzesPage />;
    case '/juanchoice':
      return <JuanChoicePage />;
    case '/juanchoice/perks':
      return <JuanChoicePerksPage />;
    case '/juanchoice/history':
      return <JuanChoiceHistoryPage />;
    case '/festivals':
      return <FestivalCalendarPage />;
    case '/partners/affiliates':
      return <AffiliatesPage />;
    case '/partners/merchants':
      return <MerchantsPage />;
    case '/partners/vouchers':
      return <VouchersPage />;
    case '/shop/cosmetics':
      return <ShopCosmeticsPage />;
    case '/shop/cosmetics/new':
    case '/shop/cosmetics/edit':
      return <ShopCosmeticEditorPage />;
    case '/trails':
      return <TrailStudioPage />;
    case '/economy/funding':
      return <FundingPage />;
    case '/economy/merchants-funding':
      return <MerchantFundingPage />;
    case '/economy/give-mjdq':
      return <GiveMjdqPage />;
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
    case '/system/developer':
      return <DeveloperRolesPage />;
    case '/system/economy-lab':
      return economyLabEnabled ? <EconomyLabPage /> : <NotFoundPage />;
    default:
      if (path.startsWith('/economy/funding/')) {
        const planId = decodeURIComponent(path.slice('/economy/funding/'.length));
        if (planId && !planId.includes('/')) return <FundingDetailPage planId={planId} />;
      }
      return <NotFoundPage />;
  }
}
