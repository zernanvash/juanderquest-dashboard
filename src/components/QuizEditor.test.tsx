import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuizEditor } from './QuizEditor';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, apiFetch: vi.fn(async () => []) };
});

vi.mock('./QuizMapPinPicker', () => ({
  QuizMapPinPicker: ({ onChange }: { onChange: (patch: Record<string, unknown>) => void }) => (
    <button type="button" onClick={() => onChange({ destinationId: 'spot-1' })}>
      Select destination
    </button>
  ),
}));

afterEach(() => {
  cleanup();
});

describe('QuizEditor (WP-7 min 1 question)', () => {
  it('starts with 1 question, disables Remove at 1, and lets admin add and remove up to 5 questions', () => {
    render(
      <QuizEditor
        mode="create"
        spots={[
          {
            id: 'spot-1',
            name: 'Bolinao',
            category: 'nature',
            subcategory: 'beach',
            municipality: 'Bolinao',
            source_name: 'LGU',
            trust_level: 'lgu_verified',
            status: 'published',
            gps_lat: 16.3,
            gps_lng: 119.8,
          },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select destination' }));
    fireEvent.change(screen.getByPlaceholderText('Stories of Cape Bolinao'), {
      target: { value: 'Cape Bolinao Quiz' },
    });
    fireEvent.change(screen.getByPlaceholderText('What travelers will learn at this destination.'), {
      target: { value: 'Discover heritage and coastal landmarks.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    expect(screen.getByText('1 of 5 questions')).toBeInTheDocument();
    const remove1 = screen.getByRole('button', { name: 'Remove question 1' });
    expect(remove1).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText('2 of 5 questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove question 1' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove question 2' }));
    expect(screen.getByText('1 of 5 questions')).toBeInTheDocument();
  });
});
