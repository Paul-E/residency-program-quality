// stats.js — statistics helpers for the residency-program evaluation site.
// Thin domain wrappers over jStat (loaded globally via a CDN <script> tag).
// All functions are pure (no DOM). See README.md for the underlying argument.

const jStat = window.jStat;

// --- Core rule arithmetic -------------------------------------------------

// Minimum number of passes needed to meet `cutoff` out of n graduates.
// Because pass counts are whole numbers, this is a ceiling.
export function kMin(n, cutoff) {
  return Math.ceil(cutoff * n);
}

// The *effective* cutoff a program of size n is actually held to, given the
// discreteness of pass counts. e.g. 80% of 3 -> needs 3/3 -> 100%.
export function effectiveCutoff(n, cutoff) {
  return kMin(n, cutoff) / n;
}

// --- Section 2: probability of passing the evaluation given true quality --

// P(program passes) = P(K >= kMin) where K ~ Binomial(n, p).
// Implemented as an upper-tail of the binomial CDF.
export function probProgramPasses(n, p, cutoff) {
  const km = kMin(n, cutoff);
  if (km > n) return 0; // impossible to satisfy (shouldn't happen for cutoff<=1)
  if (km <= 0) return 1;
  // P(K >= km) = 1 - P(K <= km-1) = 1 - cdf(km-1)
  return 1 - jStat.binomial.cdf(km - 1, n, p);
}

// --- Section 3: Wilson score confidence interval --------------------------

// Wilson score interval for a binomial proportion k/n at confidence `conf`.
// Returns {lo, hi, phat}. Verified against NIST 7.2.4.1 / Wikipedia.
export function wilsonInterval(k, n, conf = 0.95) {
  const z = jStat.normal.inv(1 - (1 - conf) / 2, 0, 1); // ~1.96 for 95%
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return {
    phat,
    lo: (center - margin) / denom,
    hi: (center + margin) / denom,
  };
}

// --- Section 4: funnel-plot control limits --------------------------------

// Funnel control limit: the observed pass-rate value at quantile q under
// Binomial(n, p0). Scans the binomial CDF up to the smallest integer r with
// cdf(r) >= q, then interpolates between integer outcomes (Spiegelhalter 2005,
// Appendix A.1.1) so the resulting band is smooth rather than a staircase.
export function binomLimit(n, p0, q) {
  // find smallest r in [0, n] with cdf(r) >= q
  let r = 0;
  let cdfR = jStat.binomial.cdf(0, n, p0);
  while (cdfR < q && r < n) {
    r += 1;
    cdfR = jStat.binomial.cdf(r, n, p0);
  }
  const cdfRm1 = r > 0 ? jStat.binomial.cdf(r - 1, n, p0) : 0;
  const span = cdfR - cdfRm1;
  // Fractional position of q between the (r-1) and r steps.
  const alpha = span > 0 ? (cdfR - q) / span : 0;
  return (r - alpha) / n;
}

// The standard Spiegelhalter quantile set: 95% (inner) and 99.8% (outer) bands.
export const FUNNEL_QUANTILES = {
  outerLo: 0.001,
  innerLo: 0.025,
  innerHi: 0.975,
  outerHi: 0.999,
};

// --- Section 6: CUSUM ------------------------------------------------------

// Standardized one-sided (downward / deterioration-detecting) tabular CUSUM
// over a per-resident pass/fail stream. Equivalent to the V-mask test, so the
// visual mask and this flag agree on the same point.
//   x_i in {0,1};  z_i = (x_i - p0)/sigma;  sigma = sqrt(p0(1-p0))
//   S_lo(i) = max(0, S_lo(i-1) - z_i - k)   ; flag when S_lo > h
// k and h are in standardized units. Returns per-step {cusum, slo, flagged}.
export function cusumSeries(outcomes, p0, k, h) {
  const sigma = Math.sqrt(p0 * (1 - p0));
  let cusum = 0; // raw standardized cumulative sum S'_m for the plotted line
  let slo = 0; // one-sided downward accumulator for detection
  const steps = [];
  let firstFlag = -1;
  outcomes.forEach((x, i) => {
    const z = (x - p0) / sigma;
    cusum += z;
    slo = Math.max(0, slo - z - k);
    const flagged = slo > h;
    if (flagged && firstFlag === -1) firstFlag = i;
    steps.push({ i, cusum, slo, flagged });
  });
  return { steps, sigma, firstFlag };
}

// CUSUM design parameters from acceptable/unacceptable rates, in standardized
// units. delta = (p0 - p1)/sigma is the shift to detect; k = delta/2 (NIST
// rule of thumb). h is supplied by the user (~4-5).
export function cusumDesign(p0, p1) {
  const sigma = Math.sqrt(p0 * (1 - p0));
  const delta = (p0 - p1) / sigma;
  const k = delta / 2;
  return { sigma, delta, k };
}

// --- Simulation helpers ----------------------------------------------------

// Small deterministic PRNG (mulberry32) so re-rolls are reproducible per seed.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draw a stream of n Bernoulli(p) outcomes. `p` may be a function of index i
// to model deterioration/improvement over time.
export function bernoulliStream(n, p, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const pi = typeof p === 'function' ? p(i) : p;
    out.push(rng() < pi ? 1 : 0);
  }
  return out;
}

// Simulate one program's observed pass rate over a window: returns {n, k, rate}.
export function simulateProgram(residentsPerYear, years, trueP, rng) {
  const n = residentsPerYear * years;
  const stream = bernoulliStream(n, trueP, rng);
  const k = stream.reduce((s, x) => s + x, 0);
  return { n, k, rate: n > 0 ? k / n : 0, residentsPerYear };
}
