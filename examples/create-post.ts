import PostZen, { PostZenApiError } from '@postzen/node';

async function main() {
  const postzen = new PostZen();

  try {
    const { data: accountsData } = await postzen.accounts.listAccounts({
      query: {
        status: 'connected',
      },
    });
    const account = accountsData?.accounts[0];

    if (!account) {
      console.log('No connected accounts found.');
      return;
    }

    const { data } = await postzen.posts.createPost({
      body: {
        title: 'SDK launch post',
        content: 'Publishing from the PostZen Node SDK.',
        publishNow: true,
        platforms: [
          {
            platform: account.platform,
            accountId: account._id,
          },
        ],
      },
    });

    if (data && 'post' in data) {
      console.log(`Created post ${data.post._id} with status ${data.post.status}`);
    } else if (data) {
      console.log(`Reused existing post ${data.existingPost._id}`);
    }
  } catch (error) {
    if (error instanceof PostZenApiError) {
      console.error(`PostZen API error ${error.statusCode}: ${error.message}`);

      if (error.code) {
        console.error(`Code: ${error.code}`);
      }

      return;
    }

    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
