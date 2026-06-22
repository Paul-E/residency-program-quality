// app.js — wires the controls to the statistics and renders the tables/charts.
import {
  kMin,
  effectiveCutoff,
  probProgramPasses,
  wilsonInterval,
  binomLimit,
  FUNNEL_QUANTILES,
  cusumSeries,
  cusumDesign,
  makeRng,
  bernoulliStream,
  simulateProgram,
} from './stats.js';

const Chart = window.Chart;
const SIZES = [1, 2, 3, 4]; // residents per year
const PCT = (x) => `${(x * 100).toFixed(1)}%`;

// Red -> yellow -> green heat colour for a probability in [0,1].
function heat(p) {
  const hue = 120 * Math.max(0, Math.min(1, p)); // 0=red, 120=green
  return `hsl(${hue}, 65%, 78%)`;
}

const $ = (id) => document.getElementById(id);

// ===========================================================================
// 1. Effective-cutoff table
// ===========================================================================
function renderCutoffTable() {
  const years = +$('cutoffYears').value;
  const std = +$('cutoffStd').value / 100;
  $('cutoffYearsVal').textContent = years;
  $('cutoffStdVal').textContent = (std * 100).toFixed(0);

  let html =
    '<thead><tr>' +
    '<th class="label-col">Residents / year</th>' +
    `<th>Graduates (n = ${years}&times;size)</th>` +
    '<th>Min passes needed</th>' +
    '<th>Effective cutoff</th>' +
    '</tr></thead><tbody>';

  for (const size of SIZES) {
    const n = size * years;
    const km = kMin(n, std);
    const eff = effectiveCutoff(n, std);
    const diverges = Math.abs(eff - std) > 1e-9;
    html +=
      `<tr><td class="label-col">${size}</td>` +
      `<td>${n}</td>` +
      `<td>${km} / ${n}</td>` +
      `<td class="${diverges ? 'flag' : ''}">${PCT(eff)}</td></tr>`;
  }
  html += '</tbody>';
  $('cutoffTable').innerHTML = html;
}

// ===========================================================================
// 2. Operating-characteristic table + chart
// ===========================================================================
const OC_PS = [0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
let ocChart;

function renderOc() {
  const years = +$('ocYears').value;
  const std = +$('ocStd').value / 100;
  $('ocYearsVal').textContent = years;
  $('ocStdVal').textContent = (std * 100).toFixed(0);

  const sizes = SIZES.map((s) => ({ size: s, n: s * years }));

  // table
  let html = '<thead><tr><th class="label-col">True resident pass-rate</th>';
  for (const { size, n } of sizes) html += `<th>${size}/yr (n=${n})</th>`;
  html += '</tr></thead><tbody>';
  for (const p of OC_PS) {
    html += `<tr><td class="label-col">${(p * 100).toFixed(0)}%</td>`;
    for (const { n } of sizes) {
      const prob = probProgramPasses(n, p, std);
      html += `<td style="background:${heat(prob)}">${(prob * 100).toFixed(1)}%</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  $('ocTable').innerHTML = html;

  // chart: P(pass) vs true p, one line per size
  const xs = [];
  for (let p = 0.5; p <= 1.0001; p += 0.01) xs.push(Math.min(1, +p.toFixed(2)));
  const palette = ['#d6483b', '#e0a800', '#2f6fed', '#2e9e6b'];
  const datasets = sizes.map(({ size, n }, idx) => ({
    label: `${size}/yr (n=${n})`,
    data: xs.map((p) => ({ x: p * 100, y: probProgramPasses(n, p, std) * 100 })),
    borderColor: palette[idx],
    backgroundColor: palette[idx],
    showLine: true,
    pointRadius: 0,
    borderWidth: 2,
    tension: 0.2,
  }));

  const cfg = {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          title: { display: true, text: 'True resident pass-rate (%)' },
          min: 50,
          max: 100,
        },
        y: {
          title: { display: true, text: 'Chance of passing the rule (%)' },
          min: 0,
          max: 100,
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        annotation: {
          annotations: {
            stdLine: {
              type: 'line',
              xMin: std * 100,
              xMax: std * 100,
              borderColor: '#5c6573',
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: 'standard',
                position: 'start',
                color: '#5c6573',
                font: { size: 10 },
              },
            },
          },
        },
      },
    },
  };

  if (ocChart) {
    ocChart.data = cfg.data;
    ocChart.options = cfg.options;
    ocChart.update();
  } else {
    ocChart = new Chart($('ocChart'), cfg);
  }
}

// ===========================================================================
// 3. Wilson confidence intervals (forest plot)
// ===========================================================================
let wilsonChart;
const WILSON_ROWS = [
  [3, 3],
  [5, 6],
  [8, 9],
  [10, 12],
];

function renderWilson() {
  const n = +$('wNInput').value;
  // keep k in range [0, n]
  $('wKInput').max = n;
  let k = Math.min(+$('wKInput').value, n);
  $('wKInput').value = k;
  const conf = +$('wConfInput').value / 100;

  $('wK').textContent = k;
  $('wN').textContent = n;
  $('wConf').textContent = (conf * 100).toFixed(0);

  const rows = [...WILSON_ROWS, [k, n]];
  const labels = rows.map(([kk, nn]) => `${kk}/${nn}`);
  const intervals = rows.map(([kk, nn]) => wilsonInterval(kk, nn, conf));

  const ci = wilsonInterval(k, n, conf);
  $('wReadout').innerHTML =
    `A program that went <strong>${k} of ${n}</strong> (${PCT(k / n)} observed) has a ` +
    `${(conf * 100).toFixed(0)}% confidence interval of <strong>${PCT(ci.lo)} to ` +
    `${PCT(ci.hi)}</strong> for its true pass-rate.`;

  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Confidence interval',
          data: intervals.map((iv) => [iv.lo * 100, iv.hi * 100]),
          backgroundColor: 'rgba(47,111,237,0.35)',
          borderColor: '#2f6fed',
          borderWidth: 1,
          borderSkipped: false,
          barPercentage: 0.5,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0,
          max: 100,
          title: { display: true, text: 'True pass-rate (%)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const [lo, hi] = ctx.raw;
              return `${lo.toFixed(1)}% – ${hi.toFixed(1)}%`;
            },
          },
        },
        annotation: {
          annotations: {
            stdLine: {
              type: 'line',
              xMin: 80,
              xMax: 80,
              borderColor: '#d6483b',
              borderWidth: 2,
              borderDash: [6, 4],
              label: {
                display: true,
                content: '80% standard',
                position: 'end',
                color: '#d6483b',
                font: { size: 10 },
              },
            },
            // observed-rate markers, one point per row
            ...Object.fromEntries(
              rows.map(([kk, nn], idx) => [
                `pt${idx}`,
                {
                  type: 'point',
                  xValue: (kk / nn) * 100,
                  yValue: labels[idx],
                  radius: 4,
                  backgroundColor: '#1f2430',
                  borderColor: '#fff',
                  borderWidth: 1,
                },
              ])
            ),
          },
        },
      },
    },
  };

  if (wilsonChart) {
    wilsonChart.data = cfg.data;
    wilsonChart.options = cfg.options;
    wilsonChart.update();
  } else {
    wilsonChart = new Chart($('wilsonChart'), cfg);
  }
}

// ===========================================================================
// 4. Funnel plot
// ===========================================================================
let funnelChart;
let funnelSeed = 1;

function renderFunnel() {
  const trueP = +$('funnelP').value / 100;
  const years = +$('funnelYears').value;
  $('funnelPVal').textContent = (trueP * 100).toFixed(0);
  $('funnelYearsVal').textContent = years;

  const p0 = 0.8; // the rule's standard — bands are always about this
  const maxN = 4 * years;

  // control-limit bands over integer n
  const ns = [];
  for (let n = 1; n <= maxN; n++) ns.push(n);
  const band = (q) => ns.map((n) => ({ x: n, y: binomLimit(n, p0, q) * 100 }));

  // simulated programs
  const rng = makeRng(funnelSeed);
  const points = [];
  for (const size of SIZES) {
    for (let r = 0; r < 12; r++) {
      const prog = simulateProgram(size, years, trueP, rng);
      // jitter x slightly so identical n don't overlap perfectly
      points.push({ x: prog.n + (rng() - 0.5) * 0.5, y: prog.rate * 100 });
    }
  }

  const bandStyle = (color, dash) => ({
    type: 'line',
    borderColor: color,
    borderWidth: 1.5,
    borderDash: dash,
    pointRadius: 0,
    fill: false,
    tension: 0.3,
  });

  const cfg = {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Programs (simulated)',
          data: points,
          backgroundColor: 'rgba(47,111,237,0.55)',
          pointRadius: 4,
        },
        { label: '99.8% upper', data: band(FUNNEL_QUANTILES.outerHi), ...bandStyle('#d6483b', [2, 3]) },
        { label: '95% upper', data: band(FUNNEL_QUANTILES.innerHi), ...bandStyle('#e0a800', [6, 4]) },
        { label: '95% lower', data: band(FUNNEL_QUANTILES.innerLo), ...bandStyle('#e0a800', [6, 4]) },
        { label: '99.8% lower', data: band(FUNNEL_QUANTILES.outerLo), ...bandStyle('#d6483b', [2, 3]) },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Graduates observed (n)' },
          min: 0,
          max: maxN + 1,
        },
        y: {
          title: { display: true, text: 'Observed pass-rate (%)' },
          min: 0,
          max: 105,
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        annotation: {
          annotations: {
            target: {
              type: 'line',
              yMin: p0 * 100,
              yMax: p0 * 100,
              borderColor: '#5c6573',
              borderWidth: 1.5,
              label: {
                display: true,
                content: '80% standard',
                position: 'start',
                color: '#5c6573',
                font: { size: 10 },
              },
            },
          },
        },
      },
    },
  };

  if (funnelChart) {
    funnelChart.data = cfg.data;
    funnelChart.options = cfg.options;
    funnelChart.update();
  } else {
    funnelChart = new Chart($('funnelChart'), cfg);
  }
}

// ===========================================================================
// 6. CUSUM with V-mask
// ===========================================================================
let cusumChart;
let cusumSeed = 7;
const RES_PER_YEAR = 2;
const PROGRAM_YEARS = 7;

function cusumStream(scenario, rng) {
  const n = RES_PER_YEAR * PROGRAM_YEARS; // 14 residents
  let p;
  if (scenario === 'good') p = () => 0.9;
  else if (scenario === 'marginal') p = () => 0.8;
  else p = (i) => (i < RES_PER_YEAR * 4 ? 0.9 : 0.55); // deteriorates after year 4
  return bernoulliStream(n, p, rng);
}

function renderCusum() {
  const p0 = +$('cusumP0').value / 100;
  const p1 = +$('cusumP1').value / 100;
  const h = +$('cusumH').value;
  const scenario = $('cusumScenario').value;
  $('cusumP0Val').textContent = (p0 * 100).toFixed(0);
  $('cusumP1Val').textContent = (p1 * 100).toFixed(0);
  $('cusumHVal').textContent = h.toFixed(1);

  const { k } = cusumDesign(p0, Math.min(p1, p0 - 0.01));
  const kSafe = Math.max(k, 0.05);

  const rng = makeRng(cusumSeed);
  const outcomes = cusumStream(scenario, rng);
  const { steps, firstFlag } = cusumSeries(outcomes, p0, kSafe, h);
  const N = steps.length;

  // readout
  if (firstFlag >= 0) {
    const year = Math.floor(firstFlag / RES_PER_YEAR) + 1;
    $('cusumReadout').innerHTML =
      `&#9888; Signal raised at resident <strong>${firstFlag + 1}</strong> ` +
      `(around year ${year}).`;
  } else {
    $('cusumReadout').innerHTML = '&#10003; No signal &mdash; performance stayed within control.';
  }

  // Anchor the V-mask at the moment of first detection (or the latest point if
  // there is no signal). With the vertex a lead-distance d = h/k ahead, the
  // upper arm value at past point m is  yA + h + k*(xA - x_m)  — so a past point
  // sits outside the mask exactly when the tabular CUSUM signals. This keeps the
  // drawn mask and the red-flagged points provably consistent.
  const d = h / kSafe; // lead distance
  const anchorIdx = firstFlag >= 0 ? firstFlag : N - 1;
  const xA = anchorIdx + 1;
  const yA = steps[anchorIdx].cusum;
  const vertexX = xA + d;

  // line points (x = resident index 1..N); colour points that escape the mask.
  const linePts = steps.map((s) => ({ x: s.i + 1, y: s.cusum }));
  const pointColors = steps.map((s) => {
    const xm = s.i + 1;
    const outside = s.i <= anchorIdx && s.cusum > yA + h + kSafe * (xA - xm);
    return outside ? '#d6483b' : '#2f6fed';
  });

  // Arm values at the chart's left edge (x = 1), drawn back from the vertex.
  const upperY0 = yA + kSafe * (vertexX - 1);
  const lowerY0 = yA - kSafe * (vertexX - 1);

  const cfg = {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: "Cumulative sum S'",
          data: linePts,
          showLine: true,
          borderColor: '#2f6fed',
          borderWidth: 2,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 4,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Resident (in sequence)' },
          min: 1,
          max: N + 1,
        },
        y: { title: { display: true, text: "Standardized cumulative sum S'" } },
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            upperArm: {
              type: 'line',
              xMin: 1,
              yMin: upperY0,
              xMax: vertexX,
              yMax: yA,
              borderColor: 'rgba(214,72,59,0.85)',
              borderWidth: 1.5,
            },
            lowerArm: {
              type: 'line',
              xMin: 1,
              yMin: lowerY0,
              xMax: vertexX,
              yMax: yA,
              borderColor: 'rgba(214,72,59,0.85)',
              borderWidth: 1.5,
            },
            anchor: {
              type: 'point',
              xValue: xA,
              yValue: yA,
              radius: 5,
              backgroundColor: 'rgba(214,72,59,0)',
              borderColor: '#d6483b',
              borderWidth: 2,
            },
          },
        },
      },
    },
  };

  if (cusumChart) {
    cusumChart.data = cfg.data;
    cusumChart.options = cfg.options;
    cusumChart.update();
  } else {
    cusumChart = new Chart($('cusumChart'), cfg);
  }
}

// ===========================================================================
// Wiring
// ===========================================================================
function on(id, evt, fn) {
  const el = $(id);
  if (el) el.addEventListener(evt, fn);
}
// Bind both 'input' (fires while dragging a slider) and 'change' (fires on
// release / programmatic set), so the UI updates for every kind of interaction.
function onChange(ids, fn) {
  ids.forEach((id) => {
    on(id, 'input', fn);
    on(id, 'change', fn);
  });
}

onChange(['cutoffYears', 'cutoffStd'], renderCutoffTable);
onChange(['ocYears', 'ocStd'], renderOc);
onChange(['wKInput', 'wNInput', 'wConfInput'], renderWilson);
onChange(['funnelP', 'funnelYears'], renderFunnel);
on('funnelReroll', 'click', () => {
  funnelSeed = (funnelSeed * 1664525 + 1013904223) >>> 0;
  renderFunnel();
});
onChange(['cusumP0', 'cusumP1', 'cusumH', 'cusumScenario'], renderCusum);
on('cusumReroll', 'click', () => {
  cusumSeed = (cusumSeed * 1664525 + 1013904223) >>> 0;
  renderCusum();
});

// initial render
renderCutoffTable();
renderOc();
renderWilson();
renderFunnel();
renderCusum();
