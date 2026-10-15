import { ApiError } from '../api/client';

export const describeError = (cause: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
};
