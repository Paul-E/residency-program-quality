# How noisy is the residency-program pass-rate rule?

An interactive, single-page explainer showing why a single **"80% board-pass rate
over 3 years"** rule does not measure small and large neurosurgery residency
programs with equal precision — and what fairer alternatives look like.

> The current rule does not evaluate all programs with equal precision. Because
> programs graduate anywhere from ~3 to ~12 residents in a three-year window,
> observed 80% compliance carries substantial random noise. The same nominal rule
> can fail genuinely-adequate small programs and pass genuinely-weak ones by
> chance. A fairer system accounts for cohort size and uncertainty — confidence
> intervals, funnel limits, and continuous (CUSUM) monitoring.

## What's inside

1. **Effective cutoff** — because pass counts are whole numbers, an 80% rule
   silently becomes 100% / 83% / 89% / 83% depending on program size.
2. **Odds of passing** — the chance a program clears the rule given its *true*
   quality (interactive table + operating-characteristic curves).
3. **Uncertainty** — Wilson confidence intervals around observed pass rates.
4. **Funnel plot** — expected chance scatter, with 95% and 99.8% control limits.
5. **The tradeoff** — longer windows cut noise but slow detection.
6. **CUSUM monitoring** — a V-mask control chart that catches real decline early.

## Tech

Static HTML + CSS + vanilla-JS ES modules. No build step. Libraries are loaded via
CDN (pinned): [Chart.js 4.5.1](https://www.chartjs.org/),
[chartjs-plugin-annotation 3.1.0](https://www.chartjs.org/chartjs-plugin-annotation/),
and [jStat 1.9.6](https://github.com/jstat/jstat) for the statistics.

- `index.html` — page content and controls
- `styles.css` — styling
- `stats.js` — statistics helpers (binomial pass probability, Wilson intervals,
  funnel limits, CUSUM)
- `app.js` — wires controls to the tables and charts

## Run locally

The page uses ES modules, which browsers will not load over `file://`, so serve it
over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static file server works — e.g. `npx serve`.)

## Deploy to GitHub Pages

1. Push these files to the repository's default branch (`main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, then choose **Branch: `main`, folder: `/ (root)`** and save.
3. The site publishes at `https://<user>.github.io/<repo>/`. The CDN scripts load
   over HTTPS, so everything works identically to local.

## Sources

- NIST/SEMATECH e-Handbook of Statistical Methods — §6.3.2.3 (CUSUM / V-mask),
  §7.2.4.1 (Wilson interval).
- Spiegelhalter, D. (2005). *Funnel plots for comparing institutional
  performance.* Statistics in Medicine. (Appendix A.1.1 interpolation.)
- Steiner, S.H. et al. (2000). *Monitoring surgical performance using
  risk-adjusted cumulative sum charts.* Biostatistics.

The statistical approaches and reference figures were cross-checked against these
sources before implementation.
