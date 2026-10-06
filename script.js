// **ใส่ URL Web App จาก Google Apps Script ของคุณตรงนี้**
const API_URL = "https://script.google.com/macros/s/AKfycby1Mt4S3oJzmQrN1hwuEk0kwcttdkQEwf63x3kyPGS9j7XknjXls8hG72QuQ9gmoKjDdA/exec";

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadInitialData();
});

// 1. ระบบสลับแท็บ
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });
}

// 2. เรียกข้อมูลเริ่มต้นจาก Backend API
async function loadInitialData() {
  try {
    // ดึงข้อมูลผู้ใช้
    const resUser = await fetch(`${API_URL}?action=getCurrentUserInfo`);
    const dataUser = await resUser.json();
    if (dataUser.ok) {
      currentUser = dataUser.data;
      document.getElementById('userBadge').innerText = `${currentUser.name} (${currentUser.role})`;
      
      // ถ้าเป็นหัวหน้า ให้แสดงแท็บ "งานทั้งหมด"
      if (currentUser.isAdmin) {
        document.getElementById('allTasksTabBtn').style.display = 'inline-block';
      }
    }

    // ดึงสรุปภาพรวม Dashboard
    const resDash = await fetch(`${API_URL}?action=getDashboardSummary`);
    const dataDash = await resDash.json();
    if (dataDash.ok) {
      renderOverview(dataDash.data);
    }

  } catch (err) {
    console.error("Error loading data:", err);
    document.getElementById('userBadge').innerText = "เชื่อมต่อระบบล้มเหลว";
  }
}

// 3. แสดงผลหน้าภาพรวม (Dashboard Cards + Table)
function renderOverview(summary) {
  // สร้าง Cards สรุป
  const cardsHtml = `
    <div class="card val-total">
      <div class="val">${summary.total}</div>
      <div class="lbl">งานทั้งหมด</div>
    </div>
    <div class="card val-overdue">
      <div class="val">${summary.byStatus['เกินกำหนด'] || 0}</div>
      <div class="lbl">เกินกำหนด</div>
    </div>
    <div class="card val-duesoon">
      <div class="val">${summary.byStatus['ใกล้ครบกำหนด'] || 0}</div>
      <div class="lbl">ใกล้ครบกำหนด</div>
    </div>
    <div class="card val-done">
      <div class="val">${summary.byStatus['เสร็จสิ้น'] || 0}</div>
      <div class="lbl">เสร็จสิ้นแล้ว</div>
    </div>
  `;
  document.getElementById('summaryCards').innerHTML = cardsHtml;

  // สร้าง ตารางสรุปตามเจ้าหน้าที่
  const tbody = document.querySelector('#officerTable tbody');
  tbody.innerHTML = summary.byOfficer.map(o => `
    <tr>
      <td>${o.name}</td>
      <td>${o.total}</td>
      <td>${o.inHand}</td>
      <td class="${o.overdue > 0 ? 'text-overdue' : ''}">${o.overdue}</td>
      <td>${o.dueSoon}</td>
      <td>${o.done}</td>
    </tr>
  `).join('');
}
