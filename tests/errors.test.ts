import { describe, expect, it } from 'vitest';
import { PostZenApiError, RateLimitError, ValidationError, parseApiError } from '../src/errors';

function response(status: number, statusText: string, headers?: HeadersInit): Response {
  return new Response('', {
    status,
    statusText,
    headers,
  });
}

describe('PostZenApiError', () => {
  it('stores status, code, and details', () => {
    const error = new PostZenApiError('Invalid request', 400, 'invalid_request', {
      field: 'content',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Invalid request');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('invalid_request');
    expect(error.details).toEqual({ field: 'content' });
  });

  it('reports helper predicates', () => {
    expect(new PostZenApiError('Unauthorized', 401).isAuthError()).toBe(true);
    expect(new PostZenApiError('Forbidden', 403).isForbidden()).toBe(true);
    expect(new PostZenApiError('Not found', 404).isNotFound()).toBe(true);
    expect(new PostZenApiError('Validation', 400).isValidationError()).toBe(true);
    expect(new PostZenApiError('Rate limited', 429).isRateLimited()).toBe(true);
    expect(new PostZenApiError('Payment required', 402).isPaymentRequired()).toBe(true);
  });
});

describe('RateLimitError', () => {
  it('calculates seconds until reset', () => {
    const resetAt = new Date(Date.now() + 30_000);
    const error = new RateLimitError('Rate limited', 100, 0, resetAt);

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('rate_limit_exceeded');
    expect(error.limit).toBe(100);
    expect(error.remaining).toBe(0);
    expect(error.getSecondsUntilReset()).toBeGreaterThanOrEqual(29);
  });
});

describe('ValidationError', () => {
  it('stores field errors', () => {
    const fields = {
      content: ['Content is required'],
    };
    const error = new ValidationError('Validation failed', fields);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('validation_error');
    expect(error.fields).toEqual(fields);
    expect(error.details).toEqual({ fields });
  });
});

describe('parseApiError', () => {
  it('maps 429 responses to RateLimitError and parses headers', () => {
    const reset = Math.floor(Date.now() / 1000) + 60;
    const error = parseApiError(
      response(429, 'Too Many Requests', {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(reset),
      }),
      { error: 'Slow down' }
    );

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toBe('Slow down');

    if (error instanceof RateLimitError) {
      expect(error.limit).toBe(100);
      expect(error.remaining).toBe(0);
      expect(error.resetAt).toEqual(new Date(reset * 1000));
    }
  });

  it('maps 400 responses with details.fields to ValidationError', () => {
    const error = parseApiError(response(400, 'Bad Request'), {
      message: 'Validation failed',
      details: {
        fields: {
          title: ['Title is too long'],
        },
      },
    });

    expect(error).toBeInstanceOf(ValidationError);

    if (error instanceof ValidationError) {
      expect(error.fields).toEqual({ title: ['Title is too long'] });
    }
  });

  it('preserves 402 code and details on generic API errors', () => {
    const details = {
      reason: 'freeTierExceeded',
      dashboardUrl: 'https://app.postzen.dev/settings?tab=billing',
    };
    const error = parseApiError(response(402, 'Payment Required'), {
      error: 'Payment method required',
      code: 'paymentRequired',
      details,
    });

    expect(error).toBeInstanceOf(PostZenApiError);
    expect(error.statusCode).toBe(402);
    expect(error.code).toBe('paymentRequired');
    expect(error.details).toEqual(details);
    expect(error.isPaymentRequired()).toBe(true);
  });

  it('falls back to statusText for plain server errors', () => {
    const error = parseApiError(response(500, 'Internal Server Error'));

    expect(error).toBeInstanceOf(PostZenApiError);
    expect(error.message).toBe('Internal Server Error');
    expect(error.statusCode).toBe(500);
  });

  it('uses a status-based fallback when statusText is empty (HTTP/2)', () => {
    const error = parseApiError(response(502, ''));

    expect(error).toBeInstanceOf(PostZenApiError);
    expect(error.message).toBe('Request failed with status 502');
    expect(error.statusCode).toBe(502);
  });

  it('uses statusText when present for the same status', () => {
    const error = parseApiError(response(502, 'Bad Gateway'));

    expect(error).toBeInstanceOf(PostZenApiError);
    expect(error.message).toBe('Bad Gateway');
    expect(error.statusCode).toBe(502);
  });

  it('prefers body.error over statusText', () => {
    const error = parseApiError(response(502, 'Bad Gateway'), {
      error: 'Upstream exploded',
    });

    expect(error).toBeInstanceOf(PostZenApiError);
    expect(error.message).toBe('Upstream exploded');
    expect(error.statusCode).toBe(502);
  });
});
