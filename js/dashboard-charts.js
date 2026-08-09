import {
  TRACE_STEPS, traceStepSummary, columnTraceability, ensureMappingFields, nextTraceStepKey,
  statusMeta,
} from './verification.js';

const STEP_COLORS = ['#64748b', '#2563eb', '#d97706', '#059669', '#7c3aed', '#10b981', '#0d5c63'];
const RECENT_ACTIVITY_LIMIT = 12;

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

  const backlogList = TRACE_STEPS
    .map(s => ({ label: s.action, count: backlog[s.action] || 0 }))
    .filter(x => x.count > 0);

  return {
    total,
    signedOff,
    blocked,
    inProgress,
    steps,
    areas,
    backlogList,
    recentActivity: buildRecentActivity(mappings, RECENT_ACTIVITY_LIMIT),
    donePct: total ? Math.round((signedOff / total) * 100) : 0,
  };
}

function buildRecentActivity(mappings, limit) {
  const events = [];
  for (const m of mappings) {
    ensureMappingFields(m);
    for (const h of m.verification?.history || []) {
      if (!h.at) continue;
      events.push({
        at: h.at,
        mappingId: m.id,
        columnRef: `${m.sourceTable}.${m.sourceColumn}`,
        status: h.status,
        by: h.participants?.length ? h.participants.join(', ') : (h.by || 'unknown'),
        note: h.note || '',
        revertTo: h.revertTo || null,
      });
    }
  }
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  return events.slice(0, limit);
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderActionPanel(data) {
  const backlogHtml = data.backlogList.length
    ? `<ul class="dash-backlog-list">${data.backlogList.map(item => `
        <li class="dash-backlog-item">
          <span class="dash-backlog-label">${esc(item.label)}</span>
          <span class="dash-backlog-count">${item.count}</span>
        </li>`).join('')}</ul>`
    : `<p class="dash-action-empty">All columns signed off — nothing waiting.</p>`;

  const activityHtml = data.recentActivity.length
    ? `<ul class="dash-activity-list">${data.recentActivity.map(ev => {
      const meta = ev.revertTo
        ? { label: 'Reverted', color: '#d97706' }
        : statusMeta(ev.status);
      return `<li class="dash-activity-item" data-mapping-id="${esc(ev.mappingId)}" tabindex="0" role="button">
        <div class="dash-activity-row">
          <span class="dash-activity-status" style="color:${meta.color}">${esc(meta.label)}</span>
          <span class="dash-activity-time">${formatRelativeTime(ev.at)}</span>
        </div>
        <div class="dash-activity-col">${esc(ev.columnRef)}</div>
        <div class="dash-activity-meta">${esc(ev.by)}${ev.note ? ` · ${esc(ev.note)}` : ''}</div>
      </li>`;
    }).join('')}</ul>`
    : `<p class="dash-action-empty">No steps recorded yet — click + on a row to start.</p>`;

  return `
    <div class="dash-action-grid">
      <div class="dash-action-block">
        <h3>Waiting on next step</h3>
        <p class="dash-chart-hint">Columns ready for the next action</p>
        ${backlogHtml}
      </div>
      <div class="dash-action-block">
        <h3>Recent activity</h3>
        <p class="dash-chart-hint">Latest recorded steps — click to open column</p>
        ${activityHtml}
      </div>
    </div>`;
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
          <div class="dash-chart-card dash-chart-wide dash-action-panel">
            ${renderActionPanel(data)}
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
const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  resizeDelay: 100,
};

export function scheduleDashboardCharts(mappings) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => mountDashboardCharts(mappings));
  });
}

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
        ...chartBaseOptions,
        indexAxis: 'y',
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
        ...chartBaseOptions,
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
        ...chartBaseOptions,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%`, font: chartFont }, grid: { color: '#f1f5f9' } },
          y: { ticks: { font: chartFont }, grid: { display: false } },
        },
      },
    });
  }
}
