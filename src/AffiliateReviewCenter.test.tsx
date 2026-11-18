import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AffiliateReviewCenter } from './AffiliateReviewCenter';
import { apiFetch } from './api/client';

vi.mock('./api/client', async () => {
  const actual = await vi.importActual<typeof import('./api/client')>('./api/client');
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock('./auth', () => ({ useSelectedAreaId: () => null }));

const api = vi.mocked(apiFetch);

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('AffiliateReviewCenter WP-8 appealed tab and fields', () => {
  it('filters by appealed tab and shows appeal message, previous rejection reason, and resubmission count', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/admin/affiliate/applications/app-appeal-1') {
        return {
          id: 'app-appeal-1',
          user_id: 'u-1',
          business_name: 'Dagupan Crafts Co.',
          category: 'Artisan',
          municipality: 'Dagupan City',
          contact_name: 'Maria',
          contact_email: 'maria@example.test',
          contact_phone: '09171234567',
          sponsorship_goals: ['local_visibility'],
          status: 'appealed',
          appeal_message: 'Updated business permit attached.',
          previous_rejection_reason: 'Blurry permit scan',
          resubmission_count: 2,
          created_at: '2026-11-18T00:00:00Z',
          updated_at: '2026-11-18T02:00:00Z',
        } as never;
      }
      return [
        {
          id: 'app-appeal-1',
          user_id: 'u-1',
          business_name: 'Dagupan Crafts Co.',
          category: 'Artisan',
          municipality: 'Dagupan City',
          contact_name: 'Maria',
          contact_email: 'maria@example.test',
          contact_phone: '09171234567',
          sponsorship_goals: ['local_visibility'],
          status: 'appealed',
          appeal_message: 'Updated business permit attached.',
          previous_rejection_reason: 'Blurry permit scan',
          resubmission_count: 2,
          created_at: '2026-11-18T00:00:00Z',
          updated_at: '2026-11-18T02:00:00Z',
        },
      ] as never;
    });

    render(<AffiliateReviewCenter />);

    expect(await screen.findByText('Dagupan Crafts Co.')).toBeInTheDocument();
    expect(screen.getByText('Appealed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'appealed' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/affiliate/applications?status=appealed', expect.anything()));

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText(/Updated business permit attached\./)).toBeInTheDocument();
    expect(screen.getByText(/Blurry permit scan/)).toBeInTheDocument();
    expect(screen.getByText(/Resubmission count:/)).toBeInTheDocument();
  });
});
