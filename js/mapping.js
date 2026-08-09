import { uid } from './store.js';
import { defaultVerification } from './verification.js';

export class MappingCanvas {
  constructor(container, { sourceSchema, targetSchema, mappings, onChange, onSelectMapping, getActor }) {
    this.container = container;
    this.sourceSchema = sourceSchema;
    this.targetSchema = targetSchema;
    this.mappings = mappings || [];
    this.onChange = onChange;
    this.onSelectMapping = onSelectMapping;
    this.getActor = getActor;
    this.dragSource = null;
    this.tempLine = null;
    this.selectedId = null;
    this.handlePositions = new Map();
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="workspace">
        <div class="panel panel-source">
          <div class="panel-header">Source · ${this.sourceSchema?.system || '—'}</div>
          <div class="panel-scroll" id="source-panel">${this.renderPanel(this.sourceSchema, 'source')}</div>
        </div>
        <div class="canvas-wrap" id="canvas-wrap">
          <div class="canvas-toolbar">
            <span id="map-hint">Drag from source ● to target ●</span>
          </div>
          <svg id="mapping-svg"><g id="lines-group"></g></svg>
        </div>
        <div class="panel panel-target">
          <div class="panel-header">Target · ${this.targetSchema?.system || '—'}</div>
          <div class="panel-scroll" id="target-panel">${this.renderPanel(this.targetSchema, 'target')}</div>
        </div>
        <div class="workspace-footer" id="workspace-footer"></div>
      </div>
    `;
    this.svg = this.container.querySelector('#mapping-svg');
    this.linesGroup = this.container.querySelector('#lines-group');
    this.canvasWrap = this.container.querySelector('#canvas-wrap');
    requestAnimationFrame(() => this.redrawLines());
  }

  renderPanel(schema, side) {
    if (!schema?.tables?.length) return '<p class="empty-state">No schema loaded</p>';
    const mappedSet = new Set(
      this.mappings.map(m =>
        side === 'source'
          ? `${m.sourceTable}.${m.sourceColumn}`
          : `${m.targetTable}.${m.targetColumn}`
      )
    );

    return schema.tables.map(table => `
      <details class="table-group" open>
        <summary>${table.name} <span>${table.columns.length} cols</span></summary>
        ${table.columns.map(col => {
          const key = `${table.name}.${col.name}`;
          const mapped = mappedSet.has(key);
          return `
            <div class="col-item ${mapped ? 'mapped' : 'unmapped'}" data-side="${side}" data-table="${table.name}" data-column="${col.name}">
              <span>${col.name}<span class="col-type">${col.type}</span></span>
              <span class="handle ${side}" data-handle="${side}" data-table="${table.name}" data-column="${col.name}" title="Connect"></span>
            </div>`;
        }).join('')}
      </details>
    `).join('');
  }

  bindEvents() {
    this.container.addEventListener('mousedown', e => {
      const handle = e.target.closest('[data-handle="source"]');
      if (!handle) return;
      e.preventDefault();
      this.dragSource = {
        table: handle.dataset.table,
        column: handle.dataset.column,
      };
      handle.classList.add('active');
      this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.tempLine.classList.add('mapping-line', 'temp');
      this.linesGroup.appendChild(this.tempLine);
      this.updateTempLine(e);
    });

    document.addEventListener('mousemove', e => {
      if (!this.dragSource) return;
      this.updateTempLine(e);
    });

    document.addEventListener('mouseup', e => {
      if (!this.dragSource) return;
      const target = e.target.closest('[data-handle="target"]');
      this.container.querySelectorAll('.handle.active').forEach(h => h.classList.remove('active'));
      if (this.tempLine) {
        this.tempLine.remove();
        this.tempLine = null;
      }

      if (target) {
        this.addMapping({
          sourceTable: this.dragSource.table,
          sourceColumn: this.dragSource.column,
          targetTable: target.dataset.table,
          targetColumn: target.dataset.column,
        });
      }
      this.dragSource = null;
    });

    this.linesGroup.addEventListener('click', e => {
      const line = e.target.closest('.mapping-line[data-id]');
      if (!line) return;
      this.selectMapping(line.dataset.id);
    });

    window.addEventListener('resize', () => this.redrawLines());
    this.container.querySelector('#source-panel')?.addEventListener('scroll', () => this.redrawLines());
    this.container.querySelector('#target-panel')?.addEventListener('scroll', () => this.redrawLines());
  }

  updateTempLine(e) {
    if (!this.tempLine || !this.dragSource) return;
    const srcHandle = this.container.querySelector(
      `[data-handle="source"][data-table="${this.dragSource.table}"][data-column="${this.dragSource.column}"]`
    );
    if (!srcHandle) return;
    const srcRect = srcHandle.getBoundingClientRect();
    const canvasRect = this.canvasWrap.getBoundingClientRect();
    const x1 = srcRect.left + srcRect.width / 2 - canvasRect.left;
    const y1 = srcRect.top + srcRect.height / 2 - canvasRect.top;
    const x2 = e.clientX - canvasRect.left;
    const y2 = e.clientY - canvasRect.top;
    this.tempLine.setAttribute('d', bezier(x1, y1, x2, y2));
  }

  addMapping({ sourceTable, sourceColumn, targetTable, targetColumn }) {
    const exists = this.mappings.some(
      m => m.sourceTable === sourceTable && m.sourceColumn === sourceColumn &&
           m.targetTable === targetTable && m.targetColumn === targetColumn
    );
    if (exists) return;

    this.mappings = this.mappings.filter(
      m => !(m.sourceTable === sourceTable && m.sourceColumn === sourceColumn) &&
           !(m.targetTable === targetTable && m.targetColumn === targetColumn)
    );

    const mapping = {
      id: uid(),
      sourceTable,
      sourceColumn,
      targetTable,
      targetColumn,
      transformNotes: '',
      lookupRule: '',
      defaultValue: '',
      verification: defaultVerification('Mapping created', this.getActor?.() || 'unknown'),
    };
    this.mappings.push(mapping);
    this.refreshPanels();
    this.onChange?.(this.mappings);
    this.selectMapping(mapping.id);
  }

  updateMapping(id, updates) {
    const idx = this.mappings.findIndex(m => m.id === id);
    if (idx < 0) return;
    this.mappings[idx] = { ...this.mappings[idx], ...updates };
    this.onChange?.(this.mappings);
  }

  deleteMapping(id) {
    this.mappings = this.mappings.filter(m => m.id !== id);
    this.selectedId = null;
    this.refreshPanels();
    this.onChange?.(this.mappings);
    this.onSelectMapping?.(null);
  }

  selectMapping(id) {
    this.selectedId = id;
    this.redrawLines();
    const mapping = this.mappings.find(m => m.id === id);
    this.onSelectMapping?.(mapping || null);
  }

  refreshPanels() {
    this.container.querySelector('#source-panel').innerHTML = this.renderPanel(this.sourceSchema, 'source');
    this.container.querySelector('#target-panel').innerHTML = this.renderPanel(this.targetSchema, 'target');
    this.redrawLines();
  }

  redrawLines() {
    this.linesGroup.querySelectorAll('.mapping-line:not(.temp)').forEach(n => n.remove());

    for (const m of this.mappings) {
      const src = this.container.querySelector(
        `[data-handle="source"][data-table="${m.sourceTable}"][data-column="${m.sourceColumn}"]`
      );
      const tgt = this.container.querySelector(
        `[data-handle="target"][data-table="${m.targetTable}"][data-column="${m.targetColumn}"]`
      );
      if (!src || !tgt) continue;

      const canvasRect = this.canvasWrap.getBoundingClientRect();
      const s = src.getBoundingClientRect();
      const t = tgt.getBoundingClientRect();
      const x1 = s.left + s.width / 2 - canvasRect.left;
      const y1 = s.top + s.height / 2 - canvasRect.top;
      const x2 = t.left + t.width / 2 - canvasRect.left;
      const y2 = t.top + t.height / 2 - canvasRect.top;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('mapping-line');
      if (m.id === this.selectedId) path.classList.add('selected');
      path.dataset.id = m.id;
      path.setAttribute('d', bezier(x1, y1, x2, y2));
      path.setAttribute('stroke', m.id === this.selectedId ? '#e07a5f' : '#64748b');
      path.style.pointerEvents = 'stroke';
      this.linesGroup.appendChild(path);
    }
  }

  updateFooter(stats) {
    const footer = this.container.querySelector('#workspace-footer');
    if (!footer) return;
    footer.innerHTML = `
      <span>${stats.mappedCount} mappings · ${stats.unmappedSource.length} unmapped source · ${stats.unmappedTarget.length} unmapped target</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${stats.percent}%"></div></div>
    `;
  }
}

function bezier(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}
