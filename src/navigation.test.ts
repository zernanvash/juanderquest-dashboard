import { describe, expect, it } from 'vitest';
import { canOpenNavItem, findNavItem, visibleNavSections } from './navigation';

describe('area administrator navigation policy', () => {
  const areaScope = { platform: false, grants: [{ area_id: 'pangasinan', area_name: 'Pangasinan', powers: ['destinations', 'analytics'] }] };

  it('shows only granted destinations and analytics sections and blocks platform deep links', () => {
    const visible = visibleNavSections(areaScope).flatMap((section) => section.items.map((item) => item.path));
    expect(visible).toContain('/destinations');
    expect(visible).toContain('/spot-reports');
    expect(visible).toContain('/insights/analytics');
    expect(visible).not.toContain('/chain');
    expect(visible).not.toContain('/area-admins');
    expect(canOpenNavItem(findNavItem('/chain'), areaScope)).toBe(false);
    expect(canOpenNavItem(findNavItem('/area-admins'), areaScope)).toBe(false);
  });

  it('shows quizzes and the merchant pages only with their powers (phase 3)', () => {
    const merchantScope = { platform: false, grants: [{ area_id: 'pangasinan', area_name: 'Pangasinan', powers: ['quests_quizzes', 'merchants_vouchers'] }] };
    const visible = visibleNavSections(merchantScope).flatMap((section) => section.items.map((item) => item.path));
    expect(visible).toEqual(expect.arrayContaining(['/quizzes', '/partners/affiliates', '/partners/merchants', '/partners/vouchers']));
    expect(visible).not.toContain('/destinations');
    expect(visible).not.toContain('/quest-reviews');
    expect(visible).not.toContain('/shop/cosmetics');
    const destinationsOnly = visibleNavSections(areaScope).flatMap((section) => section.items.map((item) => item.path));
    expect(destinationsOnly).not.toContain('/quizzes');
    expect(destinationsOnly).not.toContain('/partners/vouchers');
  });

  it('keeps every section and the area-admin page available to platform admins', () => {
    const platformScope = { platform: true, grants: [] };
    expect(canOpenNavItem(findNavItem('/area-admins'), platformScope)).toBe(true);
    expect(visibleNavSections(platformScope).flatMap((section) => section.items).length).toBeGreaterThan(10);
  });

  it('denies users without an administrator scope', () => {
    expect(visibleNavSections(null)).toEqual([]);
    expect(canOpenNavItem(findNavItem('/destinations'), null)).toBe(false);
  });

  it('prefers exact nested nav items over parent prefixes', () => {
    expect(findNavItem('/juanchoice')?.path).toBe('/juanchoice');
    expect(findNavItem('/juanchoice/perks')?.path).toBe('/juanchoice/perks');
    expect(findNavItem('/juanchoice/history')?.path).toBe('/juanchoice/history');
    expect(findNavItem('/shop/cosmetics/new')?.path).toBe('/shop/cosmetics');
  });

  it('opens /partners/merchant-claims and /merchant-claims for destinations or merchants_vouchers grants', () => {
    expect(canOpenNavItem(findNavItem('/partners/merchant-claims'), areaScope)).toBe(true);
    expect(canOpenNavItem(findNavItem('/merchant-claims'), areaScope)).toBe(true);
    const merchOnly = { platform: false, grants: [{ area_id: 'pangasinan', area_name: 'Pangasinan', powers: ['merchants_vouchers'] }] };
    expect(canOpenNavItem(findNavItem('/partners/merchant-claims'), merchOnly)).toBe(true);
    const analyticsOnly = { platform: false, grants: [{ area_id: 'pangasinan', area_name: 'Pangasinan', powers: ['analytics'] }] };
    expect(canOpenNavItem(findNavItem('/partners/merchant-claims'), analyticsOnly)).toBe(false);
  });
});
