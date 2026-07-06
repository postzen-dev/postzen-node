# PostZen Node.js SDK

Official Node.js SDK for the PostZen Public API. Use it to manage profiles, connect social accounts, upload media, and create posts against `https://api.postzen.dev`.

## Installation

```bash
npm install @postzen/node
```

## Quick Start

Set your API key:

```bash
export POSTZEN_API_KEY="pzn_live_..."
```

Create and publish a post:

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

if ('post' in data) {
  console.log(`Created post ${data.post._id}`);
}
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

- Node.js 18+
- PostZen API key

## Links

- [Documentation](https://docs.postzen.dev/)
- [Dashboard](https://app.postzen.dev/)
- [Website](https://www.postzen.dev/)
- [GitHub](https://github.com/postzen-dev/postzen-node)

## License

MIT
