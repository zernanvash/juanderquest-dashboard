import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlazaModerationPage } from './PlazaModerationPage';

const mockReportGroup = {
  comment: {
    id: 'com_123',
    body: 'Inappropriate advertisement comment',
    author_id: 'user_bad',
    author_display_name: 'Spammer',
    created_at: '2026-10-17T03:00:00.000Z',
    hidden_at: null,
    hidden_by: null,
    report_count: 3,
  },
  activity: {
    id: 'act_456',
    verb: 'quest_completed',
    subject_title: 'Hundred Islands Expedition',
    subject_href: '/quests/hundred-islands',
  },
  reports: [
    {
      reporter_id: 'user_good1',
      reporter_display_name: 'Good Scout',
      reason: 'spam',
      note: 'Commercial link',
      created_at: '2026-10-17T03:05:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
    },
  ],
};

const mockHiddenReportGroup = {
  comment: {
    id: 'com_hidden',
    body: 'Profanity laced message',
    author_id: 'user_profane',
    author_display_name: 'Troll User',
    created_at: '2026-10-17T02:00:00.000Z',
    hidden_at: '2026-10-17T02:30:00.000Z',
    hidden_by: 'admin-1',
    report_count: 5,
  },
  activity: {
    id: 'act_789',
    verb: 'spot_posted',
    subject_title: 'Cape Bolinao Lighthouse',
    subject_href: '/spots/bolinao-lighthouse',
  },
  reports: [
    {
      reporter_id: 'user_reporter',
      reporter_display_name: 'Watcher',
      reason: 'harassment',
      note: 'Personal attacks',
      created_at: '2026-10-17T02:10:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
    },
  ],
};

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

describe('PlazaModerationPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders open Plaza reports with author, comment body, and activity context', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/v1/admin/plaza/reports?status=open')) {
        return Promise.resolve(jsonResponse({ success: true, data: [mockReportGroup] }) as Response);
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<PlazaModerationPage />);

    expect(screen.getByText('Loading Plaza reports…')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('"Inappropriate advertisement comment"')).toBeDefined();
    });

    expect(screen.getByText('Spammer')).toBeDefined();
    expect(screen.getByText('Hundred Islands Expedition')).toBeDefined();
    expect(screen.getByText('3 reports')).toBeDefined();
    expect(screen.getByText('Hide comment')).toBeDefined();
  });

  it('calls PATCH /admin/plaza/comments/:id with action "hide" when clicking Hide comment', async () => {
    let patchedBody: any = null;
    let patchedUrl: string = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('/api/v1/admin/plaza/reports?status=open')) {
        return Promise.resolve(jsonResponse({ success: true, data: [mockReportGroup] }) as Response);
      }
      if (urlStr.includes('/api/v1/admin/plaza/comments/com_123') && init?.method === 'PATCH') {
        patchedUrl = urlStr;
        patchedBody = JSON.parse(init.body as string);
        return Promise.resolve(jsonResponse({ success: true, data: { ...mockReportGroup.comment, hidden_at: 'now' } }) as Response);
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<PlazaModerationPage />);

    await waitFor(() => {
      expect(screen.getByText('Hide comment')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Hide comment'));

    await waitFor(() => {
      expect(patchedUrl).toContain('/api/v1/admin/plaza/comments/com_123');
      expect(patchedBody).toEqual({ action: 'hide' });
    });
  });

  it('calls PATCH /admin/plaza/comments/:id with action "restore" for hidden comments', async () => {
    let patchedBody: any = null;
    let patchedUrl: string = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('/api/v1/admin/plaza/reports?status=open')) {
        return Promise.resolve(jsonResponse({ success: true, data: [mockHiddenReportGroup] }) as Response);
      }
      if (urlStr.includes('/api/v1/admin/plaza/comments/com_hidden') && init?.method === 'PATCH') {
        patchedUrl = urlStr;
        patchedBody = JSON.parse(init.body as string);
        return Promise.resolve(jsonResponse({ success: true, data: { ...mockHiddenReportGroup.comment, hidden_at: null } }) as Response);
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<PlazaModerationPage />);

    await waitFor(() => {
      expect(screen.getByText('Restore comment')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Restore comment'));

    await waitFor(() => {
      expect(patchedUrl).toContain('/api/v1/admin/plaza/comments/com_hidden');
      expect(patchedBody).toEqual({ action: 'restore' });
    });
  });

  it('allows moderating activities in the Activities tab', async () => {
    let patchedBody: any = null;
    let patchedUrl: string = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('/api/v1/admin/plaza/reports')) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }) as Response);
      }
      if (urlStr.includes('/api/v1/admin/plaza/activities/act_bad_999') && init?.method === 'PATCH') {
        patchedUrl = urlStr;
        patchedBody = JSON.parse(init.body as string);
        return Promise.resolve(jsonResponse({ success: true, data: { id: 'act_bad_999', hidden_at: 'now' } }) as Response);
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<PlazaModerationPage />);

    await waitFor(() => {
      expect(screen.getByText('Activities moderation')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Activities moderation'));

    const idInput = screen.getByLabelText(/Activity ID/);
    const reasonInput = screen.getByLabelText(/Reason/);

    fireEvent.change(idInput, { target: { value: 'act_bad_999' } });
    fireEvent.change(reasonInput, { target: { value: 'Spam activity feed injection' } });

    fireEvent.click(screen.getByText('Hide activity'));

    await waitFor(() => {
      expect(patchedUrl).toContain('/api/v1/admin/plaza/activities/act_bad_999');
      expect(patchedBody).toEqual({
        action: 'hide',
        reason: 'Spam activity feed injection',
      });
      expect(screen.getByText('Successfully hidden activity act_bad_999.')).toBeDefined();
    });
  });
});
