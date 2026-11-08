// Opire: GitHub-issue bounties. Its public feed is small but needs no auth.
import { getJson } from '../http.mjs'

const API = 'https://api.opire.dev/rewards'

export const name = 'opire'

function parseRepo(url) {
  const m = /github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/.exec(url || '')
  return m ? { repo: `${m[1]}/${m[2]}`, issue: Number(m[3]) } : null
}

export async function list() {
  const { json } = await getJson(API, { headers: { 'user-agent': 'bounty-sentinel' } })
  const rows = Array.isArray(json) ? json : (json.rewards ?? json.data ?? [])

  return rows.flatMap((r) => {
    const target = parseRepo(r.url)
    if (!target) return []
    const cents = r.pendingPrice?.value ?? 0
    return [{
      source: name,
      id: r.id,
      repo: target.repo,
      issue: target.issue,
      title: r.title || `${target.repo}#${target.issue}`,
      amount: cents / 100,
      currency: 'USD',
      lang: (r.programmingLanguages || []).join(', '),
      postedAt: new Date(r.createdAt || Date.now()).toISOString(),
      issueCreatedAt: null,
      url: r.url,
      notes: r.claimerUsers?.length ? `claimed by ${r.claimerUsers.length}` : '',
    }]
  })
}
