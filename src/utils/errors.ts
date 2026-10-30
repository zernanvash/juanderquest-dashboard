import { ApiError } from '../api/client';

export const describeError = (cause: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (cause instanceof ApiError) {
    if (cause.status >= 500) {
      return 'The service is unavailable right now. Check your connection and try again.';
    }
    return cause.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
};
