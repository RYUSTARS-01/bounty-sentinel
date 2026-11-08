#!/usr/bin/env node
// bounty-sentinel — watch bounty boards, but only for bounties worth taking.
import fs from 'node:fs'
import * as bountyhub from './sources/bountyhub.mjs'
import * as opire from './sources/opire.mjs'
import { createGitHub } from './github.mjs'
import { rank } from './score.mjs'

const SOURCES = [bountyhub, opire]

const USAGE = `bounty-sentinel — fresh, unclaimed GitHub bounties only

Usage:
  bounty-sentinel scan  [options]     one pass, prints a ranked table
  bounty-sentinel watch [options]     loop, prints only new bounties

Options:
  --hours <n>        ignore bounties older than n hours (default 168)
  --min <usd>        ignore bounties under this amount (default 10)
  --lang <a,b>       keep only these languages (e.g. TypeScript,Python)
  --max-check <n>    max GitHub API probes this run (default 25)
  --top <n>          rows to print (default 20)
  --json             machine-readable output
  --interval <min>   watch loop interval in minutes (default 30)
  --state <path>     state file for watch mode
  --token <pat>      GitHub token (or set GITHUB_TOKEN) for 5000 req/h instead of 60

Verdicts:
  grab    0 PRs, posted < 24h  — read it now
  watch   ≤ 2 PRs, posted < 7d — worth a look
  skip    crowded or stale
`

function parseArgs(argv) {
  const opts = {
    command: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'scan',
    hours: 168,
    min: 10,
    maxCheck: 25,
    top: 20,
    json: false,
    interval: 30,
    state: '.bounty-state.json',
    token: process.env.GITHUB_TOKEN || '',
    lang: '',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === 'scan' || a === 'watch') opts.command = a
    else if (a === '--hours') opts.hours = Number(next())
    else if (a === '--min') opts.min = Number(next())
    else if (a === '--lang') opts.lang = next()
    else if (a === '--max-check') opts.maxCheck = Number(next())
    else if (a === '--top') opts.top = Number(next())
    else if (a === '--interval') opts.interval = Number(next())
    else if (a === '--state') opts.state = next()
    else if (a === '--token') opts.token = next()
    else if (a === '--json') opts.json = true
    else if (a === '--help' || a === '-h') opts.help = true
  }
  return opts
}

async function collect(opts, gh) {
  const results = await Promise.all(
    SOURCES.map((s) =>
      s.list().catch((err) => {
        console.error(`[warn] ${s.name}: ${err.message}`)
        return []
      })
    )
  )
  const all = results.flat()

  const cutoff = Date.now() - opts.hours * 36e5
  let candidates = all.filter((b) => Date.parse(b.postedAt) >= cutoff && b.amount >= opts.min)
  if (opts.lang) {
    const wanted = opts.lang.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    candidates = candidates.filter((b) => wanted.some((w) => (b.lang || '').toLowerCase().includes(w)))
  }

  // Spend the rate limit on the bounties that look best before competition is known.
  candidates.sort((a, b) => b.amount - a.amount)
  const toCheck = candidates.slice(0, opts.maxCheck)

  let checked = 0
  for (const b of toCheck) {
    try {
      Object.assign(b, await gh.competition(b.repo, b.issue))
      checked++
    } catch (err) {
      b.openPRs = null
      b.error = err.message
    }
    await new Promise((r) => setTimeout(r, 350))
  }

  return { candidates, checked, total: all.length }
}

function pad(s, n) {
  s = String(s ?? '')
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function printTable(rows, opts, meta) {
  if (!rows.length) {
    console.log(`No bounties matched (${meta.total} open on ${SOURCES.length} boards).`)
    return
  }
  console.log(
    `${pad('verdict', 8)} ${pad('score', 7)} ${pad('amt', 8)} ${pad('age', 6)} ${pad('prs', 5)} target`
  )
  for (const r of rows.slice(0, opts.top)) {
    const age = r.ageHours < 1 ? `${Math.round(r.ageHours * 60)}m` : r.ageHours < 48 ? `${Math.round(r.ageHours)}h` : `${Math.round(r.ageHours / 24)}d`
    const prs = r.openPRs == null ? '?' : String(r.openPRs)
    console.log(
      `${pad(r.verdict, 8)} ${pad(r.score.toFixed(1), 7)} ${pad(`$${r.amount}`, 8)} ${pad(age, 6)} ${pad(prs, 5)} ${r.repo}#${r.issue}  ${r.title.slice(0, 58)}`
    )
  }
  const counts = rows.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] || 0) + 1), acc), {})
  console.log(
    `\n${meta.total} open · ${meta.candidates.length} in window · ${meta.checked} probed · ` +
      Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ') +
      (meta.ghRemaining != null ? ` · github rate left ${meta.ghRemaining}` : '')
  )
}

function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return console.log(USAGE)

  const gh = createGitHub({ token: opts.token })

  if (opts.command === 'scan') {
    const { candidates, checked, total } = await collect(opts, gh)
    const ranked = rank(candidates)
    if (opts.json) {
      console.log(JSON.stringify({ at: stamp(), total, checked, bounties: ranked }, null, 2))
    } else {
      printTable(ranked, opts, { candidates, checked, total, ghRemaining: gh.remaining })
    }
    return
  }

  // watch: keep scanning, report only what is new since the state file
  const state = loadState(opts.state)
  process.on('SIGINT', () => {
    fs.writeFileSync(opts.state, JSON.stringify(state, null, 2))
    process.exit(0)
  })

  for (;;) {
    try {
      const { candidates, checked, total } = await collect(opts, gh)
      const ranked = rank(candidates)

      const fresh = ranked.filter((r) => !state[r.id])
      for (const r of ranked) {
        state[r.id] = {
          firstSeen: state[r.id]?.firstSeen ?? stamp(),
          lastSeen: stamp(),
          openPRs: r.openPRs,
          verdict: r.verdict,
        }
      }
      fs.writeFileSync(opts.state, JSON.stringify(state, null, 2))

      console.log(`[${stamp()}] ${total} open · ${candidates.length} in window · ${checked} probed · ${fresh.length} new`)
      for (const r of fresh.filter((x) => x.verdict !== 'skip')) {
        console.log(
          `  ★ ${r.verdict.toUpperCase()} $${r.amount} ${r.repo}#${r.issue} (${r.openPRs ?? '?'} PRs, ${Math.round(r.ageHours)}h) ${r.title.slice(0, 70)}`
        )
      }
    } catch (err) {
      console.error(`[${stamp()}] scan failed: ${err.message}`)
    }
    await new Promise((r) => setTimeout(r, opts.interval * 60e3))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
