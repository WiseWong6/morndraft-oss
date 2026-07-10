const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizePair = (layout, variant) =>
  `${String(layout ?? '').trim()}/${String(variant ?? '').trim()}`;

const getTemplateItem = (items) => {
  const records = items.filter(isRecord);
  const nonHeaderRecords = records.filter((item) => {
    const role = String(item.role ?? '').trim().toLowerCase();
    return role !== 'header' && role !== 'columns' && role !== 'column';
  });
  return nonHeaderRecords[nonHeaderRecords.length - 1] ?? records[records.length - 1] ?? null;
};

const getNextLabel = (items) => `新增项 ${items.length + 1}`;

const getTableColumnCount = (items, template) => {
  const header = items.find((item) => isRecord(item) && Array.isArray(item.values));
  if (isRecord(header) && Array.isArray(header.values)) return Math.max(1, header.values.length);
  if (isRecord(template) && Array.isArray(template.values)) return Math.max(1, template.values.length);
  return 3;
};

const countFishboneSide = (items, side) =>
  items.filter((item) => {
    if (!isRecord(item)) return false;
    const normalizedSide = String(item.side ?? item.type ?? item.role ?? '').trim().toLowerCase();
    return normalizedSide === side;
  }).length;

const createGenericItem = (items) => {
  const label = getNextLabel(items);
  const template = getTemplateItem(items);
  const nextItem = { label };
  if (!template) return nextItem;

  if ('value' in template) nextItem.value = '补充内容';
  if ('note' in template) nextItem.note = '补充说明';
  if ('badge' in template) nextItem.badge = String(items.length + 1).padStart(2, '0');
  if (Array.isArray(template.values)) {
    nextItem.values = template.values.map((_, index) => (index === 0 ? label : '补充内容'));
  }
  if (Array.isArray(template.children)) nextItem.children = ['子项'];
  if (Array.isArray(template.items)) nextItem.items = ['子项'];
  if (Array.isArray(template.modules)) nextItem.modules = ['模块'];
  if ('side' in template) {
    const side = String(template.side ?? '').trim().toLowerCase();
    nextItem.side = side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : template.side;
  }
  if ('type' in template) {
    const type = String(template.type ?? '').trim().toLowerCase();
    nextItem.type = type === 'top' ? 'bottom' : type === 'bottom' ? 'top' : template.type;
  }
  if ('unit' in template) nextItem.unit = template.unit;
  if ('trend' in template) nextItem.trend = template.trend;
  if ('status' in template) nextItem.status = template.status;
  if ('marker' in template) nextItem.marker = template.marker;
  if ('start' in template || 'width' in template) {
    nextItem.start = Math.min(88, Math.max(0, items.length * 14));
    nextItem.width = Number.isFinite(Number(template.width)) ? Number(template.width) : 14;
  }
  return nextItem;
};

export const createDefaultMornDraftFlatItem = ({ layout, variant, items } = {}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const pair = normalizePair(layout, variant);
  const label = getNextLabel(normalizedItems);
  const template = getTemplateItem(normalizedItems);

  if (pair === 'metrics/radar-hex') {
    return { label, value: '60%' };
  }

  if (pair === 'flow/gantt') {
    const width = isRecord(template) && Number.isFinite(Number(template.width))
      ? Number(template.width)
      : 18;
    return {
      label,
      start: Math.min(88, Math.max(0, normalizedItems.length * 14)),
      width,
    };
  }

  if (pair === 'compare/table') {
    const columnCount = getTableColumnCount(normalizedItems, template);
    return {
      values: Array.from({ length: columnCount }, (_, index) =>
        index === 0 ? label : '补充内容'),
    };
  }

  if (pair === 'map/fishbone') {
    const topCount = countFishboneSide(normalizedItems, 'top');
    const bottomCount = countFishboneSide(normalizedItems, 'bottom');
    return {
      label,
      side: topCount <= bottomCount ? 'top' : 'bottom',
    };
  }

  if (pair === 'map/platform-architecture' || pair === 'map/platform-architecture-complex') {
    if (isRecord(template) && Array.isArray(template.items)) {
      return {
        label,
        items: [{ label: '模块', items: ['能力点'] }],
      };
    }
    return {
      label,
      modules: ['模块'],
    };
  }

  if (pair === 'map/pyramid-inverted') {
    return { label: '新增层' };
  }

  if (pair === 'cards/two-column' || pair === 'cards/three-column') {
    return { label, value: '补充内容' };
  }

  return createGenericItem(normalizedItems);
};
