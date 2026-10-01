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
