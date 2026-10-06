<script>
  // 🔴 1. วาง Web App URL ที่ได้จากขั้นตอน Deploy ของ Google Apps Script ที่นี่
  const API_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

  let CURRENT_USER = null;
  let ALL_OFFICERS = [];
  let MY_TASKS_CACHE = [];

  // ---------- ฟังก์ชันกลางสำหรับเรียก API ไปยัง Google Apps Script ----------
  async function apiCall(action, payload = {}) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // ป้องกัน CORS Preflight Issue
        body: JSON.stringify({ action, ...payload })
      });
      return await response.json();
    } catch (err) {
      console.error(`API Error [${action}]:`, err);
      return { ok: false, error: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย' };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadUserAndOfficers();
    loadOverview();
    document.getElementById('addTaskForm').addEventListener('submit', onAddTaskSubmit);
    document.getElementById('filterAssignee').addEventListener('change', loadAllTasks);
    document.getElementById('filterStatus').addEventListener('change', loadAllTasks);
    document.getElementById('hideCompleted').addEventListener('change', loadAllTasks);
    document.getElementById('filterCloseRequested').addEventListener('change', loadAllTasks);
    document.getElementById('editTaskForm').addEventListener('submit', onUpdateTaskSubmit);
    document.getElementById('cancelEditBtn').addEventListener('click', hideEditForm);
    document.getElementById('editHideCompleted').addEventListener('change', () => renderEditTaskList(MY_TASKS_CACHE));
  });

  // ---------- แท็บ ----------
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'overview') loadOverview();
        if (btn.dataset.tab === 'mytasks') loadMyTasks();
        if (btn.dataset.tab === 'alltasks') loadAllTasks();
        if (btn.dataset.tab === 'edittask') loadEditTaskList();
      });
    });
  }

  // ---------- โหลดผู้ใช้ปัจจุบัน + รายชื่อเจ้าหน้าที่ ----------
  async function loadUserAndOfficers() {
    const info = await apiCall('getCurrentUserInfo');
    if (info) {
      CURRENT_USER = info;
      document.getElementById('userBadge').textContent = (info.name || 'ผู้ใช้งาน') + ' (' + (info.role || '-') + ')';
      if (info.isAdmin) document.getElementById('allTasksTabBtn').style.display = '';
    }

    const officers = await apiCall('getOfficers');
    if (Array.isArray(officers)) {
      ALL_OFFICERS = officers;
      const assigneeSelect = document.getElementById('f_assignee');
      const filterSelect = document.getElementById('filterAssignee');
      officers.forEach(o => {
        const opt1 = document.createElement('option');
        opt1.value = o.name; opt1.textContent = o.name;
        assigneeSelect.appendChild(opt1);
        const opt2 = document.createElement('option');
        opt2.value = o.name; opt2.textContent = o.name;
        filterSelect.appendChild(opt2);
      });
    }
  }

  // ---------- ภาพรวม ----------
  async function loadOverview() {
    const summary = await apiCall('getDashboardSummary');
    if (summary && summary.byStatus) {
      renderOverview(summary);
    }
  }

  function renderOverview(summary) {
    const s = summary.byStatus;
    const cards = [
      { cls: 'total', label: 'งานทั้งหมด', val: summary.total || 0 },
      { cls: 'overdue', label: 'เกินกำหนด', val: s['เกินกำหนด'] || 0 },
      { cls: 'duesoon', label: 'ใกล้ครบกำหนด', val: s['ใกล้ครบกำหนด'] || 0 },
      { cls: 'done', label: 'เสร็จสิ้นแล้ว', val: s['เสร็จสิ้น'] || 0 },
    ];
    document.getElementById('summaryCards').innerHTML = cards.map(c =>
      `<div class="card ${c.cls}"><div class="num">${c.val}</div><div class="label">${c.label}</div></div>`
    ).join('');

    const tbody = document.querySelector('#officerTable tbody');
    tbody.innerHTML = (summary.byOfficer || []).map(o => `
      <tr>
        <td style="text-align:left">${escapeHtml(o.name)}</td>
        <td>${o.total}</td>
        <td>${o.inHand}</td>
        <td class="${o.overdue > 0 ? 'overdue-cell' : ''}">${o.overdue}</td>
        <td>${o.dueSoon}</td>
        <td>${o.done}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-hint">ยังไม่มีข้อมูลเจ้าหน้าที่</td></tr>';
  }

  // ---------- งานของฉัน ----------
  async function loadMyTasks() {
    document.getElementById('myTasksList').innerHTML = '<div class="empty-hint">กำลังโหลด...</div>';
    const tasks = await apiCall('getMyTasks');
    if (Array.isArray(tasks)) {
      renderMyStatCards(tasks);
      renderTaskList('myTasksList', tasks, true);
    } else {
      document.getElementById('myTasksList').innerHTML = '<div class="empty-hint">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    }
  }

  function renderMyStatCards(tasks) {
    const stats = [
      { cls: 'total big', label: 'งานทั้งหมด', val: tasks.length },
      { cls: 'overdue big', label: 'เกินกำหนด', val: tasks.filter(t => t.status === 'เกินกำหนด').length },
      { cls: 'duesoon big', label: 'ใกล้ครบกำหนด', val: tasks.filter(t => t.status === 'ใกล้ครบกำหนด').length },
      { cls: 'done big', label: 'เสร็จสิ้นแล้ว', val: tasks.filter(t => t.status === 'เสร็จสิ้น').length },
    ];
    document.getElementById('myStatCards').innerHTML = stats.map(c =>
      `<div class="card ${c.cls}"><div class="num">${c.val}</div><div class="label">${c.label}</div></div>`
    ).join('');
  }

  // ---------- งานทั้งหมด ----------
  async function loadAllTasks() {
    document.getElementById('allTasksList').innerHTML = '<div class="empty-hint">กำลังโหลด...</div>';
    const tasks = await apiCall('getAllTasks');
    if (Array.isArray(tasks)) {
      const assignee = document.getElementById('filterAssignee').value;
      const status = document.getElementById('filterStatus').value;
      const hideCompleted = document.getElementById('hideCompleted').checked;
      const onlyCloseRequested = document.getElementById('filterCloseRequested').checked;
      let filtered = tasks;
      if (assignee) filtered = filtered.filter(t => t.assignee === assignee);
      if (status) filtered = filtered.filter(t => t.status === status);
      if (hideCompleted) filtered = filtered.filter(t => t.status !== 'เสร็จสิ้น');
      if (onlyCloseRequested) filtered = filtered.filter(t => t.closeRequested);
      renderTaskList('allTasksList', filtered, CURRENT_USER && CURRENT_USER.isAdmin);
    } else {
      document.getElementById('allTasksList').innerHTML = '<div class="empty-hint">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    }
  }

  // ---------- แสดงการ์ดงาน ----------
  function renderTaskList(containerId, tasks, allowActions) {
    const el = document.getElementById(containerId);
    if (!tasks || !tasks.length) {
      el.innerHTML = '<div class="empty-hint">ไม่มีรายการงาน</div>';
      return;
    }
    el.innerHTML = tasks.map(t => `
      <div class="task-card status-${t.status}">
        <div class="row1">
          <span class="title">${escapeHtml(t.title)}</span>
          <span class="badge status-${t.status}">${t.status}</span>
        </div>
        <div class="meta">
          ผู้รับผิดชอบ: ${escapeHtml(t.assignee)} &nbsp;|&nbsp;
          รับเรื่อง: ${t.receivedDate} &nbsp;|&nbsp;
          กำหนดเสร็จ: ${t.dueDate || '-'}
          ${t.status !== 'เสร็จสิ้น' && t.daysRemaining !== null ? ' (' + (t.daysRemaining >= 0 ? 'เหลือ ' + t.daysRemaining + ' วัน' : 'เกิน ' + Math.abs(t.daysRemaining) + ' วัน') + ')' : ''}
          ${t.doneDate ? ' &nbsp;|&nbsp; เสร็จเมื่อ: ' + t.doneDate : ''}
        </div>
        ${t.closeRequested ? '<div class="badge badge-pending">รอการอนุมัติปิดงาน</div>' : ''}
        <div class="progress-line">
          ความคืบหน้า: ${escapeHtml(t.progress)}
          ${t.fileNumber ? ' &nbsp;|&nbsp; หมายเลขแฟ้ม: ' + escapeHtml(t.fileNumber) : ''}
        </div>
        <div class="meta audit-line">
          ${t.createdBy ? 'บันทึกโดย: ' + escapeHtml(t.createdBy) : ''}
          ${t.updatedBy && t.updatedBy !== t.createdBy ? ' &nbsp;|&nbsp; แก้ไขล่าสุดโดย: ' + escapeHtml(t.updatedBy) : ''}
        </div>
        ${t.note ? `<div class="meta">หมายเหตุ: ${escapeHtml(t.note)}</div>` : ''}
        ${allowActions ? `
        <div class="task-actions">
          ${t.status !== 'เสร็จสิ้น' && CURRENT_USER && CURRENT_USER.isAdmin && t.closeRequested ? `<button class="done-btn" onclick="onApproveClose('${t.id}', this)">อนุมัติปิดงาน</button>` : ''}
          ${t.status !== 'เสร็จสิ้น' && CURRENT_USER && CURRENT_USER.isAdmin && !t.closeRequested ? `<button class="done-btn" onclick="onMarkDone('${t.id}', this)">ทำเครื่องหมายว่าเสร็จ</button>` : ''}
          ${CURRENT_USER && CURRENT_USER.isAdmin ? `<button class="delete-btn" onclick="onDeleteTask('${t.id}', this)">ลบ</button>` : ''}
        </div>` : ''}
      </div>
    `).join('');
  }

  async function onMarkDone(taskId, btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const res = await apiCall('markTaskDone', { taskId });
    if (res && res.ok) {
      loadOverview();
      if (document.getElementById('tab-mytasks').classList.contains('active')) loadMyTasks();
      if (document.getElementById('tab-alltasks').classList.contains('active')) loadAllTasks();
    } else {
      alert((res && res.error) || 'เกิดข้อผิดพลาด');
      btn.disabled = false;
      btn.textContent = 'ทำเครื่องหมายว่าเสร็จ';
    }
  }

  async function onApproveClose(taskId, btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังอนุมัติ...';
    const res = await apiCall('approveCloseTask', { taskId });
    if (res && res.ok) {
      loadOverview();
      loadAllTasks();
    } else {
      alert((res && res.error) || 'เกิดข้อผิดพลาด');
      btn.disabled = false;
      btn.textContent = 'อนุมัติปิดงาน';
    }
  }

  async function onDeleteTask(taskId, btn) {
    if (!confirm('ยืนยันการลบงานนี้?')) return;
    btn.disabled = true;
    const res = await apiCall('deleteTask', { taskId });
    if (res && res.ok) {
      loadOverview();
      loadAllTasks();
    } else {
      alert((res && res.error) || 'เกิดข้อผิดพลาด');
      btn.disabled = false;
    }
  }

  // ---------- เพิ่มงานใหม่ ----------
  async function onAddTaskSubmit(e) {
    e.preventDefault();
    const msg = document.getElementById('addTaskMsg');
    msg.textContent = '';
    msg.className = '';

    const task = {
      receivedDate: document.getElementById('f_receivedDate').value,
      title: document.getElementById('f_title').value.trim(),
      assignee: document.getElementById('f_assignee').value,
      dueDate: document.getElementById('f_dueDate').value,
      fileNumber: document.getElementById('f_fileNumber').value.trim(),
      note: document.getElementById('f_note').value.trim(),
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    const res = await apiCall('addTask', { task });
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึกงาน';

    if (res && res.ok) {
      msg.textContent = 'บันทึกงานเรียบร้อย (รหัสงาน ' + res.id + ')';
      msg.className = 'ok';
      e.target.reset();
      loadOverview();
    } else {
      msg.textContent = (res && res.error) || 'เกิดข้อผิดพลาดในการบันทึก';
      msg.className = 'error';
    }
  }

  // ---------- ปรับปรุงข้อมูล ----------
  async function loadEditTaskList() {
    document.getElementById('editTaskList').innerHTML = '<div class="empty-hint">กำลังโหลด...</div>';
    hideEditForm();
    const tasks = await apiCall('getMyTasks');
    if (Array.isArray(tasks)) {
      MY_TASKS_CACHE = tasks;
      renderEditTaskList(tasks);
    }
  }

  function renderEditTaskList(allTasks) {
    const hideCompleted = document.getElementById('editHideCompleted').checked;
    const tasks = hideCompleted ? allTasks.filter(t => t.status !== 'เสร็จสิ้น') : allTasks;
    const el = document.getElementById('editTaskList');
    if (!tasks.length) {
      el.innerHTML = '<div class="empty-hint">ไม่มีงานที่ตรงกับเงื่อนไข</div>';
      return;
    }
    el.innerHTML = tasks.map(t => `
      <div class="task-card status-${t.status}">
        <div class="row1">
          <span class="title">${escapeHtml(t.title)}</span>
          <span class="badge status-${t.status}">${t.status}</span>
        </div>
        <div class="meta">กำหนดเสร็จ: ${t.dueDate || '-'} ${t.fileNumber ? ' | แฟ้ม: ' + escapeHtml(t.fileNumber) : ''}</div>
        ${t.closeRequested ? '<div class="badge badge-pending">รอการอนุมัติปิดงาน</div>' : ''}
        <div class="progress-line">ความคืบหน้า: ${escapeHtml(t.progress)}</div>
        <div class="task-actions">
          <button class="done-btn" onclick="openEditForm('${t.id}')">แก้ไขรายละเอียด</button>
          ${t.status !== 'เสร็จสิ้น' && !t.closeRequested ? `<button class="delete-btn" onclick="onRequestClose('${t.id}', this)">ขอปิดงาน</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  async function onRequestClose(taskId, btn) {
    if (!confirm('ยืนยันขอปิดงานนี้? หัวหน้าจะต้องอนุมัติก่อนจึงจะถือว่าเสร็จสิ้น')) return;
    btn.disabled = true;
    btn.textContent = 'กำลังส่งคำขอ...';
    const res = await apiCall('requestCloseTask', { taskId });
    if (res && res.ok) {
      loadEditTaskList();
    } else {
      alert((res && res.error) || 'เกิดข้อผิดพลาด');
      btn.disabled = false;
      btn.textContent = 'ขอปิดงาน';
    }
  }

  function openEditForm(taskId) {
    const t = MY_TASKS_CACHE.find(x => x.id === taskId);
    if (!t) return;
    document.getElementById('e_id').value = t.id;
    document.getElementById('e_title').value = t.title;
    document.getElementById('e_dueDate').value = t.dueDateRaw || '';
    document.getElementById('e_progress').value = t.progress;
    document.getElementById('e_fileNumber').value = t.fileNumber;
    document.getElementById('e_note').value = t.note;
    document.getElementById('editTaskForm').style.display = 'flex';
    document.getElementById('editTaskMsg').textContent = '';
    document.getElementById('editTaskForm').scrollIntoView({ behavior: 'smooth' });
  }

  function hideEditForm() {
    document.getElementById('editTaskForm').style.display = 'none';
    document.getElementById('editTaskForm').reset();
  }

  async function onUpdateTaskSubmit(e) {
    e.preventDefault();
    const msg = document.getElementById('editTaskMsg');
    msg.textContent = '';
    msg.className = '';

    const task = {
      id: document.getElementById('e_id').value,
      title: document.getElementById('e_title').value.trim(),
      dueDate: document.getElementById('e_dueDate').value,
      progress: document.getElementById('e_progress').value,
      fileNumber: document.getElementById('e_fileNumber').value.trim(),
      note: document.getElementById('e_note').value.trim(),
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    const res = await apiCall('updateTask', { task });
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึกการแก้ไข';

    if (res && res.ok) {
      msg.textContent = 'บันทึกการแก้ไขเรียบร้อย';
      msg.className = 'ok';
      loadEditTaskList();
      loadOverview();
    } else {
      msg.textContent = (res && res.error) || 'เกิดข้อผิดพลาดในการบันทึก';
      msg.className = 'error';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
</script>
