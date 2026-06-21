# GH Issue via Cloudflare Worker

A Cloudflare Worker that receives inbound email via Cloudflare Email Routing and creates a GitHub issue from it. The email subject becomes the issue title and the email body becomes the issue content. The sender's identity is never forwarded.

## Setup

1. **Clone and install**
   ```sh
   git clone https://github.com/arefm/github-issue-via-cloudflare-worker.git
   cd github-issue-via-cloudflare-worker
   npm install
   ```

2. **Configure** - open `src/config.js` and set `owner` and `repo` to your target GitHub repository. Optionally set `labels`, `assignee`, `branch`, and `project`.

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

All non-secret options are in `src/config.js`:

| Option | Default | Description |
|---|---|---|
| `github.owner` | `''` | GitHub repository owner |
| `github.repo` | `''` | GitHub repository name |
| `github.labels` | `[]` | Labels to apply to every issue |
| `github.project` | `null` | GitHub Project v2 node ID to link every issue to (see below) |
| `github.branch` | `null` | Branch name appended as a footer in the issue body |
| `github.assignee` | `null` | GitHub username to assign to every issue |
| `hideSender` | `true` | When true, the sender address is omitted from the issue |

### Finding your Project v2 node ID

Run the following to list your GitHub Projects and their node IDs:

```sh
gh api graphql -f query='{ viewer { projectsV2(first: 10) { nodes { id title } } } }'
```

Copy the `id` value (it looks like `PVT_kwDO...`) and set it as `github.project` in `src/config.js`.

If the project belongs to an organisation rather than your personal account, replace `viewer` with `organization(login: "your-org")`.

## Auto-deploy

Automatic deployment via GitHub Actions is disabled by default. To enable it, you need two Cloudflare credentials added as repository secrets, plus a repository variable to turn the deploy on.

If you prefer to deploy manually with `npm run deploy`, you can skip this section entirely and just run `npx wrangler login` once to authenticate locally.

**1. Get your Cloudflare credentials**

- **Account ID** - log in to the Cloudflare dashboard, select any domain, and copy the Account ID from the right-hand sidebar under "API".
- **API Token** - go to https://dash.cloudflare.com/profile/api-tokens, click "Create Token", and use the "Edit Cloudflare Workers" template. Scope it to your account.

**2. Add them as GitHub repository secrets**

Go to your repository on GitHub: Settings > Secrets and variables > Actions > Secrets > New repository secret.

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API Token |

**3. Enable auto-deploy**

In the same settings page, switch to the Variables tab and add:

| Variable | Value |
|---|---|
| `ENABLE_AUTO_DEPLOY` | `true` |

When unset or set to any other value, pushes to `master` will not trigger a deploy.

## Monitoring

Stream live logs from the deployed worker:
```sh
npx wrangler tail
```
