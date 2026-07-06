import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import PostZen, { PostZenApiError, type MediaPresignRequest } from '@postzen/node';

const DEFAULT_CONTENT_TYPE: MediaPresignRequest['contentType'] = 'image/png';

async function main() {
  const filePath = process.argv[2];
  const contentType = (process.argv[3] ?? DEFAULT_CONTENT_TYPE) as MediaPresignRequest['contentType'];

  if (!filePath) {
    throw new Error('Usage: tsx examples/media-upload.ts ./image.png image/png');
  }

  const postzen = new PostZen();
  const file = await readFile(filePath);

  try {
    const { data: presign } = await postzen.media.createMediaPresign({
      body: {
        filename: basename(filePath),
        contentType,
        size: file.byteLength,
      },
    });

    if (!presign) {
      throw new Error('Failed to create a presigned upload URL.');
    }

    const uploadResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file as unknown as BodyInit,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with ${uploadResponse.status}`);
    }

    const { data: accountsData } = await postzen.accounts.listAccounts({
      query: {
        status: 'connected',
      },
    });
    const account = accountsData?.accounts[0];

    if (!account) {
      console.log('Uploaded media, but no connected account is available for posting.');
      console.log(`Media URL: ${presign.publicUrl}`);
      return;
    }

    const { data } = await postzen.posts.createPost({
      body: {
        title: 'Post with uploaded media',
        content: 'This post uses media uploaded through a presigned PostZen URL.',
        publishNow: true,
        mediaItems: [
          {
            url: presign.publicUrl,
            title: basename(filePath),
          },
        ],
        platforms: [
          {
            platform: account.platform,
            accountId: account._id,
          },
        ],
      },
    });

    if (data && 'post' in data) {
      console.log(`Created post ${data.post._id}`);
    } else if (data) {
      console.log(`Reused existing post ${data.existingPost._id}`);
    }
  } catch (error) {
    if (error instanceof PostZenApiError) {
      console.error(`PostZen API error ${error.statusCode}: ${error.message}`);
      return;
    }

    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
