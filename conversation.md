I'm trying to evaluate the "fairness" of neurological residency program fairness. This is how programs (not students) are evaluated:

1) All neurological surgery residency programs are treated the same and are all 7 years in length
2) Some programs have 1 resident /year, some have 2/year, some have 3/year, some have 4/year (only 2)
3) All must have an 80% pass rate for their past 3 years

I want to find a way to show how much noise factors into a program succeeding or passing. What (statistical) methods and approaches can I use? I am good at programming and can create a simulation if I need to

----

The core statistical problem is **small-n binomial noise with unequal sample sizes**. Programs are “treated the same,” but the measurement precision is not the same. A 1-resident/year program has only about 3 observed graduates in a 3-year window; a 4-resident/year program has about 12. That makes the current rule much noisier for smaller programs.

## 1. Start with the exact binomial model

Let:

[
K_i \sim \text{Binomial}(n_i, p_i)
]

where:

* (n_i) = number of residents/graduates observed over the 3-year window
* (p_i) = true underlying probability that a resident from program (i) passes
* (K_i) = observed number passing

The program “passes” if:

[
\frac{K_i}{n_i} \ge 0.80
]

But because (K_i) is discrete, the effective cutoff differs by size:

| Residents/year | 3-year n | Minimum passes needed | Effective cutoff |
| -------------: | -------: | --------------------: | ---------------: |
|              1 |        3 |                   3/3 |           100.0% |
|              2 |        6 |                   5/6 |            83.3% |
|              3 |        9 |                   8/9 |            88.9% |
|              4 |       12 |                 10/12 |            83.3% |

That alone is a strong fairness argument: **the same nominal 80% rule is not the same actual rule.**

## 2. Calculate “probability of passing the evaluation” given true quality

For each program size, calculate:

[
P(\text{program passes evaluation} \mid p, n)
]

This tells you how often a program with true pass probability (p) would pass the rule just due to sampling noise.

Using the 3-year cohort sizes above:

| True resident pass probability |   n=3 |   n=6 |   n=9 |  n=12 |
| -----------------------------: | ----: | ----: | ----: | ----: |
|                            60% | 21.6% | 23.3% |  7.1% |  8.3% |
|                            70% | 34.3% | 42.0% | 19.6% | 25.3% |
|                            75% | 42.2% | 53.4% | 30.0% | 39.1% |
|                            80% | 51.2% | 65.5% | 43.6% | 55.8% |
|                            85% | 61.4% | 77.6% | 59.9% | 73.6% |
|                            90% | 72.9% | 88.6% | 77.5% | 88.9% |
|                            95% | 85.7% | 96.7% | 92.9% | 98.0% |

This is probably the cleanest demonstration.

A program whose true pass rate is exactly 80% does **not** have an 80% chance of passing the standard. Depending on size, it has only about a **44% to 66%** chance of passing the evaluation. A truly strong 90% program can still fail, especially if it has only 3 or 9 graduates in the window.

Here is simple Python for the exact calculation:

```python
from math import comb, ceil

def probability_program_passes(n, true_p, cutoff=0.80):
    k_min = ceil(cutoff * n)
    return sum(
        comb(n, k) * true_p**k * (1 - true_p)**(n - k)
        for k in range(k_min, n + 1)
    )

for n in [3, 6, 9, 12]:
    print(n, probability_program_passes(n, 0.80))
```

## 3. Use false-pass and false-fail rates

Define a program’s true quality as above or below 80%.

Then compute:

[
P(\text{fail evaluation} \mid p \ge 0.80)
]

and

[
P(\text{pass evaluation} \mid p < 0.80)
]

Examples:

* A true 90% program with (n=3) still fails about **27%** of the time.
* A true 90% program with (n=9) fails about **22.5%** of the time.
* A true 70% program with (n=6) still passes about **42%** of the time.

That gives you a language of **misclassification risk**, which is often more persuasive than saying “small sample sizes are noisy.”

## 4. Show confidence intervals around observed rates

For each observed pass rate, compute binomial confidence intervals, preferably Wilson or exact Clopper-Pearson intervals.

For example, a 1-resident/year program that goes 3/3 has an observed pass rate of 100%, but its Wilson 95% interval is roughly:

[
44% \text{ to } 100%
]

That is, even a “perfect” small program leaves enormous uncertainty about the true underlying pass probability.

A barely passing program also has wide uncertainty:

|  n | Observed passing result | Observed rate | Approx. Wilson 95% CI |
| -: | ----------------------: | ------------: | --------------------: |
|  3 |                     3/3 |        100.0% |          43.8%–100.0% |
|  6 |                     5/6 |         83.3% |           43.6%–97.0% |
|  9 |                     8/9 |         88.9% |           56.5%–98.0% |
| 12 |                   10/12 |         83.3% |           55.2%–95.3% |

This is another strong way to show noise: **many “passing” programs are statistically indistinguishable from programs whose true rate is well below 80%.**

## 5. Make a funnel plot

A funnel plot is standard in hospital quality measurement.

Plot:

* x-axis: (n), the number of observed residents
* y-axis: observed pass rate
* horizontal line: 80%
* confidence bands around 80%, widening at smaller (n)

Small programs will naturally scatter much more widely. Large programs will cluster more tightly.

This visually separates:

* expected random variation
* programs that are truly unusually high or low
* programs being overinterpreted because of tiny denominators

A funnel plot is probably the best single figure for a policy audience.

## 6. Use a Bayesian hierarchical model

A better evaluative framework is:

[
K_i \sim \text{Binomial}(n_i, p_i)
]

[
\text{logit}(p_i) \sim \mathcal{N}(\mu, \tau^2)
]

This assumes each program has its own true pass probability, but those probabilities come from a shared distribution.

The benefit is **partial pooling**:

* Small programs get shrunk more toward the overall mean.
* Large programs’ observed rates are trusted more.
* You get a posterior distribution for each program’s true pass rate.

Instead of saying:

> Program A passed because it went 3/3.

you can say:

> Program A’s posterior probability of having a true pass rate above 80% is 62%.

That is much fairer statistically.

A Bayesian decision rule could be something like:

* “Pass” if (P(p_i \ge 0.80 \mid \text{data}) > 0.80)
* “Flag for review” if (P(p_i < 0.80 \mid \text{data}) > 0.80)
* otherwise “uncertain”

This avoids pretending that 3 observations can prove program quality.

## 7. Simulate the current rule

Simulation would be very useful here.

Basic structure:

```python
import numpy as np
from math import ceil

rng = np.random.default_rng(123)

program_sizes = np.array([1, 2, 3, 4])
n = 3 * program_sizes

# Example: assume true program pass probabilities vary around 82%
# beta distribution parameterized by mean and concentration
mean_p = 0.82
concentration = 40
alpha = mean_p * concentration
beta = (1 - mean_p) * concentration

num_sims = 100_000

for n_i in n:
    true_p = rng.beta(alpha, beta, size=num_sims)
    observed_passes = rng.binomial(n_i, true_p)
    observed_rate = observed_passes / n_i
    program_passes = observed_rate >= 0.80

    false_fails = (true_p >= 0.80) & (~program_passes)
    false_passes = (true_p < 0.80) & (program_passes)

    print(
        f"n={n_i}",
        "pass rate:", program_passes.mean(),
        "false fail:", false_fails.mean(),
        "false pass:", false_passes.mean()
    )
```

You can vary assumptions:

* distribution of true program quality
* exam difficulty from year to year
* resident-to-resident correlation
* whether programs improve or decline over time
* whether pass probability differs by resident characteristics

This lets you compare policies.

## 8. Consider overdispersion / beta-binomial noise

The plain binomial model assumes each resident’s outcome is independent with the same probability. That may be too optimistic.

Residents within the same program and time period may share:

* same faculty
* same curriculum
* same case exposure
* same exam preparation culture
* same year-specific exam difficulty
* same selection effects

So outcomes may be correlated.

A beta-binomial model allows extra variation:

[
K_i \sim \text{Beta-Binomial}(n_i, \alpha_i, \beta_i)
]

This often makes the noise problem worse because the “effective sample size” is smaller than the raw count.

If you want to be conservative, compare both:

1. Binomial model: independent resident outcomes
2. Beta-binomial model: extra clustering / overdispersion

If the current rule looks noisy under the binomial model, it will usually look even noisier under the beta-binomial model.

## 9. Compare alternative policies

Once you have the simulation, compare the current rule against alternatives.

Possible alternatives:

### Longer window

Use 5 or 7 years instead of 3 years.

This increases (n), especially for small programs.

For a 1-resident/year program:

* 3-year window: (n=3)
* 5-year window: (n=5)
* 7-year window: (n=7)

Still small, but better.

### Minimum denominator rule

Do not make a hard pass/fail judgment until at least some minimum number of graduates is observed, say (n \ge 10), (n \ge 15), or (n \ge 20).

Before that, classify as “insufficient data” or “monitoring.”

### Probability-based rule

Instead of observed pass rate ≥ 80%, use:

[
P(p_i < 0.80 \mid \text{data}) > c
]

as the trigger for concern.

For example:

* flag if there is at least 90% posterior probability that the true pass rate is below 80%
* otherwise continue monitoring

### Two-stage rule

Use the current observed rate as a screening trigger, but not as the final judgment.

For example:

* observed rate below 80% triggers review
* final judgment considers uncertainty, cohort size, trend, and posterior probability

This may be more politically feasible than replacing the rule entirely.

## My recommended package of analyses

I would present four things:

1. **Effective cutoff table**
   Show that 80% becomes 100%, 83.3%, 88.9%, or 83.3% depending on size.

2. **Operating characteristic curves**
   Plot (P(\text{program passes})) against true (p), separately for (n=3, 6, 9, 12).

3. **Funnel plot**
   Show how much random variation is expected at small sample sizes.

4. **Simulation comparing rules**
   Estimate false-pass and false-fail rates under the current rule versus alternatives.

The main statistical conclusion is:

> The current rule does not evaluate all programs with equal precision. Because of small and unequal denominators, especially over only three years, observed 80% pass-rate compliance contains substantial random noise. The rule can both penalize genuinely adequate small programs and allow genuinely underperforming programs to pass by chance. A fairer system would account for denominator size and uncertainty, ideally using binomial/Bayesian uncertainty or a longer observation window.


----


For "2. Calculate “probability of passing the evaluation” given true quality", how to did you create that table? what calculation did you use?


----

I used the **binomial distribution**.

For a program with (n) residents in the 3-year evaluation window, assume each resident independently passes with true probability (p). Then the number of passing residents is:

[
K \sim \text{Binomial}(n, p)
]

The program passes the evaluation if:

[
\frac{K}{n} \ge 0.80
]

Equivalently:

[
K \ge \lceil 0.80n \rceil
]

So the probability that the program passes is:

[
P(\text{program passes}) =
\sum_{k=\lceil 0.80n \rceil}^{n}
\binom{n}{k}p^k(1-p)^{n-k}
]

where:

* (n) = total residents evaluated over 3 years
* (p) = true resident-level pass probability
* (k) = observed number of residents who pass
* (\binom{n}{k}) = number of ways to observe exactly (k) passes

## Example: 1 resident/year program

Over 3 years:

[
n = 3
]

To meet an 80% pass rate:

[
K \ge \lceil 0.80 \times 3 \rceil = \lceil 2.4 \rceil = 3
]

So the program must go **3 for 3**.

If the true pass probability is (p = 0.80), then:

[
P(\text{program passes}) = P(K = 3)
]

[
= \binom{3}{3}(0.80)^3(0.20)^0
]

[
= 1 \times 0.512 \times 1
]

[
= 0.512
]

So a truly 80% program with 1 resident/year has only a **51.2%** chance of passing the evaluation over a 3-year window.

## Example: 2 residents/year program

Over 3 years:

[
n = 6
]

The program must have:

[
K \ge \lceil 0.80 \times 6 \rceil = \lceil 4.8 \rceil = 5
]

So it passes if it gets either 5 or 6 residents passing.

If (p = 0.80):

[
P(\text{passes}) = P(K = 5) + P(K = 6)
]

[
= \binom{6}{5}(0.80)^5(0.20)^1 + \binom{6}{6}(0.80)^6(0.20)^0
]

[
= 6(0.32768)(0.20) + 1(0.262144)
]

[
= 0.393216 + 0.262144
]

[
= 0.65536
]

So a truly 80% program with 2 residents/year has a **65.5%** chance of passing.

## Python code that generates the table

```python
from math import comb, ceil

def prob_program_passes(n, p, cutoff=0.80):
    k_min = ceil(cutoff * n)
    return sum(
        comb(n, k) * p**k * (1 - p)**(n - k)
        for k in range(k_min, n + 1)
    )

true_ps = [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
ns = [3, 6, 9, 12]

print("p", *[f"n={n}" for n in ns], sep="\t")

for p in true_ps:
    row = [f"{p:.2f}"]
    for n in ns:
        row.append(f"{prob_program_passes(n, p):.3f}")
    print(*row, sep="\t")
```

That produces probabilities like:

| True pass probability (p) |   n=3 |   n=6 |   n=9 |  n=12 |
| ------------------------: | ----: | ----: | ----: | ----: |
|                      0.60 | 0.216 | 0.233 | 0.071 | 0.083 |
|                      0.70 | 0.343 | 0.420 | 0.196 | 0.253 |
|                      0.75 | 0.422 | 0.534 | 0.300 | 0.391 |
|                      0.80 | 0.512 | 0.655 | 0.436 | 0.558 |
|                      0.85 | 0.614 | 0.776 | 0.599 | 0.736 |
|                      0.90 | 0.729 | 0.886 | 0.775 | 0.889 |
|                      0.95 | 0.857 | 0.967 | 0.929 | 0.980 |

The unintuitive part is that (n=9) is harsher than (n=6) or (n=12), because 80% of 9 is 7.2, so the program must get at least 8 of 9, or **88.9% observed pass rate**.



-----

The core issue with extending the window is that we want to identify programs that are training doctors incorrectly quickly, so there is a tension

---


Exactly. Extending the window reduces noise, but it also **slows detection**. That is the central tradeoff:

[
\text{More years} \Rightarrow \text{less random noise but slower identification}
]

[
\text{Fewer years} \Rightarrow \text{faster detection but more false alarms}
]

So the question should not be framed as “3 years versus longer window.” It should be framed as:

> How do we detect truly underperforming programs quickly while controlling the chance of falsely flagging adequate programs?

That suggests a few better statistical approaches.

## 1. Separate “screening” from “punishment”

The current rule seems to use one threshold for everything:

[
\text{Observed pass rate} < 80% \Rightarrow \text{problem}
]

But with tiny denominators, that is too crude.

A better structure is:

| Result            | Interpretation               | Action                          |
| ----------------- | ---------------------------- | ------------------------------- |
| Weak evidence     | Could easily be noise        | Continue monitoring             |
| Moderate evidence | Possible problem             | Review, mentoring, data request |
| Strong evidence   | Likely true underperformance | Formal adverse action           |

This lets you act quickly without pretending small samples are conclusive.

For example, with a 1-resident/year program:

* 1 failure in 3 years means observed pass rate is 67%.
* But statistically, that is not strong proof the true rate is below 80%.
* It may justify review, but not necessarily a definitive failing judgment.

## 2. Use probability of underperformance, not raw pass rate

Instead of asking:

[
\frac{K}{n} \ge 0.80?
]

ask:

[
P(p < 0.80 \mid \text{data})
]

That is, given the observed results, how likely is it that the program’s true pass probability is below the acceptable standard?

You can then create rules like:

| Posterior probability true rate is below 80% | Action          |
| -------------------------------------------: | --------------- |
|                                        < 50% | No concern      |
|                                      50%–80% | Monitor         |
|                                      80%–95% | Targeted review |
|                                        > 95% | Serious concern |

This handles small programs more fairly because it incorporates uncertainty.

For example, a program going 2/3 has a raw pass rate of 67%, but the uncertainty is huge. A program going 8/12 also has 67%, but the evidence is stronger because the denominator is larger.

## 3. Use Bayesian updating over time

This is probably the most natural solution.

Each year, update your belief about the program’s true pass probability.

A simple model:

[
K_t \sim \text{Binomial}(n_t, p)
]

[
p \sim \text{Beta}(\alpha, \beta)
]

After observing (K) passes out of (n), the posterior is:

[
p \mid \text{data} \sim \text{Beta}(\alpha + K, \beta + n - K)
]

Then compute:

[
P(p < 0.80 \mid \text{data})
]

This gives you a continuous monitoring system rather than a hard 3-year cliff.

Basic Python:

```python
from scipy.stats import beta

def posterior_prob_below_threshold(k, n, alpha=8, beta_param=2, threshold=0.80):
    """
    Prior Beta(8,2) has prior mean 0.80.
    k = observed passes
    n = observed total residents
    """
    post_alpha = alpha + k
    post_beta = beta_param + n - k
    return beta.cdf(threshold, post_alpha, post_beta)

examples = [
    (2, 3),
    (5, 6),
    (8, 9),
    (10, 12),
]

for k, n in examples:
    prob_bad = posterior_prob_below_threshold(k, n)
    print(k, n, prob_bad)
```

The prior should be chosen carefully. You could use:

* a weak prior, such as Beta(1,1)
* a prior centered around the national average
* a hierarchical prior estimated from all programs

The hierarchical version is best.

## 4. Use control charts: CUSUM or EWMA

This is what I would strongly consider if the goal is **early detection**.

### CUSUM chart

A CUSUM chart accumulates evidence over time that a program has shifted from acceptable to unacceptable.

You define two rates:

[
p_0 = 0.80
]

acceptable performance

[
p_1 = 0.60 \text{ or } 0.70
]

unacceptable performance

Each resident outcome contributes evidence. Failures add evidence that the program may be underperforming; passes reduce or reset that concern.

A CUSUM can detect deterioration faster than a fixed 3-year rule while still controlling false alarms.

This is widely used in surgical outcomes monitoring because it is designed for exactly this tension: **small accumulating samples, early warning, and false-alarm control.**

### EWMA chart

An exponentially weighted moving average gives more weight to recent outcomes while not fully discarding older data.

A simple version:

[
S_t = \lambda X_t + (1-\lambda)S_{t-1}
]

where:

* (X_t = 1) if a resident passes, 0 if they fail
* (S_t) is the smoothed pass-rate signal
* (\lambda) controls responsiveness

Larger (\lambda): faster detection, noisier
Smaller (\lambda): slower detection, more stable

This directly addresses the window-length problem by replacing a hard 3-year window with a **recency-weighted memory**.

## 5. Use simulation to compare policies by detection delay and false-alarm rate

This is the most persuasive framework.

Simulate programs under several true conditions:

1. Adequate programs: true pass rate = 80%, 85%, 90%
2. Marginal programs: true pass rate = 75%
3. Poor programs: true pass rate = 60%, 65%, 70%
4. Deteriorating programs: start at 90%, then drop to 60% after year 4
5. Improving programs: start at 60%, then improve to 85%

Then compare rules:

* Current 3-year 80% rule
* 5-year window
* Bayesian posterior rule
* CUSUM
* EWMA
* two-stage screening/review rule

Measure:

| Metric                    | Meaning                                            |
| ------------------------- | -------------------------------------------------- |
| False alarm rate          | How often adequate programs are wrongly flagged    |
| Detection probability     | How often bad programs are detected                |
| Detection delay           | How many years until a bad program is flagged      |
| Positive predictive value | Among flagged programs, how many are truly bad     |
| Burden                    | How many programs are sent to review unnecessarily |

The right rule is not the one with the highest detection rate. It is the one with an acceptable balance between:

[
\text{early detection}
]

and

[
\text{not falsely labeling programs}
]

## 6. A two-threshold rule may be the best policy compromise

You could use one threshold for early review and another for formal failure.

For example:

| Evidence                   | Action                                   |
| -------------------------- | ---------------------------------------- |
| Observed 3-year rate < 80% | Trigger monitoring/review                |
| (P(p < 0.80) > 80%)        | Require corrective plan                  |
| (P(p < 0.80) > 95%)        | Formal adverse accreditation consequence |

This preserves fast detection while reducing unfairness.

The current rule treats a noisy signal as a verdict. A two-threshold rule treats it as a signal first, then asks how strong the evidence is.

## 7. A practical recommendation

I would not recommend simply extending the window and stopping there. That solves one problem but creates another.

I would recommend presenting something like this:

> Because patient safety and training quality require timely detection, a longer fixed window alone is not ideal. A fairer approach is sequential monitoring: use recent outcomes to trigger early review, but require stronger statistical evidence before imposing formal consequences. This can be implemented with Bayesian posterior probabilities, CUSUM/EWMA control charts, or a two-stage rule calibrated by simulation.

For your project, the strongest analysis would be:

1. Show how noisy the current 3-year rule is.
2. Simulate program outcomes under true pass rates of 60%–95%.
3. Compare current rule, longer windows, Bayesian monitoring, and CUSUM/EWMA.
4. Report both:

    * false-alarm rate for adequate programs
    * detection delay for truly poor programs

That directly captures the tension you described.

