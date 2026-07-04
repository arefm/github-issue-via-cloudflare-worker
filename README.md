# github-issue-via-cloudflare-worker

Cloudflare Worker that files GitHub issues from inbound email or an authenticated HTTP endpoint — routes different addresses to different repos/labels/assignees.

## What it does

The worker exposes two ways to create a GitHub issue, both funneling into the same GitHub REST API call:

- **Inbound email** — hook it up to Cloudflare Email Routing and any email sent to a configured address becomes a GitHub issue. The subject becomes the issue title, the body becomes the issue content. Optionally the sender's address is appended to the body (or hidden entirely).
- **`POST /issues` HTTP endpoint** — bearer-token authenticated, for filing issues from anything else that can make an HTTP request (a contact form, another service, a script). Accepts `title`, `body`, and optional `name`/`email` fields that get appended to the body.

### Why this is useful

- **No server to run.** It's a single Worker — no backend to host, patch, or pay for beyond Cloudflare's free tier.
- **Turns email into your issue tracker.** Point a support/feedback address at it and every message becomes a triaged GitHub issue instead of living in an inbox.
- **One worker, many destinations.** You're not limited to a single repo — different inbound addresses can file into different GitHub repos, with their own labels and assignee, all from one deployment (see [Multiple destinations / per-address routing](#multiple-destinations--per-address-routing) below).
- **Drop-in for forms.** The `/issues` endpoint means any static site or app can create GitHub issues without you writing or hosting API code.

## Setup

The interactive `npm run setup` script (aliased from `scripts/initialize.js`) does all of the configuration for you — it asks a series of questions and writes `wrangler.toml` and `.dev.vars` accordingly. It runs automatically after `npm install` (via the `postinstall` hook), but **only works in a real interactive terminal** — if it detects a non-interactive stdin (which is how npm invokes lifecycle scripts) it stops immediately with instructions instead of silently writing a blank config. In that case, just run it directly:

```sh
git clone https://github.com/arefm/github-issue-via-cloudflare-worker.git
cd github-issue-via-cloudflare-worker
npm install
node scripts/initialize.js   # only needed if postinstall told you to run it manually
```

### What `npm run setup` asks

1. **Checks your wrangler login** (`wrangler whoami`) — informational only; it just determines later whether you'll be offered the option to push secrets straight to Cloudflare.
2. **`GITHUB_TOKEN`** — a fine-grained GitHub personal access token scoped to your target repo with `Issues: Read and write`. Generate one at https://github.com/settings/personal-access-tokens.
3. **`WORKER_API_SECRET`** — the bearer token that protects `POST /issues`. Generate automatically (default) or paste your own.
4. **Default GitHub repository config** — `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_LABELS` (comma-separated or JSON array, e.g. `bug,feedback` or `["bug"]`), `GITHUB_ASSIGNEE`, and whether to hide the sender's address from the issue body (`HIDE_SENDER`). This is the fallback config used by `POST /issues` and by any inbound address that doesn't have its own override.
5. **Email routing (`send_email` bindings)** — loops so you can define one or more bindings:
   - A binding name (defaults to `SEND_EMAIL`, `SEND_EMAIL2`, ...).
   - Whether to restrict it to specific destination address(es). Leave unrestricted, or list one or more addresses (comma-separated).
   - If you gave it addresses, you can optionally override `GITHUB_OWNER`/`GITHUB_REPO`/`GITHUB_LABELS`/`GITHUB_ASSIGNEE` just for that group of addresses (press enter to reuse the default from step 4). See below for how this routing works at runtime.
   - Keeps asking "add another binding?" until you say no.
6. **Custom domain (optional)** — a bare hostname (e.g. `mail.example.com`, no wildcards or paths — Cloudflare Custom Domains reject those). If set, the worker deploys to that domain and `workers_dev` is turned off; if left blank, it deploys to the default `*.workers.dev` subdomain instead.
7. **Observability (optional, defaults to yes)** — whether to turn on Workers Logs and Traces, plus a sampling rate from `0.0` to `1.0` (`1` = every request). This is what powers `wrangler tail` and the dashboard's request logs.
8. **Push secrets to Cloudflare (optional)** — only offered if you're logged in to wrangler. If yes, it runs `wrangler secret put` for `GITHUB_TOKEN` and `WORKER_API_SECRET` immediately, so your live Worker is ready to deploy without a separate manual step.

### Multiple destinations / per-address routing

If you gave one or more `send_email` bindings a specific GitHub config in step 5, that mapping is written to a `GITHUB_ROUTES` variable (a JSON object keyed by lowercased recipient address). When an email arrives, the worker looks up the recipient address in `GITHUB_ROUTES` and uses that repo/labels/assignee instead of the default — so `bugs@yourdomain.com` and `feedback@yourdomain.com` can file into two entirely different repositories from the same deployment. Addresses with no match, and the `POST /issues` endpoint, always use the default config from step 4.

### Configure Cloudflare Email Routing

After deploying, go to the Cloudflare dashboard, enable Email Routing for your domain, and add address rules that route inbound mail for each configured address to this Worker.

### Deploy

```sh
npm run deploy
```

## Resetting your local configuration

```sh
npm run reset
```

This runs `scripts/reset.js`, which:

1. Deletes your local `wrangler.toml` — after asking you to confirm.
2. Optionally deletes the live `GITHUB_TOKEN` and `WORKER_API_SECRET` Cloudflare secrets too (`wrangler secret delete`), if you want a completely clean slate.

It never touches `.dev.vars` — edit or delete that file by hand if you want to change local secrets. Afterwards, re-run `npm run setup` (or `node scripts/initialize.js`) to reconfigure.

## Configuration reference

All configuration is read directly from environment variables — locally from `.dev.vars`, in production from `wrangler.toml` `[vars]` (non-secret) or Wrangler secrets.

| Option | Type / Format | Description |
|---|---|---|
| `GITHUB_OWNER` | String | Default GitHub repository owner |
| `GITHUB_REPO` | String | Default GitHub repository name |
| `GITHUB_LABELS` | JSON array or comma-separated string | Labels applied to issues that use the default config (e.g. `["bug"]` or `bug,help wanted`) |
| `GITHUB_ASSIGNEE` | String | GitHub username assigned to issues that use the default config |
| `GITHUB_ROUTES` | JSON string | Per-address overrides, keyed by lowercased recipient address: `{"sales@example.com":{"owner":"...","repo":"...","labels":["..."],"assignee":"..."}}`. Only used by the email handler. |
| `HIDE_SENDER` | Boolean string (`true`/`false`) | When `true`, the sender address is omitted from the issue body |
| `GITHUB_TOKEN` | Secret | Fine-grained GitHub PAT with `Issues: Read and write` |
| `WORKER_API_SECRET` | Secret | Bearer token required by `POST /issues` |

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

GitHub's API returns a 422 error if any label in `GITHUB_LABELS` (or a route's labels) doesn't exist in the repo. Either create the label on GitHub first, or clear it in your configuration.

**Assignee is not a repository collaborator**

Setting an assignee who is not a collaborator on the repository also causes a 422. Clear the variable if unsure.
