# AEO experiments log

One entry per experiment. Newest at the bottom.

We measure two things:

- **Probe cited-rate.** Run `pnpm aeo:probe` (see `web/scripts/aeo/probe.ts`). It counts how often answer engines cite flamingocounty.com, out of all calls.
- **Search Console clicks** for the pages we changed and for the control pages.

Change only the test pages. Leave the control pages alone so we can tell our change apart from noise. Review 4–6 weeks after the start date.

## Template

```
## YYYY-MM-DD — short name

- Hypothesis: If we <change>, then <metric> will <go up / go down> because <reason>.
- Pages changed: <URLs>
- Control pages: <URLs we did not touch>
- Start date: YYYY-MM-DD
- Metric: probe cited-rate (question ids: <which>) and Search Console clicks (pages changed vs control)
- Before: <cited x/y, clicks n over 28 days>
- Review date: YYYY-MM-DD (4–6 weeks after start)
- Result: <after numbers, and what we learned>
```

## 2026-10-01 — Baseline

- Hypothesis: none. This is the starting point.
- Pages changed: none.
- Control pages: n/a.
- Start date: 2026-10-01
- Metric: probe cited-rate.
- Before: cited **0/216**. That is 24 questions x 3 runs x 3 models: `perplexity/sonar`, `openai/gpt-4.1:online` and `anthropic/claude-sonnet-4.5:online`.
- Review date: n/a.
- Result: no engine cited flamingocounty.com for any question.

The same day, the question bank grew from 24 to 153 questions. Of the original 24 ids (commit `f620188`), 23 are unchanged. `cheap-eats-hialeah` was removed, because the site makes no price claims and can't answer a price question. Future runs should report the original 23 ids separately from the new ones. Only those 23 compare directly with this baseline: recompute its rate from the baseline file without `cheap-eats-hialeah`. The new ones get their own baseline on their first run.

A full run now costs more. It is about 160 x 3 runs x 3 models, or 1,440 calls, instead of 216.

## 2026-10-07 — Civic answers (AEO round 3), baseline

- Hypothesis: If we publish pages that answer civic questions from the county's and cities' records (where to vote, storm-surge zones, trash zones, commission districts), then the civic probe cited-rate and Search Console impressions will go up, because answer engines today cite only the agencies' own pages and map viewers, which hold no quotable answer.
- Pages changed: none yet.
  - Phase 2 ("where to vote") is blocked: the county's polling-place layer is stale for 2026-11-03 (see `AEO-HANDOFF.md`, Phase 2 status).
  - Phase 3 is not built.
  - Phase 1 changed only `llms.txt` and the JSON-LD on `/en/address` and `/es/address`.
  - Record the URLs here when the pages ship.
- Control pages: listings and events (unchanged by this round).
- Start date: the day the first civic pages deploy. This entry is the "before".
- Metric: probe cited-rate on the 56 `intent: "civic"` ids (`pnpm aeo:probe --intent civic`), and Search Console impressions and clicks for the civic pages against the control pages.
- Before (probe, 2026-10-07):
  - Cited **0/168**: 56 questions (28 ES, 28 EN) x 1 run x 3 models (`perplexity/sonar`, `openai/gpt-4.1:online`, `anthropic/claude-sonnet-4.5:online`). That is 0/56 per model. "Mentioned": 0.
  - No errors, and every answer cited something.
  - Most-cited domains:
    - ES: miamidade.gov 56, hialeahfl.gov 29, diariolasamericas.com 15, univision.com 15, miami.gov 14, elnuevoherald.com 12, telemundo51.com 12, hgis.hialeahfl.gov 11.
    - EN: miamidade.gov 61, hialeahfl.gov 32, miami.gov 19, hgis.hialeahfl.gov 18, cbsnews.com 15, miamiherald.com 12, gisweb.miamidade.gov 12, nbcmiami.com 11.
  - Cost: **$2.06**, read from the OpenRouter key's usage before and after.
  - Results file: `~/Documents/dev-projects/flamingo-county-aeo-results/2026-10-07T20-14-23-141Z-civic.jsonl`.
- Before (Search Console, 2026-09-09 to 2026-10-06, site-wide):
  - **5 impressions, 0 clicks**, average position 16.8.
  - Sitemap: 106 URLs submitted, last downloaded 2026-10-06.
  - URL inspection:
    - `/es`: indexed.
    - `/es/free-rides` and `/en/hialeah/molinas-ranch`: "Discovered, not indexed".
    - `/es/address`: unknown to Google.
    - `/es/halloween`: "Server error (5xx)" on the 2026-10-06 crawl. It returns 200 now, most likely a deploy-switchover 502.
  - Pulled by the coordinator session over the Search Console API (O1 now works for local sessions). This session's own pull was refused by its permission settings, so these numbers are the coordinator's, as given.
- Review date: 4–6 weeks after the first civic pages deploy. Also re-run these ids with the 2026-10-22 to 10-29 probe.
- Result: pending.
