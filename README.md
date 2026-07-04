# Github issue via Cloudflare worker

A Cloudflare Worker that files GitHub issues from inbound email or from an authenticated HTTP endpoint. It can also route different addresses to different repos, labels and assignees.

## What it does

The worker gives you two ways to create a GitHub issue, and both end up calling the same GitHub API code underneath:

- **Inbound email**. Hook it up to Cloudflare Email Routing and any email sent to a configured address turns into a GitHub issue. The subject becomes the issue title, the body becomes the issue content. You can optionally append the sender's address to the body, or hide it completely.
- **`POST /issues` HTTP endpoint**. Protected with a bearer token, so anything that can make an HTTP request can file an issue: a contact form, another service, a script. It takes a `title`, a `body`, and optional `name`/`email` fields that get appended to the body.

### Why this is useful

- **No server to run.** It's just a Worker. There's no backend to host, patch or pay for beyond Cloudflare's free tier.
- **Turns email into your issue tracker.** Point a support or feedback address at it and every message becomes a real GitHub issue instead of sitting in an inbox.
- **One worker, many destinations.** You're not stuck with a single repo. Different inbound addresses can file into different GitHub repos, each with its own labels and assignee, all from one deployment. See "Multiple destinations" below.
- **Drop-in for forms.** The `/issues` endpoint means any static site or app can create GitHub issues without you writing or hosting your own API for it.

## Setup

There's an interactive script, `npm run setup` (this just runs `scripts/initialize.js`), that walks you through configuration and writes `wrangler.toml` and `.dev.vars` for you. It also runs automatically after `npm install` through the `postinstall` hook.

One thing to know: it needs a real interactive terminal to work. When npm runs `postinstall` on its own, it doesn't connect your terminal's input to the script, so if it detects that, it stops right away and tells you to run it manually instead of silently writing an empty config. If that happens, just run it yourself:

```sh
git clone https://github.com/arefm/github-issue-via-cloudflare-worker.git
cd github-issue-via-cloudflare-worker
npm install
node scripts/initialize.js
```

### What it asks you

1. First it checks if you're logged in to wrangler (`wrangler whoami`). This is just informational, it decides later whether you'll be offered the option to push secrets straight to Cloudflare.
2. **GITHUB_TOKEN**: a fine-grained GitHub personal access token, scoped to your repo, with "Issues: Read and write" permission. You can generate one at https://github.com/settings/personal-access-tokens.
3. **WORKER_API_SECRET**: the bearer token that protects `POST /issues`. You can let the script generate one for you (the default) or paste your own.
4. **Default GitHub repository config**: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_LABELS` (either comma separated or a JSON array, so `bug,feedback` or `["bug"]` both work), `GITHUB_ASSIGNEE`, and whether to hide the sender's address from the issue body (`HIDE_SENDER`). This is the fallback config, used by `POST /issues` and by any inbound address that doesn't have a more specific override.
5. **Email routing (send_email bindings)**. This part loops so you can set up more than one:
   - A binding name. Defaults to `SEND_EMAIL`, then `SEND_EMAIL2`, and so on.
   - Whether to restrict it to specific destination address(es). You can leave it unrestricted or list one or more addresses, comma separated.
   - If you gave it addresses, you can optionally set a different `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_LABELS` and `GITHUB_ASSIGNEE` just for that group of addresses. Press enter on any of these to just reuse the default from step 4. More on how this works below.
   - It keeps asking "add another binding?" until you say no.
6. **Custom domain**, optional. Just a plain hostname, like `mail.example.com`. No wildcards or paths, Cloudflare's Custom Domains don't allow those. If you set one, the worker deploys to that domain and `workers_dev` is turned off. If you leave it blank, it deploys to the default `*.workers.dev` subdomain instead.
7. **Observability**, optional, defaults to yes. Whether to turn on Workers Logs and Traces, and a sampling rate between 0.0 and 1.0, where 1 means every request. This is what feeds `wrangler tail` and the request logs you see in the dashboard.
8. **Pushing secrets to Cloudflare**, optional, and only offered if you're logged in to wrangler. If you say yes, it runs `wrangler secret put` for `GITHUB_TOKEN` and `WORKER_API_SECRET` right there, so your live Worker is ready to deploy without you having to do that step separately.

### Multiple destinations

If you gave one of the send_email bindings its own GitHub config in step 5, that mapping gets written into a `GITHUB_ROUTES` variable (a JSON object keyed by the lowercased recipient address). When an email comes in, the worker looks up the recipient address in `GITHUB_ROUTES` and, if there's a match, uses that repo, labels and assignee instead of the default ones. So `bugs@yourdomain.com` and `feedback@yourdomain.com` can end up filing issues in two completely different repositories from the same deployment. Anything that doesn't match, and the `POST /issues` endpoint, always falls back to the default config from step 4.

### Configure Cloudflare Email Routing

Once it's deployed, go to the Cloudflare dashboard, turn on Email Routing for your domain, and add address rules that send inbound mail for each configured address to this worker.

### Deploy

```sh
npm run deploy
```

## Resetting your local configuration

```sh
npm run reset
```

This runs `scripts/reset.js`, which does two things:

1. Deletes your local `wrangler.toml`, after asking you to confirm first.
2. Optionally deletes the live `GITHUB_TOKEN` and `WORKER_API_SECRET` secrets from Cloudflare too (`wrangler secret delete`), in case you want a completely clean slate.

It never touches `.dev.vars`. If you want to change your local secrets, edit or delete that file yourself. Afterwards, run `npm run setup` again to reconfigure everything.

## Configuration reference

Everything is read from environment variables. Locally that's `.dev.vars`, in production it's `wrangler.toml`'s `[vars]` section for non-secret values, or Wrangler secrets for the rest.

| Option              | Type / Format                        | Description                                                                                                                                                                           |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_OWNER`      | String                               | Default GitHub repository owner                                                                                                                                                       |
| `GITHUB_REPO`       | String                               | Default GitHub repository name                                                                                                                                                        |
| `GITHUB_LABELS`     | JSON array or comma-separated string | Labels applied to issues using the default config, e.g. `["bug"]` or `bug,help wanted`                                                                                                |
| `GITHUB_ASSIGNEE`   | String                               | GitHub username assigned to issues using the default config                                                                                                                           |
| `GITHUB_ROUTES`     | JSON string                          | Per-address overrides, keyed by lowercased recipient address: `{"sales@example.com":{"owner":"...","repo":"...","labels":["..."],"assignee":"..."}}`. Only used by the email handler. |
| `HIDE_SENDER`       | Boolean string (`true`/`false`)      | When `true`, the sender's address is left out of the issue body                                                                                                                       |
| `GITHUB_TOKEN`      | Secret                               | Fine-grained GitHub PAT with "Issues: Read and write"                                                                                                                                 |
| `WORKER_API_SECRET` | Secret                               | Bearer token required by `POST /issues`                                                                                                                                               |

## Monitoring

To stream live logs from the deployed worker:

```sh
npx wrangler tail
```

## Troubleshooting

### "Message blocked, 555 5.7.1 Internal error"

This bounce means the worker was invoked but threw an error and called `setReject`. To see what actually happened, run `npx wrangler tail`, then send a test email. The error will show up in the console.

Common causes:

**GITHUB_TOKEN not set or expired**

Check that the secret exists:

```sh
npx wrangler secret list
```

If it's missing or stale, set it again:

```sh
npx wrangler secret put GITHUB_TOKEN
```

It needs to be a fine-grained personal access token scoped to the target repository, with "Issues: Read and write" permission.

**Label doesn't exist in the target repository**

GitHub's API returns a 422 error if any label in `GITHUB_LABELS` (or in a route's labels) doesn't exist in that repo. Either create the label on GitHub first, or clear it from your configuration.

**Assignee isn't a repository collaborator**

Setting an assignee who isn't a collaborator on the repository also causes a 422. Clear the variable if you're not sure.
