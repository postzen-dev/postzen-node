import { afterEach, describe, expect, it } from 'vitest';
import PostZen, { PostZenApiError } from '../src';
import packageJson from '../package.json';

const originalApiKey = process.env.POSTZEN_API_KEY;

function restoreEnv(): void {
  if (originalApiKey === undefined) {
    delete process.env.POSTZEN_API_KEY;
  } else {
    process.env.POSTZEN_API_KEY = originalApiKey;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('PostZen client', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('throws when no API key is provided', () => {
    delete process.env.POSTZEN_API_KEY;

    expect(() => new PostZen()).toThrow(PostZenApiError);
    expect(() => new PostZen()).toThrow('POSTZEN_API_KEY');
  });

  it('reads POSTZEN_API_KEY from the environment', () => {
    process.env.POSTZEN_API_KEY = 'pzn_test_env';

    const client = new PostZen();

    expect(client.apiKey).toBe('pzn_test_env');
  });

  it('sends the SDK User-Agent header', async () => {
    const client = new PostZen({ apiKey: 'pzn_test_key' });
    let request: Request | undefined;

    await client.profiles.listProfiles({
      fetch: async (incoming: Request) => {
        request = incoming;
        return jsonResponse({ profiles: [] });
      },
    });

    expect(request?.headers.get('User-Agent')).toBe(`postzen-node/${packageJson.version}`);
  });

  it('sends the Authorization bearer token', async () => {
    const client = new PostZen({ apiKey: 'pzn_test_auth' });
    let request: Request | undefined;

    await client.profiles.listProfiles({
      fetch: async (incoming: Request) => {
        request = incoming;
        return jsonResponse({ profiles: [] });
      },
    });

    expect(request?.headers.get('Authorization')).toBe('Bearer pzn_test_auth');
  });

  it('keeps multiple client instances isolated', async () => {
    const first = new PostZen({
      apiKey: 'pzn_first',
      baseURL: 'https://first.example',
    });
    const second = new PostZen({
      apiKey: 'pzn_second',
      baseURL: 'https://second.example',
    });
    const requests: Request[] = [];
    const captureFetch = async (incoming: Request): Promise<Response> => {
      requests.push(incoming);
      return jsonResponse({ profiles: [] });
    };

    await first.profiles.listProfiles({ fetch: captureFetch });
    await second.profiles.listProfiles({ fetch: captureFetch });
    await first.profiles.listProfiles({ fetch: captureFetch });

    expect(requests).toHaveLength(3);
    expect(requests[0].url).toBe('https://first.example/v1/profiles');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer pzn_first');
    expect(requests[1].url).toBe('https://second.example/v1/profiles');
    expect(requests[1].headers.get('Authorization')).toBe('Bearer pzn_second');
    expect(requests[2].url).toBe('https://first.example/v1/profiles');
    expect(requests[2].headers.get('Authorization')).toBe('Bearer pzn_first');
  });

  it('aborts requests after the configured timeout', async () => {
    const client = new PostZen({ apiKey: 'pzn_timeout', timeout: 10 });
    const startedAt = Date.now();
    let thrown: unknown;

    try {
      await client.profiles.listProfiles({
        fetch: async () => new Promise<Response>(() => undefined),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
