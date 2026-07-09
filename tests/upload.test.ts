import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import PostZen, { PostZenApiError } from '../src';

interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  rawBody: unknown;
}

const PRESIGN_RESPONSE = {
  uploadUrl: 'https://storage.example/upload/abc?signature=xyz',
  publicUrl: 'https://cdn.postzen.dev/media/abc.jpg',
  key: 'media/abc.jpg',
  type: 'image' as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function recordCall(input: Request | string, init: RequestInit | undefined): Promise<RecordedCall> {
  const isRequest = typeof input !== 'string';
  const url = isRequest ? input.url : input;
  const method = init?.method ?? (isRequest ? input.method : 'GET');
  const headers = isRequest ? input.headers : new Headers(init?.headers ?? {});
  const rawBody = isRequest ? await input.clone().text() : init?.body;

  return { url, method, headers, rawBody };
}

/**
 * Stubs global fetch, routing the presign request and the raw byte upload.
 * `presign` / `put` let individual tests override the response for each leg.
 */
function stubFetch(handlers: {
  presign?: () => Response;
  put?: () => Response;
} = {}): RecordedCall[] {
  const calls: RecordedCall[] = [];

  vi.stubGlobal('fetch', async (input: Request | string, init?: RequestInit) => {
    const call = await recordCall(input, init);
    calls.push(call);

    if (call.url.endsWith('/v1/media/presign')) {
      return (handlers.presign ?? (() => jsonResponse(PRESIGN_RESPONSE)))();
    }

    return (handlers.put ?? (() => new Response(null, { status: 200 })))();
  });

  return calls;
}

describe('media.upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads from a file path: infers content type + size, PUTs exact bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'postzen-upload-'));
    const filePath = join(dir, 'photo.jpg');
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    writeFileSync(filePath, bytes);

    try {
      const calls = stubFetch();
      const client = new PostZen({ apiKey: 'pzn_test_upload' });

      const result = await client.media.upload(filePath);

      const presign = calls.find((call) => call.url.endsWith('/v1/media/presign'));
      const put = calls.find((call) => call.method === 'PUT');

      expect(presign).toBeDefined();
      expect(presign?.method).toBe('POST');
      expect(JSON.parse(presign?.rawBody as string)).toEqual({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        size: bytes.byteLength,
      });
      expect(presign?.headers.get('Authorization')).toBe('Bearer pzn_test_upload');

      expect(put).toBeDefined();
      expect(put?.url).toBe(PRESIGN_RESPONSE.uploadUrl);
      expect(put?.headers.get('Content-Type')).toBe('image/jpeg');
      expect(put?.headers.get('Authorization')).toBeNull();
      expect(Buffer.from(put?.rawBody as Uint8Array)).toEqual(bytes);

      expect(result).toEqual({
        publicUrl: PRESIGN_RESPONSE.publicUrl,
        key: PRESIGN_RESPONSE.key,
        type: 'image',
        size: bytes.byteLength,
        filename: 'photo.jpg',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uploads raw bytes when a filename is supplied', async () => {
    const calls = stubFetch();
    const client = new PostZen({ apiKey: 'pzn_test_bytes' });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const result = await client.media.upload(bytes, { filename: 'diagram.png' });

    const presign = calls.find((call) => call.url.endsWith('/v1/media/presign'));
    const put = calls.find((call) => call.method === 'PUT');

    expect(JSON.parse(presign?.rawBody as string)).toEqual({
      filename: 'diagram.png',
      contentType: 'image/png',
      size: 5,
    });
    expect(put?.headers.get('Content-Type')).toBe('image/png');
    expect(Buffer.from(put?.rawBody as Uint8Array)).toEqual(Buffer.from(bytes));
    expect(result.filename).toBe('diagram.png');
    expect(result.size).toBe(5);
  });

  it('forwards an explicit contentType and profileId', async () => {
    const calls = stubFetch();
    const client = new PostZen({ apiKey: 'pzn_test_opts' });
    const bytes = new Uint8Array([9, 9, 9]);

    await client.media.upload(bytes, {
      filename: 'clip.bin',
      contentType: 'video/mp4',
      profileId: 'profile_123',
    });

    const presign = calls.find((call) => call.url.endsWith('/v1/media/presign'));
    const put = calls.find((call) => call.method === 'PUT');

    expect(JSON.parse(presign?.rawBody as string)).toEqual({
      filename: 'clip.bin',
      contentType: 'video/mp4',
      size: 3,
      profileId: 'profile_123',
    });
    expect(put?.headers.get('Content-Type')).toBe('video/mp4');
  });

  it('throws for an unknown extension, naming contentType', async () => {
    stubFetch();
    const client = new PostZen({ apiKey: 'pzn_test_ext' });

    await expect(client.media.upload(new Uint8Array([1]), { filename: 'file.xyz' })).rejects.toThrow(
      /contentType/
    );
  });

  it('throws when raw bytes are uploaded without a filename', async () => {
    stubFetch();
    const client = new PostZen({ apiKey: 'pzn_test_nofn' });

    await expect(client.media.upload(new Uint8Array([1, 2, 3]))).rejects.toThrow(/filename/);
  });

  it('propagates presign API errors and never PUTs', async () => {
    const calls = stubFetch({
      presign: () => jsonResponse({ error: 'read-write API key required' }, 403),
    });
    const client = new PostZen({ apiKey: 'pzn_test_presign_err' });

    await expect(client.media.upload(new Uint8Array([1, 2, 3]), { filename: 'a.png' })).rejects.toBeInstanceOf(
      PostZenApiError
    );

    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('throws with the status when the presigned PUT fails', async () => {
    stubFetch({
      put: () => new Response('nope', { status: 500 }),
    });
    const client = new PostZen({ apiKey: 'pzn_test_put_err' });

    let thrown: unknown;
    try {
      await client.media.upload(new Uint8Array([1, 2, 3]), { filename: 'a.png' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PostZenApiError);
    expect((thrown as PostZenApiError).statusCode).toBe(500);
    expect((thrown as PostZenApiError).message).toBe('upload to presigned URL failed');
  });
});
