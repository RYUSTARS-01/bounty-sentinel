// Opportunity score.
//
// Two things kill a bounty: it sat too long (someone else found it), or other
// people are already competing for it. So the score is
//
//     amount × freshness × competition
//
// freshness halves every 72 hours, competition is 1/(1 + 2·openPRs + 0.5·closedPRs).
// It is deliberately crude — you want to re-read the issue anyway.
const HALF_LIFE_HOURS = 72

export function scoreBounty(bounty, now = Date.now()) {
  const posted = Date.parse(bounty.postedAt) || now
  const ageHours = Math.max(0, (now - posted) / 36e5)
  const freshness = 0.5 ** (ageHours / HALF_LIFE_HOURS)

  let competition
  let verdict
  if (bounty.openPRs == null) {
    competition = 0.35 // unknown: assume some competition, but not fatal
    verdict = 'unknown'
  } else {
    competition = 1 / (1 + 2 * bounty.openPRs + 0.5 * (bounty.closedPRs ?? 0))
    if (bounty.openPRs === 0 && ageHours <= 24) verdict = 'grab'
    else if (bounty.openPRs <= 2 && ageHours <= 168) verdict = 'watch'
    else verdict = 'skip'
  }

  return {
    ageHours,
    freshness,
    competition,
    score: bounty.amount * freshness * competition,
    verdict,
  }
}

export function rank(bounties, now = Date.now()) {
  return bounties
    .map((b) => ({ ...b, ...scoreBounty(b, now) }))
    .sort((a, b) => b.score - a.score)
}
