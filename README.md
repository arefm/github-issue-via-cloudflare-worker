# Github issue via Cloudflare worker

Cloudflare Worker that files GitHub issues from inbound email or an authenticated HTTP endpoint — routes different addresses to different repos/labels/assignees.

## Setup

1. **Clone and install**

   ```sh
   git clone https://github.com/arefm/github-issue-via-cloudflare-worker.git
   cd github-issue-via-cloudflare-worker
   npm install
   ```

2. **Configure** - define settings in `.dev.vars` (for local development) or `wrangler.toml` (for production) as environment variables.

3. **Set the GitHub token secret** - go to https://github.com/settings/personal-access-tokens, create a fine-grained token scoped to the target repository with `Issues: Read and write` permission, then run:

   ```sh
   npx wrangler secret put GITHUB_TOKEN
   ```

4. **Deploy**

   ```sh
   npm run deploy
   ```

5. **Configure Cloudflare Email Routing** - in the Cloudflare dashboard, enable Email Routing for your domain and add a custom address rule that routes inbound mail to this Worker.

## Configuration

All configuration options are defined as environment variables (loaded locally from `.dev.vars` / `.env` and set in production via `wrangler.toml` `[vars]` or Wrangler secrets):

| Option              | Type / Format                        | Description                                                          |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `GITHUB_OWNER`      | String                               | GitHub repository owner (e.g. `arefm`)                               |
| `GITHUB_REPO`       | String                               | GitHub repository name (e.g. `github-issue-via-cloudflare-worker`)   |
| `GITHUB_LABELS`     | JSON array or comma-separated string | Labels to apply to every issue (e.g. `["bug"]` or `bug,help wanted`) |
| `GITHUB_ASSIGNEE`   | String                               | GitHub username to assign to every issue                             |
| `HIDE_SENDER`       | Boolean string (`true`/`false`)      | When `true`, the sender address is omitted from the issue body       |
| `WORKER_API_SECRET` | String                               | API auth token for the Worker                                        |

## Auto-deploy

Automatic deployment via GitHub Actions is disabled by default. To enable it, you need two Cloudflare credentials added as repository secrets, plus a repository variable to turn the deploy on.

If you prefer to deploy manually with `npm run deploy`, you can skip this section entirely and just run `npx wrangler login` once to authenticate locally.

**1. Get your Cloudflare credentials**

- **Account ID** - log in to the Cloudflare dashboard, select any domain, and copy the Account ID from the right-hand sidebar under "API".
- **API Token** - go to https://dash.cloudflare.com/profile/api-tokens, click "Create Token", and use the "Edit Cloudflare Workers" template. Scope it to your account.

**2. Add them as GitHub repository secrets**

Go to your repository on GitHub: Settings > Secrets and variables > Actions > Secrets > New repository secret.

| Secret                  | Value                      |
| ----------------------- | -------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CLOUDFLARE_API_TOKEN`  | Your Cloudflare API Token  |

**3. Enable auto-deploy**

In the same settings page, switch to the Variables tab and add:

| Variable             | Value  |
| -------------------- | ------ |
| `ENABLE_AUTO_DEPLOY` | `true` |

When unset or set to any other value, pushes to `master` will not trigger a deploy.

## Monitoring

Stream live logs from the deployed worker:

```sh
npx wrangler tail
```

## Troubleshooting

### "Message blocked — 555 5.7.1 Internal error"

This bounce means the worker was invoked but threw an error and called `setReject`. To see the actual error, run `npx wrangler tail` and send a test email — the error is logged to the console.

Common causes:

**`GITHUB_TOKEN` not set or expired**

Verify the secret exists:

```sh
npx wrangler secret list
```

If it's missing or stale, re-set it:

```sh
npx wrangler secret put GITHUB_TOKEN
```

The token must be a fine-grained personal access token scoped to the target repository with `Issues: Read and write` permission.

**Label does not exist in the target repository**

GitHub's API returns a 422 error if any label in `GITHUB_LABELS` doesn't exist in the repo. Either create the label on GitHub first, or clear `GITHUB_LABELS` in your environment.

**Assignee is not a repository collaborator**

Setting `GITHUB_ASSIGNEE` to a user who is not a collaborator on the repository also causes a 422. Clear the variable if unsure.

### Auto-deploy not triggering

Check that the `ENABLE_AUTO_DEPLOY` repository variable is set to the string `true` (not a secret — it lives under Settings > Secrets and variables > Actions > **Variables**). If it is unset or set to any other value the workflow job is skipped.

Also verify both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are present under **Secrets** in the same settings page. The API token must be created using the **"Edit Cloudflare Workers"** template (or include at minimum `Account — Workers Scripts: Edit` permission). Leave the **Client IP Address Filtering** field empty so GitHub Actions' dynamic runner IPs are not blocked.
