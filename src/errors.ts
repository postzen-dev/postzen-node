export class PostZenApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PostZenApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PostZenApiError);
    }
  }

  isAuthError(): boolean {
    return this.statusCode === 401;
  }

  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isValidationError(): boolean {
    return this.statusCode === 400;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isPaymentRequired(): boolean {
    return this.statusCode === 402;
  }
}

export class RateLimitError extends PostZenApiError {
  readonly limit?: number;
  readonly remaining?: number;
  readonly resetAt?: Date;

  constructor(message: string, limit?: number, remaining?: number, resetAt?: Date) {
    super(message, 429, 'rate_limit_exceeded');
    this.name = 'RateLimitError';
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt;
  }

  getSecondsUntilReset(): number | undefined {
    if (!this.resetAt) {
      return undefined;
    }

    return Math.max(0, Math.ceil((this.resetAt.getTime() - Date.now()) / 1000));
  }
}

export class ValidationError extends PostZenApiError {
  readonly fields?: Record<string, string[]>;

  constructor(message: string, fields?: Record<string, string[]>) {
    super(message, 400, 'validation_error', fields ? { fields } : undefined);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

type ErrorBody = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getNumberHeader(response: Response, header: string): number | undefined {
  const value = response.headers.get(header);

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRateLimitReset(response: Response): Date | undefined {
  const reset = getNumberHeader(response, 'X-RateLimit-Reset');

  if (reset === undefined) {
    return undefined;
  }

  return new Date(reset > 1_000_000_000_000 ? reset : reset * 1000);
}

function getValidationFields(details: Record<string, unknown> | undefined): Record<string, string[]> | undefined {
  if (!isRecord(details?.fields)) {
    return undefined;
  }

  const fields: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(details.fields)) {
    if (Array.isArray(messages) && messages.every((message) => typeof message === 'string')) {
      fields[field] = messages;
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

export function parseApiError(response: Response, body?: ErrorBody): PostZenApiError {
  const statusText = response.statusText ? response.statusText : undefined;
  const message =
    getString(body?.error) ??
    getString(body?.message) ??
    statusText ??
    `Request failed with status ${response.status}`;
  const code = getString(body?.code);
  const details = isRecord(body?.details) ? body.details : undefined;

  if (response.status === 429) {
    return new RateLimitError(
      message,
      getNumberHeader(response, 'X-RateLimit-Limit'),
      getNumberHeader(response, 'X-RateLimit-Remaining'),
      parseRateLimitReset(response)
    );
  }

  const fields = getValidationFields(details);

  if (response.status === 400 && fields) {
    return new ValidationError(message, fields);
  }

  return new PostZenApiError(message, response.status, code, details);
}
