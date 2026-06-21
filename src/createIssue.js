import { config } from './config.js';

export async function createIssue(title, body, env) {
  const { owner, repo, labels, project, branch, assignee } = config.github;

  if (branch) {
    body += `\n\n---\n_Branch: ${branch}_`;
  }

  const payload = { title, body };
  if (labels.length > 0) payload.labels = labels;
  if (assignee) payload.assignees = [assignee];

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
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

  const issue = await response.json();

  if (project) {
    await addIssueToProject(issue.node_id, project, env.GITHUB_TOKEN);
  }

  return issue.html_url;
}

async function addIssueToProject(issueNodeId, projectId, token) {
  const query = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'github-issue-via-cloudflare-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { projectId, contentId: issueNodeId } }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`GitHub GraphQL error ${response.status}: ${responseText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GitHub GraphQL error: ${result.errors[0].message}`);
  }
}
