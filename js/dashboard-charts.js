import {
  TRACE_STEPS, traceStepSummary, columnTraceability, ensureMappingFields, nextTraceStepKey,
} from './verification.js';

const STEP_COLORS = ['#64748b', '#2563eb', '#d97706', '#059669', '#7c3aed', '#10b981', '#0d5c63'];

let charts = {};

export function buildTraceDashboardData(mappings) {
  const total = mappings.length;
  const traceCounts = traceStepSummary(mappings);
  const steps = TRACE_STEPS.map((s, i) => ({
    key: s.key,
    label: s.action,
    count: traceCounts[s.key] || 0,
    pct: total ? Math.round(((traceCounts[s.key] || 0) / total) * 100) : 0,
    color: STEP_COLORS[i] || '#64748b',
  }));

  let signedOff = 0;
  let blocked = 0;
  let inProgress = 0;
  const areaMap = {};

  for (const m of mappings) {
    ensureMappingFields(m);
    const status = m.verification.status;
    if (status === 'signed_off') signedOff++;
    else if (status === 'test_failed' || status === 'live_failed') blocked++;
    else inProgress++;

    const area = m.serviceArea?.trim() || 'Unassigned';
    if (!areaMap[area]) areaMap[area] = { total: 0, done: 0 };
    areaMap[area].total++;
    if (columnTraceability(m).done) areaMap[area].done++;
  }

  const areas = Object.entries(areaMap)
    .map(([name, v]) => ({
      name,
      total: v.total,
      done: v.done,
      pct: v.total ? Math.round((v.done / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const backlog = {};
  for (const m of mappings) {
    const next = nextTraceStepKey(m);
    if (next) {
      const step = TRACE_STEPS.find(s => s.key === next);
      const label = step?.action || next;
      backlog[label] = (backlog[label] || 0) + 1;
    }
  }

  const activity = buildActivitySeries(mappings, 14);

  return {
    total,
    signedOff,
    blocked,
    inProgress,
    steps,
    areas,
    backlog,
    activity,
    donePct: total ? Math.round((signedOff / total) * 100) : 0,
  };
}

function buildActivitySeries(mappings, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const labels = [];
  const counts = [];
  const keys = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    keys.push(key);
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));
  }

  const buckets = new Map(keys.map(k => [k, 0]));
  for (const m of mappings) {
    for (const h of m.verification?.history || []) {
      if (h.revertTo) continue;
      const key = h.at?.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    }
  }
  for (const key of keys) counts.push(buckets.get(key));

  return { labels, counts };
}

export function renderTraceDashboardHTML(data, open = false) {
  return `
    <details class="trace-dashboard card" id="trace-dashboard-panel"${open ? ' open' : ''}>
      <summary class="dash-summary">
        <span class="dash-summary-text">
          <span class="dash-summary-title">Traceability dashboard</span>
          <span class="dash-summary-meta">${data.signedOff}/${data.total} signed off · ${data.donePct}% complete${data.blocked ? ` · ${data.blocked} blocked` : ''}</span>
        </span>
        <span class="dash-live"><span class="dash-live-dot"></span> Live</span>
      </summary>
      <div class="dash-body">
        <div class="dash-stats">
          <div class="dash-stat"><span class="dash-stat-value">${data.total}</span><span class="dash-stat-label">Columns</span></div>
          <div class="dash-stat dash-stat-brand"><span class="dash-stat-value">${data.signedOff}</span><span class="dash-stat-label">Signed off</span></div>
          <div class="dash-stat"><span class="dash-stat-value">${data.inProgress}</span><span class="dash-stat-label">In progress</span></div>
          <div class="dash-stat dash-stat-warn"><span class="dash-stat-value">${data.blocked}</span><span class="dash-stat-label">Blocked</span></div>
          <div class="dash-stat"><span class="dash-stat-value">${data.donePct}%</span><span class="dash-stat-label">Complete</span></div>
        </div>
        <div class="dash-charts-grid">
          <div class="dash-chart-card dash-chart-main">
            <h3>Pipeline completion</h3>
            <p class="dash-chart-hint">Columns that completed each trace step</p>
            <div class="dash-chart-wrap"><canvas id="chart-funnel"></canvas></div>
          </div>
          <div class="dash-chart-card">
            <h3>Status mix</h3>
            <div class="dash-chart-wrap dash-chart-square"><canvas id="chart-status"></canvas></div>
          </div>
          <div class="dash-chart-card">
            <h3>By service area</h3>
            <p class="dash-chart-hint">% signed off per area</p>
            <div class="dash-chart-wrap"><canvas id="chart-areas"></canvas></div>
          </div>
          <div class="dash-chart-card dash-chart-wide">
            <h3>Audit activity</h3>
            <p class="dash-chart-hint">Recorded steps per day (last 14 days)</p>
            <div class="dash-chart-wrap dash-chart-short"><canvas id="chart-activity"></canvas></div>
          </div>
        </div>
      </div>
    </details>`;
}

export function destroyDashboardCharts() {
  for (const c of Object.values(charts)) c?.destroy?.();
  charts = {};
}

const chartFont = { family: '"DM Sans", system-ui, sans-serif' };

export function mountDashboardCharts(mappings) {
  if (typeof Chart === 'undefined') return;

  destroyDashboardCharts();
  const data = buildTraceDashboardData(mappings);

  const funnelEl = document.getElementById('chart-funnel');
  if (funnelEl) {
    charts.funnel = new Chart(funnelEl, {
      type: 'bar',
      data: {
        labels: data.steps.map(s => s.label),
        datasets: [{
          label: 'Columns',
          data: data.steps.map(s => s.count),
          backgroundColor: data.steps.map(s => s.color),
          borderRadius: 4,
          barThickness: 18,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: ctx => {
                const s = data.steps[ctx.dataIndex];
                return `${s.pct}% of ${data.total} columns`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: Math.max(data.total, 1),
            ticks: { stepSize: 1, font: chartFont },
            grid: { color: '#f1f5f9' },
          },
          y: { ticks: { font: chartFont }, grid: { display: false } },
        },
      },
    });
  }

  const statusEl = document.getElementById('chart-status');
  if (statusEl) {
    charts.status = new Chart(statusEl, {
      type: 'doughnut',
      data: {
        labels: ['Signed off', 'In progress', 'Blocked'],
        datasets: [{
          data: [data.signedOff, data.inProgress, data.blocked],
          backgroundColor: ['#0d5c63', '#2563eb', '#dc2626'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { font: chartFont, boxWidth: 10, padding: 10 } },
        },
      },
    });
  }

  const areasEl = document.getElementById('chart-areas');
  if (areasEl && data.areas.length) {
    charts.areas = new Chart(areasEl, {
      type: 'bar',
      data: {
        labels: data.areas.map(a => a.name),
        datasets: [{
          label: '% signed off',
          data: data.areas.map(a => a.pct),
          backgroundColor: '#0d5c63',
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%`, font: chartFont }, grid: { color: '#f1f5f9' } },
          y: { ticks: { font: chartFont }, grid: { display: false } },
        },
      },
    });
  }

  const activityEl = document.getElementById('chart-activity');
  if (activityEl) {
    charts.activity = new Chart(activityEl, {
      type: 'line',
      data: {
        labels: data.activity.labels,
        datasets: [{
          label: 'Steps recorded',
          data: data.activity.counts,
          borderColor: '#0d5c63',
          backgroundColor: 'rgba(13, 92, 99, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#0d5c63',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: chartFont, maxRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: chartFont }, grid: { color: '#f1f5f9' } },
        },
      },
    });
  }
}
