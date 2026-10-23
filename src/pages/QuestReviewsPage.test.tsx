import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuestReviewsPage } from './QuestReviewsPage';
import * as client from '../api/client';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 500, code = 'ERROR') {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

describe('QuestReviewsPage (Plan 43 §7 & §4.5)', () => {
  const mockAttempts = [
    {
      id: 'attempt-1',
      quest_id: 'quest-101',
      quest_title: 'Lingayen Capitol Heritage Trail',
      quest_location: 'Lingayen',
      user_id: 'user-traveler-1',
      traveler_name: 'Juan Dela Cruz',
      status: 'submitted',
      current_step: 2,
      total_steps: 2,
      verified_steps: 1,
      step_order_mode: 'sequential',
      created_at: '2026-10-21T00:00:00Z',
      steps: [
        {
          id: 'step-ev-1',
          step_order: 1,
          task_key: 'task_loc_1',
          title: 'Capitol Grounds Arrival',
          description: 'Check in near the historic capitol steps.',
          checkpoint_type: 'location',
          required: true,
          status: 'verified',
          evidence_payload: { distance_meters: 15 },
          failed_tries: 0,
        },
        {
          id: 'step-ev-2',
          step_order: 2,
          task_key: 'task_photo_2',
          title: 'Veterans Memorial Park',
          description: 'Take a clear photo of the memorial plaque.',
          checkpoint_type: 'photo',
          required: true,
          status: 'pending_review',
          evidence_payload: {
            photo_url: '/api/v1/quests/evidence/step-ev-2/file',
            distance_meters: 22,
            captured_accuracy: 8,
            mime_type: 'image/jpeg',
            byte_length: 245000,
          },
          failed_tries: 0,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders quest attempts list and selects an attempt', async () => {
    (client.apiFetch as any).mockResolvedValueOnce(mockAttempts);

    render(<QuestReviewsPage />);

    expect(screen.getByText(/Loading quest attempts…/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Lingayen Capitol Heritage Trail')).toBeInTheDocument();
    });

    expect(screen.getByText(/Traveler:/i)).toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();

    // Select the attempt
    fireEvent.click(screen.getByText('Lingayen Capitol Heritage Trail'));

    // Check detail pane rendered
    expect(screen.getByText('1. Capitol Grounds Arrival')).toBeInTheDocument();
    expect(screen.getByText('2. Veterans Memorial Park')).toBeInTheDocument();

    // Final attempt approval should be disabled while photo task is pending review
    const approveAttemptBtn = screen.getByRole('button', { name: /Approve Quest Attempt/i });
    expect(approveAttemptBtn).toBeDisabled();
  });

  it('approves a photo task via PATCH /admin/quest-attempts/:id/steps/:order', async () => {
    (client.apiFetch as any).mockResolvedValueOnce(mockAttempts);

    render(<QuestReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Lingayen Capitol Heritage Trail')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lingayen Capitol Heritage Trail'));

    // Click "Approve Task" on the pending photo task
    const approveTaskBtn = screen.getByRole('button', { name: /Approve Task/i });
    fireEvent.click(approveTaskBtn);

    // Modal opens
    expect(screen.getByText('Approve Task Evidence')).toBeInTheDocument();
    expect(screen.getByText(/Task 2: Veterans Memorial Park/i)).toBeInTheDocument();

    // Confirm approval
    (client.apiFetch as any).mockResolvedValueOnce({ success: true }); // PATCH step
    (client.apiFetch as any).mockResolvedValueOnce([
      {
        ...mockAttempts[0],
        verified_steps: 2,
        steps: [
          mockAttempts[0].steps[0],
          { ...mockAttempts[0].steps[1], status: 'verified' },
        ],
      },
    ]); // Refetch attempts

    fireEvent.click(screen.getByRole('button', { name: /Confirm Approval/i }));

    await waitFor(() => {
      expect(client.apiFetch).toHaveBeenCalledWith(
        '/admin/quest-attempts/attempt-1/steps/2',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ action: 'approve' }),
        })
      );
    });
  });

  it('requests changes with reason via PATCH /admin/quest-attempts/:id/steps/:order', async () => {
    (client.apiFetch as any).mockResolvedValueOnce(mockAttempts);

    render(<QuestReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Lingayen Capitol Heritage Trail')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lingayen Capitol Heritage Trail'));

    // Click "Needs Changes…"
    const needsChangesBtn = screen.getByRole('button', { name: /Needs Changes…/i });
    fireEvent.click(needsChangesBtn);

    // Modal opens
    expect(screen.getByText('Request Changes for Task')).toBeInTheDocument();

    // Type a valid reason
    const reasonInput = screen.getByLabelText(/Reason for requesting changes/i);
    fireEvent.change(reasonInput, {
      target: { value: 'The plaque is blurry and unreadable. Please retake the photo in daylight.' },
    });

    (client.apiFetch as any).mockResolvedValueOnce({ success: true });
    (client.apiFetch as any).mockResolvedValueOnce(mockAttempts);

    fireEvent.click(screen.getByRole('button', { name: /Send Request/i }));

    await waitFor(() => {
      expect(client.apiFetch).toHaveBeenCalledWith(
        '/admin/quest-attempts/attempt-1/steps/2',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            action: 'needs_changes',
            reason: 'The plaque is blurry and unreadable. Please retake the photo in daylight.',
          }),
        })
      );
    });
  });
});
