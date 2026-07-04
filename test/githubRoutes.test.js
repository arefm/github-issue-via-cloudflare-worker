import { describe, expect, it } from 'vitest';
import { resolveGithubConfig } from '../src/githubRoutes.js';

describe('resolveGithubConfig', () => {
  const baseEnv = {
    GITHUB_OWNER: 'default-owner',
    GITHUB_REPO: 'default-repo',
    GITHUB_LABELS: ['default-label'],
    GITHUB_ASSIGNEE: 'default-assignee',
  };

  it('returns the env unchanged when GITHUB_ROUTES is not set', () => {
    expect(resolveGithubConfig(baseEnv, 'someone@example.com')).toBe(baseEnv);
  });

  it('returns the env unchanged when address is not provided', () => {
    const env = { ...baseEnv, GITHUB_ROUTES: JSON.stringify({ 'a@example.com': { owner: 'x' } }) };
    expect(resolveGithubConfig(env, undefined)).toBe(env);
  });

  it('returns the env unchanged when the address has no matching route', () => {
    const env = { ...baseEnv, GITHUB_ROUTES: JSON.stringify({ 'a@example.com': { owner: 'x' } }) };
    expect(resolveGithubConfig(env, 'b@example.com')).toBe(env);
  });

  it('overrides only the fields provided by a matching route (case-insensitively)', () => {
    const env = {
      ...baseEnv,
      GITHUB_ROUTES: JSON.stringify({
        'sales@example.com': { owner: 'sales-owner', repo: 'sales-repo', labels: ['sales'], assignee: 'sales-bot' },
      }),
    };

    const resolved = resolveGithubConfig(env, 'Sales@Example.com');

    expect(resolved.GITHUB_OWNER).toBe('sales-owner');
    expect(resolved.GITHUB_REPO).toBe('sales-repo');
    expect(resolved.GITHUB_LABELS).toEqual(['sales']);
    expect(resolved.GITHUB_ASSIGNEE).toBe('sales-bot');
  });

  it('falls back to base env fields when a route omits them', () => {
    const env = {
      ...baseEnv,
      GITHUB_ROUTES: JSON.stringify({ 'sales@example.com': { repo: 'sales-repo' } }),
    };

    const resolved = resolveGithubConfig(env, 'sales@example.com');

    expect(resolved.GITHUB_OWNER).toBe('default-owner');
    expect(resolved.GITHUB_REPO).toBe('sales-repo');
    expect(resolved.GITHUB_ASSIGNEE).toBe('default-assignee');
  });

  it('returns the env unchanged when GITHUB_ROUTES is invalid JSON', () => {
    const env = { ...baseEnv, GITHUB_ROUTES: 'not-json' };
    expect(resolveGithubConfig(env, 'a@example.com')).toBe(env);
  });

  it('accepts GITHUB_ROUTES already parsed as an object', () => {
    const env = { ...baseEnv, GITHUB_ROUTES: { 'a@example.com': { owner: 'obj-owner' } } };
    expect(resolveGithubConfig(env, 'a@example.com').GITHUB_OWNER).toBe('obj-owner');
  });
});
