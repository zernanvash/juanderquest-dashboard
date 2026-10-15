import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(scriptDir, '..');
const outputDir = path.resolve(dashboardRoot, '..', 'docs', '07-testing', 'assets', '2026-10-14-admin-acceptance');
const PORT = 4178;
const BASE = `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
];

const ZOOM_VIEWPORTS = [
  { name: '320@200', width: 160, height: 568 },
  { name: '390@200', width: 195, height: 844 },
  { name: '768@200', width: 384, height: 1024 },
  { name: '1024@200', width: 512, height: 768 },
  { name: '1440@200', width: 720, height: 900 },
];

const PAGES = [
  { route: '/', name: 'overview', heading: 'Operations overview' },
  { route: '/submissions', name: 'submissions', heading: 'Proof submissions' },
  { route: '/destinations', name: 'destinations', heading: 'Destinations' },
  { route: '/quizzes', name: 'quizzes', heading: 'Cultural quizzes' },
  { route: '/partners/merchants', name: 'merchants', heading: 'Merchants' },
  { route: '/system/settings', name: 'settings', heading: 'Settings' },
  { route: '/system/status', name: 'status', heading: 'Service health' },
  { route: '/juanchoice', name: 'juanchoice', heading: 'JuanChoice' },
];

const adminProfile = {
  id: 'restart-check-admin',
  seed_id: 'admin-1',
  display_name: 'Tourism Officer Admin',
  email: 'admin@pangasinan.gov.ph',
  role: 'admin',
};

const settingsFixture = {
  revision: 4,
  updated_by: adminProfile.id,
  updated_at: '2026-10-14T09:00:00Z',
  values: {
    support_contact_email: 'tourism@pangasinan.gov.ph',
    support_help_url: 'https://juanderquest.app/help',
    announcement_message: 'Cultural quiz pilot is live.',
    quiz_default_language: 'en',
    quiz_default_radius_meters: 300,
    quiz_default_time_limit_minutes: 30,
    quiz_default_cooldown_hours: 24,
    quiz_default_xp_reward: 25,
  },
  definitions: [
    { key: 'support_contact_email', label: 'Public support contact email', category: 'branding_support', type: 'email', defaultValue: '', maxLength: 255, restartRequired: false, description: 'Shown on approved support surfaces.' },
    { key: 'support_help_url', label: 'Approved help link', category: 'branding_support', type: 'url', defaultValue: '', maxLength: 500, restartRequired: false, description: 'HTTPS link to the approved traveler help page.' },
    { key: 'announcement_message', label: 'Operator announcement', category: 'branding_support', type: 'text', defaultValue: '', maxLength: 280, restartRequired: false, description: 'Plain-text announcement. HTML is rejected.' },
    { key: 'quiz_default_language', label: 'Default quiz language', category: 'quiz_defaults', type: 'string', defaultValue: 'en', allowedValues: ['en', 'fil', 'ilo', 'pag'], restartRequired: false, description: 'Applies to new quiz drafts only.' },
    { key: 'quiz_default_radius_meters', label: 'Default quiz start radius (m)', category: 'quiz_defaults', type: 'integer', defaultValue: 200, min: 100, max: 1000, restartRequired: false, description: 'Applies to new quiz drafts only.' },
    { key: 'quiz_default_time_limit_minutes', label: 'Default quiz time limit (minutes)', category: 'quiz_defaults', type: 'integer', defaultValue: 30, min: 5, max: 120, restartRequired: false, description: 'Applies to new quiz drafts only.' },
    { key: 'quiz_default_cooldown_hours', label: 'Default quiz cooldown after failure (hours)', category: 'quiz_defaults', type: 'integer', defaultValue: 24, min: 1, max: 168, restartRequired: false, description: 'Applies to new quiz drafts only.' },
    { key: 'quiz_default_xp_reward', label: 'Default quiz XP reward', category: 'quiz_defaults', type: 'integer', defaultValue: 25, min: 1, max: 500, restartRequired: false, description: 'Applies to new quiz drafts only.' },
  ],
};

const systemStatusFixture = {
  observed_at: '2026-10-14T09:00:00Z',
  read_only: true,
  service: {
    status: 'degraded',
    ready: true,
    degraded: true,
    dependencies: {
      postgres: { status: 'up', required: true, latency_ms: 2 },
      valhalla: { status: 'degraded', required: false, latency_ms: 1500, message: 'Valhalla dependency is unavailable.' },
      storage: { status: 'up', required: false, latency_ms: 1 },
    },
    checked_at: '2026-10-14T09:00:00Z',
  },
  release: {
    version_name: 'alpha-abc1234',
    version_code: 7,
    commit_hash: 'abc1234',
    published_at: '2026-10-13T00:00:00Z',
    update_policy: 'optional',
    force_update: false,
    min_supported_version_code: 1,
    channel: 'alpha',
  },
  runtime: { node_env: 'production', wallet_auth_mode: 'signature', spot_photo_storage: 'local', migration_ledger: { applied: 43, total: 43, up_to_date: true } },
  feature_flags: {
    progression_enabled: true,
    juanchoice_enabled: true,
    juanchoice_writes_enabled: false,
    juanchoice_promotion_enabled: true,
    marketplace_enabled: true,
    guest_login_enabled: false,
    alpha_wallet_simulation_enabled: false,
    demo_login_allowed: false,
  },
  deployment_note: 'Deployment-owned values are read-only in the browser. Signing keys, database URLs, tunnel hosts and mailer credentials are never exposed.',
};

const juanchoiceOverview = {
  server_time: '2026-10-14T09:00:00Z',
  region: { key: 'pangasinan', label: 'Pangasinan', timezone: 'Asia/Manila' },
  view: 'open',
  availability: { voting_enabled: true, reason: null },
  current: { id: 'camp-1', slug: 'coastal', theme: 'Coastal Discoveries', status: 'voting', opens_at: '2026-10-01T00:00:00Z', closes_at: '2026-10-08T00:00:00Z' },
  next: { opens_at: '2026-11-01T00:00:00Z', closes_at: '2026-11-08T00:00:00Z', theme: 'Nature and coast', schedule_status: 'scheduled' },
  previous: { campaign_id: 'camp-0', theme: 'Hidden Gems', period_start: '2026-09-01T00:00:00Z', opens_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-08T00:00:00Z', finalized_at: '2026-09-09T00:00:00Z', valid_ballots: 42, co_winner_ids: ['a', 'b'], period_label: 'September 2026' },
  notice: null,
};

const installApiMocks = async (context) => {
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const json = (data, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (pathname === '/api/v1/auth/me') return json({ success: true, data: adminProfile });
    if (pathname === '/api/v1/auth/wallet/config') return json({ success: true, data: { mode: 'signature' } });
    if (pathname === '/api/v1/admin/settings') return json({ success: true, data: settingsFixture });
    if (pathname === '/api/v1/admin/settings/audit') return json({ success: true, data: { scope: 'settings_only', entries: [
      { id: 'aud-1', actor_id: adminProfile.id, changed_keys: ['announcement_message'], before_values: { announcement_message: '' }, after_values: { announcement_message: 'Cultural quiz pilot is live.' }, reason: 'Pilot launch', request_id: 'req-1', revision: 4, created_at: '2026-10-14T09:00:00Z' },
    ] } });
    if (pathname === '/api/v1/admin/system/status') return json({ success: true, data: systemStatusFixture });
    if (pathname === '/api/v1/juanchoice/overview') return json({ success: true, data: juanchoiceOverview });
    if (pathname === '/api/v1/juanchoice/admin/campaigns') return json({ success: true, data: { items: [] } });
    if (pathname === '/api/v1/juanchoice/admin/schedules') return json({ success: true, data: { items: [] } });
    if (pathname === '/api/v1/ready') {
      return json({ status: 'ready', ready: true, degraded: false, timestamp: new Date().toISOString(), dependencies: { postgres: { status: 'up', required: true, latency_ms: 2 } } });
    }
    if (
      pathname.startsWith('/api/v1/admin/') ||
      pathname === '/api/v1/quests' ||
      pathname === '/api/v1/vouchers'
    ) {
      return json({ success: true, data: [] });
    }
    return json({ success: true, data: [] });
  });
};

const waitForServer = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite preview server did not start in time');
};

const overflowOf = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const main = async () => {
  mkdirSync(outputDir, { recursive: true });

  const server = spawn(
    process.execPath,
    [path.join(dashboardRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: dashboardRoot, stdio: 'ignore' }
  );

  const results = { viewports: [], zoom: [], keyboard: [], reducedMotion: null, consoleErrors: [], screenshots: [] };

  try {
    await waitForServer();
    const browser = await chromium.launch({ channel: 'chrome', headless: true });

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      await installApiMocks(context);
      const page = await context.newPage();
      page.on('pageerror', (error) => results.consoleErrors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') results.consoleErrors.push(`console: ${message.text()}`);
      });

      for (const target of PAGES) {
        await page.goto(`${BASE}/#${target.route}`, { waitUntil: 'load' });
        await page.getByRole('heading', { level: 1, name: target.heading }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(250);
        const overflowPx = await overflowOf(page);
        results.viewports.push({ viewport: viewport.name, page: target.name, overflowPx });

        const shouldCapture =
          target.name === 'overview' ||
          (target.name === 'settings' && (viewport.name === '320' || viewport.name === '1440')) ||
          (target.name === 'submissions' && viewport.name === '390');
        if (shouldCapture) {
          const file = path.join(outputDir, `${target.name}-${viewport.width}x${viewport.height}.png`);
          await page.screenshot({ path: file });
          results.screenshots.push(path.basename(file));
        }
      }
      await context.close();
    }

    for (const viewport of ZOOM_VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      await installApiMocks(context);
      const page = await context.newPage();
      for (const target of PAGES) {
        await page.goto(`${BASE}/#${target.route}`, { waitUntil: 'load' });
        await page.getByRole('heading', { level: 1, name: target.heading }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(200);
        results.zoom.push({ viewport: viewport.name, page: target.name, overflowPx: await overflowOf(page) });
      }
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await installApiMocks(context);
      const page = await context.newPage();
      await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
      await page.getByRole('heading', { level: 1, name: 'Operations overview' }).waitFor();

      await page.keyboard.press('Tab');
      const firstFocus = await page.evaluate(() => document.activeElement?.className || '');
      results.keyboard.push({ step: 'first-tab-is-skip-link', pass: firstFocus.includes('skip-link'), detail: firstFocus });

      let desktopActivated = false;
      for (let index = 0; index < 60; index += 1) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        if (label === 'Destinations') {
          await page.keyboard.press('Enter');
          desktopActivated = true;
          break;
        }
      }
      await page.waitForTimeout(200);
      const desktopHash = await page.evaluate(() => window.location.hash);
      results.keyboard.push({ step: 'keyboard-activate-destinations', pass: desktopActivated && desktopHash === '#/destinations', detail: desktopHash });
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await installApiMocks(context);
      const page = await context.newPage();
      await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
      await page.getByRole('heading', { level: 1, name: 'Operations overview' }).waitFor();

      let menuFocused = false;
      for (let index = 0; index < 60; index += 1) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        if (label === 'Menu') {
          menuFocused = true;
          await page.keyboard.press('Enter');
          break;
        }
      }
      await page.waitForTimeout(150);
      const expanded = await page.evaluate(() => document.querySelector('.shell-menu-button')?.getAttribute('aria-expanded'));
      results.keyboard.push({ step: 'mobile-menu-opens-with-keyboard', pass: menuFocused && expanded === 'true', detail: String(expanded) });

      let mobileActivated = false;
      for (let index = 0; index < 80; index += 1) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        if (label === 'Destinations') {
          await page.keyboard.press('Enter');
          mobileActivated = true;
          break;
        }
      }
      await page.waitForTimeout(200);
      const mobileHash = await page.evaluate(() => window.location.hash);
      const collapsed = await page.evaluate(() => document.querySelector('.shell-menu-button')?.getAttribute('aria-expanded'));
      results.keyboard.push({ step: 'mobile-keyboard-navigation', pass: mobileActivated && mobileHash === '#/destinations' && collapsed === 'false', detail: `${mobileHash} expanded=${collapsed}` });
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
      await installApiMocks(context);
      const page = await context.newPage();
      await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
      await page.getByRole('heading', { level: 1, name: 'Operations overview' }).waitFor();
      const prefersReduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const overflowPx = await overflowOf(page);
      const file = path.join(outputDir, 'overview-reduced-motion-1024x768.png');
      await page.screenshot({ path: file });
      results.screenshots.push(path.basename(file));
      results.reducedMotion = { prefersReduced, overflowPx, pass: prefersReduced && overflowPx <= 1 };
      await context.close();
    }

    await browser.close();
  } finally {
    server.kill();
  }

  const overflowFailures = results.viewports.filter((entry) => entry.overflowPx > 1);
  // Browser zoom equivalents below ~288 CSS px (320/390 px devices at 200 %) are
  // narrower than any supported mobile layout; they are recorded as
  // informational, not failures. Desktop zoom equivalents (>= 384 CSS px) must
  // be overflow-free.
  const zoomFailures = results.zoom.filter(
    (entry) => entry.overflowPx > 1 && !entry.viewport.startsWith('320@200') && !entry.viewport.startsWith('390@200')
  );
  const zoomInformational = results.zoom.filter(
    (entry) => entry.overflowPx > 1 && (entry.viewport.startsWith('320@200') || entry.viewport.startsWith('390@200'))
  );
  const keyboardFailures = results.keyboard.filter((entry) => !entry.pass);
  const summary = {
    overflowChecked: results.viewports.length + results.zoom.length,
    overflowFailures,
    zoomFailures,
    zoomInformational,
    keyboardFailures,
    reducedMotionPass: results.reducedMotion?.pass ?? false,
    consoleErrors: results.consoleErrors,
    screenshots: results.screenshots,
  };

  writeFileSync(
    path.join(outputDir, 'browser-acceptance-results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)
  );

  console.log(JSON.stringify(summary, null, 2));
  const failed =
    overflowFailures.length > 0 ||
    zoomFailures.length > 0 ||
    keyboardFailures.length > 0 ||
    !summary.reducedMotionPass ||
    results.consoleErrors.length > 0;
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error('BROWSER_ACCEPTANCE_FAILED', error);
  process.exit(1);
});
