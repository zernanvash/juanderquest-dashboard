import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  Coins,
  Compass,
  Flag,
  FlaskConical,
  LayoutDashboard,
  MapPin,
  Settings2,
  ShieldAlert,
  Store,
  Ticket,
  Vote,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  available: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const economyLabEnabled =
  import.meta.env.DEV && import.meta.env.VITE_JDQ_ECONOMY_LAB === 'true';

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        path: '/',
        label: 'Operations overview',
        icon: LayoutDashboard,
        description: 'Pending work, queue health and quick actions.',
        available: true,
      },
    ],
  },
  {
    id: 'traveler-operations',
    label: 'Traveler operations',
    items: [
      {
        path: '/submissions',
        label: 'Proof submissions',
        icon: ClipboardCheck,
        description: 'Review GPS-backed quest proof and manage the verification queue.',
        available: true,
      },
      {
        path: '/quest-reviews',
        label: 'Quest attempt reviews',
        icon: Award,
        description: 'Multi-task attempt moderation and per-task photo/evidence approval queue.',
        available: true,
      },
      {
        path: '/destinations',
        label: 'Destinations',
        icon: Compass,
        description: 'Published catalog, crowd capacity bands and emergency suppression.',
        available: true,
      },
      {
        path: '/quests',
        label: 'Quests',
        icon: MapPin,
        description: 'Read-only oversight of active and authored quests.',
        available: true,
      },
      {
        path: '/quizzes',
        label: 'Cultural quizzes',
        icon: BookOpen,
        description: 'Location-bound quizzes granting Explorer XP, with draft authoring and lifecycle controls.',
        available: true,
      },
      {
        path: '/spot-reports',
        label: 'Destination reports',
        icon: Flag,
        description: 'Traveler-submitted destination reports, read-only until a resolution policy exists.',
        available: true,
      },
      {
        path: '/plaza-moderation',
        label: 'Plaza moderation',
        icon: ShieldAlert,
        description: 'Review reported Plaza comments, resolve traveler flags, and moderate social activities.',
        available: true,
      },
    ],
  },
  {
    id: 'juanchoice',
    label: 'JuanChoice',
    items: [
      {
        path: '/juanchoice',
        label: 'Promotional voting',
        icon: Award,
        description: 'Campaigns, monthly schedules, candidates and promotion assessments.',
        available: true,
      },
    ],
  },
  {
    id: 'partners',
    label: 'Partners',
    items: [
      {
        path: '/partners/affiliates',
        label: 'Affiliate applications',
        icon: Building2,
        description: 'Review merchant affiliation requests and provision workspaces.',
        available: true,
      },
      {
        path: '/partners/merchants',
        label: 'Merchants',
        icon: Store,
        description: 'Read-only directory and inspection of provisioned merchant workspaces.',
        available: true,
      },
      {
        path: '/partners/vouchers',
        label: 'Merchant vouchers',
        icon: Ticket,
        description: 'Current voucher offers available to travelers.',
        available: true,
      },
    ],
  },
  {
    id: 'economy-operations',
    label: 'Economy operations',
    items: [
      {
        path: '/economy/funding',
        label: 'Quest funding',
        icon: Coins,
        description: 'Inspect simulated quest funding, merchant point credits and reconciliation; close rounds safely.',
        available: true,
      },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      {
        path: '/insights/analytics',
        label: 'Web analytics',
        icon: BarChart3,
        description: 'Web telemetry counters with explicit source labels.',
        available: true,
      },
      {
        path: '/insights/governance',
        label: 'Governance archive',
        icon: Vote,
        description: 'Historical governance records retained for inspection. JuanChoice is the active voting engine.',
        available: true,
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        path: '/system/status',
        label: 'Service health',
        icon: Activity,
        description: 'Read-only readiness, release metadata and effective feature flags.',
        available: true,
      },
      {
        path: '/system/settings',
        label: 'Settings',
        icon: Settings2,
        description: 'Approved low-risk settings with server validation, revision checks and audit.',
        available: true,
      },
      {
        path: '/system/economy-lab',
        label: 'Local economy lab',
        icon: FlaskConical,
        description: 'Simulated Explorer Coin observation. Development builds only.',
        available: economyLabEnabled,
      },
    ],
  },
];

export const findNavItem = (path: string): NavItem | null => {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.path === path || (item.path !== '/' && path.startsWith(`${item.path}/`))) return item;
    }
  }
  return null;
};
