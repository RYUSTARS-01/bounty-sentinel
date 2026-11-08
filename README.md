# bounty-sentinel

**Bounty boards are full of AI agents. This one tells you which bounties are still worth reading.**

`bounty-sentinel` watches GitHub-issue bounty boards and filters them by the two things that actually decide whether you have a chance:

1. **freshness** — how long ago the bounty was posted, and
2. **competition** — how many pull requests already target that issue.

A bounty with six agent-submitted PRs is a lottery ticket, not an opportunity. A bounty posted 40 minutes ago with zero PRs is worth dropping everything for. Feeds that only show you "open bounties" hide exactly that difference.

```
verdict  score   amt      age    prs   target
grab     58.2    $60      0h     0     some-org/some-repo#1445  Crash when exporting audio
watch    12.4    $420     3d     2     other-org/other-repo#1336  Feature request: basic TX support
skip     4.1     $420     9d     6     gqrx-sdr/gqrx#1336  [Feature request] Basic TX support
skip     0.9     $300     14d    6     microg/GmsCore#1272  Implementation of Nearby Share
```

## Why this exists

On 2026-11-08 we scanned the public boards by hand:

| Board | Open bounties | Newest bounty posted | Notes |
|---|---|---|---|
| BountyHub | 30 | **9 days ago** | every feasible bounty already had **3–6 PRs**; one $10 issue had 24 |
| Opire | 3 | months old | one already had a competing PR |
| Algora | — | — | pivoted to recruiting; `/bounties` returns 404 |

The market is not "impossible", it's *crowded*: BountyHub has paid out recently ($75 on 2026-10-16, $200 on 2026-09-17), but supply is thin and anything easy is claimed within days. The only edge left is **speed** — and speed needs a watcher that understands competition, not just a feed.

## Install

No dependencies, Node 20+.

```bash
git clone https://github.com/RYUSTARS-01/bounty-sentinel
cd bounty-sentinel
node src/cli.mjs scan
```

## Usage

One pass:

```bash
node src/cli.mjs scan --hours 168 --min 20 --top 15
```

Loop forever (only prints bounties it has not seen before):

```bash
node src/cli.mjs watch --interval 30
```

Options:

| Flag | Meaning | Default |
|---|---|---|
| `--hours <n>` | ignore bounties older than n hours | `168` |
| `--min <usd>` | ignore bounties below this amount | `10` |
| `--lang <a,b>` | keep only these languages | all |
| `--max-check <n>` | max GitHub API probes per run | `25` |
| `--top <n>` | rows to print | `20` |
| `--interval <min>` | watch loop interval | `30` |
| `--state <path>` | state file used by watch mode | `.bounty-state.json` |
| `--json` | machine-readable output | off |
| `--token <pat>` | GitHub token (or `GITHUB_TOKEN`) | — |

**Use a token.** Unauthenticated GitHub allows 60 API calls/hour; each check costs one. With `GITHUB_TOKEN` you get 5,000/hour.

### Reading the verdict

| Verdict | Meaning |
|---|---|
| `grab` | 0 PRs and posted less than 24 h ago — read the issue now |
| `watch` | ≤ 2 PRs and posted less than 7 days ago — worth a look |
| `skip` | crowded or stale |
| `unknown` | GitHub check failed or rate-limited; treat as risky |

### Score

```
score = amount × freshness × competition
freshness   = 0.5 ^ (ageHours / 72)          # halves every three days
competition = 1 / (1 + 2·openPRs + 0.5·closedPRs)
```

It is deliberately crude — it ranks what to read first, it does not judge whether you can fix it.

## How it works

- **BountyHub** — its web app talks to `https://api.bountyhub.dev/api/bounties`, which is public and needs no browser. One GET returns all open bounties.
- **Opire** — `https://api.opire.dev/rewards`, also public.
- **Competition** — `GET /repos/{owner}/{repo}/issues/{n}/timeline` and count `cross-referenced` events that are pull requests.

No browser automation, no headless Chrome, no scraping HTML.

## Limitations

- Only boards with public APIs are supported (BountyHub, Opire). Adding a source is ~30 lines: see `src/sources/`.
- GitHub's unauthenticated rate limit is the real constraint; the default `--max-check 25` is sized for it.
- "No PR yet" is not "no one is working on it" — people sometimes work silently. It is a strong signal, not a guarantee.
- `closed` PRs are counted too, because twenty rejected PRs is also a red flag.

## Roadmap

- [ ] Gitcoin / Dework / MergePay adapters
- [ ] Webhook mode (push instead of poll)
- [ ] `--claim-check`: does the issue have an assignee or an accepted PR already?
- [ ] Track how fast a bounty gets its first PR per repo (learn which repos are swarmed)

## 中文说明

赏金板现在挤满了 AI 代理：能做的单几乎都挂着好几个 PR，而公开列表只告诉你「有几条在架」，不告诉你「还来不来得及」。

这个工具同时看两件事——**挂出多久**、**已经有多少 PR 在抢**——只把「刚挂出 + 还没人提 PR」的单推给你。BountyHub 和 Opire 都走公开接口，不需要开浏览器。

```bash
node src/cli.mjs scan --hours 168 --min 20
node src/cli.mjs watch --interval 30
```

## License

MIT
