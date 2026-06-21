import { config } from './config.js';

export async function createIssue(title, body, env) {
  const { owner, repo, labels, branch, assignee } = config.github;

  if (branch) {
    body += `\n\n---\n_Branch: ${branch}_`;
  }

  const payload = { title, body };
  if (labels.length > 0) payload.labels = labels;
  if (assignee) payload.assignees = [assignee];

  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'github-issue-via-cloudflare-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${responseText}`);
  }

  const responseJson = await response.json();
  return responseJson.html_url;
}
