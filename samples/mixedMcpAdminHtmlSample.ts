export const MIXED_MCP_ADMIN_HTML_SAMPLE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MCP后台管理系统</title>
<style>
:root {
  --primary: #4f6ef7;
  --primary-hover: #3d5ce5;
  --primary-bg: #eef1fe;
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --bg: #f5f6fa;
  --surface: #ffffff;
  --border: #e5e7eb;
  --text: #1f2937;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --radius: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow: 0 1px 3px rgba(0,0,0,.1), 0 1px 2px rgba(0,0,0,.06);
  --shadow-lg: 0 10px 25px rgba(0,0,0,.12);
  --transition: 150ms ease;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh;
}
/* Header */
.header {
  background: var(--surface); border-bottom: 1px solid var(--border);
  padding: 0 24px; height: 56px; display: flex; align-items: center;
  position: sticky; top: 0; z-index: 50; box-shadow: var(--shadow-sm);
}
.header-logo { font-size: 18px; font-weight: 700; color: var(--primary); letter-spacing: -.3px; }
.header-logo span { color: var(--text); font-weight: 400; margin-left: 4px; }
/* Container */
.container { max-width: 1320px; margin: 0 auto; padding: 20px 24px; }
/* Page Title */
.page-title { font-size: 20px; font-weight: 600; margin-bottom: 16px; color: var(--text); }
/* Card */
.card { background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow); border: 1px solid var(--border); }
.card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 15px; }
.card-body { padding: 20px; }
/* Filter */
.filter-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.filter-item { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
.filter-item label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.filter-item input, .filter-item select {
  height: 36px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius);
  font-size: 13px; color: var(--text); background: var(--surface); outline: none; transition: border var(--transition);
  min-width: 140px;
}
.filter-item input:focus, .filter-item select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-bg); }
.filter-item input::placeholder { color: var(--text-muted); }
.filter-actions { display: flex; gap: 8px; align-items: flex-end; padding-bottom: 0; }
/* Buttons */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--radius); font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all var(--transition); white-space: nowrap; height: 36px; }
.btn-primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-default { background: var(--surface); color: var(--text); border-color: var(--border); }
.btn-default:hover { background: #f9fafb; }
.btn-text { background: transparent; border: none; color: var(--primary); padding: 4px 8px; height: auto; font-size: 13px; cursor: pointer; }
.btn-text:hover { background: var(--primary-bg); border-radius: 4px; }
.btn-text.danger { color: var(--danger); }
.btn-text.danger:hover { background: #fef2f2; }
.btn-sm { padding: 4px 10px; font-size: 12px; height: 28px; }
/* Table */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
table th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid var(--border); white-space: nowrap; font-size: 12px; }
table td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
table tbody tr:hover { background: #f9fafb; }
/* Tags */
.tag { display: inline-block; padding: 2px 10px; border-radius: 100px; font-size: 12px; font-weight: 500; }
.tag-success { background: #dcfce7; color: #16a34a; }
.tag-danger { background: #fef2f2; color: #dc2626; }
/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 100; display: flex; align-items: center; justify-content: center; animation: fadeIn .2s ease; }
.modal { background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); width: 800px; max-width: 92vw; max-height: 85vh; display: flex; flex-direction: column; animation: slideUp .25s ease; }
.modal-lg { width: 960px; }
.modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 16px; }
.modal-header .close-btn { width: 32px; height: 32px; border: none; background: transparent; cursor: pointer; border-radius: 6px; font-size: 18px; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; }
.modal-header .close-btn:hover { background: #f3f4f6; }
.modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 14px 24px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
/* Form Sections */
.form-section { margin-bottom: 20px; }
.form-section-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--border); display: flex; align-items: center; gap: 8px; }
.form-section-title::before { content: ''; width: 3px; height: 14px; background: var(--primary); border-radius: 2px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group.full { grid-column: 1 / -1; }
.form-group label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form-group label .required { color: var(--danger); margin-left: 2px; }
.form-group input, .form-group select, .form-group textarea {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius);
  font-size: 13px; color: var(--text); outline: none; font-family: inherit; transition: border var(--transition);
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-bg); }
.form-group input::placeholder, .form-group textarea::placeholder { color: var(--text-muted); }
.form-group textarea { resize: vertical; min-height: 72px; }
.form-group input[readonly], .form-group textarea[readonly], .form-group select[disabled] { background: #f9fafb; color: var(--text-secondary); cursor: not-allowed; }
/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 12px; }
.tab-btn { padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: transparent; color: var(--text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all var(--transition); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
/* Param Table */
.param-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
.param-table th { background: #f9fafb; padding: 8px 10px; text-align: left; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid var(--border); font-size: 12px; }
.param-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
.param-table input, .param-table select { width: 100%; padding: 5px 6px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; outline: none; }
.param-table input:focus, .param-table select:focus { border-color: var(--primary); }
.param-table .delete-cell { text-align: center; width: 40px; }
.param-table .delete-cell button { background: none; border: none; color: var(--danger); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; }
.param-table .delete-cell button:hover { background: #fef2f2; }
/* Toggle Switch */
.toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #d1d5db; border-radius: 22px; transition: .2s; }
.toggle-slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--primary); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); }
/* JSON Preview */
.json-preview { background: #1e1e2e; color: #cdd6f4; padding: 14px 16px; border-radius: var(--radius); font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; line-height: 1.6; overflow-x: auto; white-space: pre; max-height: 260px; overflow-y: auto; }
/* Toast */
.toast-container { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.toast { padding: 10px 20px; background: #1f2937; color: #fff; border-radius: var(--radius); font-size: 13px; box-shadow: var(--shadow-lg); animation: toastIn .3s ease, toastOut .3s ease 2.2s forwards; pointer-events: none; }
.toast.success { background: #059669; }
/* Animations */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes toastIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }
/* Hidden */
.hidden { display: none !important; }
/* Responsive */
@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .filter-row { flex-direction: column; }
  .modal { width: 96vw; }
}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-logo">⚙ MCP<span>后台管理系统</span></div>
</div>

<!-- Toast Container -->
<div class="toast-container" id="toastContainer"></div>

<!-- Main Content -->
<div class="container" id="mainContent">
  <div class="page-title">MCP 管理</div>

  <!-- Filter Card -->
  <div class="card" style="margin-bottom: 16px;">
    <div class="card-body">
      <div class="filter-row">
        <div class="filter-item">
          <label>名称</label>
          <input type="text" id="filterName" placeholder="请输入MCP名称">
        </div>
        <div class="filter-item">
          <label>描述</label>
          <input type="text" id="filterDesc" placeholder="请输入描述">
        </div>
        <div class="filter-item">
          <label>负责人</label>
          <input type="text" id="filterOwner" placeholder="请输入负责人">
        </div>
        <div class="filter-item">
          <label>状态</label>
          <select id="filterStatus">
            <option value="">全部</option>
            <option value="enabled">启用</option>
            <option value="disabled">下架</option>
          </select>
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" onclick="handleQuery()">🔍 查询</button>
          <button class="btn btn-default" onclick="handleReset()">↻ 重置</button>
          <button class="btn btn-primary" onclick="openAddModal()">＋ 新增</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Table Card -->
  <div class="card">
    <div class="card-body" style="padding: 0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:50px;">id</th>
              <th style="width:72px;">状态</th>
              <th>名称</th>
              <th>描述</th>
              <th style="width:80px;">关联节点</th>
              <th>负责人</th>
              <th style="width:140px;">创建时间</th>
              <th style="width:140px;">更新时间</th>
              <th style="width:180px;">操作</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- Modal: Add/Edit/View MCP -->
<div class="modal-overlay hidden" id="mcpModalOverlay">
  <div class="modal modal-lg" id="mcpModal">
    <div class="modal-header">
      <span id="mcpModalTitle">新增 MCP</span>
      <button class="close-btn" onclick="closeMcpModal()">✕</button>
    </div>
    <div class="modal-body" id="mcpModalBody">
      <!-- 基础配置 -->
      <div class="form-section">
        <div class="form-section-title">基础配置</div>
        <div class="form-grid">
          <div class="form-group">
            <label>工具名称 <span class="required">*</span></label>
            <input type="text" id="mcpServerName" placeholder="MCP Server 名称，对应 URL路径中的{name}">
          </div>
          <div class="form-group">
            <label>负责人 <span class="required">*</span></label>
            <input type="text" id="mcpOwner" placeholder="负责人名称，多输入使用英文逗号隔开">
          </div>
        </div>
      </div>

      <!-- AO服务配置 -->
      <div class="form-section">
        <div class="form-section-title">AO服务配置</div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label>Nacos 服务名</label>
            <input type="text" id="mcpServiceName" placeholder="Nacos注册的服务名">
          </div>
          <div class="form-group">
            <label>接口名称 <span class="required">*</span></label>
            <input type="text" id="mcpInterfaceName" placeholder="AO服务对应的接口名称">
          </div>
          <div class="form-group">
            <label>语言 <span class="required">*</span></label>
            <select id="mcpLang">
              <option value="python" selected>python</option>
              <option value="go">go</option>
              <option value="php">php</option>
            </select>
          </div>
          <div class="form-group">
            <label>超时时间</label>
            <input type="number" id="mcpTimeout" placeholder="AO服务调用配置，单位为秒" min="1">
          </div>
        </div>
      </div>

      <!-- MCP服务配置 -->
      <div class="form-section">
        <div class="form-section-title">MCP服务配置</div>
        <div class="form-group full" style="margin-bottom:12px;">
          <label>工具描述 <span class="required">*</span></label>
          <textarea id="mcpToolDesc" placeholder="描述工具能力，供MCP tools/list返回使用" rows="3"></textarea>
        </div>

        <!-- 输入参数 -->
        <label style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;display:block;">输入参数</label>
        <div class="tabs">
          <button class="tab-btn active" id="tabVisual" onclick="switchParamMode('visual')">可视化配置</button>
          <button class="tab-btn" id="tabJson" onclick="switchParamMode('json')">自定义JSON</button>
        </div>

        <!-- 可视化配置面板 -->
        <div id="paramVisualPanel">
          <div class="table-wrap">
            <table class="param-table">
              <thead>
                <tr>
                  <th>参数名</th>
                  <th>类型</th>
                  <th>描述</th>
                  <th>枚举值</th>
                  <th style="width:70px;">是否必填</th>
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody id="paramTableBody"></tbody>
            </table>
          </div>
          <button class="btn btn-default btn-sm" onclick="addParamRow()" style="margin-top:4px;">＋ 新增参数</button>
        </div>

        <!-- 自定义JSON面板 -->
        <div id="paramJsonPanel" class="hidden">
          <div class="json-preview" id="jsonPreview"></div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">基于可视化配置自动生成，仅预览</div>
        </div>

        <!-- 返回值 -->
        <div class="form-group full" style="margin-top:12px;">
          <label>返回值</label>
          <textarea id="mcpOutput" placeholder="描述AO服务返回值的业务含义" rows="3"></textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer" id="mcpModalFooter">
      <button class="btn btn-primary" id="btnSave" onclick="handleSaveMcp()">保存</button>
      <button class="btn btn-default" onclick="closeMcpModal()">关闭</button>
    </div>
  </div>
</div>

<!-- Modal: 关联节点 -->
<div class="modal-overlay hidden" id="relationModalOverlay">
  <div class="modal" id="relationModal">
    <div class="modal-header">
      <span>关联节点</span>
      <button class="close-btn" onclick="closeRelationModal()">✕</button>
    </div>
    <div class="modal-body" style="padding:16px 20px;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>应用ID</th>
              <th>应用名称</th>
              <th>节点ID</th>
              <th>节点名称</th>
              <th>最近编辑用户</th>
              <th>最近编辑时间</th>
              <th style="width:70px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>10086</td>
              <td>外呼助手</td>
              <td>20006</td>
              <td>风控扫描节点</td>
              <td>wisewong</td>
              <td>2025-03-27 10:30:00</td>
              <td><button class="btn-text btn-sm" onclick="handleCopyNode(this)">复制</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<script>
// ===== Mock Data =====
const mockData = [
  { id: 1, status: 'enabled', name: '联网搜索', desc: '使用google查询信息', nodeCount: 3, owners: ['wisewong', 'koma', 'yolan'], createdAt: '2026/04/22 10:06:02', updatedAt: '2026/04/22 10:06:02' },
  { id: 2, status: 'disabled', name: 'OCR识别', desc: '提取图片文字信息', nodeCount: 4, owners: ['wisewong'], createdAt: '2026/04/22 10:06:02', updatedAt: '2026/04/22 10:06:02' },
  { id: 3, status: 'enabled', name: '查询知识库', desc: '支持基于指定知识库召回', nodeCount: 5, owners: ['koma'], createdAt: '2026/04/22 10:06:02', updatedAt: '2026/04/22 10:06:02' },
];
// Simulate current user
const currentUser = 'wisewong';

// ===== Toast =====
function showToast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ===== Render Table =====
function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = mockData.map(row => {
    const isOwner = row.owners.includes(currentUser);
    const statusTag = row.status === 'enabled'
      ? '<span class="tag tag-success">启用</span>'
      : '<span class="tag tag-danger">禁用</span>';
    const ownersDisplay = row.owners.slice(0, 3).join('、');
    // Action buttons
    let actions = '';
    // 查看/编辑
    if (isOwner) {
      actions += \`<button class="btn-text" onclick="openViewModal(\${row.id})">查看</button>\`;
    } else {
      actions += \`<button class="btn-text" onclick="openEditModal(\${row.id})">编辑</button>\`;
    }
    // 启用/下架 (仅负责人)
    if (isOwner) {
      if (row.status === 'enabled') {
        actions += \`<button class="btn-text danger" onclick="toggleStatus(\${row.id})">禁用</button>\`;
      } else {
        actions += \`<button class="btn-text" onclick="toggleStatus(\${row.id})">启用</button>\`;
      }
      actions += \`<button class="btn-text" onclick="openRelationModal(\${row.id})">关联节点</button>\`;
    }
    return \`<tr>
      <td>\${row.id}</td>
      <td>\${statusTag}</td>
      <td>\${row.name}</td>
      <td>\${row.desc}</td>
      <td>\${row.nodeCount}</td>
      <td>\${ownersDisplay}</td>
      <td>\${row.createdAt}</td>
      <td>\${row.updatedAt}</td>
      <td style="white-space:nowrap;">\${actions}</td>
    </tr>\`;
  }).join('');
}
renderTable();

// ===== Filter =====
function handleQuery() { showToast('查询完成'); }
function handleReset() {
  document.getElementById('filterName').value = '';
  document.getElementById('filterDesc').value = '';
  document.getElementById('filterOwner').value = '';
  document.getElementById('filterStatus').value = '';
  showToast('已重置筛选条件');
}

// ===== Toggle Status =====
function toggleStatus(id) {
  const row = mockData.find(r => r.id === id);
  if (row) {
    row.status = row.status === 'enabled' ? 'disabled' : 'enabled';
    renderTable();
    showToast(row.status === 'enabled' ? '已启用' : '已下架', 'success');
  }
}

// ===== MCP Modal State =====
let mcpModalMode = 'add'; // 'add' | 'edit' | 'view'
let editingMcpId = null;

// Param rows stored for the modal
let paramRows = [];

function resetParamRows() {
  paramRows = [{ name: '', type: 'string', desc: '', enumVal: '', required: false }];
}
resetParamRows();

function renderParamTable() {
  const tbody = document.getElementById('paramTableBody');
  const readonly = mcpModalMode === 'view';
  tbody.innerHTML = paramRows.map((p, i) => {
    const delBtn = paramRows.length >= 2
      ? \`<button onclick="deleteParamRow(\${i})" \${readonly ? 'disabled style="opacity:.4;cursor:not-allowed;"' : ''}>🗑</button>\`
      : '';
    const disabled = readonly ? 'disabled' : '';
    const ro = readonly ? 'readonly' : '';
    const typeOpts = ['string','number','bool','int'].map(t =>
      \`<option value="\${t}" \${p.type===t?'selected':''}>\${t}</option>\`
    ).join('');
    return \`<tr>
      <td><input type="text" value="\${p.name}" placeholder="如userid" \${ro}></td>
      <td><select \${disabled}>\${typeOpts}</select></td>
      <td><input type="text" value="\${p.desc}" placeholder="描述这个参数的用途" \${ro}></td>
      <td><input type="text" value="\${p.enumVal}" placeholder="如[1.5, 2.5, 3.5]" \${ro}></td>
      <td style="text-align:center;">
        <label class="toggle-switch">
          <input type="checkbox" \${p.required?'checked':''} \${disabled} onchange="paramRows[\${i}].required=this.checked;updateJsonPreview();">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td class="delete-cell">\${delBtn}</td>
    </tr>\`;
  }).join('');
}

function syncParamRowsFromDOM() {
  const rows = document.querySelectorAll('#paramTableBody tr');
  paramRows = Array.from(rows).map(row => {
    const cells = row.querySelectorAll('td');
    const nameInput = cells[0].querySelector('input');
    const typeSelect = cells[1].querySelector('select');
    const descInput = cells[2].querySelector('input');
    const enumInput = cells[3].querySelector('input');
    const reqCheckbox = cells[4].querySelector('input[type=checkbox]');
    return {
      name: nameInput ? nameInput.value : '',
      type: typeSelect ? typeSelect.value : 'string',
      desc: descInput ? descInput.value : '',
      enumVal: enumInput ? enumInput.value : '',
      required: reqCheckbox ? reqCheckbox.checked : false,
    };
  });
}

function addParamRow() {
  if (mcpModalMode === 'view') return;
  syncParamRowsFromDOM();
  paramRows.push({ name: '', type: 'string', desc: '', enumVal: '', required: false });
  renderParamTable();
  updateJsonPreview();
}

function deleteParamRow(i) {
  if (mcpModalMode === 'view') return;
  if (paramRows.length <= 1) return;
  syncParamRowsFromDOM();
  paramRows.splice(i, 1);
  renderParamTable();
  updateJsonPreview();
}

// Attach input listeners for param table
document.getElementById('paramTableBody').addEventListener('input', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
    syncParamRowsFromDOM();
    updateJsonPreview();
  }
});

function updateJsonPreview() {
  syncParamRowsFromDOM();
  const serverName = document.getElementById('mcpServerName').value || 'server_name';
  const desc = document.getElementById('mcpToolDesc').value || '工具的功能描述';
  const output = document.getElementById('mcpOutput').value || '接口返回值的描述信息';
  const properties = {};
  const required = [];
  paramRows.forEach(p => {
    if (p.name) {
      properties[p.name] = { type: p.type, description: p.desc || '' };
      if (p.required) required.push(p.name);
    }
  });
  const jsonObj = {
    input: {
      name: serverName,
      description: desc,
      inputSchema: {
        type: 'object',
        properties: properties,
        required: required,
      },
    },
    output: output,
  };
  document.getElementById('jsonPreview').textContent = JSON.stringify(jsonObj, null, 2);
}

// ===== Param Mode Switch =====
function switchParamMode(mode) {
  document.getElementById('tabVisual').classList.toggle('active', mode === 'visual');
  document.getElementById('tabJson').classList.toggle('active', mode === 'json');
  document.getElementById('paramVisualPanel').classList.toggle('hidden', mode !== 'visual');
  document.getElementById('paramJsonPanel').classList.toggle('hidden', mode !== 'json');
  if (mode === 'json') {
    syncParamRowsFromDOM();
    updateJsonPreview();
  }
}

// ===== Open MCP Modal =====
function openAddModal() {
  mcpModalMode = 'add';
  editingMcpId = null;
  document.getElementById('mcpModalTitle').textContent = '新增 MCP';
  document.getElementById('mcpServerName').value = '';
  document.getElementById('mcpOwner').value = '';
  document.getElementById('mcpServiceName').value = '';
  document.getElementById('mcpInterfaceName').value = '';
  document.getElementById('mcpLang').value = 'python';
  document.getElementById('mcpTimeout').value = '';
  document.getElementById('mcpToolDesc').value = '';
  document.getElementById('mcpOutput').value = '';
  resetParamRows();
  renderParamTable();
  switchParamMode('visual');
  updateJsonPreview();
  setFieldsReadonly(false);
  document.getElementById('btnSave').classList.remove('hidden');
  document.getElementById('mcpModalOverlay').classList.remove('hidden');
}

function openEditModal(id) {
  const row = mockData.find(r => r.id === id);
  if (!row) return;
  mcpModalMode = 'edit';
  editingMcpId = id;
  document.getElementById('mcpModalTitle').textContent = '编辑 MCP — ' + row.name;
  populateMcpForm(row);
  setFieldsReadonly(false);
  document.getElementById('btnSave').classList.remove('hidden');
  document.getElementById('mcpModalOverlay').classList.remove('hidden');
}

function openViewModal(id) {
  const row = mockData.find(r => r.id === id);
  if (!row) return;
  mcpModalMode = 'view';
  editingMcpId = id;
  document.getElementById('mcpModalTitle').textContent = '查看 MCP — ' + row.name;
  populateMcpForm(row);
  setFieldsReadonly(true);
  document.getElementById('btnSave').classList.add('hidden');
  document.getElementById('mcpModalOverlay').classList.remove('hidden');
}

function populateMcpForm(row) {
  document.getElementById('mcpServerName').value = row.name || '';
  document.getElementById('mcpOwner').value = (row.owners || []).join(',');
  document.getElementById('mcpServiceName').value = row.serviceName || '';
  document.getElementById('mcpInterfaceName').value = row.interfaceName || '';
  document.getElementById('mcpLang').value = row.lang || 'python';
  document.getElementById('mcpTimeout').value = row.timeout || '';
  document.getElementById('mcpToolDesc').value = row.toolDesc || '';
  document.getElementById('mcpOutput').value = row.output || '';
  paramRows = (row.params && row.params.length > 0) ? JSON.parse(JSON.stringify(row.params)) : [{ name: '', type: 'string', desc: '', enumVal: '', required: false }];
  renderParamTable();
  switchParamMode('visual');
  updateJsonPreview();
}

function setFieldsReadonly(readonly) {
  const modal = document.getElementById('mcpModalBody');
  const inputs = modal.querySelectorAll('input:not([type=checkbox]):not(.toggle-switch input)');
  const textareas = modal.querySelectorAll('textarea');
  const selects = modal.querySelectorAll('select');
  inputs.forEach(el => { if (readonly) el.setAttribute('readonly', ''); else el.removeAttribute('readonly'); });
  textareas.forEach(el => { if (readonly) el.setAttribute('readonly', ''); else el.removeAttribute('readonly'); });
  selects.forEach(el => { if (readonly) el.setAttribute('disabled', ''); else el.removeAttribute('disabled'); });
  // Also disable param table inputs
  const paramInputs = document.getElementById('paramTableBody').querySelectorAll('input, select');
  paramInputs.forEach(el => { if (readonly) el.setAttribute('disabled', ''); else el.removeAttribute('disabled'); });
  // Re-enable toggle switches visual only
  if (!readonly) {
    document.getElementById('paramTableBody').querySelectorAll('.toggle-switch input').forEach(el => el.removeAttribute('disabled'));
  }
}

function closeMcpModal() {
  document.getElementById('mcpModalOverlay').classList.add('hidden');
  mcpModalMode = 'add';
  editingMcpId = null;
}

function handleSaveMcp() {
  syncParamRowsFromDOM();
  showToast('保存成功', 'success');
}

// ===== Relation Modal =====
function openRelationModal(id) {
  document.getElementById('relationModalOverlay').classList.remove('hidden');
  // Store context for copy
  document.getElementById('relationModal').dataset.mcpId = id;
}

function closeRelationModal() {
  document.getElementById('relationModalOverlay').classList.add('hidden');
}

function handleCopyNode(btn) {
  const row = btn.closest('tr');
  const cells = row.querySelectorAll('td');
  const appId = cells[0].textContent.trim();
  const appName = cells[1].textContent.trim();
  const nodeId = cells[2].textContent.trim();
  const nodeName = cells[3].textContent.trim();
  const editor = cells[4].textContent.trim();
  const editTime = cells[5].textContent.trim();
  const text = \`节点ID: \${nodeId}\n应用ID: \${appId}\n应用名称: \${appName}\n节点名称: \${nodeName}\n最近编辑用户: \${editor}\n最近编辑时间: \${editTime}\`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success');
  }).catch(() => {
    showToast('复制失败，请手动复制', '');
  });
}

// ===== Close modals on overlay click =====
document.getElementById('mcpModalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeMcpModal();
});
document.getElementById('relationModalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeRelationModal();
});

// ===== Init =====
renderParamTable();
updateJsonPreview();
</script>
</body>
</html>`;
