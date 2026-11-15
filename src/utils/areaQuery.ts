/** Plan 92b: list reads follow the area switcher (`?area_id=`); no area means every area in scope. */
export const withArea = (path: string, areaId: string | null | undefined): string =>
  areaId ? `${path}${path.includes('?') ? '&' : '?'}area_id=${encodeURIComponent(areaId)}` : path;
