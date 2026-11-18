import { useCallback, useState } from 'react';
import * as routerModule from '../router';

function readHashQuery(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const idx = raw.indexOf('?');
  return new URLSearchParams(idx >= 0 ? raw.slice(idx + 1) : '');
}

function safeOptionalRouter() {
  try {
    const mod = routerModule as { useOptionalRouter?: () => ReturnType<typeof routerModule.useOptionalRouter> };
    return typeof mod.useOptionalRouter === 'function' ? mod.useOptionalRouter() : null;
  } catch {
    return null;
  }
}

/**
 * URL-backed filter state that works both inside <RouterProvider> (updating the hash URL with replaceState)
 * and in isolated component tests rendered without <RouterProvider>.
 */
export function useUrlFilterState(
  paramKey: string,
  defaultValue = '',
): [string, (nextValue: string) => void] {
  const router = safeOptionalRouter();
  const [fallbackValue, setFallbackValue] = useState<string>(() => readHashQuery().get(paramKey) ?? defaultValue);

  const value = router ? (router.query.get(paramKey) ?? defaultValue) : fallbackValue;

  const setValue = useCallback(
    (nextValue: string) => {
      if (router) {
        const params = new URLSearchParams(router.query.toString());
        if (!nextValue || nextValue === defaultValue) {
          params.delete(paramKey);
        } else {
          params.set(paramKey, nextValue);
        }
        const suffix = params.toString();
        router.navigate(`${router.path}${suffix ? `?${suffix}` : ''}`, { replace: true });
      } else {
        setFallbackValue(nextValue);
      }
    },
    [router, paramKey, defaultValue],
  );

  return [value, setValue];
}
