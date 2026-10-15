export const API_BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export const isAuthError = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
}

let bearerToken: string | null = null;
let unauthorizedListener: (() => void) | null = null;

export const setBearerToken = (token: string | null) => {
  bearerToken = token;
};

export const getBearerToken = (): string | null => bearerToken;

export const setUnauthorizedListener = (listener: (() => void) | null) => {
  unauthorizedListener = listener;
};

const extractMessage = (data: unknown, status: number): string => {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: { message?: string; code?: string } }).error;
    if (error?.message) return error.message;
    if (error?.code) return error.code;
  }
  return `Request failed (${status}).`;
};

export async function apiFetch<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { token, body, headers, ...init } = options;
  const effectiveToken = token !== undefined ? token : bearerToken;
  const requestHeaders = new Headers(headers);
  if (effectiveToken) requestHeaders.set('Authorization', `Bearer ${effectiveToken}`);

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      payload = body;
    } else {
      requestHeaders.set('Content-Type', 'application/json');
      payload = JSON.stringify(body);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: requestHeaders,
      body: payload,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Network error — the server could not be reached.', 0);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) {
    unauthorizedListener?.();
    throw new ApiError(extractMessage(data, 401), 401, (data as { error?: { code?: string } })?.error?.code, (data as { error?: unknown })?.error);
  }

  if (!response.ok || (data && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success === false)) {
    throw new ApiError(
      extractMessage(data, response.status),
      response.status,
      (data as { error?: { code?: string } })?.error?.code,
      (data as { error?: unknown })?.error
    );
  }

  if (data && typeof data === 'object' && 'data' in data) return (data as { data: T }).data;
  return data as T;
}
