# @postzen/node

Node.js client for the [PostZen Public API](https://api.postzen.dev) — manage profiles, connected social accounts, OAuth connection flows, media uploads, and post creation from server-side integrations.

This SDK is auto-generated from the PostZen OpenAPI specification using [OpenAPI Generator](https://openapi-generator.tech) (`typescript-node`). Do not edit the generated files by hand — changes will be overwritten on the next regeneration.

## Installation

```bash
npm install @postzen/node
```

## Usage

Authenticate with your PostZen API key as a bearer token:

```ts
import { ProfilesApi, PostsApi } from '@postzen/node';

const profiles = new ProfilesApi();
profiles.accessToken = process.env.POSTZEN_API_KEY!;

const { body } = await profiles.listProfiles();
console.log(body.profiles);
```

Available API classes:

- `ProfilesApi` — list, create, update, and delete profiles
- `AccountsApi` — list and disconnect connected social accounts
- `ConnectApi` — start and complete OAuth account connection flows
- `MediaApi` — create presigned upload URLs for PostZen-hosted media
- `PostsApi` — create drafts, scheduled posts, or immediate posts

## Documentation

See the full API reference at [docs.postzen.dev](https://docs.postzen.dev).

## Development

```bash
npm install
npm run build
```
