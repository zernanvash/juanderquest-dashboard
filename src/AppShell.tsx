import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, LogOut, Menu, X } from 'lucide-react';
import { Link, useRouter } from './router';
import { useAuth } from './auth';
import { canOpenNavItem, findNavItem, visibleNavSections } from './navigation';

const NON_COLLAPSIBLE_SECTIONS = new Set(['overview', 'blockchain']);
const COLLAPSED_STORAGE_KEY = 'jdq_admin_nav_collapsed';

const readCollapsedState = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
};

const isActive = (path: string, itemPath: string): boolean =>
  itemPath === '/' ? path === '/' : path === itemPath || path.startsWith(`${itemPath}/`);

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  const { profile, scope, selectedAreaId, setSelectedAreaId, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(readCollapsedState);
  const travelerUrl = import.meta.env.VITE_TRAVELER_URL || '/app';
  const activeItem = findNavItem(path);
  const sections = visibleNavSections(scope);
  const activeGrant = scope?.grants.find((grant) => grant.area_id === selectedAreaId);
  const activePowers = activeGrant?.powers || scope?.grants.flatMap((grant) => grant.powers) || [];
  const isDeveloper = profile?.role === 'admin' && profile?.admin_scope === 'developer';

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((current) => {
      const next = { ...current, [sectionId]: !current[sectionId] };
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside id="shell-sidebar" className={`shell-sidebar${navOpen ? ' is-open' : ''}`} aria-label="Administration sections">
        <div className="shell-brand">
          <img src="/logo.png" alt="" width="36" height="36" className="shell-brand-logo" />
          <div>
            <p className="shell-brand-name">JuanderQuest</p>
            <p className="shell-brand-sub">Control Room</p>
          </div>
          <button
            type="button"
            className="shell-nav-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="shell-nav">
          {sections.map((section) => {
            const items = section.items.filter((item) => item.available && (!item.developerOnly || isDeveloper));
            if (!items.length) return null;
            const collapsible = !NON_COLLAPSIBLE_SECTIONS.has(section.id);
            const isCollapsed = collapsible && Boolean(collapsedSections[section.id]);
            return (
              <div key={section.id} className="shell-nav-section">
                {collapsible ? (
                  <button
                    type="button"
                    className="shell-nav-toggle"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span>{section.label}</span>
                    {isCollapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                  </button>
                ) : (
                  <p className="shell-nav-label">{section.label}</p>
                )}
                {!isCollapsed ? (
                  <ul>
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(path, item.path);
                      return (
                        <li key={item.path}>
                          <Link
                            to={item.path}
                            className={`shell-nav-link${active ? ' is-active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            title={item.description}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="shell-sidebar-footer">
          <p className="shell-environment">Prototype administration — local-first build</p>
          <a className="shell-traveler-link" href={travelerUrl}>
            <ExternalLink size={14} aria-hidden="true" /> View traveler site
          </a>
        </div>
      </aside>

      {navOpen ? <div className="shell-scrim" aria-hidden="true" onClick={() => setNavOpen(false)} /> : null}

      <div className="shell-body">
        <header className="shell-topbar">
          <button
            type="button"
            className="shell-menu-button"
            aria-expanded={navOpen}
            aria-controls="shell-sidebar"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={18} aria-hidden="true" />
            <span>Menu</span>
          </button>
          <p className="shell-topbar-page">{activeItem?.label ?? 'Control Room'}</p>
          <div className="shell-user">
            {scope && !scope.platform ? <div className="shell-user-meta">
              {scope.grants.length > 1 ? <label>Area <select aria-label="Select area" value={selectedAreaId || ''} onChange={(event) => setSelectedAreaId(event.target.value || null)}>
                <option value="">All my areas</option>
                {scope.grants.map((grant) => <option key={grant.area_id} value={grant.area_id}>{grant.area_name}</option>)}
              </select></label> : <span>{scope.grants[0]?.area_name}</span>}
              <span className="scope-chip">{activePowers.map((power) => power.replace(/_/g, ' ')).join(' · ')}</span>
            </div> : null}
            {profile ? (
              <div className="shell-user-chip">
                <span className="shell-user-avatar" aria-hidden="true">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || 'A').slice(0, 1)}
                </span>
                <span className="shell-user-meta">
                  <span className="shell-user-name">{profile.display_name || 'Administrator'}</span>
                  <span className="shell-user-role">{profile.role === 'area_admin' ? 'Area administrator' : isDeveloper ? 'Developer' : profile.admin_scope === 'platform' ? 'JuanderQuest staff' : 'Administrator'}</span>
                </span>
              </div>
            ) : null}
            <button type="button" className="shell-logout" onClick={() => void signOut()}>
              <LogOut size={15} aria-hidden="true" /> Logout
            </button>
          </div>
        </header>

        <main id="main-content" className="shell-main" tabIndex={-1}>
          <div className="shell-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
