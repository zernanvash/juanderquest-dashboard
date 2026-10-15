import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

export interface RouteLocation {
  path: string;
  query: URLSearchParams;
}

const normalizePath = (raw: string): string => {
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const stripped = withSlash.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
};

const parseHash = (): RouteLocation => {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const [pathPart = '/', queryPart = ''] = raw.split('?');
  return { path: normalizePath(pathPart), query: new URLSearchParams(queryPart) };
};

interface RouterValue extends RouteLocation {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<RouteLocation>(parseHash);

  useEffect(() => {
    const sync = () => setLocation(parseHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const target = normalizePath(to.startsWith('#') ? to.slice(1) : to);
    const current = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (target === (current || '/')) {
      setLocation(parseHash());
      return;
    }
    if (options?.replace) {
      window.history.replaceState(null, '', `#${target}`);
    } else {
      window.history.pushState(null, '', `#${target}`);
    }
    setLocation(parseHash());
  }, []);

  const value = useMemo<RouterValue>(() => ({ ...location, navigate }), [location, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useRouter must be used inside RouterProvider');
  return context;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
}

export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${normalizePath(to)}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
