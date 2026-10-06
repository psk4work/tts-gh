```javascript
// ============================================================
// 🔐 GOOGLE LOGIN + ระบบติดตามงาน
// ============================================================

// ------------------------------------------------------------
// 1. ตั้งค่า Google OAuth
// ------------------------------------------------------------

// 🔴 ใส่ Client ID จาก Google Cloud Console
const GOOGLE_CLIENT_ID = "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 .apps.googleusercontent.com";

// 🔴 Web App URL ของ Google Apps Script
const API_URL = "https://script.google.com/macros/s/AKfycby1Mt4S3oJzmQrN1hwuEk0kwcttdkQEwf63x3kyPGS9j7XknjXls8hG72QuQ9gmoKjDdA/exec";


// ------------------------------------------------------------
// 2. ตัวแปรกลางของระบบ
// ------------------------------------------------------------

let CURRENT_USER = null;
let ALL_OFFICERS = [];
let MY_TASKS_CACHE = [];


// ============================================================
// 🔐 GOOGLE LOGIN
// ============================================================

// ---------- แปลง JWT Token จาก Google ----------
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];

    const base64 = base64Url
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    return JSON.parse(jsonPayload);

  } catch (e) {
    console.error('JWT Parse Error:', e);
    return null;
  }
}


// ---------- เริ่มต้น Google Identity Services ----------
window.onload = function () {

  // ตรวจสอบว่า Google Identity Services โหลดแล้วหรือไม่
  if (
    typeof google === 'undefined' ||
    !google.accounts ||
    !google.accounts.id
  ) {
    console.error('ไม่พบ Google Identity Services');

    const userInfo = document.getElementById('userInfo');

    if (userInfo) {
      userInfo.innerHTML =
        'ไม่สามารถโหลดระบบ Google Login ได้ กรุณารีเฟรชหน้าเว็บ';
    }

    return;
  }


  // เริ่มต้น Google Login
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });


  // ตรวจสอบ Login ที่บันทึกไว้
  const savedUser = localStorage.getItem('google_user');

  if (savedUser) {

    try {

      CURRENT_USER = JSON.parse(savedUser);

      // ตรวจสอบข้อมูลขั้นต่ำ
      if (CURRENT_USER && CURRENT_USER.email) {
        onLoginSuccess(CURRENT_USER);
      } else {
        logout();
      }

    } catch (e) {

      console.error('Saved user data invalid:', e);

      localStorage.removeItem('google_user');
      renderGoogleButton();
    }

  } else {

    renderGoogleButton();

  }
};


// ------------------------------------------------------------
// แสดงปุ่ม Google Sign-In
// ------------------------------------------------------------

function renderGoogleButton() {

  const userInfo = document.getElementById('userInfo');
  const mainContent = document.getElementById('mainContent');
  const googleBtn = document.getElementById('googleBtn');

  if (userInfo) {
    userInfo.innerHTML =
      'กรุณาลงชื่อเข้าใช้ด้วย Gmail เพื่อใช้งานระบบ';
  }

  if (mainContent) {
    mainContent.style.display = 'none';
  }

  if (googleBtn) {

    googleBtn.innerHTML = '';

    google.accounts.id.renderButton(
      googleBtn,
      {
        theme: "outline",
        size: "large",
        text: "signin_with"
      }
    );
  }
}


// ------------------------------------------------------------
// Callback เมื่อ Google Login สำเร็จ
// ------------------------------------------------------------

async function handleCredentialResponse(response) {

  const profile = parseJwt(response.credential);

  if (profile && profile.email) {

    CURRENT_USER = {

      email: profile.email,

      name: profile.name || profile.email,

      picture: profile.picture || ''

    };


    // บันทึก Login
    localStorage.setItem(
      'google_user',
      JSON.stringify(CURRENT_USER)
    );


    await onLoginSuccess(CURRENT_USER);

  } else {

    alert(
      'ไม่สามารถตรวจสอบตัวตนได้ กรุณาลองใหม่อีกครั้ง'
    );

  }
}


// ------------------------------------------------------------
// เมื่อ Login สำเร็จ
// ------------------------------------------------------------

async function onLoginSuccess(user) {

  const googleBtn = document.getElementById('googleBtn');
  const userInfo = document.getElementById('userInfo');
  const mainContent = document.getElementById('mainContent');


  // แสดงข้อมูลผู้ใช้
  if (googleBtn) {
    googleBtn.innerHTML = '';
  }


  if (userInfo) {

    userInfo.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        gap:10px;
      ">

        ${
          user.picture
            ? `<img
                 src="${escapeHtml(user.picture)}"
                 style="
                   width:32px;
                   height:32px;
                   border-radius:50%;
                 "
               >`
            : ''
        }

        <span>
          <b>${escapeHtml(user.name)}</b>
          (${escapeHtml(user.email)})
        </span>

        <button
          onclick="logout()"
          style="
            padding:4px 8px;
            cursor:pointer;
          "
        >
          ออกจากระบบ
        </button>

      </div>
    `;
  }


  // เปิดระบบหลัก
  if (mainContent) {
    mainContent.style.display = 'block';
  }


  // โหลดข้อมูลจากระบบเดิม
  await loadUserAndOfficers();

  // โหลด Dashboard
  await loadOverview();
}


// ------------------------------------------------------------
// ออกจากระบบ
// ------------------------------------------------------------

function logout() {

  localStorage.removeItem('google_user');

  CURRENT_USER = null;

  if (
    typeof google !== 'undefined' &&
    google.accounts &&
    google.accounts.id
  ) {
    google.accounts.id.disableAutoSelect();
  }

  location.reload();
}


// ============================================================
// 🔗 API
// ============================================================

// ---------- ฟังก์ชันกลางสำหรับเรียก Google Apps Script ----------

async function apiCall(action, payload = {}) {

  try {

    const response = await fetch(API_URL, {

      method: 'POST',

      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },

      body: JSON.stringify({

        action,

        // 🔐 ส่ง Email ของผู้ Login ไปทุกครั้ง
        email: CURRENT_USER?.email || '',

        ...payload

      })

    });


    return await response.json();


  } catch (err) {

    console.error(
      `API Error [${action}]:`,
      err
    );

    return {
      ok: false,
      error:
        err.message ||
        'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย'
    };

  }
}


// ============================================================
// 🚀 เริ่มต้นระบบหลัง DOM โหลด
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  initTabs();


  // ⚠️ ไม่เรียก loadUserAndOfficers() ตรงนี้
  // เพราะต้องรอ Google Login ก่อน


  const addTaskForm =
    document.getElementById('addTaskForm');

  if (addTaskForm) {
    addTaskForm.addEventListener(
      'submit',
      onAddTaskSubmit
    );
  }


  const filterAssignee =
    document.getElementById('filterAssignee');

  if (filterAssignee) {
    filterAssignee.addEventListener(
      'change',
      loadAllTasks
    );
  }


  const filterStatus =
    document.getElementById('filterStatus');

  if (filterStatus) {
    filterStatus.addEventListener(
      'change',
      loadAllTasks
    );
  }


  const hideCompleted =
    document.getElementById('hideCompleted');

  if (hideCompleted) {
    hideCompleted.addEventListener(
      'change',
      loadAllTasks
    );
  }


  const filterCloseRequested =
    document.getElementById('filterCloseRequested');

  if (filterCloseRequested) {
    filterCloseRequested.addEventListener(
      'change',
      loadAllTasks
    );
  }


  const editTaskForm =
    document.getElementById('editTaskForm');

  if (editTaskForm) {
    editTaskForm.addEventListener(
      'submit',
      onUpdateTaskSubmit
    );
  }


  const cancelEditBtn =
    document.getElementById('cancelEditBtn');

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener(
      'click',
      hideEditForm
    );
  }


  const editHideCompleted =
    document.getElementById('editHideCompleted');

  if (editHideCompleted) {

    editHideCompleted.addEventListener(
      'change',
      () => renderEditTaskList(MY_TASKS_CACHE)
    );

  }

});


// ============================================================
// 📑 แท็บ
// ============================================================

function initTabs() {

  document
    .querySelectorAll('.tab-btn')
    .forEach(btn => {

      btn.addEventListener('click', () => {

        document
          .querySelectorAll('.tab-btn')
          .forEach(b =>
            b.classList.remove('active')
          );

        document
          .querySelectorAll('.tab-panel')
          .forEach(p =>
            p.classList.remove('active')
          );


        btn.classList.add('active');


        const panel =
          document.getElementById(
            'tab-' + btn.dataset.tab
          );

        if (panel) {
          panel.classList.add('active');
        }


        if (btn.dataset.tab === 'overview') {
          loadOverview();
        }

        if (btn.dataset.tab === 'mytasks') {
          loadMyTasks();
        }

        if (btn.dataset.tab === 'alltasks') {
          loadAllTasks();
        }

        if (btn.dataset.tab === 'edittask') {
          loadEditTaskList();
        }

      });

    });

}


// ============================================================
// 👤 โหลดผู้ใช้ + รายชื่อเจ้าหน้าที่
// ============================================================

async function loadUserAndOfficers() {

  // ส่ง Email ไปตรวจสอบสิทธิ์กับ Apps Script
  const info = await apiCall(
    'getCurrentUserInfo',
    {
      email: CURRENT_USER?.email || ''
    }
  );


  if (info) {

    CURRENT_USER = {

      ...CURRENT_USER,

      ...info,

      email:
        info.email ||
        CURRENT_USER?.email ||
        ''

    };


    // เก็บข้อมูลล่าสุด
    localStorage.setItem(
      'google_user',
      JSON.stringify(CURRENT_USER)
    );


    const userBadge =
      document.getElementById('userBadge');

    if (userBadge) {

      userBadge.textContent =
        (info.name || 'ผู้ใช้งาน') +
        ' (' +
        (info.role || '-') +
        ')';

    }


    // แสดงแท็บงานทั้งหมดเฉพาะ Admin
    const allTasksTabBtn =
      document.getElementById('allTasksTabBtn');

    if (
      allTasksTabBtn &&
      info.isAdmin
    ) {

      allTasksTabBtn.style.display = '';

    }

  }


  // โหลดรายชื่อเจ้าหน้าที่
  const officers =
    await apiCall('getOfficers');


  if (Array.isArray(officers)) {

    ALL_OFFICERS = officers;


    const assigneeSelect =
      document.getElementById('f_assignee');

    const filterSelect =
      document.getElementById('filterAssignee');


    officers.forEach(o => {

      if (assigneeSelect) {

        const opt1 =
          document.createElement('option');

        opt1.value = o.name;

        opt1.textContent = o.name;

        assigneeSelect.appendChild(opt1);

      }


      if (filterSelect) {

        const opt2 =
          document.createElement('option');

        opt2.value = o.name;

        opt2.textContent = o.name;

        filterSelect.appendChild(opt2);

      }

    });

  }

}


// ============================================================
// 📊 ภาพรวม
// ============================================================

async function loadOverview() {

  const summary =
    await apiCall('getDashboardSummary');


  if (
    summary &&
    summary.byStatus
  ) {

    renderOverview(summary);

  }

}


function renderOverview(summary) {

  const s = summary.byStatus;


  const cards = [

    {
      cls: 'total',
      label: 'งานทั้งหมด',
      val: summary.total || 0
    },

    {
      cls: 'overdue',
      label: 'เกินกำหนด',
      val: s['เกินกำหนด'] || 0
    },

    {
      cls: 'duesoon',
      label: 'ใกล้ครบกำหนด',
      val: s['ใกล้ครบกำหนด'] || 0
    },

    {
      cls: 'done',
      label: 'เสร็จสิ้นแล้ว',
      val: s['เสร็จสิ้น'] || 0
    }

  ];


  document.getElementById(
    'summaryCards'
  ).innerHTML = cards.map(c => `

    <div class="card ${c.cls}">

      <div class="num">
        ${c.val}
      </div>

      <div class="label">
        ${c.label}
      </div>

    </div>

  `).join('');


  const tbody =
    document.querySelector(
      '#officerTable tbody'
    );


  if (!tbody) return;


  tbody.innerHTML =
    (summary.byOfficer || [])
      .map(o => `

        <tr>

          <td style="text-align:left">
            ${escapeHtml(o.name)}
          </td>

          <td>${o.total}</td>

          <td>${o.inHand}</td>

          <td class="${o.overdue > 0
            ? 'overdue-cell'
            : ''
          }">
            ${o.overdue}
          </td>

          <td>${o.dueSoon}</td>

          <td>${o.done}</td>

        </tr>

      `)
      .join('')

    ||

      '<tr>' +
      '<td colspan="6" class="empty-hint">' +
      'ยังไม่มีข้อมูลเจ้าหน้าที่' +
      '</td>' +
      '</tr>';

}


// ============================================================
// 📌 งานของฉัน
// ============================================================

async function loadMyTasks() {

  const el =
    document.getElementById(
      'myTasksList'
    );


  if (el) {

    el.innerHTML =
      '<div class="empty-hint">' +
      'กำลังโหลด...' +
      '</div>';

  }


  const tasks =
    await apiCall('getMyTasks');


  if (Array.isArray(tasks)) {

    renderMyStatCards(tasks);

    renderTaskList(
      'myTasksList',
      tasks,
      true
    );

  } else if (el) {

    el.innerHTML =
      '<div class="empty-hint">' +
      'เกิดข้อผิดพลาดในการโหลดข้อมูล' +
      '</div>';

  }

}


function renderMyStatCards(tasks) {

  const stats = [

    {
      cls: 'total big',
      label: 'งานทั้งหมด',
      val: tasks.length
    },

    {
      cls: 'overdue big',
      label: 'เกินกำหนด',
      val:
        tasks.filter(
          t => t.status === 'เกินกำหนด'
        ).length
    },

    {
      cls: 'duesoon big',
      label: 'ใกล้ครบกำหนด',
      val:
        tasks.filter(
          t => t.status === 'ใกล้ครบกำหนด'
        ).length
    },

    {
      cls: 'done big',
      label: 'เสร็จสิ้นแล้ว',
      val:
        tasks.filter(
          t => t.status === 'เสร็จสิ้น'
        ).length
    }

  ];


  document.getElementById(
    'myStatCards'
  ).innerHTML = stats.map(c => `

    <div class="card ${c.cls}">

      <div class="num">
        ${c.val}
      </div>

      <div class="label">
        ${c.label}
      </div>

    </div>

  `).join('');

}


// ============================================================
// 📋 งานทั้งหมด
// ============================================================

async function loadAllTasks() {

  const el =
    document.getElementById(
      'allTasksList'
    );


  if (el) {

    el.innerHTML =
      '<div class="empty-hint">' +
      'กำลังโหลด...' +
      '</div>';

  }


  const tasks =
    await apiCall('getAllTasks');


  if (Array.isArray(tasks)) {

    const assignee =
      document.getElementById(
        'filterAssignee'
      )?.value || '';


    const status =
      document.getElementById(
        'filterStatus'
      )?.value || '';


    const hideCompleted =
      document.getElementById(
        'hideCompleted'
      )?.checked || false;


    const onlyCloseRequested =
      document.getElementById(
        'filterCloseRequested'
      )?.checked || false;


    let filtered = tasks;


    if (assignee) {

      filtered =
        filtered.filter(
          t => t.assignee === assignee
        );

    }


    if (status) {

      filtered =
        filtered.filter(
          t => t.status === status
        );

    }


    if (hideCompleted) {

      filtered =
        filtered.filter(
          t => t.status !== 'เสร็จสิ้น'
        );

    }


    if (onlyCloseRequested) {

      filtered =
        filtered.filter(
          t => t.closeRequested
        );

    }


    renderTaskList(
      'allTasksList',
      filtered,
      CURRENT_USER &&
      CURRENT_USER.isAdmin
    );


  } else if (el) {

    el.innerHTML =
      '<div class="empty-hint">' +
      'เกิดข้อผิดพลาดในการโหลดข้อมูล' +
      '</div>';

  }

}


// ============================================================
// 📝 แสดงรายการงาน
// ============================================================

function renderTaskList(
  containerId,
  tasks,
  allowActions
) {

  const el =
    document.getElementById(containerId);


  if (!el) return;


  if (!tasks || !tasks.length) {

    el.innerHTML =
      '<div class="empty-hint">' +
      'ไม่มีรายการงาน' +
      '</div>';

    return;

  }


  el.innerHTML =
    tasks.map(t => `

      <div class="task-card status-${t.status}">

        <div class="row1">

          <span class="title">
            ${escapeHtml(t.title)}
          </span>

          <span class="badge status-${t.status}">
            ${t.status}
          </span>

        </div>


        <div class="meta">

          ผู้รับผิดชอบ:
          ${escapeHtml(t.assignee)}

          &nbsp;|&nbsp;

          รับเรื่อง:
          ${t.receivedDate}

          &nbsp;|&nbsp;

          กำหนดเสร็จ:
          ${t.dueDate || '-'}

          ${
            t.status !== 'เสร็จสิ้น' &&
            t.daysRemaining !== null
              ? ' (' +
                (
                  t.daysRemaining >= 0
                    ? 'เหลือ ' +
                      t.daysRemaining +
                      ' วัน'
                    : 'เกิน ' +
                      Math.abs(t.daysRemaining) +
                      ' วัน'
                ) +
                ')'
              : ''
          }

          ${
            t.doneDate
              ? ' &nbsp;|&nbsp; เสร็จเมื่อ: ' +
                t.doneDate
              : ''
          }

        </div>


        ${
          t.closeRequested
            ? '<div class="badge badge-pending">' +
              'รอการอนุมัติปิดงาน' +
              '</div>'
            : ''
        }


        <div class="progress-line">

          ความคืบหน้า:
          ${escapeHtml(t.progress)}

          ${
            t.fileNumber
              ? ' &nbsp;|&nbsp; หมายเลขแฟ้ม: ' +
                escapeHtml(t.fileNumber)
              : ''
          }

        </div>


        <div class="meta audit-line">

          ${
            t.createdBy
              ? 'บันทึกโดย: ' +
                escapeHtml(t.createdBy)
              : ''
          }

          ${
            t.updatedBy &&
            t.updatedBy !== t.createdBy
              ? ' &nbsp;|&nbsp; แก้ไขล่าสุดโดย: ' +
                escapeHtml(t.updatedBy)
              : ''
          }

        </div>


        ${
          t.note
            ? `<div class="meta">
                 หมายเหตุ:
                 ${escapeHtml(t.note)}
               </div>`
            : ''
        }


        ${
          allowActions
            ? `

              <div class="task-actions">

                ${
                  t.status !== 'เสร็จสิ้น' &&
                  CURRENT_USER &&
                  CURRENT_USER.isAdmin &&
                  t.closeRequested

                    ? `<button
                         class="done-btn"
                         onclick="onApproveClose('${t.id}', this)"
                       >
                         อนุมัติปิดงาน
                       </button>`

                    : ''
                }


                ${
                  t.status !== 'เสร็จสิ้น' &&
                  CURRENT_USER &&
                  CURRENT_USER.isAdmin &&
                  !t.closeRequested

                    ? `<button
                         class="done-btn"
                         onclick="onMarkDone('${t.id}', this)"
                       >
                         ทำเครื่องหมายว่าเสร็จ
                       </button>`

                    : ''
                }


                ${
                  CURRENT_USER &&
                  CURRENT_USER.isAdmin

                    ? `<button
                         class="delete-btn"
                         onclick="onDeleteTask('${t.id}', this)"
                       >
                         ลบ
                       </button>`

                    : ''
                }

              </div>

            `
            : ''
        }

     
