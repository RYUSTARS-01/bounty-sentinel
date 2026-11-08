// GitHub competition probe: how many PRs already target this issue?
//
// This is the part every other bounty feed skips. A bounty with no PRs is
// worth reading; a bounty with six agent-submitted PRs is a lottery ticket.
import { getJson } from './http.mjs'

const BASE = 'https://api.github.com'

export function createGitHub({ token = process.env.GITHUB_TOKEN, ttlMs = 30 * 60e3 } = {}) {
  const cache = new Map()
  let remaining = null

  async function api(path) {
    const headers = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'bounty-sentinel',
    }
    if (token) headers.authorization = `Bearer ${token}`
    const { json, headers: resHeaders } = await getJson(`${BASE}${path}`, { headers })
    const left = resHeaders.get('x-ratelimit-remaining')
    if (left !== null) remaining = Number(left)
    return json
  }

  async function competition(repo, issue) {
    const key = `${repo}#${issue}`
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    if (remaining !== null && remaining < 5) {
      throw new Error('GitHub rate limit nearly exhausted — slowdown or set GITHUB_TOKEN')
    }

    const events = await api(`/repos/${repo}/issues/${issue}/timeline?per_page=100`)
    const pulls = []
    for (const ev of Array.isArray(events) ? events : []) {
      if (ev.event === 'cross-referenced' && ev.source?.issue?.pull_request) {
        pulls.push({
          number: ev.source.issue.number,
          state: ev.source.issue.state,
          author: ev.source.issue.user?.login ?? null,
        })
      }
    }

    const value = {
      openPRs: pulls.filter((p) => p.state === 'open').length,
      closedPRs: pulls.filter((p) => p.state !== 'open').length,
      authors: [...new Set(pulls.map((p) => p.author).filter(Boolean))],
      checkedAt: new Date().toISOString(),
    }
    cache.set(key, { at: Date.now(), value })
    return value
  }

  return {
    competition,
    get remaining() {
      return remaining
    },
  }
}
