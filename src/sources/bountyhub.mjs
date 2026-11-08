// BountyHub exposes an unauthenticated JSON API used by its own web app.
// No browser required — one GET returns every open bounty.
import { getJson } from '../http.mjs'

const API = 'https://api.bountyhub.dev/api/bounties'

export const name = 'bountyhub'

export async function list() {
  const query = new URLSearchParams({
    page: '1',
    limit: '100',
    filters: JSON.stringify({ language: '', repositoryFullName: '', solved: false }),
    sort: JSON.stringify([{ orderBy: 'createdAt', order: 'desc' }]),
  })

  const { json } = await getJson(`${API}?${query}`, { headers: { 'user-agent': 'bounty-sentinel' } })
  const rows = Array.isArray(json.data) ? json.data : []

  return rows
    .filter((b) => !b.claimed && !b.solved && !b.retracted && b.issueState === 'open')
    .map((b) => ({
      source: name,
      id: b.id,
      repo: b.repositoryFullName,
      issue: b.issueNumber,
      title: b.title,
      amount: Number(b.amount) || 0,
      currency: 'USD',
      lang: b.language || '',
      postedAt: b.createdAt,
      issueCreatedAt: b.githubCreatedAt,
      url: b.htmlURL,
      notes: (b.additionalDescription || '').trim(),
    }))
}
