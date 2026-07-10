import { validateDocumentSpec } from './document-spec.js';
import { SWISS_CATALOG_COMPONENT_CSS } from './swiss-catalog-css.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getSlot = (page, key) => String(page.slots?.[key] ?? '');
const getItemLabel = (item, fallback = '') => String(item?.label || item?.title || item?.name || item?.value || fallback);
const getItemValue = (item, fallback = '') => String(item?.value || item?.note || item?.description || item?.label || item?.title || fallback);
const getItemNote = (item, fallback = '') => String(item?.note || item?.description || fallback);
const getItemBadge = (item, fallback = '') => String(item?.badge || fallback);
export const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';

const getSlotEditPath = (page, key, index = null) => {
  const editPath = page?.__morndraftEditPaths?.slots?.[key];
  if (Array.isArray(editPath)) return index === null ? '' : editPath[index] || '';
  return index === null && typeof editPath === 'string' ? editPath : '';
};

const getItemEditPath = (item, key, index = null) => {
  const editPath = item?.__morndraftEditPaths?.[key];
  if (Array.isArray(editPath)) return index === null ? '' : editPath[index] || '';
  return index === null && typeof editPath === 'string' ? editPath : '';
};

const renderEditAttributes = (path) =>
  path ? ` ${MORNDRAFT_FLAT_EDIT_PATH_ATTR}="${escapeHtml(path)}"` : '';

const renderEditableText = (value, path) =>
  path
    ? `<span${renderEditAttributes(path)}>${escapeHtml(value)}</span>`
    : escapeHtml(value);

const parseJsonValue = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const parseListValue = (value) => {
  const parsed = parseJsonValue(value, null);
  if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  return [];
};

const getItemList = (item, key) => parseListValue(item?.[key]);
const getItemArray = (item, key) => {
  const parsed = parseJsonValue(item?.[key], null);
  return Array.isArray(parsed) ? parsed : [];
};

const renderOptionalHeading = (page) => {
  const title = getSlot(page, 'title');
  const subtitle = getSlot(page, 'subtitle');
  return [
    title ? `<h2>${renderEditableText(title, getSlotEditPath(page, 'title'))}</h2>` : '',
    subtitle ? `<p>${renderEditableText(subtitle, getSlotEditPath(page, 'subtitle'))}</p>` : '',
  ].filter(Boolean).join('\n');
};

const getVariant = (page, fallback = '') => String(page.variant || fallback);

const chunkItems = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const formatSvgNumber = (value) => Number(value.toFixed(2)).toString();

const wrapSwissCard = (innerHtml, cardClass = 'swiss-card--body', contentClass = '') => `
<div class="swiss-card ${cardClass}">
  <div class="swiss-card__content${contentClass ? ` ${contentClass}` : ''}">
    ${innerHtml}
  </div>
</div>`;

const renderTitleCard = (page) => `
<div class="swiss-card swiss-card--titlecard">
  <div class="title-card">
    <h2>${renderEditableText(getSlot(page, 'title') || 'Title', getSlotEditPath(page, 'title'))}</h2>
    ${getSlot(page, 'subtitle') ? `<p>${renderEditableText(getSlot(page, 'subtitle'), getSlotEditPath(page, 'subtitle'))}</p>` : ''}
  </div>
</div>`;

const renderBeforeAfter = (page) => {
  const variant = getVariant(page, 'with-arrow');
  if (variant === 'verification') {
    const rows = (page.items ?? []).length
      ? page.items
      : [{ fuzzy: '模糊输入', precise: '明确输入' }];
    return wrapSwissCard(`
      ${renderOptionalHeading(page)}
      <div class="before-after--verification">
        ${rows.map((row, index) => `
          <div class="compare-row">
            <div class="compare-side compare-side--fuzzy">
              ${index === 0 ? '<span class="compare-tag">Fuzzy</span>' : ''}
              <p>${renderEditableText(row.fuzzy || row.before || getItemLabel(row, 'Fuzzy'), getItemEditPath(row, 'fuzzy') || getItemEditPath(row, 'before') || getItemEditPath(row, 'label'))}</p>
            </div>
            <div class="compare-divider">VS</div>
            <div class="compare-side compare-side--precise">
              ${index === 0 ? '<span class="compare-tag">Precise</span>' : ''}
              <p>${renderEditableText(row.precise || row.after || getItemValue(row, 'Precise'), getItemEditPath(row, 'precise') || getItemEditPath(row, 'after') || getItemEditPath(row, 'value'))}</p>
            </div>
          </div>`).join('')}
      </div>
    `);
  }

  const [before = {}, after = {}] = page.items ?? [];
  const className = variant === 'no-bg'
    ? 'before-after no-bg'
    : variant === 'default'
      ? 'before-after'
      : 'before-after with-arrow';
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="${className}">
      <div class="side before">
        <span class="badge">${renderEditableText(getItemLabel(before, 'Before'), getItemEditPath(before, 'label'))}</span>
        <p>${renderEditableText(getItemValue(before), getItemEditPath(before, 'value'))}</p>
      </div>
      ${className.includes('with-arrow') ? '<div class="arrow">→</div>' : ''}
      <div class="side after">
        <span class="badge">${renderEditableText(getItemLabel(after, 'After'), getItemEditPath(after, 'label'))}</span>
        <p>${renderEditableText(getItemValue(after), getItemEditPath(after, 'value'))}</p>
      </div>
    </div>
  `);
};

const renderSwot = (page) => {
  const classes = ['strengths', 'weaknesses', 'opportunities', 'threats'];
  const labels = ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'];
  const items = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="swot">
      ${classes.map((className, index) => {
        const item = items[index] ?? {};
        return `<div class="cell ${className}"><h4>${renderEditableText(getItemLabel(item, labels[index]), getItemEditPath(item, 'label'))}</h4><p>${renderEditableText(getItemValue(item), getItemEditPath(item, 'value') || getItemEditPath(item, 'note'))}</p></div>`;
      }).join('')}
    </div>
  `);
};

const renderQuadrantAxis = (page) => {
  const items = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="quadrant-axis">
      <div class="axis-label top">${renderEditableText(getSlot(page, 'axisTop') || '积极', getSlotEditPath(page, 'axisTop'))}</div>
      <div class="axis-label bottom">${renderEditableText(getSlot(page, 'axisBottom') || '风险', getSlotEditPath(page, 'axisBottom'))}</div>
      <div class="axis-label left">${renderEditableText(getSlot(page, 'axisLeft') || '内部', getSlotEditPath(page, 'axisLeft'))}</div>
      <div class="axis-label right">${renderEditableText(getSlot(page, 'axisRight') || '外部', getSlotEditPath(page, 'axisRight'))}</div>
      <div class="axis-center">${renderEditableText(getSlot(page, 'center') || 'AXIS', getSlotEditPath(page, 'center'))}</div>
      ${[0, 1, 2, 3].map((index) => {
        const item = items[index] ?? {};
        return `<div class="quadrant q${index + 1}">
          <div class="marker">${renderEditableText(item.marker || `Q${index + 1}`, getItemEditPath(item, 'marker'))}</div>
          <h4>${renderEditableText(getItemLabel(item, `Q${index + 1}`), getItemEditPath(item, 'label'))}</h4>
          <p>${renderEditableText(getItemValue(item), getItemEditPath(item, 'value') || getItemEditPath(item, 'note'))}</p>
        </div>`;
      }).join('')}
    </div>
  `);
};

const renderImpossibleTriangle = (page) => {
  const items = page.items ?? [];
  const defaults = ['成本', '效率', '质量'];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="impossible-triangle" role="img" aria-label="不可能三角">
      <svg class="impossible-triangle-svg" viewBox="0 0 320 260" aria-hidden="true" focusable="false">
        <polygon class="impossible-triangle-shape" points="160,28 42,226 278,226"></polygon>
      </svg>
      ${[0, 1, 2].map((index) => {
        const item = items[index] ?? {};
        return `<div class="impossible-triangle-point impossible-triangle-point-${index + 1}">
          ${renderEditableText(getItemLabel(item, defaults[index]), getItemEditPath(item, 'label'))}
        </div>`;
      }).join('')}
    </div>
  `);
};

const renderComparisonTable = (page) => {
  const columns = parseListValue(getSlot(page, 'columns'));
  const headers = columns.length ? columns : ['维度', '方案 A', '方案 B'];
  const rows = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <table class="comparison-table">
      <tr>${headers.map((header, index) => `<th>${renderEditableText(header, getSlotEditPath(page, 'columns', index))}</th>`).join('')}</tr>
      ${rows.map((item) => {
        const values = parseListValue(item.values);
        const rowValues = values.length ? values : [getItemLabel(item), getItemValue(item), getItemNote(item)];
        return `<tr>${rowValues.map((value, index) => `<td${index > 0 ? ' class="score"' : ''}>${renderEditableText(value, getItemEditPath(item, 'values', index))}</td>`).join('')}</tr>`;
      }).join('')}
    </table>
  `);
};

const renderProcess = (page) => {
  const items = page.items ?? [];
  const variant = getVariant(page, 'arrow');
  if (variant === 'annotated' || variant === 'annotated-arrow') {
    const annotatedItems = items.length ? items : [{}];
    const arrowVariant = variant === 'annotated-arrow';
    const rows = chunkItems(
      annotatedItems.map((item, index) => ({ item, index })),
      4,
    );
    return wrapSwissCard(`
      ${renderOptionalHeading(page)}
      <div class="process-annotated-stack process-annotated-stack--${arrowVariant ? 'arrow' : 'plain'}">
        ${rows.map((row) => `
          <div class="process-annotated-grid process-annotated-grid--${arrowVariant ? 'arrow' : 'plain'}" style="--annotated-count:${row.length}">
            ${row.map(({ item, index }) => `
              <div class="process-annotated-item">
                <div class="step-node${arrowVariant ? ` tone-${(index % 6) + 1}` : ''}">${renderEditableText(getItemLabel(item, `Step ${index + 1}`), getItemEditPath(item, 'label'))}</div>
                <div class="caption-node">
                  <span class="caption-label">${renderEditableText(getItemBadge(item, arrowVariant ? `Stage ${String(index + 1).padStart(2, '0')}` : `Step ${String(index + 1).padStart(2, '0')}`), getItemEditPath(item, 'badge'))}</span>
                  <p>${renderEditableText(getItemNote(item, getItemValue(item)), getItemEditPath(item, 'note') || getItemEditPath(item, 'value'))}</p>
                </div>
              </div>`).join('')}
          </div>`).join('')}
      </div>
    `);
  }

  const content = items.map((item, index) => {
    const step = `<div class="step tone-${(index % 8) + 1}">${renderEditableText(getItemLabel(item, `Step ${index + 1}`), getItemEditPath(item, 'label'))}</div>`;
    const arrow = variant === 'arrow' ? '<div class="arrow"></div>' : '<div class="arrow">→</div>';
    return index < items.length - 1 ? `${step}${arrow}` : step;
  }).join('');
  const dataType = variant === 'arrow' || variant === 'wrap' ? ` data-type="${variant}"` : '';
  const dataDensity = items.length > 7 ? ' data-density="wrap"' : '';
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="process-chain"${dataType}${dataDensity} data-count="${items.length}">${content}</div>
  `);
};

const LOOP_CLOSED_PATH_CONFIG = Object.freeze({
  triangle: { cx: 130, cy: 138, r: 90, angles: [-90, 30, 150] },
  quad: { cx: 130, cy: 130, r: 92, angles: [-90, 0, 90, 180] },
  pentagon: { cx: 130, cy: 130, r: 90, angles: [-90, -18, 54, 126, 198] },
  hex: { cx: 130, cy: 130, r: 90, angles: [-90, -30, 30, 90, 150, 210] },
});

const getLoopClosedArrowPoints = ({ cx, cy, r, angles }) =>
  angles.map((angle, index) => {
    const nextAngle =
      angles[(index + 1) % angles.length] + (index === angles.length - 1 ? 360 : 0);
    const midAngle = (angle + nextAngle) / 2;
    const radians = (midAngle * Math.PI) / 180;
    return {
      x: Number((cx + Math.cos(radians) * r).toFixed(2)),
      y: Number((cy + Math.sin(radians) * r).toFixed(2)),
      rotation: Number((midAngle + 90).toFixed(2)),
    };
  });

const renderLoopClosedPath = (type) => {
  const config = LOOP_CLOSED_PATH_CONFIG[type] ?? LOOP_CLOSED_PATH_CONFIG.quad;
  const arrows = getLoopClosedArrowPoints(config)
    .map(({ x, y, rotation }) => `
        <path class="loop-closed-arrow" d="M 7 0 L -5 -4 L -3 0 L -5 4 Z" fill="#d95e00" opacity="0.68" transform="translate(${x} ${y}) rotate(${rotation})"></path>`)
    .join('');
  return `
      <svg class="loop-closed-path" viewBox="0 0 260 260" aria-hidden="true" focusable="false">
        <circle class="loop-closed-track" cx="${config.cx}" cy="${config.cy}" r="${config.r}" fill="none" stroke="#d95e00" stroke-width="2" stroke-linecap="round" stroke-dasharray="8 8" opacity="0.3"></circle>${arrows}
      </svg>`;
};

const getLoopShapeType = (items) =>
  items.length === 3 ? 'triangle' : items.length === 5 ? 'pentagon' : items.length >= 6 ? 'hex' : 'quad';

const renderProcessLoop = (page) => {
  const items = page.items ?? [];
  const requestedVariant = getVariant(page);
  const closedLoop = requestedVariant === 'closed-loop';
  const type = requestedVariant && !closedLoop ? requestedVariant : getLoopShapeType(items);
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="process-loop${closedLoop ? ' process-loop-closed' : ''}" data-type="${type}" data-count="${items.length}" data-style="${closedLoop ? 'closed-loop' : 'loop'}">
      ${items.slice(0, 6).map((item, index) => `<div class="loop-item">${renderEditableText(getItemLabel(item, `Step ${index + 1}`), getItemEditPath(item, 'label'))}</div>`).join('')}
      ${closedLoop ? renderLoopClosedPath(type) : ''}
    </div>
  `);
};

const renderJourney = (page) => {
  const items = (page.items ?? []).slice(0, 5);
  const defaults = ['发现', '调研', '购买', '体验', '推荐'];
  const labels = defaults.map((fallback, index) => getItemLabel(items[index], fallback));
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="journey">
      <div class="path">
        <svg class="journey-svg" viewBox="0 0 560 210" role="img" aria-label="${escapeHtml(getSlot(page, 'title') || 'Journey')}">
          <defs>
            <filter id="journeyMilestoneShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#d95e00" flood-opacity="0.26"></feDropShadow>
            </filter>
          </defs>
          <path class="journey-track" d="M15 100 Q 75 100, 105 80 T 195 75 T 285 60 T 375 85 T 465 70 T 515 75"></path>
          ${[
            [65, 95.5, false],
            [165, 69.5, false],
            [265, 73.4, true],
            [365, 76.5, false],
            [465, 69.6, false],
          ].map(([x, y, milestone]) => `
          <g class="journey-point${milestone ? ' journey-point--milestone' : ''}" transform="translate(${x} ${y})">
            <circle class="journey-ring" r="${milestone ? 15 : 12}"></circle>
            <circle class="journey-core" r="${milestone ? 12 : 8}"></circle>
          </g>`).join('')}
          <rect class="journey-badge-bg" x="227" y="18" width="76" height="32" rx="8"></rect>
          <text class="journey-badge-text" x="265" y="39">${escapeHtml(getItemBadge(items[2], '决策'))}</text>
          ${[65, 165, 265, 365, 465].map((x, index) => `<text class="journey-label" x="${x}" y="178">${escapeHtml(labels[index])}</text>`).join('')}
        </svg>
      </div>
    </div>
  `);
};

const renderGantt = (page) => {
  const tasks = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="gantt">
      <div class="gantt-header">
        <div class="label">任务</div>
        <div class="timeline"><span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span></div>
      </div>
      ${tasks.map((task, index) => {
        const start = Number.parseFloat(task.start ?? '') || Math.min(index * 18, 80);
        const width = Number.parseFloat(task.width ?? '') || 24;
        return `<div class="task"><div class="task-name">${renderEditableText(getItemLabel(task, `Task ${index + 1}`), getItemEditPath(task, 'label'))}</div><div class="task-bar"><div class="fill" style="left:${start}%;width:${width}%"></div></div></div>`;
      }).join('')}
    </div>
  `);
};

const renderTimeline = (page) => {
  const items = page.items ?? [];
  const type = getVariant(page, 'horizontal');
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="timeline" data-type="${type}">
      ${items.map((item, index) => {
        const label = getItemLabel(item, `T${index + 1}`);
        const note = getItemNote(item, '');
        const hasValue = Boolean(item?.value);
        const summary = getItemValue(item, note || label);
        const summaryPath = hasValue
          ? getItemEditPath(item, 'value')
          : getItemEditPath(item, 'note') || getItemEditPath(item, 'label');
        const descPath = getItemEditPath(item, 'note');
        const desc = type === 'vertical' && note && note !== label ? `<div class="desc">${renderEditableText(note, descPath)}</div>` : '';
        return `<div class="item"><div class="year">${renderEditableText(label, getItemEditPath(item, 'label'))}</div><p>${renderEditableText(summary, summaryPath)}</p>${desc}</div>`;
      }).join('')}
    </div>
  `);
};

const renderPyramid = (page) => {
  const items = (page.items ?? []).slice(0, 5);
  const inverted = getVariant(page) === 'inverted';
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="pyramid"${inverted ? ' data-type="inverted"' : ''} data-count="${items.length}" style="transform:scale(0.8);margin:0">
      ${items.map((item, index) => `<div class="level level-${index + 1}">${renderEditableText(getItemLabel(item, `Level ${index + 1}`), getItemEditPath(item, 'label'))}</div>`).join('')}
    </div>
  `);
};

const renderFishbone = (page) => {
  const top = (page.items ?? []).filter((item) => item.type === 'top');
  const bottom = (page.items ?? []).filter((item) => item.type === 'bottom');
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="fishbone" style="min-height:240px;padding:50px 20px 50px">
      <div class="head">${renderEditableText(getSlot(page, 'head') || getSlot(page, 'result') || '结果', getSlotEditPath(page, 'head') || getSlotEditPath(page, 'result'))}</div>
      <div class="spine"></div>
      <div class="ribs-top">${top.map((item) => `<div class="rib">${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</div>`).join('')}</div>
      <div class="ribs-bottom">${bottom.map((item) => `<div class="rib">${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</div>`).join('')}</div>
    </div>
  `);
};

const renderIceberg = (page) => {
  const items = page.items ?? [];
  const surfaceItem = items[0] ?? {};
  const depthItem = items[1] ?? {};
  const surfaceLabel = getSlot(page, 'surfaceLabel') || getItemBadge(surfaceItem, '表层');
  const surface = getSlot(page, 'surface') || getItemLabel(surfaceItem, '可见现象');
  const depthLabel = getSlot(page, 'depthLabel') || getItemBadge(depthItem, '深层');
  const depth = getSlot(page, 'depth') || getItemLabel(depthItem, getItemNote(surfaceItem, '根因结构'));
  const surfaceLabelPath = getSlotEditPath(page, 'surfaceLabel') || getItemEditPath(surfaceItem, 'badge') || getItemEditPath(surfaceItem, 'role');
  const surfacePath = getSlotEditPath(page, 'surface') || getItemEditPath(surfaceItem, 'label') || getItemEditPath(surfaceItem, 'value');
  const depthLabelPath = getSlotEditPath(page, 'depthLabel') || getItemEditPath(depthItem, 'badge') || getItemEditPath(depthItem, 'role');
  const depthPath = getSlotEditPath(page, 'depth') || getItemEditPath(depthItem, 'label') || getItemEditPath(depthItem, 'value') || getItemEditPath(depthItem, 'note') || getItemEditPath(surfaceItem, 'note');

  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="iceberg">
      <div class="iceberg__callout iceberg__callout--surface">
        <strong>${renderEditableText(surfaceLabel, surfaceLabelPath)}</strong>
        <span>${renderEditableText(surface, surfacePath)}</span>
      </div>
      <div class="iceberg__visual" aria-hidden="true">
        <div class="iceberg__stage">
          <div class="iceberg__waterline"></div>
          <svg class="iceberg__art" viewBox="0 0 420 420" preserveAspectRatio="xMidYMid meet">
            <path class="iceberg__shadow" d="M118 182 L340 182 L316 266 L279 332 L246 378 L212 362 L185 400 L160 333 L128 346 L108 272 Z" />
            <path class="iceberg__mass iceberg__mass--top" d="M118 174 L154 112 L200 96 L236 36 L252 122 L301 158 L340 174 L292 174 L241 149 L194 174 Z" />
            <path class="iceberg__facet iceberg__facet--top" d="M200 96 L236 36 L252 122 L207 158 Z" />
            <path class="iceberg__mass iceberg__mass--bottom" d="M118 174 L340 174 L316 266 L279 332 L246 378 L212 362 L185 400 L160 333 L128 346 L108 272 Z" />
            <path class="iceberg__facet iceberg__facet--bottom" d="M160 333 L184 400 L209 296 L236 336 L246 378 L279 332 L316 266 L278 252 L236 290 L198 246 L154 260 Z" />
            <path class="iceberg__edge" d="M154 112 L200 96 L236 36 L252 122" />
            <path class="iceberg__edge" d="M198 246 L209 296 L184 400" />
          </svg>
        </div>
      </div>
      <div class="iceberg__callout iceberg__callout--depth">
        <strong>${renderEditableText(depthLabel, depthLabelPath)}</strong>
        <span>${renderEditableText(depth, depthPath)}</span>
      </div>
    </div>
  `);
};

const renderVenn = (page) => {
  const items = page.items ?? [];
  if (getVariant(page) === 'double') {
    return wrapSwissCard(`
      ${renderOptionalHeading(page)}
      <div class="venn" style="height:240px">
        <div class="v-circle v-a">${renderEditableText(getItemLabel(items[0], 'A'), getItemEditPath(items[0], 'label'))}</div>
        <div class="v-circle v-b">${renderEditableText(getItemLabel(items[1], 'B'), getItemEditPath(items[1], 'label'))}</div>
      </div>
    `);
  }
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="venn-three" style="height:240px">
      ${['a', 'b', 'c'].map((suffix, index) => `<div class="circle circle-${suffix}">${renderEditableText(getItemLabel(items[index], `Circle ${index + 1}`), getItemEditPath(items[index], 'label'))}</div>`).join('')}
    </div>
  `);
};

const getArchitectureTone = (index, simple = false) => {
  const tones = simple ? ['a', 'b', 'c', 'e'] : ['a', 'e', 'c', 'd', 'b'];
  return tones[index % tones.length];
};

const renderArchitectureCards = (cards, complex = false) => {
  const colClass = cards.length >= 4 ? 'col-4' : 'col-3';
  if (complex) {
    return `<div class="av-grid ${colClass}">
      ${cards.map((card) => `
        <div class="av-card arch-tone-card">
          <div class="av-card-title arch-tone-fill">${renderEditableText(getItemLabel(card), getItemEditPath(card, 'label'))}</div>
          <div class="av-items">
            ${getItemList(card, 'items').map((item, itemIndex) => `<div class="av-item">${renderEditableText(item, getItemEditPath(card, 'items', itemIndex))}</div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  }

  return `<div class="ap-grid ${colClass}">
    ${cards.map((card) => `
      <div class="ap-card arch-tone-card">
        <div class="ap-card-title arch-tone-title">${renderEditableText(getItemLabel(card), getItemEditPath(card, 'label'))}</div>
        <div class="ap-items">
          ${getItemList(card, 'items').map((item, itemIndex) => `<div class="ap-item arch-tone-fill">${renderEditableText(item, getItemEditPath(card, 'items', itemIndex))}</div>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
};

const renderArchitecture = (page, complex = false) => {
  const layers = page.items ?? [];
  if (complex) {
    return wrapSwissCard(`
      ${renderOptionalHeading(page)}
      <div class="arch-complex-v">
        ${layers.map((layer, index) => {
          const tone = getArchitectureTone(index);
          const cards = getItemArray(layer, 'items');
          const modules = getItemList(layer, 'modules');
          return `
            <div class="av-row tone-${tone}">
              <div class="av-label arch-tone-label">${renderEditableText(getItemLabel(layer, `Layer ${index + 1}`), getItemEditPath(layer, 'label'))}</div>
              <div class="av-content arch-tone-wrap">
                ${cards.length
                  ? renderArchitectureCards(cards, true)
                  : `<div class="av-flat" data-count="${Math.max(1, modules.length)}">${modules.map((module, moduleIndex) => `<div class="av-chip arch-tone-fill">${renderEditableText(module, getItemEditPath(layer, 'modules', moduleIndex))}</div>`).join('')}</div>`}
              </div>
            </div>`;
        }).join('')}
      </div>
    `);
  }
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="arch-platform">
      ${layers.map((layer, index) => {
        const tone = getArchitectureTone(index, page.layout === 'architecture');
        const cards = getItemArray(layer, 'items');
        const modules = getItemList(layer, 'modules');
        return `
          <div class="ap-row tone-${tone}">
            <div class="ap-label arch-tone-label">${renderEditableText(getItemLabel(layer, `Layer ${index + 1}`), getItemEditPath(layer, 'label'))}</div>
            ${cards.length
              ? `<div class="ap-grid-wrap arch-tone-wrap tone-${tone}">${renderArchitectureCards(cards)}</div>`
              : `<div class="ap-flat arch-tone-wrap tone-${tone}" data-count="${Math.max(1, modules.length)}">${modules.map((module, moduleIndex) => `<div class="ap-chip arch-tone-fill">${renderEditableText(module, getItemEditPath(layer, 'modules', moduleIndex))}</div>`).join('')}</div>`}
          </div>`;
      }).join('')}
    </div>
  `, 'swiss-card--body', page.layout === 'arch-platform' ? 'swiss-card__content--arch-base' : '');
};

const MIND_MAP_CONNECTOR_STROKE = '#d95e00';
const MIND_MAP_HORIZONTAL_WIDTH = 448;
const MIND_MAP_HORIZONTAL_HEIGHT = 239;
const MIND_MAP_HORIZONTAL_NODE_WIDTH = 100;
const MIND_MAP_HORIZONTAL_BRANCH_GAP = 32;
const MIND_MAP_HORIZONTAL_ROOT_TOP_Y = 40;
const MIND_MAP_HORIZONTAL_SPINE_Y = 140;
const MIND_MAP_HORIZONTAL_NODE_CENTER_Y = 178.5;
const MIND_MAP_VERTICAL_WIDTH = 568;
const MIND_MAP_VERTICAL_PADDING_Y = 40;
const MIND_MAP_VERTICAL_BRANCH_GAP = 20;
const MIND_MAP_VERTICAL_NODE_HEIGHT = 36;
const MIND_MAP_VERTICAL_CHILD_GAP = 10;
const MIND_MAP_VERTICAL_ROOT_LEFT_X = 30;
const MIND_MAP_VERTICAL_SPINE_X = 190;
const MIND_MAP_VERTICAL_NODE_CENTER_X = 266;
const MIND_MAP_VERTICAL_SUB_SPINE_X = 384;
const MIND_MAP_VERTICAL_SUB_NODE_CENTER_X = 460;

const renderMindMapLine = (x1, y1, x2, y2) => `
          <line class="mind-map-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MIND_MAP_CONNECTOR_STROKE}" stroke-width="2" fill="none" stroke-linecap="square" vector-effect="non-scaling-stroke"></line>`;

const getMindMapHorizontalBaseWidth = (branches) => {
  const count = branches.length;
  if (!count) return MIND_MAP_HORIZONTAL_WIDTH;
  const branchTrackWidth = count * MIND_MAP_HORIZONTAL_NODE_WIDTH + (count - 1) * MIND_MAP_HORIZONTAL_BRANCH_GAP;
  return Math.max(MIND_MAP_HORIZONTAL_WIDTH, branchTrackWidth);
};

const getMindMapFitStyle = ({
  baseWidth,
  baseHeight,
  compactScale,
  narrowScale,
}) => {
  const toPx = (value) => `${Math.ceil(value)}px`;
  return [
    `--mind-map-base-width:${baseWidth}px`,
    `--mind-map-base-height:${baseHeight}px`,
    `--mind-map-compact-scale:${compactScale}`,
    `--mind-map-compact-width:${toPx(baseWidth * compactScale)}`,
    `--mind-map-compact-height:${toPx(baseHeight * compactScale)}`,
    `--mind-map-narrow-scale:${narrowScale}`,
    `--mind-map-narrow-width:${toPx(baseWidth * narrowScale)}`,
    `--mind-map-narrow-height:${toPx(baseHeight * narrowScale)}`,
  ].join(';');
};

const renderMindMapHorizontalConnectors = (branches, baseWidth = MIND_MAP_HORIZONTAL_WIDTH) => {
  const count = branches.length;
  if (!count) return '';

  const branchTrackWidth = count * MIND_MAP_HORIZONTAL_NODE_WIDTH + (count - 1) * MIND_MAP_HORIZONTAL_BRANCH_GAP;
  const rootCenterX = baseWidth / 2;
  const branchStartX = (baseWidth - branchTrackWidth) / 2;
  const branchCenters = branches.map((_, index) => (
    branchStartX +
    MIND_MAP_HORIZONTAL_NODE_WIDTH / 2 +
    index * (MIND_MAP_HORIZONTAL_NODE_WIDTH + MIND_MAP_HORIZONTAL_BRANCH_GAP)
  ));
  const lines = [
    renderMindMapLine(
      rootCenterX,
      MIND_MAP_HORIZONTAL_ROOT_TOP_Y,
      rootCenterX,
      MIND_MAP_HORIZONTAL_SPINE_Y,
    ),
    renderMindMapLine(
      branchCenters[0],
      MIND_MAP_HORIZONTAL_SPINE_Y,
      branchCenters[branchCenters.length - 1],
      MIND_MAP_HORIZONTAL_SPINE_Y,
    ),
    ...branchCenters.map((centerX) => renderMindMapLine(
      centerX,
      MIND_MAP_HORIZONTAL_SPINE_Y,
      centerX,
      MIND_MAP_HORIZONTAL_NODE_CENTER_Y,
    )),
  ];

  return `
        <svg class="mind-map-overlay" aria-hidden="true" viewBox="0 0 ${baseWidth} ${MIND_MAP_HORIZONTAL_HEIGHT}" preserveAspectRatio="none">
          ${lines.join('')}
        </svg>`;
};

const getMindMapVerticalBranchMetrics = (branches) => {
  let cursorY = MIND_MAP_VERTICAL_PADDING_Y;
  const branchMetrics = branches.map((branch) => {
    const childCount = getItemList(branch, 'children').length;
    const childTrackHeight = childCount > 0
      ? childCount * MIND_MAP_VERTICAL_NODE_HEIGHT + (childCount - 1) * MIND_MAP_VERTICAL_CHILD_GAP
      : 0;
    const rowHeight = Math.max(MIND_MAP_VERTICAL_NODE_HEIGHT, childTrackHeight);
    const centerY = cursorY + rowHeight / 2;
    const childStartY = cursorY + (rowHeight - childTrackHeight) / 2;
    const childCenters = Array.from({ length: childCount }, (_, index) => (
      childStartY +
      MIND_MAP_VERTICAL_NODE_HEIGHT / 2 +
      index * (MIND_MAP_VERTICAL_NODE_HEIGHT + MIND_MAP_VERTICAL_CHILD_GAP)
    ));
    cursorY += rowHeight + MIND_MAP_VERTICAL_BRANCH_GAP;
    return { centerY, childCenters };
  });
  const height = cursorY - MIND_MAP_VERTICAL_BRANCH_GAP + MIND_MAP_VERTICAL_PADDING_Y;
  return { branchMetrics, height };
};

const renderMindMapVerticalConnectors = (branches) => {
  const count = branches.length;
  if (!count) return '';

  const { branchMetrics, height } = getMindMapVerticalBranchMetrics(branches);
  const rootY = height / 2;
  const lines = [
    renderMindMapLine(MIND_MAP_VERTICAL_ROOT_LEFT_X, rootY, MIND_MAP_VERTICAL_SPINE_X, rootY),
    renderMindMapLine(
      MIND_MAP_VERTICAL_SPINE_X,
      branchMetrics[0].centerY,
      MIND_MAP_VERTICAL_SPINE_X,
      branchMetrics[branchMetrics.length - 1].centerY,
    ),
    ...branchMetrics.map(({ centerY }) => renderMindMapLine(
      MIND_MAP_VERTICAL_SPINE_X,
      centerY,
      MIND_MAP_VERTICAL_NODE_CENTER_X,
      centerY,
    )),
  ];

  branchMetrics.forEach(({ centerY, childCenters }) => {
    if (!childCenters.length) return;

    const subSpineTop = Math.min(centerY, ...childCenters);
    const subSpineBottom = Math.max(centerY, ...childCenters);
    lines.push(renderMindMapLine(MIND_MAP_VERTICAL_NODE_CENTER_X, centerY, MIND_MAP_VERTICAL_SUB_SPINE_X, centerY));
    lines.push(renderMindMapLine(MIND_MAP_VERTICAL_SUB_SPINE_X, subSpineTop, MIND_MAP_VERTICAL_SUB_SPINE_X, subSpineBottom));
    childCenters.forEach((childY) => {
      lines.push(renderMindMapLine(MIND_MAP_VERTICAL_SUB_SPINE_X, childY, MIND_MAP_VERTICAL_SUB_NODE_CENTER_X, childY));
    });
  });

  return `
        <svg class="mind-map-overlay" aria-hidden="true" viewBox="0 0 ${MIND_MAP_VERTICAL_WIDTH} ${height}" preserveAspectRatio="none">
          ${lines.join('')}
        </svg>`;
};

const renderMindMap = (page) => {
  const branches = page.items ?? [];
  const rootLabel = getSlot(page, 'root') || getSlot(page, 'title') || 'Root';
  if (getVariant(page) === 'horizontal') {
    const baseWidth = getMindMapHorizontalBaseWidth(branches);
    return wrapSwissCard(`
      ${renderOptionalHeading(page)}
      <div class="mind-map-fit mind-map-fit--horizontal" style="${getMindMapFitStyle({
        baseWidth,
        baseHeight: MIND_MAP_HORIZONTAL_HEIGHT,
        compactScale: 0.68,
        narrowScale: 0.46,
      })}">
        <div class="mind-map" data-type="horizontal">
          ${renderMindMapHorizontalConnectors(branches, baseWidth)}
          <div class="root-node">${renderEditableText(rootLabel, getSlotEditPath(page, 'root') || getSlotEditPath(page, 'title'))}</div>
          <div class="branches">
            ${branches.map((branch) => `<div class="branch"><div class="node">${renderEditableText(getItemLabel(branch), getItemEditPath(branch, 'label'))}</div></div>`).join('')}
          </div>
        </div>
      </div>
    `);
  }
  const { height: verticalHeight } = getMindMapVerticalBranchMetrics(branches);
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="mind-map-fit mind-map-fit--vertical" style="${getMindMapFitStyle({
      baseWidth: MIND_MAP_VERTICAL_WIDTH,
      baseHeight: verticalHeight,
      compactScale: 0.58,
      narrowScale: 0.4,
    })}">
      <div class="mind-map" data-type="vertical">
        ${renderMindMapVerticalConnectors(branches)}
        <div class="root-node">${renderEditableText(rootLabel, getSlotEditPath(page, 'root') || getSlotEditPath(page, 'title'))}</div>
        <div class="branches">
          ${branches.map((branch) => {
            const children = getItemList(branch, 'children');
            return `<div class="branch"><div class="node">${renderEditableText(getItemLabel(branch), getItemEditPath(branch, 'label'))}</div>${children.length ? `<div class="sub-branches">${children.map((child, childIndex) => `<div class="sub-node">${renderEditableText(child, getItemEditPath(branch, 'children', childIndex))}</div>`).join('')}</div>` : ''}</div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `);
};

const renderMatrix = (page) => {
  const items = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="matrix-grid">
      ${items.map((item) => `
        <div class="cell">
          <h4>${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</h4>
          ${getItemNote(item) ? `<p>${renderEditableText(getItemNote(item), getItemEditPath(item, 'note'))}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `);
};

const renderVs = (page) => {
  const [left = {}, right = {}] = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="vs-grid">
      <div class="vs-side vs-side--left"><h4>${renderEditableText(getItemLabel(left, 'Left'), getItemEditPath(left, 'label'))}</h4><p>${renderEditableText(getItemValue(left), getItemEditPath(left, 'value'))}</p></div>
      <div class="vs-divider">VS</div>
      <div class="vs-side vs-side--right"><h4>${renderEditableText(getItemLabel(right, 'Right'), getItemEditPath(right, 'label'))}</h4><p>${renderEditableText(getItemValue(right), getItemEditPath(right, 'value'))}</p></div>
    </div>
  `);
};

const renderStats = (page) => {
  const items = page.items ?? [];
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="stat-grid">
      ${items.map((item) => {
        const label = getItemLabel(item);
        const value = item.value || item.badge || item.note || label;
        const trend = item.trend || '';
        const trendClass = String(trend).trim().startsWith('-') ? 'down' : 'up';
        const unit = item.unit || '';
        const labelPath = getItemEditPath(item, 'label');
        const valuePath = getItemEditPath(item, 'value') || getItemEditPath(item, 'badge') || getItemEditPath(item, 'note');
        const trendPath = getItemEditPath(item, 'trend');
        const unitPath = getItemEditPath(item, 'unit');
        const notePath = getItemEditPath(item, 'note');
        return `
          <div class="stat-card">
            <div class="stat-card-header"><div class="stat-card-label">${renderEditableText(label, labelPath)}</div>${trend ? `<div class="stat-card-trend ${trendClass}">${renderEditableText(trend, trendPath)}</div>` : ''}</div>
            <div class="stat-card-value">${renderEditableText(value, valuePath)}${unit ? `<span class="stat-card-unit">${renderEditableText(unit, unitPath)}</span>` : ''}</div>
            ${getItemNote(item) && getItemNote(item) !== value ? `<div class="stat-card-footer">${renderEditableText(getItemNote(item), notePath)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `);
};

const getRadarPoint = (index, count, radius) => {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [
    130 + Math.cos(angle) * radius,
    130 + Math.sin(angle) * radius,
  ];
};

const getRadarValueRatio = (item, index) => {
  const rawValue = item?.value ?? item?.badge ?? item?.note;
  const parsed = Number.parseFloat(String(rawValue ?? '').replace('%', ''));
  if (Number.isFinite(parsed)) {
    return clampNumber(parsed > 1 ? parsed / 100 : parsed, 0.18, 1);
  }
  return [0.82, 0.68, 0.76, 0.58, 0.88, 0.72, 0.64, 0.8][index % 8];
};

const renderRadar = (page, hex = false) => {
  const fallback = hex
    ? ['创新', '性能', '易用', '稳定', '安全', '扩展']
    : ['性能', '扩展', '安全', '维护', '体验'];
  const sourceItems = page.items?.length ? page.items : fallback.map((label) => ({ label }));
  const items = sourceItems.map((item, index) => ({
    item,
    label: getItemLabel(item, fallback[index % fallback.length]),
    ratio: getRadarValueRatio(item, index),
  }));
  const count = Math.max(3, items.length);
  while (items.length < count) {
    const index = items.length;
    items.push({
      item: {},
      label: fallback[index % fallback.length],
      ratio: getRadarValueRatio({}, index),
    });
  }
  const outerRadius = hex ? 86 : 94;
  const labelRadius = hex ? 113 : 116;
  const gridRadii = [outerRadius, outerRadius * 0.67, outerRadius * 0.34];
  const polygonPoints = (radius) =>
    Array.from({ length: count }, (_, index) => getRadarPoint(index, count, radius))
      .map(([x, y]) => `${formatSvgNumber(x)},${formatSvgNumber(y)}`)
      .join(' ');
  const dataPoints = items
    .map(({ ratio }, index) => getRadarPoint(index, count, outerRadius * ratio));
  const dataPointString = dataPoints
    .map(([x, y]) => `${formatSvgNumber(x)},${formatSvgNumber(y)}`)
    .join(' ');
  const renderRadarLabel = ({ item, label }, index) => {
    const [x, y] = getRadarPoint(index, count, labelRadius);
    const labelPath = getItemEditPath(item, 'label');
    const inner = labelPath
      ? renderEditableText(label, labelPath)
      : escapeHtml(label);
    return `<foreignObject x="${formatSvgNumber(clampNumber(x - 46, 2, 166))}" y="${formatSvgNumber(clampNumber(y - 14, 4, 232))}" width="92" height="28"><div xmlns="http://www.w3.org/1999/xhtml" class="radar-label">${inner}</div></foreignObject>`;
  };
  const body = `
    <div class="${hex ? 'radar radar--hex' : 'radar'}">
      <div class="${hex ? 'radar-hex-inner' : 'radar-inner'}">
        <div class="radar-container">
          <svg class="radar-svg" viewBox="0 0 260 260">
            ${gridRadii.map((radius) => `<polygon class="radar-grid" points="${polygonPoints(radius)}"/>`).join('')}
            ${Array.from({ length: count }, (_, index) => {
              const [x, y] = getRadarPoint(index, count, outerRadius);
              return `<line class="radar-axis" x1="130" y1="130" x2="${formatSvgNumber(x)}" y2="${formatSvgNumber(y)}"/>`;
            }).join('')}
            <polygon class="radar-data" points="${dataPointString}"/>
            ${dataPoints.map(([x, y]) => `<circle class="radar-point" cx="${formatSvgNumber(x)}" cy="${formatSvgNumber(y)}" r="4"/>`).join('')}
            ${items.map((entry, index) => renderRadarLabel(entry, index)).join('')}
          </svg>
        </div>
      </div>
    </div>`;

  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    ${body}
  `);
};

const renderConcentric = (page) => {
  const sourceItems = (page.items ?? []).slice(0, 5);
  const items = sourceItems.length ? sourceItems : [{ label: 'Layer 1' }];
  const minSize = 110;
  const step = items.length <= 3 ? 85 : 54;
  const maxSize = minSize + step * (items.length - 1);
  const variant = getVariant(page);
  const variantClassName = variant === 'center-text-bottom'
    ? 'align-center-text-bottom'
    : variant;
  const getLayerTextTop = (index, size) => {
    const radius = size / 2;
    if (index === 0) return radius;
    const previousRadius = (minSize + step * (index - 1)) / 2;
    if (variantClassName === 'align-top') return previousRadius + radius;
    if (variantClassName === 'align-bottom') return size - (previousRadius + radius);
    const ringCenterOffset = (previousRadius + radius) / 2;
    if (variantClassName === 'align-center') return radius - ringCenterOffset;
    return radius + ringCenterOffset;
  };
  const layers = items
    .map((item, index) => ({ item, index }))
    .reverse()
    .map(({ item, index }, orderIndex) => {
      const layerNumber = index + 1;
      const size = minSize + step * index;
      const textTop = formatSvgNumber(getLayerTextTop(index, size));
      return `<div class="layer layer-${layerNumber}" style="width:${size}px;height:${size}px;z-index:${orderIndex + 1}"><span class="layer-text" style="top:${textTop}px;transform:translate(-50%, -50%)">${renderEditableText(getItemLabel(item, `Layer ${layerNumber}`), getItemEditPath(item, 'label'))}</span></div>`;
    })
    .join('');
  const className = variantClassName
    ? `concentric ${variantClassName}`
    : 'concentric align-center align-center-text-bottom';

  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="${className}" style="height:${Math.max(300, maxSize + 20)}px">${layers}</div>
  `);
};

const renderListCard = (page) => wrapSwissCard(`
  ${getVariant(page) === 'workflow'
    ? `<div class="list-card list-card--workflow">
        <div class="list-card-header"><span>${renderEditableText(getSlot(page, 'title') || '标准工作流', getSlotEditPath(page, 'title'))}</span><span class="workflow-kicker">${renderEditableText(getSlot(page, 'kicker') || '02 / Workflow', getSlotEditPath(page, 'kicker'))}</span></div>
        <ol>
          ${(page.items ?? []).map((item) => `<li><div><span class="workflow-item-title">${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</span><span class="workflow-item-copy">${renderEditableText(getItemValue(item), getItemEditPath(item, 'value') || getItemEditPath(item, 'note'))}</span></div></li>`).join('')}
        </ol>
      </div>`
    : `<div class="list-card">
        <div class="list-card-header">${renderEditableText(getSlot(page, 'title') || '列表', getSlotEditPath(page, 'title'))}</div>
        <ol>
          ${(page.items ?? []).map((item) => `<li>${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</li>`).join('')}
        </ol>
      </div>`}
`);

const renderTocCard = (page) => wrapSwissCard(`
  <div class="toc-card">
    <div class="toc-card-header">
      <div class="toc-card-tag">${renderEditableText(getSlot(page, 'tag') || '目录', getSlotEditPath(page, 'tag'))}</div>
      <div class="toc-card-index">${renderEditableText(getSlot(page, 'index') || '02', getSlotEditPath(page, 'index'))}</div>
    </div>
    <div>
      <h2 class="toc-card-title">${renderEditableText(getSlot(page, 'title') || '目录', getSlotEditPath(page, 'title'))}</h2>
      ${getSlot(page, 'subtitle') ? `<div class="toc-card-subtitle">${renderEditableText(getSlot(page, 'subtitle'), getSlotEditPath(page, 'subtitle'))}</div>` : ''}
    </div>
    <div class="toc-card-list">
      ${(page.items ?? []).map((section) => `
        <div class="toc-card-section">
          <div class="toc-card-section-label">${renderEditableText(getItemLabel(section), getItemEditPath(section, 'label'))}</div>
          ${getItemList(section, 'items').map((item, index) => `<div class="toc-card-row"><div class="toc-card-item">${renderEditableText(item, getItemEditPath(section, 'items', index))}</div><div class="toc-card-page">${escapeHtml(section.page || String(index + 1).padStart(2, '0'))}</div></div>`).join('')}
        </div>
      `).join('')}
    </div>
  </div>
`);

const renderFormCard = (page) => {
  const actions = parseListValue(getSlot(page, 'actions'));
  return wrapSwissCard(`
    <div class="form-card">
      <div class="form-card-header">
        <div>
          <div class="form-card-meta">${renderEditableText(getSlot(page, 'meta') || '登记 / 提醒 / 跟进', getSlotEditPath(page, 'meta'))}</div>
          <h2 class="form-card-title">${renderEditableText(getSlot(page, 'title') || '表单', getSlotEditPath(page, 'title'))}</h2>
        </div>
        <div class="form-card-meta">Auto Intake</div>
      </div>
      ${getSlot(page, 'prompt') ? `<div class="form-card-prompt">${renderEditableText(getSlot(page, 'prompt'), getSlotEditPath(page, 'prompt'))}</div>` : ''}
      <div class="form-card-fields">
        ${(page.items ?? []).map((item, index) => `<div class="form-field${index === (page.items ?? []).length - 1 ? ' form-field--wide' : ''}"><span class="form-field-label">${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</span><div class="form-field-value">${renderEditableText(getItemValue(item), getItemEditPath(item, 'value') || getItemEditPath(item, 'note'))}</div></div>`).join('')}
      </div>
      ${actions.length ? `<div class="form-card-footer">${actions.map((action, index) => `<div class="form-card-action"><strong>${String(index + 1).padStart(2, '0')}</strong>${escapeHtml(action)}</div>`).join('')}</div>` : ''}
    </div>
  `);
};

const renderCardGrid = (page, style) => {
  const items = page.items?.length ? page.items : [{}, {}];
  const isIconStyle = style === 'three';
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="card-grid card-grid--${style} ${isIconStyle ? 'three-col' : 'two-col'}">
      ${items.map((item, index) => {
        const valuePath = getItemEditPath(item, 'value') || getItemEditPath(item, 'note');
        if (isIconStyle) {
          return `<div class="card-grid-item card-grid-item--icon three-col-item">
            ${item.icon ? `<div class="three-col-icon">${escapeHtml(item.icon)}</div>` : ''}
            <div class="three-col-number">${String(index + 1).padStart(2, '0')}</div>
            <div class="three-col-label">${renderEditableText(getItemLabel(item, `Card ${index + 1}`), getItemEditPath(item, 'label'))}</div>
            <div class="three-col-desc">${renderEditableText(getItemValue(item), valuePath)}</div>
          </div>`;
        }
        return `<div class="card-grid-item card-grid-item--plain">
          <h4>${renderEditableText(getItemLabel(item, `Card ${index + 1}`), getItemEditPath(item, 'label'))}</h4>
          <p>${renderEditableText(getItemValue(item), valuePath)}</p>
        </div>`;
      }).join('')}
    </div>
  `);
};

const renderTwoCol = (page) => renderCardGrid(page, 'two');

const renderThreeCol = (page) => renderCardGrid(page, 'three');

const renderSplitV = (page) => wrapSwissCard(`
  <div class="split-v${getVariant(page) === 'accent' ? ' accent' : ''}">
    <div class="split-v-header"><div class="split-v-title">${renderEditableText(getSlot(page, 'title') || '标题', getSlotEditPath(page, 'title'))}</div>${getSlot(page, 'subtitle') ? `<div class="split-v-subtitle">${renderEditableText(getSlot(page, 'subtitle'), getSlotEditPath(page, 'subtitle'))}</div>` : ''}</div>
    <div class="split-v-body"><p>${renderEditableText(getSlot(page, 'body'), getSlotEditPath(page, 'body'))}</p></div>
  </div>
`);

const renderQuote = (page) => wrapSwissCard(`
  <div class="quote">
    <div class="divider"></div>
    <blockquote>${renderEditableText(getSlot(page, 'quote'), getSlotEditPath(page, 'quote'))}</blockquote>
    <div class="author">
      <span class="author-name">${renderEditableText(getSlot(page, 'author') || 'Author', getSlotEditPath(page, 'author'))}</span>
      ${getSlot(page, 'source') ? `<span class="author-title">${renderEditableText(getSlot(page, 'source'), getSlotEditPath(page, 'source'))}</span>` : ''}
    </div>
  </div>
`);

const renderAlertBox = (page) => wrapSwissCard(`
  ${(page.items ?? []).map((item) => `<div class="alert-box ${escapeHtml(item.type || 'info')}"><div class="icon">${escapeHtml(item.icon || '')}</div><div class="content"><div class="title">${renderEditableText(getItemLabel(item), getItemEditPath(item, 'label'))}</div><p>${renderEditableText(getItemValue(item), getItemEditPath(item, 'value') || getItemEditPath(item, 'note'))}</p></div></div>`).join('')}
`);

const renderTerminalBox = (page) => wrapSwissCard(`
  <div class="terminal-box">
    <div class="term-header"><span class="term-label">术语</span><span class="term-tag">${renderEditableText(getSlot(page, 'term'), getSlotEditPath(page, 'term'))}</span></div>
    <div class="term-section"><span class="section-label">定义</span><p class="section-content">${renderEditableText(getSlot(page, 'definition'), getSlotEditPath(page, 'definition'))}</p></div>
    ${getSlot(page, 'usage') ? `<div class="term-section"><span class="section-label">用法</span><div class="usage-row">${renderEditableText(getSlot(page, 'usage'), getSlotEditPath(page, 'usage')).replace(/-&gt;|→/g, '<span class="usage-arrow">→</span>')}</div></div>` : ''}
  </div>
`);

const renderCodeBlock = (page) => {
  const language = getSlot(page, 'language') || getSlot(page, 'meta') || 'text';
  const code = getSlot(page, 'code') || (page.items ?? []).map((item) => getItemLabel(item)).join('\n');
  return wrapSwissCard(`
    ${renderOptionalHeading(page)}
    <div class="code-block">
      <div class="code-header">
        <div class="code-dots"><span class="code-dot red"></span><span class="code-dot yellow"></span><span class="code-dot green"></span></div>
        <span class="code-lang">${renderEditableText(language, getSlotEditPath(page, 'language') || getSlotEditPath(page, 'meta'))}</span>
      </div>
      <pre><code>${renderEditableText(code, getSlotEditPath(page, 'code'))}</code></pre>
    </div>
  `);
};

const renderIframeCard = (page) => `
<div class="swiss-card swiss-card--iframecard">
  <div class="iframe-card">
    <div class="legacy-iframe-placeholder">
      <div class="eyebrow">${renderEditableText(getSlot(page, 'eyebrow') || 'Iframe Preview', getSlotEditPath(page, 'eyebrow'))}</div>
      <h2>${renderEditableText(getSlot(page, 'title') || '外部页面预览', getSlotEditPath(page, 'title'))}</h2>
      <p>${renderEditableText(getSlot(page, 'subtitle') || '承载外部页面的嵌入式容器。', getSlotEditPath(page, 'subtitle'))}</p>
    </div>
  </div>
</div>`;

const renderCoverFallback = (page) => wrapSwissCard(`
  ${getSlot(page, 'eyebrow') ? `<div class="cover-meta">${renderEditableText(getSlot(page, 'eyebrow'), getSlotEditPath(page, 'eyebrow'))}</div>` : ''}
  <h1>${renderEditableText(getSlot(page, 'title') || 'MornDraft', getSlotEditPath(page, 'title'))}</h1>
  ${getSlot(page, 'subtitle') ? `<p>${renderEditableText(getSlot(page, 'subtitle'), getSlotEditPath(page, 'subtitle'))}</p>` : ''}
  ${getSlot(page, 'caption') ? `<div class="cover-date">${renderEditableText(getSlot(page, 'caption'), getSlotEditPath(page, 'caption'))}</div>` : ''}
`, 'swiss-card--cover');

const renderPageSnippet = (page) => {
  switch (page.layout) {
    case 'title-card':
      return renderTitleCard(page);
    case 'before-after':
      return renderBeforeAfter(page);
    case 'swot':
      return renderSwot(page);
    case 'quadrant-axis':
      return renderQuadrantAxis(page);
    case 'impossible-triangle':
      return renderImpossibleTriangle(page);
    case 'comparison-table':
      return renderComparisonTable(page);
    case 'process':
      return renderProcess(page);
    case 'process-loop':
      return renderProcessLoop(page);
    case 'journey':
      return renderJourney(page);
    case 'gantt':
      return renderGantt(page);
    case 'timeline':
      return renderTimeline(page);
    case 'pyramid':
      return renderPyramid(page);
    case 'fishbone':
      return renderFishbone(page);
    case 'iceberg':
      return renderIceberg(page);
    case 'venn':
      return renderVenn(page);
    case 'architecture':
    case 'arch-platform':
      return renderArchitecture(page);
    case 'arch-platform-complex-v':
      return renderArchitecture(page, true);
    case 'mind-map':
      return renderMindMap(page);
    case 'matrix':
      return renderMatrix(page);
    case 'vs':
      return renderVs(page);
    case 'stat-card':
      return renderStats(page);
    case 'radar':
      return renderRadar(page);
    case 'radar-hex':
      return renderRadar(page, true);
    case 'concentric':
      return renderConcentric(page);
    case 'list-card':
      return renderListCard(page);
    case 'toc-card':
      return renderTocCard(page);
    case 'form-card':
      return renderFormCard(page);
    case 'two-col':
      return renderTwoCol(page);
    case 'three-col':
      return renderThreeCol(page);
    case 'split-v':
      return renderSplitV(page);
    case 'quote':
      return renderQuote(page);
    case 'alert-box':
      return renderAlertBox(page);
    case 'terminal-box':
      return renderTerminalBox(page);
    case 'code-block':
      return renderCodeBlock(page);
    case 'iframe-card':
      return renderIframeCard(page);
    case 'cover':
      return renderCoverFallback(page);
    default:
      return wrapSwissCard(renderOptionalHeading(page));
  }
};

const getShellWidthPx = (spec) => {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  const isArch = pages.some((page) => page.layout === 'arch-platform' || page.layout === 'arch-platform-complex-v');
  if (isArch || spec.target === '16:9') return 744;
  const needsWideProcessCanvas = pages.some((page) => page.layout === 'process');
  const needsWideHorizontalTimeline = pages.some((page) => (
    page.layout === 'timeline' &&
    getVariant(page) === 'horizontal'
  ));
  if (needsWideProcessCanvas || needsWideHorizontalTimeline) return 744;
  const needsWideMindMapCanvas = pages.some((page) => (
    page.layout === 'mind-map' &&
    getVariant(page) === 'vertical' &&
    (page.items ?? []).some((branch) => getItemList(branch, 'children').length > 0)
  ));
  const needsWideIceberg = pages.some((page) => page.layout === 'iceberg');
  if (needsWideMindMapCanvas || needsWideIceberg) return 600;
  return 480;
};

export const resolveSwissCatalogPreviewWidth = (input) => {
  const validation = validateDocumentSpec(input);
  return getShellWidthPx(validation.spec);
};

const clampPreviewHeight = (value) => Math.min(960, Math.max(180, Math.ceil(value)));

const getApproxTextLineCount = (value, charsPerLine = 13) => {
  const text = String(value ?? '');
  if (!text) return 1;
  return text.split(/\r?\n/).reduce((total, line) => {
    const length = Array.from(line.trim()).length;
    return total + Math.max(1, Math.ceil(length / charsPerLine));
  }, 0);
};

const getBeforeAfterVerificationPreviewContentHeight = (page, base) => {
  const rows = (page.items ?? []).length
    ? page.items
    : [{ fuzzy: '模糊输入', precise: '明确输入' }];
  const rowHeights = rows.map((row) => {
    const fuzzyLines = getApproxTextLineCount(
      row.fuzzy || row.before || getItemLabel(row, 'Fuzzy'),
    );
    const preciseLines = getApproxTextLineCount(
      row.precise || row.after || getItemValue(row, 'Precise'),
    );
    return Math.max(54, Math.max(fuzzyLines, preciseLines) * 31 + 18);
  });
  const rowGap = Math.max(0, rows.length - 1) * 10;
  const layoutMargin = 16;
  const narrowColumnWrapReserve = rows.length >= 3 ? 34 : 0;
  return base + layoutMargin + rowGap + narrowColumnWrapReserve + rowHeights.reduce((total, height) => total + height, 0);
};

const getHorizontalTimelinePreviewContentHeight = (page, base) => {
  const items = page.items ?? [];
  const maxSummaryLines = items.reduce((maxLines, item, index) => {
    const label = getItemLabel(item, `T${index + 1}`);
    const note = getItemNote(item, '');
    const summary = getItemValue(item, note || label);
    return Math.max(maxLines, getApproxTextLineCount(summary, 22));
  }, 1);
  const timelineBoxHeight = Math.max(78, 43 + maxSummaryLines * 17);
  return base + 40 + timelineBoxHeight;
};

const getPagePreviewContentHeight = (page) => {
  const itemCount = Array.isArray(page?.items) ? page.items.length : 0;
  const headingHeight = getSlot(page, 'title') || getSlot(page, 'subtitle') ? 64 : 0;
  const base = headingHeight + 40;
  switch (page?.layout) {
    case 'title-card':
      return 220;
    case 'process':
      return base + (
        getVariant(page) === 'wrap'
          ? 260
          : getVariant(page).startsWith('annotated')
            ? Math.max(280, Math.ceil(Math.max(1, itemCount) / 4) * 140)
            : itemCount > 7 ? 192 : 132
      );
    case 'process-loop':
      return base + 300;
    case 'timeline':
      return getVariant(page) === 'vertical'
        ? base + Math.max(220, itemCount * 96)
        : getHorizontalTimelinePreviewContentHeight(page, base);
    case 'before-after':
      return getVariant(page) === 'verification'
        ? getBeforeAfterVerificationPreviewContentHeight(page, base)
        : base + Math.max(180, itemCount * 72);
    case 'quadrant-axis':
      return base + 360;
    case 'impossible-triangle':
      return base + 300;
    case 'gantt':
      return base + 64 + Math.max(4, itemCount) * 44;
    case 'radar':
    case 'radar-hex':
      return base + 360;
    case 'iceberg':
      return base + 460;
    case 'mind-map':
      if (getVariant(page) === 'vertical') {
        const branches = page.items ?? [];
        const { height } = getMindMapVerticalBranchMetrics(branches);
        return base + Math.max(260, height);
      }
      return base + 300;
    case 'architecture':
    case 'arch-platform':
    case 'arch-platform-complex-v':
      return base + Math.max(360, itemCount * 110);
    case 'iframe-card':
      return base + 220;
    case 'two-col':
      return base + Math.max(200, Math.ceil(Math.max(1, itemCount) / 2) * 126);
    case 'three-col':
      return base + Math.max(240, Math.ceil(Math.max(1, itemCount) / 3) * 164);
    default:
      return base + Math.max(180, itemCount * 72);
  }
};

export const resolveSwissCatalogPreviewHeight = (input) => {
  const validation = validateDocumentSpec(input);
  const pages = Array.isArray(validation.spec?.pages) ? validation.spec.pages : [];
  const pageContentHeight = pages.length
    ? pages.reduce((total, page) => total + getPagePreviewContentHeight(page), 0)
    : 220;
  return clampPreviewHeight(64 + pageContentHeight);
};

const getShellMaxWidth = (spec) => {
  const shellWidth = getShellWidthPx(spec);
  if (shellWidth === 744) return '744px';
  if (shellWidth === 600) return '600px';
  return '480px';
};

const SWISS_CATALOG_RESPONSIVE_CSS = `
.swiss-card .mind-map-fit {
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
    overflow: visible;
}

@media (max-width: 420px) {
    .swiss-card .process-chain:not([data-type="wrap"]),
    .swiss-card .process-chain[data-type="arrow"] {
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
    }
    .swiss-card .process-chain:not([data-type="wrap"]) .step,
    .swiss-card .process-chain[data-type="arrow"] .step,
    .swiss-card .process-chain[data-type="arrow"][data-density="wrap"] .step {
        flex: 0 1 calc(50% - 8px);
        min-width: 118px;
        margin-right: 0;
        white-space: normal;
    }
    .swiss-card .process-chain:not([data-type="wrap"]) .arrow {
        display: none;
    }
    .swiss-card .process-chain[data-type="arrow"] .step,
    .swiss-card .process-chain[data-type="arrow"] .step:first-child,
    .swiss-card .process-chain[data-type="arrow"] .step:last-child {
        clip-path: none;
        border-radius: 8px !important;
        padding-left: 10px;
        padding-right: 10px;
    }
    .swiss-card .mind-map-fit {
        width: var(--mind-map-narrow-width);
        height: var(--mind-map-narrow-height);
        overflow: hidden;
    }
    .swiss-card .mind-map-fit > .mind-map {
        width: var(--mind-map-base-width);
        min-width: var(--mind-map-base-width);
        height: var(--mind-map-base-height);
        transform: scale(var(--mind-map-narrow-scale)) !important;
        transform-origin: top left !important;
    }
    .swiss-card .iceberg__callout {
        transform: none !important;
        width: auto;
        max-width: 100%;
    }
    .swiss-card .iceberg__callout span {
        white-space: normal;
    }
    .swiss-card .concentric {
        height: 220px !important;
        overflow: hidden;
    }
    .swiss-card .concentric .layer-1 {
        width: 84px !important;
        height: 84px !important;
    }
    .swiss-card .concentric .layer-2 {
        width: 152px !important;
        height: 152px !important;
    }
    .swiss-card .concentric .layer-3 {
        width: 220px !important;
        height: 220px !important;
    }
    .swiss-card .arch-platform .ap-row {
        flex-direction: column;
    }
    .swiss-card .arch-platform .ap-grid,
    .swiss-card .arch-platform .ap-grid.col-4,
    .swiss-card .arch-platform .ap-items {
        grid-template-columns: 1fr;
    }
    .swiss-card .arch-platform .ap-chip,
    .swiss-card .arch-platform .ap-card-title,
    .swiss-card .arch-platform .ap-item {
        white-space: normal;
        overflow-wrap: anywhere;
    }
}
`;

export const SWISS_CATALOG_SHARED_STYLE_ATTR = 'data-morndraft-swiss-catalog-shared';
export const MORNDRAFT_HTML_SOURCE_STYLE_ATTR = 'data-morndraft-source-style';

export const isMornDraftHtmlSource = (html) => (
  typeof html === 'string' &&
  (
    /<!--\s*morndraft:structure\b/i.test(html) ||
    /\bdata-morndraft-source=(?:"morndraft-flat"|'morndraft-flat')/i.test(html)
  )
);

const hasSwissCatalogComponentCss = (html) => (
  typeof html === 'string' &&
  (
    html.includes(SWISS_CATALOG_SHARED_STYLE_ATTR) ||
    html.includes('data-morndraft-inline-swiss-catalog') ||
    /Swiss Card 样式/i.test(html)
  )
);

const renderSwissCatalogShellStyles = (spec, attributes = '') => `<style${attributes}>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Noto Sans SC', -apple-system, sans-serif;
  background: #fff;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: auto;
  padding: 16px;
}
.component-shell {
  width: ${getShellMaxWidth(spec)};
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding: 16px;
  background: #fff;
  overflow: visible;
  container-type: inline-size;
}
.swiss-card { width: 100% !important; min-height: auto !important; box-shadow: none !important; overflow: visible !important; }
.swiss-card__content { min-height: auto !important; padding: 20px 0 !important; }
.swiss-card--titlecard .title-card { height: auto !important; padding: 24px !important; }
.swiss-card--iframecard { height: auto !important; min-height: auto !important; }
.swiss-card--iframecard .iframe-card { width: 100% !important; height: auto !important; }
.legacy-iframe-placeholder { padding: 24px !important; min-height: 160px !important; }
:root {
  --morndraft-accent: #d95e00;
  --morndraft-text: #1a1a1a;
  --morndraft-surface: #ffffff;
  --morndraft-muted-surface: #f2efe9;
  --morndraft-card-shadow: none;
}
.component-shell .swiss-card { box-shadow: var(--morndraft-card-shadow) !important; }
.component-shell .swiss-card--body { background: var(--morndraft-surface) !important; color: var(--morndraft-text) !important; }
.component-shell .swiss-card--cover { background: var(--morndraft-muted-surface) !important; color: var(--morndraft-text) !important; }
.component-shell .swiss-card h1,
.component-shell .swiss-card p { color: var(--morndraft-text) !important; }
.component-shell .swiss-card h2,
.component-shell .swiss-card h3,
.component-shell .swiss-card h4,
.component-shell .swiss-card h5,
.component-shell .swiss-card h6,
.component-shell .swiss-card strong,
.component-shell .swiss-card em { color: var(--morndraft-accent) !important; }
.component-shell .swiss-card h2 { border-bottom-color: var(--morndraft-accent) !important; }
</style>`;

export const renderSwissCatalogSharedStyleTag = () => `<style ${SWISS_CATALOG_SHARED_STYLE_ATTR}>
${SWISS_CATALOG_COMPONENT_CSS}
${SWISS_CATALOG_RESPONSIVE_CSS}
</style>`;

const renderSwissCatalogStyles = (spec, options = {}) => {
  const cssMode = options.cssMode === 'shared' ? 'shared' : 'inline';
  if (cssMode === 'shared') {
    return renderSwissCatalogShellStyles(spec, ` ${MORNDRAFT_HTML_SOURCE_STYLE_ATTR}`);
  }
  return [
    renderSwissCatalogShellStyles(spec),
    renderSwissCatalogSharedStyleTag().replace(
      `<style ${SWISS_CATALOG_SHARED_STYLE_ATTR}>`,
      '<style data-morndraft-inline-swiss-catalog>',
    ),
  ].join('\n');
};

const injectHeadMarkupIntoHtmlDocument = (html, headMarkup) => {
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${headMarkup}`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/(<html[^>]*>)/i, `$1<head>${headMarkup}</head>`);
  }

  if (/^<!doctype\s+html[\s>]/i.test(html)) {
    return html.replace(/^(<!doctype\s+html[^>]*>)/i, `$1<html><head>${headMarkup}</head>`);
  }

  return `${headMarkup}${html}`;
};

export const injectMornDraftSwissCatalogSharedStyles = (html) => {
  if (!isMornDraftHtmlSource(html) || hasSwissCatalogComponentCss(html)) return html;
  return injectHeadMarkupIntoHtmlDocument(html, renderSwissCatalogSharedStyleTag());
};

const withMornDraftEditMetadata = (normalizedSpec, sourceSpec) => {
  if (!sourceSpec || typeof sourceSpec !== 'object' || !Array.isArray(sourceSpec.pages)) return normalizedSpec;
  return {
    ...normalizedSpec,
    pages: normalizedSpec.pages.map((page, pageIndex) => {
      const sourcePage = sourceSpec.pages[pageIndex];
      if (!sourcePage || typeof sourcePage !== 'object') return page;
      return {
        ...page,
        ...(sourcePage.__morndraftEditPaths ? { __morndraftEditPaths: sourcePage.__morndraftEditPaths } : {}),
        items: page.items.map((item, itemIndex) => {
          const sourceItem = sourcePage.items?.[itemIndex];
          return sourceItem?.__morndraftEditPaths
            ? { ...item, __morndraftEditPaths: sourceItem.__morndraftEditPaths }
            : item;
        }),
      };
    }),
  };
};

export const renderSwissCatalogDocumentSpecToHtml = (input, options = {}) => {
  const validation = validateDocumentSpec(input);
  if (!validation.ok) {
    return {
      ok: false,
      html: '',
      diagnostics: validation.diagnostics,
      spec: validation.spec,
    };
  }

  const spec = withMornDraftEditMetadata(validation.spec, input);
  const firstTitle = getSlot(spec.pages[0], 'title') || 'MornDraft Component';
  const snippets = spec.pages.map(renderPageSnippet).join('\n');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(firstTitle)}</title>
${renderSwissCatalogStyles(spec, options)}
</head>
<body>
  <div class="component-shell" data-renderer="swiss-catalog" data-target="${escapeHtml(spec.target)}">
    ${snippets}
  </div>
</body>
</html>
`;

  return {
    ok: true,
    html,
    diagnostics: validation.diagnostics,
    spec,
  };
};
