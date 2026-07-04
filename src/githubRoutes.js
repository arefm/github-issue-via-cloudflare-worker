export function resolveGithubConfig(env, address) {
  if (!env.GITHUB_ROUTES || !address) return env;

  let routes;
  try {
    routes = typeof env.GITHUB_ROUTES === 'string' ? JSON.parse(env.GITHUB_ROUTES) : env.GITHUB_ROUTES;
  } catch {
    return env;
  }

  const route = routes[address.toLowerCase()];
  if (!route) return env;

  return {
    ...env,
    GITHUB_OWNER: route.owner ?? env.GITHUB_OWNER,
    GITHUB_REPO: route.repo ?? env.GITHUB_REPO,
    GITHUB_LABELS: route.labels ?? env.GITHUB_LABELS,
    GITHUB_ASSIGNEE: route.assignee ?? env.GITHUB_ASSIGNEE,
  };
}
