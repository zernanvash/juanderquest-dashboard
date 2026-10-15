import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';
import { MerchantsPage } from './MerchantsPage';

const merchants = [
  {
    id: 'merchant-1',
    name: 'Alaminos Island Sweets',
    category: 'pasalubong',
    municipality: 'Alaminos City',
    location: 'Alaminos City, Pangasinan',
    status: 'active',
    is_published: true,
    source_application_id: 'app-1',
    owner_display_name: 'Sweets Owner',
    membership_count: 1,
    active_product_count: 1,
    archived_product_count: 1,
    created_at: '2026-10-14T00:00:00Z',
  },
];

const detail = {
  merchant: {
    id: 'merchant-1',
    name: 'Alaminos Island Sweets',
    description: 'Local sweets and pasalubong showcase.',
    location: 'Alaminos City, Pangasinan',
    municipality: 'Alaminos City',
    category: 'pasalubong',
    status: 'active',
    is_published: true,
    contact_email: 'owner@alaminos.ph',
    contact_phone: '+63 900 000 0000',
    logo_url: null,
    banner_url: null,
    source_application_id: 'app-1',
    created_at: '2026-10-14T00:00:00Z',
  },
  memberships: [
    { id: 'membership-1', role: 'owner', status: 'active', created_at: '2026-10-14T00:00:00Z', member_display_name: 'Sweets Owner' },
  ],
  products: [
    { id: 'product-1', name: 'Bottled Boneless Bangus', description: '', price: 250, currency: 'PHP', image_url: null, is_published: true, is_archived: false, display_order: 0 },
    { id: 'product-2', name: 'Retired Sweet Box', description: '', price: 180, currency: 'PHP', image_url: null, is_published: false, is_archived: true, display_order: 1 },
  ],
  application: {
    id: 'app-1',
    status: 'approved',
    business_name: 'Alaminos Island Sweets',
    category: 'pasalubong',
    municipality: 'Alaminos City',
    business_province: 'Pangasinan',
    created_at: '2026-10-10T00:00:00Z',
    reviewed_at: '2026-10-12T00:00:00Z',
  },
};

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

describe('MerchantsPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/partners/merchants');
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the directory and inspects a merchant without mutations', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/admin/merchants') return Promise.resolve(jsonResponse({ success: true, data: merchants }));
      if (url === '/api/v1/admin/merchants/merchant-1') return Promise.resolve(jsonResponse({ success: true, data: detail }));
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <RouterProvider>
        <MerchantsPage />
      </RouterProvider>
    );

    expect(await screen.findByText('Alaminos Island Sweets')).toBeInTheDocument();
    expect(screen.getByText(/suspend\/hide\/restore actions are deferred/i)).toBeInTheDocument();
    expect(screen.getByText(/Owner: Sweets Owner/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /alaminos island sweets/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Bottled Boneless Bangus');
    expect(dialog).toHaveTextContent('Retired Sweet Box');
    expect(dialog).toHaveTextContent('archived');
    expect(dialog).toHaveTextContent('Sweets Owner');
    expect(dialog).toHaveTextContent('approved');
    expect(dialog).toHaveTextContent('Alaminos City, Pangasinan');

    const actionButtons = Array.from(dialog.querySelectorAll('button')).filter(
      (button) => !/close merchant details/i.test(button.getAttribute('aria-label') || '')
    );
    expect(actionButtons).toHaveLength(0);
  });

  it('shows an explicit empty state when no merchants exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/admin/merchants') return Promise.resolve(jsonResponse({ success: true, data: [] }));
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    }));

    render(
      <RouterProvider>
        <MerchantsPage />
      </RouterProvider>
    );

    expect(await screen.findByText('No merchant matches this view.')).toBeInTheDocument();
  });
});
