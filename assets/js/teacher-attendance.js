const teacherApp = document.querySelector('#teacher-app');
const teacherToken = localStorage.getItem('attendqr-token');
let qrTimer;
let liveTimer;

function teacherEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function teacherApi(action, payload, method = 'POST') {
  const base = window.APP_CONFIG?.API_BASE_URL || 'http://localhost/4th_Year_Pj_Backend/public/index.php';
  const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(teacherToken ? { Authorization: `Bearer ${teacherToken}` } : {}) } };
  let url = `${base}?action=${encodeURIComponent(action)}`;
  if (method === 'GET') url += payload ? `&${new URLSearchParams(payload)}` : '';
  else options.body = JSON.stringify(payload || {});
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Server returned an invalid response.' }));
  if (response.status === 401) { localStorage.removeItem('attendqr-token'); throw new Error('Your session has expired. Return to the main sign-in page and log in again.'); }
  if (!data.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function message(text, type = 'success') {
  return `<p class="notice ${type}" role="status">${teacherEscape(text)}</p>`;
}

function qrImageUrl(payload, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=svg&data=${encodeURIComponent(payload)}`;
}

function render(content) {
  teacherApp.innerHTML = `<aside><div class="brand">ATTEND<span>QR</span></div><nav><a href="dashboard.html">Dashboard</a><a href="create-session.html">Create QR session</a><a href="live-attendance.html">Live attendance</a><a href="manual-attendance.html">Manual attendance</a><a href="reports.html">Reports</a></nav></aside><section class="workspace">${content}</section>`;
}

function renderQrDisplay(session, targetId = 'qr-result') {
  const target = document.querySelector(`#${targetId}`);
  if (!target || !session?.token || !session?.expires_at) return;
  const expiresAt = new Date(session.expires_at);
  const payload = session.qr_payload || `ATTENDQR:${session.token}`;
  const context = session.subject ? `${session.class || ''} · ${session.subject.code} — ${session.subject.name}` : '';
  target.innerHTML = `<div class="teacher-token"><small>ACTIVE QR TOKEN</small><img id="attendance-qr" alt="Attendance QR code" src="${qrImageUrl(payload)}"><strong>${teacherEscape(session.token)}</strong><p>${teacherEscape(session.title || 'Attendance session')}</p>${context ? `<p>${teacherEscape(context)}</p>` : ''}<p>Expires <time datetime="${expiresAt.toISOString()}">${expiresAt.toLocaleTimeString()}</time></p><p id="qr-countdown"></p><div id="qr-image-error"></div></div>`;
  document.querySelector('#attendance-qr').onerror = event => {
    event.currentTarget.hidden = true;
    document.querySelector('#qr-image-error').innerHTML = message('QR image could not be loaded. Check your internet connection, then use the token shown above.', 'error');
  };
  const countdown = document.querySelector('#qr-countdown');
  clearInterval(qrTimer);
  const update = () => {
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) { clearInterval(qrTimer); countdown.innerHTML = message('This QR code has expired.', 'error'); return; }
    countdown.textContent = `Valid for ${Math.ceil(remaining / 1000)} seconds`;
  };
  update();
  qrTimer = setInterval(update, 1000);
}

async function createSession(user) {
  const subjects = user.subjects || [];
  const years = [...new Set(subjects.map(subject => Number(subject.year_level)))];
  const options = year => subjects.filter(subject => Number(subject.year_level) === Number(year)).map(subject => `<option value="${teacherEscape(subject.id)}">${teacherEscape(subject.code)} — ${teacherEscape(subject.name)}</option>`).join('');
  render(`<header><span class="eyebrow">Teacher</span><h1>Create QR session</h1></header><div class="card"><p class="notice">Generating a new session disables the previous active QR session.</p><form id="session-form"><label>Session title<input name="title" value="Class attendance" required></label><label>Year / class<select name="year_level" id="teacher-year" required>${years.map(year => `<option value="${year}">${year} Year</option>`).join('')}</select></label><label>Subject<select name="subject_id" id="teacher-subject" required></select></label><label>Valid for minutes<input name="minutes" type="number" min="1" max="240" value="10" required></label><button${subjects.length ? '' : ' disabled'}>Generate QR</button></form><div id="qr-result"></div></div>`);
  const yearSelect = document.querySelector('#teacher-year');
  const subjectSelect = document.querySelector('#teacher-subject');
  const updateSubjects = () => { subjectSelect.innerHTML = options(yearSelect.value); };
  yearSelect.onchange = updateSubjects;
  updateSubjects();
  document.querySelector('#session-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const result = document.querySelector('#qr-result');
    button.disabled = true;
    clearInterval(qrTimer);
    try {
      const data = await teacherApi('attendance/create', Object.fromEntries(new FormData(event.target)));
      const expiresAt = new Date(data.expires_at);
      const session = { token: data.token, qr_payload: data.qr_payload, expires_at: data.expires_at, title: Object.fromEntries(new FormData(event.target)).title, class: data.class, subject: data.subject };
      sessionStorage.setItem('attendqr-active-session', JSON.stringify(session));
      renderQrDisplay(session);
      result.insertAdjacentHTML('beforeend', '<p><a class="button-link" href="qr-display.html">Open QR display</a></p>');
    } catch (error) {
      result.innerHTML = message(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };
}

async function liveAttendance() {
  const refresh = async () => {
    try {
      const data = await teacherApi('attendance/live', null, 'GET');
      const total = Number(data.total_students ?? data.stats?.total_students ?? 0);
      const present = Number(data.present_students ?? data.stats?.present_students ?? data.attendance?.length ?? 0);
      const absent = Math.max(0, total - present);
      const session = data.session;
      document.querySelector('#live-result').innerHTML = session ? `<div class="stats"><div class="card"><strong>Total students</strong><h2>${total}</h2></div><div class="card"><strong>Present students</strong><h2>${present}</h2></div><div class="card"><strong>Absent students</strong><h2>${absent}</h2></div></div><div class="card"><h2>${teacherEscape(session.title)}</h2><p>${teacherEscape(session.subject)} · expires ${new Date(session.expires_at).toLocaleTimeString()}</p><div class="table-responsive"><table><thead><tr><th>Student</th><th>Number</th><th>Time</th></tr></thead><tbody>${data.attendance.map(item => `<tr><td>${teacherEscape(item.full_name)}</td><td>${teacherEscape(item.student_no)}</td><td>${new Date(item.recorded_at).toLocaleTimeString()}</td></tr>`).join('') || '<tr><td colspan="3">Nobody has checked in yet.</td></tr>'}</tbody></table></div></div>` : '<div class="card">No active attendance session.</div>';
    } catch (error) { document.querySelector('#live-result').innerHTML = message(error.message, 'error'); }
  };
  render(`<header><span class="eyebrow">Teacher</span><h1>Live attendance</h1></header><div id="live-result"></div>`);
  await refresh();
  clearInterval(liveTimer);
  liveTimer = setInterval(refresh, 5000);
}

function manualAttendance() {
  render(`<header><span class="eyebrow">Teacher</span><h1>Manual attendance</h1></header><div class="card"><form id="manual-form"><label>Session ID<input name="session_id" type="number" min="1" required></label><label>Student ID<input name="student_id" type="number" min="1" required></label><label>Status<select name="status"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></label><button>Record attendance</button></form><div id="manual-result"></div></div>`);
  document.querySelector('#manual-form').onsubmit = async event => {
    event.preventDefault();
    try { const data = await teacherApi('attendance/manual', Object.fromEntries(new FormData(event.target))); document.querySelector('#manual-result').innerHTML = message(data.message || 'Attendance recorded.'); event.target.reset(); }
    catch (error) { document.querySelector('#manual-result').innerHTML = message(error.message, 'error'); }
  };
}

function qrDisplay() {
  const session = JSON.parse(sessionStorage.getItem('attendqr-active-session') || 'null');
  render(`<header><span class="eyebrow">Teacher</span><h1>Display QR code</h1></header><div class="card qr-display-card"><div id="qr-display-result"></div><p><a class="button-link" href="create-session.html">Create a new session</a></p></div>`);
  if (!session) { document.querySelector('#qr-display-result').innerHTML = message('No QR session is available. Create a session first.', 'error'); return; }
  renderQrDisplay(session, 'qr-display-result');
}

async function reportsForTeacher(user) {
  const subjects = user.subjects || [];
  const years = [...new Set(subjects.map(subject => Number(subject.year_level)))];
  const subjectOptions = year => subjects.filter(subject => Number(subject.year_level) === Number(year)).map(subject => `<option value="${teacherEscape(subject.id)}">${teacherEscape(subject.code)} — ${teacherEscape(subject.name)}</option>`).join('');
  render(`<header><span class="eyebrow">Teacher</span><h1>Attendance reports</h1></header><div class="card"><form id="teacher-report-filter"><label>Month<input name="month" type="month" value="${new Date().toISOString().slice(0, 7)}" required></label><label>Year / class<select name="year_level" id="report-year">${years.map(year => `<option value="${year}">${year} Year</option>`).join('')}</select></label><label>Subject<select name="subject_id" id="report-subject"></select></label><button>View report</button></form></div><div id="report-result"></div>`);
  const year = document.querySelector('#report-year'); const subject = document.querySelector('#report-subject');
  const updateSubjects = () => { subject.innerHTML = subjectOptions(year.value); }; year.onchange = updateSubjects; updateSubjects();
  const load = async () => {
    try {
      const data = await teacherApi('reports/monthly', Object.fromEntries(new FormData(document.querySelector('#teacher-report-filter'))), 'GET');
      document.querySelector('#report-result').innerHTML = `<div class="card"><div class="table-responsive"><table><thead><tr><th>Student</th><th>Number</th><th>Attended</th><th>Total sessions</th><th>Percentage</th><th>Status</th></tr></thead><tbody>${data.report.map(item => `<tr><td>${teacherEscape(item.full_name)}</td><td>${teacherEscape(item.student_no)}</td><td>${teacherEscape(item.attended)}</td><td>${teacherEscape(item.total_sessions)}</td><td>${teacherEscape(item.percentage)}%</td><td>${teacherEscape(item.status)}</td></tr>`).join('') || '<tr><td colspan="6">No attendance data.</td></tr>'}</tbody></table></div></div>`;
    } catch (error) { document.querySelector('#report-result').innerHTML = message(error.message, 'error'); }
  };
  document.querySelector('#teacher-report-filter').onsubmit = event => { event.preventDefault(); load(); };
  if (subjects.length) await load();
}

async function reports() {
  render(`<header><span class="eyebrow">Teacher</span><h1>Attendance reports</h1></header><div id="report-result"></div>`);
  try {
    const data = await teacherApi('reports/monthly', null, 'GET');
    document.querySelector('#report-result').innerHTML = `<div class="card"><div class="table-responsive"><table><thead><tr><th>Student</th><th>Number</th><th>Attended</th><th>Total sessions</th><th>Percentage</th><th>Semester percentage</th></tr></thead><tbody>${data.report.map(item => `<tr><td>${teacherEscape(item.full_name)}</td><td>${teacherEscape(item.student_no)}</td><td>${teacherEscape(item.attended)}</td><td>${teacherEscape(item.total_sessions ?? '—')}</td><td>${item.percentage == null ? '—' : `${teacherEscape(item.percentage)}%`}</td><td>${item.semester_percentage == null ? '—' : `${teacherEscape(item.semester_percentage)}%`}</td></tr>`).join('') || '<tr><td colspan="6">No attendance data.</td></tr>'}</tbody></table></div></div>`;
  } catch (error) { document.querySelector('#report-result').innerHTML = message(error.message, 'error'); }
}

async function initTeacherPage() {
  if (!teacherToken) { render(`${message('Please sign in before opening teacher attendance pages.', 'error')}<p><a href="../../index.html">Return to sign in</a></p>`); return; }
  try {
    const user = await teacherApi('me', null, 'GET');
    if (user.user?.role !== 'teacher') { render(message('Teacher access is required.', 'error')); return; }
    const page = document.body.dataset.teacherPage;
    if (page === 'create') await createSession(user.user);
    if (page === 'qr-display') qrDisplay();
    if (page === 'live') await liveAttendance();
    if (page === 'manual') manualAttendance();
    if (page === 'reports') await reportsForTeacher(user.user);
  } catch (error) { render(message(error.message, 'error')); }
}

initTeacherPage();
