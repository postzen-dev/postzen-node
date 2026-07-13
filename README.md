<p align="center">
  <img src=".github/assets/postzen-icon.png" alt="PostZen" width="96" />
</p>

<h1 align="center">PostZen Node.js SDK</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@postzen/node"><img src="https://img.shields.io/npm/v/%40postzen%2Fnode" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@postzen/node"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" /></a>
</p>

<p align="center"><strong>One API to post everywhere. 8 platforms, zero headaches.</strong></p>

The official Node.js SDK for the [PostZen API](https://docs.postzen.dev) — schedule and publish social media posts across X/Twitter, Instagram, TikTok, LinkedIn, Facebook, YouTube, Threads, and Pinterest with a single integration.

## Installation

```bash
npm install @postzen/node
```

Requires Node 18+. Ships CommonJS and ESM builds with TypeScript declarations, and has zero runtime dependencies (it uses the built-in `fetch`).

## Quick Start

Create an API key on the [API keys page](https://app.postzen.dev/api-keys) and expose it as `POSTZEN_API_KEY`:

```bash
export POSTZEN_API_KEY="pzn_live_..."
```

Then create and publish a post:

```typescript
import PostZen from '@postzen/node';

const postzen = new PostZen();

const { data } = await postzen.posts.createPost({
  body: {
    title: 'Launch post',
    content: 'We shipped the new release.',
    publishNow: true,
    platforms: [
      {
        platform: 'twitter',
        accountId: 'account_id',
      },
    ],
  },
});

if (data && 'post' in data) {
  console.log(`Created post ${data.post._id}`);
}
```

## Authentication

The client authenticates with a bearer API key, resolved in this order:

1. The `apiKey` option passed to the constructor.
2. The `POSTZEN_API_KEY` environment variable.

If neither is set, the constructor throws a `PostZenApiError` with code `missing_api_key`.

```typescript
import PostZen from '@postzen/node';

// Explicit key
const postzen = new PostZen({ apiKey: 'pzn_live_...' });

// Or rely on POSTZEN_API_KEY in the environment
const fromEnv = new PostZen();
```

## Configuration

```typescript
import PostZen from '@postzen/node';

const postzen = new PostZen({
  apiKey: 'pzn_live_...',
  baseURL: 'https://api.postzen.dev',
  timeout: 60000,
  defaultHeaders: {
    'X-Request-Source': 'my-app',
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `process.env.POSTZEN_API_KEY` | PostZen API key used as a bearer token. |
| `baseURL` | `string \| null` | `https://api.postzen.dev` | Override the API base URL. |
| `timeout` | `number` | `60000` | Request timeout in milliseconds. The client aborts timed-out requests. |
| `defaultHeaders` | `Record<string, string>` | `{}` | Headers sent with every API request. |

## Examples

### Create a Profile

```typescript
const { data } = await postzen.profiles.createProfile({
  body: {
    name: 'Marketing Team',
    description: 'Profile for marketing campaigns',
    color: '#4caf50',
  },
});

console.log(data.profile._id);
```

### Connect URL Flow

```typescript
const profileId = 'profile_id';

const { data: start } = await postzen.connect.createConnectUrl({
  path: {
    platform: 'linkedin',
  },
  query: {
    profileId,
    redirectUrl: 'https://yourapp.example/connected',
  },
});

console.log(start.authUrl);

await postzen.connect.completeConnect({
  path: {
    platform: 'linkedin',
  },
  body: {
    code: 'oauth_code_from_redirect',
    state: start.state,
    profileId,
  },
});
```

### Media Presign Upload

```typescript
const file = await fetch('https://example.com/image.png').then((response) => response.blob());

const { data: presign } = await postzen.media.createMediaPresign({
  body: {
    filename: 'image.png',
    contentType: 'image/png',
    size: file.size,
  },
});

await fetch(presign.uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'image/png',
  },
  body: file,
});

await postzen.posts.createPost({
  body: {
    title: 'Post with media',
    content: 'Uploaded through a PostZen presigned URL.',
    publishNow: true,
    mediaItems: [
      {
        url: presign.publicUrl,
        title: 'image.png',
      },
    ],
    platforms: [
      {
        platform: 'instagram',
        accountId: 'account_id',
      },
    ],
  },
});
```

### Upload media

`media.upload` is a one-step helper: it presigns, uploads the raw bytes to the
returned storage URL, and resolves with the public URL and metadata. Pass a file
path (the content type is inferred from the extension) or raw bytes with an
explicit `filename`.

```typescript
// From a file path — content type inferred from the extension.
const media = await postzen.media.upload('./photo.jpg');

// From a Buffer or Uint8Array — filename is required.
const fromBytes = await postzen.media.upload(buffer, { filename: 'photo.jpg' });

// media => { publicUrl, key, type, size, filename }
console.log(media.publicUrl);
```

Reference the returned `publicUrl` in `posts.createPost`:

```typescript
const media = await postzen.media.upload('./photo.jpg');

await postzen.posts.createPost({
  body: {
    title: 'Post with media',
    content: 'Uploaded through the PostZen SDK.',
    publishNow: true,
    mediaItems: [{ url: media.publicUrl, title: media.filename }],
    platforms: [{ platform: 'instagram', accountId: 'account_id' }],
  },
});
```

### List Accounts

```typescript
const { data } = await postzen.accounts.listAccounts({
  query: {
    status: 'connected',
    platform: 'linkedin',
  },
});

for (const account of data.accounts) {
  console.log(`${account.platform}: ${account.displayName}`);
}
```

### Paginate Accounts

`accounts.listAccounts` accepts `page` and `limit` (max 100) and returns a `pagination` object with `page`, `limit`, `total`, and `totalPages`.

```typescript
let page = 1;
let totalPages = 1;

do {
  const { data } = await postzen.accounts.listAccounts({
    query: { page, limit: 50 },
  });

  for (const account of data.accounts) {
    console.log(`${account.platform}: ${account.displayName}`);
  }

  totalPages = data.pagination?.totalPages ?? 1;
  page += 1;
} while (page <= totalPages);
```

## Error Handling

The SDK throws `PostZenApiError` for non-2xx API responses. Specialized subclasses are used for rate limits and validation errors.

```typescript
import PostZen, { PostZenApiError, RateLimitError, ValidationError } from '@postzen/node';

const postzen = new PostZen();

try {
  await postzen.posts.createPost({
    body: {
      content: 'Hello from PostZen',
      publishNow: true,
      platforms: [{ platform: 'twitter', accountId: 'account_id' }],
    },
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry in ${error.getSecondsUntilReset()} seconds.`);
  } else if (error instanceof ValidationError) {
    console.error('Validation failed:', error.fields);
  } else if (error instanceof PostZenApiError) {
    console.error(`PostZen API error ${error.statusCode}: ${error.message}`);
  } else {
    throw error;
  }
}
```

Error classes:

| Class | Description |
|-------|-------------|
| `PostZenApiError` | Base API error with `statusCode`, `code`, `details`, and helper methods. |
| `RateLimitError` | HTTP 429 with `limit`, `remaining`, `resetAt`, and `getSecondsUntilReset()`. |
| `ValidationError` | HTTP 400 with `fields: Record<string, string[]>`. |

## SDK Reference

### Profiles
| Method | Description |
|--------|-------------|
| `profiles.listProfiles()` | List profiles |
| `profiles.createProfile()` | Create a profile |
| `profiles.getProfile()` | Get a profile |
| `profiles.updateProfile()` | Update a profile |
| `profiles.deleteProfile()` | Delete a profile |

### Accounts
| Method | Description |
|--------|-------------|
| `accounts.listAccounts()` | List accounts |
| `accounts.disconnectAccount()` | Disconnect an account |

### Connect (OAuth)
| Method | Description |
|--------|-------------|
| `connect.createConnectUrl()` | Create an OAuth connect URL |
| `connect.completeConnect()` | Complete an OAuth connection |

### Media
| Method | Description |
|--------|-------------|
| `media.createMediaPresign()` | Create a presigned media upload URL |

### Posts
| Method | Description |
|--------|-------------|
| `posts.createPost()` | Create a post |

## Requirements

- Node.js 18 or later
- A PostZen API key ([create one](https://app.postzen.dev/api-keys))

## Development

```bash
npm install              # install dev dependencies (node_modules is not committed)
npm run generate         # regenerate the client, types, tests, and SDK reference from openapi.json
npm run generate:readme  # regenerate just the SDK Reference section above
npm run build            # bundle to dist/ (CJS + ESM + .d.ts)
npm test                 # run the vitest suite
```

`openapi.json` and everything under `src/generated/` are synced from the PostZen monorepo and regenerated by CI — don't edit them by hand.

## PostZen developer tools

- [Documentation](https://docs.postzen.dev)
- [API reference](https://docs.postzen.dev/api-reference)
- [Python SDK](https://github.com/postzen-dev/postzen-python) — `postzen-sdk` on PyPI
- [CLI](https://github.com/postzen-dev/postzen-cli) — `@postzen/cli`
- [MCP server](https://docs.postzen.dev/mcp)
- [Dashboard & API keys](https://app.postzen.dev/api-keys)

## License

MIT
