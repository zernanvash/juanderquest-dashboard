import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { describeError } from './errors';

describe('dashboard error messages', () => {
  it('does not expose raw 5xx responses to staff', () => {
    expect(describeError(new ApiError('Request failed (500).', 500))).toMatch(/service is unavailable/i);
    expect(describeError(new ApiError('Request failed (500).', 500))).not.toContain('500');
  });

  it('keeps actionable 4xx messages', () => {
    expect(describeError(new ApiError('Reason must be between 10 and 300 characters.', 400)))
      .toBe('Reason must be between 10 and 300 characters.');
  });
});
