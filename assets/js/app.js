const root = document.getElementById('app');
let activeCameraStream = null;
let qrExpiryTimer = null;
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const notice = (message, type = 'success') => `<p class="notice ${type}">${escapeHtml(message)}</p>`;
const qrImageUrl = (payload, size = 220) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=svg&data=${encodeURIComponent(payload)}`;
function loginView(message = '') {
  root.innerHTML = `<section class="auth-page auth-focused"><div class="auth-box auth-simple"><div class="auth-panel"><h2>Sign in</h2>${message}<form id="login"><label>Username<input name="username" required></label><label>Password<input type="password" name="password" required></label><button>Log in</button></form><div class="auth-switch"><span>New user?</span><button class="secondary" id="switch-to-signup">Sign up</button></div></div></div></section>`;
  document.querySelector('#login').onsubmit = login;
  document.querySelector('#switch-to-signup').onclick = () => signupView();
}
async function signupView(message = '') {
  let subjects = [];
  try { subjects = (await api('registration/subjects', null, 'GET')).subjects || []; } catch (error) { message += notice(error.message, 'error'); }
  root.innerHTML = `<section class="auth-page auth-focused"><div class="auth-box auth-simple"><div class="auth-panel"><h2>Create your account</h2>${message}<form id="register"><label>Full name<input name="full_name" required></label><label>Username<input name="username" required></label><label>Password<input type="password" name="password" minlength="6" required></label><label>Role<select name="role" id="registration-role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label id="registration-identifier-field">Student roll number<input name="identifier" placeholder="e.g. 4IT15" autocomplete="off"></label><label id="registration-class-field"><span>Class or classes</span><input name="class_name" id="registration-class" placeholder="e.g. 3IT,4IT" autocomplete="off"></label><div id="class-validation" aria-live="polite"></div><fieldset id="student-subject-field" hidden><legend>Subjects for your class</legend><div class="check-list" id="student-subject-list"></div></fieldset><fieldset id="teacher-subject-field" hidden><legend>Subjects taught</legend><p class="field-help">Select every subject you teach across the entered classes.</p><div class="check-list" id="teacher-subject-list"></div></fieldset><button>Register</button></form><div class="auth-switch"><span>Already have an account?</span><button class="secondary" id="switch-to-login">Sign in</button></div></div></div></section>`;
  const role = document.querySelector('#registration-role');
  const identifierField = document.querySelector('#registration-identifier-field');
  const identifier = identifierField.querySelector('input');
  const classField = document.querySelector('#registration-class-field');
  const classInput = document.querySelector('#registration-class');
  const validation = document.querySelector('#class-validation');
  const studentSubjectField = document.querySelector('#student-subject-field');
  const studentSubjectList = document.querySelector('#student-subject-list');
  const subjectField = document.querySelector('#teacher-subject-field');
  const subjectList = document.querySelector('#teacher-subject-list');
  const updateTeacherSubjects = () => {
    if (role.value !== 'teacher') return;
    classInput.value = classInput.value.toUpperCase().replace(/\s+/g, '');
    const classes = [...new Set(classInput.value.split(',').filter(Boolean))];
    subjectField.hidden = true;
    subjectList.innerHTML = '';
    if (!classInput.value) { validation.innerHTML = '<p class="field-help">Enter one or more classes, such as 3IT,4IT, to see their subjects.</p>'; return; }
    if (!classes.length || classes.some(className => !/^[1-9]IT$/.test(className))) { validation.innerHTML = notice('Use class values such as 3IT,4IT separated by commas.', 'error'); return; }
    const available = subjects.filter(subject => classes.some(className => String(subject.code).toUpperCase().startsWith(`IT${className[0]}`)));
    const unsupported = classes.filter(className => !subjects.some(subject => String(subject.code).toUpperCase().startsWith(`IT${className[0]}`)));
    if (unsupported.length) { validation.innerHTML = notice(`No subjects are configured for ${unsupported.join(', ')}.`, 'error'); return; }
    validation.innerHTML = `<p class="notice">${available.length} subject${available.length === 1 ? '' : 's'} available for ${escapeHtml(classes.join(', '))}.</p>`;
    subjectList.innerHTML = available.map(subject => `<label class="check-option"><input type="checkbox" name="subject_codes" value="${escapeHtml(subject.code)}"><span><strong>${escapeHtml(subject.code)}</strong> — ${escapeHtml(subject.name)}</span></label>`).join('');
    subjectField.hidden = false;
  };
  const updateStudentSubjects = () => {
    if (role.value !== 'student') return;
    identifier.value = identifier.value.toUpperCase().replace(/\s+/g, '');
    const match = identifier.value.match(/^([1-9])IT[0-9]+$/);
    studentSubjectField.hidden = true;
    studentSubjectList.innerHTML = '';
    if (!identifier.value) { validation.innerHTML = '<p class="field-help">Your roll number determines your class and subjects.</p>'; return; }
    if (!match) { validation.innerHTML = notice('Use a student roll number such as 4IT15.', 'error'); return; }
    const className = `${match[1]}IT`;
    const available = subjects.filter(subject => String(subject.code).toUpperCase().startsWith(`IT${match[1]}`));
    if (!available.length) { validation.innerHTML = notice(`No subjects are configured for ${className}.`, 'error'); return; }
    validation.innerHTML = `<p class="notice">Roll number ${escapeHtml(identifier.value)} belongs to ${className}.</p>`;
    studentSubjectList.innerHTML = available.map(subject => `<div class="check-option"><span><strong>${escapeHtml(subject.code)}</strong> — ${escapeHtml(subject.name)}</span></div>`).join('');
    studentSubjectField.hidden = false;
  };
  const updateRole = () => {
    const teacher = role.value === 'teacher';
    identifierField.hidden = teacher;
    identifier.disabled = teacher;
    identifier.required = !teacher;
    identifier.pattern = '[1-9]IT[0-9]+';
    classField.hidden = !teacher;
    classInput.disabled = !teacher;
    classInput.required = teacher;
    classInput.pattern = '[1-9]IT(,[1-9]IT)*';
    subjectField.hidden = true;
    subjectList.innerHTML = '';
    studentSubjectField.hidden = true;
    studentSubjectList.innerHTML = '';
    validation.innerHTML = teacher ? '<p class="field-help">Enter one or more classes, such as 3IT,4IT, to see their subjects.</p>' : '<p class="field-help">Your roll number determines your class and subjects.</p>';
    if (teacher) updateTeacherSubjects(); else updateStudentSubjects();
  };
  document.querySelector('#register').onsubmit = event => {
    if (role.value === 'teacher' && !document.querySelector('input[name="subject_codes"]:checked')) {
      event.preventDefault();
      validation.innerHTML = notice('Select at least one subject you teach.', 'error');
      return;
    }
    register(event);
  };
  role.onchange = updateRole;
  identifier.oninput = updateStudentSubjects;
  classInput.oninput = updateTeacherSubjects;
  updateRole();
  document.querySelector('#switch-to-login').onclick = () => loginView();
}
async function login(event) { event.preventDefault(); const f = Object.fromEntries(new FormData(event.target)); try { const r = await api('login', { ...f, device_uuid: deviceUuid }); localStorage.setItem('attendqr-token', r.token); start(r.user); } catch (e) { loginView(notice(e.message, 'error')); } }
async function register(event) { event.preventDefault(); const formData = new FormData(event.target); const payload = Object.fromEntries(formData); payload.subject_codes = formData.getAll('subject_codes'); try { const r = await api('register', payload); loginView(notice(r.message, 'success')); } catch (e) { signupView(notice(e.message, 'error')); } }
function layout(user, content) { root.innerHTML = `<aside><div class="brand">ATTEND<span>QR</span></div><p>${escapeHtml(user.full_name)}</p><small>${escapeHtml(user.role)}</small><nav><button data-page="home">Dashboard</button>${user.role === 'student' ? '<button data-page="scan">Scan QR</button><button data-page="report">Monthly attendance</button><button data-page="attendance">Attendance history</button><button data-page="schedule">Schedule</button>' : ''}${user.role === 'teacher' ? '<button data-page="create">Create QR session</button><button data-page="live">Live attendance</button><button data-page="report">Reports</button>' : ''}${user.role === 'admin' ? '<button data-page="users">Users</button><button data-page="subjects">Subjects</button>' : ''}<button id="logout">Log out</button></nav></aside><section class="workspace">${content}</section>`; document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => page(user, b.dataset.page)); document.querySelector('#logout').onclick = async () => { await api('logout', {}); localStorage.removeItem('attendqr-token'); sessionStorage.removeItem('user'); loginView(); }; }
const title = (heading, body = '') => `<header><span class="eyebrow">${escapeHtml(body)}</span><h1>${escapeHtml(heading)}</h1></header>`;
const ordinalSuffix = value => (value % 100 >= 11 && value % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[value % 10] || 'th';
const yearLabel = value => `${value}${ordinalSuffix(Number(value))} Year`;
const subjectOptions = (subjects, year) => subjects.filter(subject => Number(subject.year_level) === Number(year)).map(subject => `<option value="${subject.id}">${escapeHtml(subject.code)} — ${escapeHtml(subject.name)}</option>`).join('');

function teacherCreatePage(user) {
  const subjects = user.subjects || [];
  const options = subjects.map(subject => `<option value="${subject.id}">${escapeHtml(subject.code)} — ${escapeHtml(subject.name)}</option>`).join('');
  layout(user, `${title('Create QR session', 'Teacher')}<div class="card"><p class="notice">Generating a new session replaces the previous active QR session.</p><form id="create"><label>Class<input value="${escapeHtml(user.class_name || '')}" readonly></label><label>Session title<input name="title" value="Class attendance" required></label><label>Subject<select name="subject_id" id="session-subject" required>${options}</select></label><label>Valid for minutes<input type="number" name="minutes" min="1" max="240" value="10" required></label><button${subjects.length ? '' : ' disabled'}>Generate QR</button></form><div id="token" aria-live="polite"></div></div>`);
  document.querySelector('#create').onsubmit = createAttendanceSession;
}

function adminSubjectsPage(user) {
  layout(user, `${title('Subjects', 'Administrator')}<div class="card"><form id="subject"><label>Code<input name="code" required></label><label>Name<input name="name" required></label><label>Year level<input name="year_level" type="number" min="1" max="9" required></label><button>Save subject</button></form><div id="saved"></div></div>`);
  document.querySelector('#subject').onsubmit = async event => { event.preventDefault(); try { const response = await api('admin/subject', Object.fromEntries(new FormData(event.target))); document.querySelector('#saved').innerHTML = notice(response.message); event.target.reset(); } catch (error) { document.querySelector('#saved').innerHTML = notice(error.message, 'error'); } };
}

async function attendanceReportPage(user) {
  const params = new URLSearchParams(location.search);
  const query = { month: params.get('month') || new Date().toISOString().slice(0, 7) };
  if (user.role === 'teacher') { if (params.get('subject_id')) query.subject_id = params.get('subject_id'); if (params.get('year_level')) query.year_level = params.get('year_level'); }
  const data = await api('reports/monthly', query, 'GET');
  const studentView = user.role === 'student';
  const subjects = data.subjects || [];
  const years = [...new Set(subjects.map(subject => Number(subject.year_level)))];
  const filters = studentView ? '' : `<label>Year / class<select name="year_level" id="report-year">${years.map(year => `<option value="${year}"${year === Number(data.year_level) ? ' selected' : ''}>${yearLabel(year)}</option>`).join('')}</select></label><label>Subject<select name="subject_id" id="report-subject">${subjectOptions(subjects, data.year_level)}</select></label>`;
  layout(user, `${title('Monthly attendance', yearLabel(data.year_level))}<div class="card"><form id="month-report"><label>Month<input type="month" name="month" value="${escapeHtml(data.month)}" required></label>${filters}<button>View report</button></form></div><table><thead><tr>${studentView ? '<th>Subject</th>' : '<th>Student</th><th>Number</th>'}<th>Attended</th><th>Total classes</th><th>Attendance</th><th>Status</th></tr></thead><tbody>${data.report.map(item => `<tr><td>${escapeHtml(studentView ? `${item.code} — ${item.name}` : item.full_name)}</td>${studentView ? '' : `<td>${escapeHtml(item.student_no)}</td>`}<td>${item.attended}</td><td>${item.total_sessions}</td><td class="${item.meets_requirement ? 'attendance-good' : 'attendance-bad'}">${Number(item.percentage).toFixed(2)}%</td><td class="${item.meets_requirement ? 'attendance-good' : 'attendance-bad'}">${escapeHtml(item.status)}</td></tr>`).join('') || `<tr><td colspan="${studentView ? 5 : 6}">No data for this month.</td></tr>`}</tbody></table>`);
  if (!studentView) {
    const subject = document.querySelector('#report-subject'); subject.value = String(data.subject?.id || '');
    document.querySelector('#report-year').onchange = event => { subject.innerHTML = subjectOptions(subjects, event.target.value); };
  }
  document.querySelector('#month-report').onsubmit = event => { event.preventDefault(); const next = new URLSearchParams(Object.fromEntries(new FormData(event.target))); history.replaceState(null, '', `${location.pathname}?${next}`); page(user, 'report'); };
}

async function page(user, which = 'home') {
  try {
    if (which === 'create') { teacherCreatePage(user); return; }
    if (which === 'subjects') { adminSubjectsPage(user); return; }
    if (which === 'report') { await attendanceReportPage(user); return; }
    if (which === 'home') return layout(user, `${title(user.welcome_message || 'Welcome back', user.role === 'student' && user.year_level ? `${yearLabel(user.year_level)} · ${user.class_name}` : user.role === 'teacher' ? user.class_name : user.role)}<div class="card"><h2>Quick start</h2><p>${user.role === 'student' ? 'Review your monthly subject attendance or scan your teacher’s active QR token.' : user.role === 'teacher' ? `Create ${escapeHtml(user.class_name)} attendance sessions for ${user.subjects?.length || 0} assigned subjects.` : 'Approve new student accounts, reset registered devices, and maintain subjects.'}</p></div>`);
    if (which === 'scan') { stopCamera(); layout(user, `${title('Scan QR', 'Student')}<div class="card scan-card"><p>Scan your teacher's active QR code to record attendance. The server validates expiry and duplicate attendance.</p><button class="secondary" id="camera" type="button">Open live camera</button> <button class="secondary" id="qr-photo" type="button">Take or choose QR photo</button><input id="qr-photo-input" type="file" accept="image/*" capture="environment" hidden><video id="preview" autoplay playsinline hidden></video><form id="scan"><label>QR token<input name="token" autocomplete="off" required autofocus></label><button type="submit">Record attendance</button></form><div id="result" role="status" aria-live="polite"></div></div>`); document.querySelector('#scan').onsubmit = submitScan; document.querySelector('#camera').onclick = startCamera; document.querySelector('#qr-photo').onclick = () => document.querySelector('#qr-photo-input').click(); document.querySelector('#qr-photo-input').onchange = scanQrPhoto; return; }
    if (which === 'attendance') { const d = await api('student/attendance', null, 'GET'); layout(user, `${title('My attendance', 'Student')}<table><thead><tr><th>Subject</th><th>Session</th><th>Status</th><th>Time</th></tr></thead><tbody>${d.attendance.map(x => `<tr><td>${escapeHtml(x.code)} — ${escapeHtml(x.name)}</td><td>${escapeHtml(x.title)}</td><td><b>${escapeHtml(x.status)}</b></td><td>${new Date(x.recorded_at).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="4">No attendance records yet.</td></tr>'}</tbody></table>`); return; }
    if (which === 'schedule') { const d = await api('student/schedule', null, 'GET'); layout(user, `${title('Schedule', 'Student')}<table><thead><tr><th>Subject</th><th>Day</th><th>Time</th><th>Room</th></tr></thead><tbody>${d.schedules.map(x => `<tr><td>${escapeHtml(x.code)} — ${escapeHtml(x.name)}</td><td>${escapeHtml(x.day_of_week)}</td><td>${escapeHtml(x.start_time)}–${escapeHtml(x.end_time)}</td><td>${escapeHtml(x.classroom || '—')}</td></tr>`).join('') || '<tr><td colspan="4">No schedules added yet.</td></tr>'}</tbody></table>`); return; }
    if (which === 'live') { const d = await api('attendance/live', null, 'GET'); const total = Number(d.total_students ?? d.stats?.total_students ?? 0); const present = Number(d.present_students ?? d.stats?.present_students ?? d.attendance?.length ?? 0); const absent = Math.max(0, total - present); layout(user, `${title('Live attendance', 'Teacher')}${d.session ? `<div class="stats"><div class="card"><strong>Total students</strong><h2>${total}</h2></div><div class="card"><strong>Present</strong><h2>${present}</h2></div><div class="card"><strong>Absent</strong><h2>${absent}</h2></div></div><div class="card"><h2>${escapeHtml(d.session.title)}</h2><p>${escapeHtml(d.session.class_name)} · ${escapeHtml(d.session.subject)} · expires ${new Date(d.session.expires_at).toLocaleTimeString()}</p><table><thead><tr><th>Student</th><th>Number</th><th>Time</th></tr></thead><tbody>${d.attendance.map(x => `<tr><td>${escapeHtml(x.full_name)}</td><td>${escapeHtml(x.student_no)}</td><td>${new Date(x.recorded_at).toLocaleTimeString()}</td></tr>`).join('') || '<tr><td colspan="3">Nobody has checked in yet.</td></tr>'}</tbody></table></div>` : '<div class="card">No active attendance session.</div>'}`); return; }
    if (which === 'users') { const d = await api('admin/users', null, 'GET'); layout(user, `${title('User management', 'Administrator')}<table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.users.map(x => `<tr><td>${escapeHtml(x.full_name)}<small>${escapeHtml(x.username)}</small></td><td>${escapeHtml(x.role)}</td><td>${escapeHtml(x.status)}</td><td>${x.status === 'pending' ? `<button onclick="approve(${x.id})">Approve</button>` : ''}${x.role === 'student' ? ` <button class="secondary" onclick="resetDevice(${x.id})">Reset device</button>` : ''}</td></tr>`).join('')}</tbody></table>`); return; }
  } catch (error) { if (error.message === 'Your session has expired. Please sign in again.') { loginView(notice(error.message, 'error')); return; } layout(user, notice(error.message, 'error')); }
}
window.approve = async id => { await api('admin/verify', { user_id: id }); page(JSON.parse(sessionStorage.user), 'users') }; window.resetDevice = async id => { await api('admin/device/reset', { user_id: id }); page(JSON.parse(sessionStorage.user), 'users') };
async function createAttendanceSession(event) { event.preventDefault(); const output = document.querySelector('#token'); const button = event.target.querySelector('button'); button.disabled = true; clearInterval(qrExpiryTimer); try { const r = await api('attendance/create', Object.fromEntries(new FormData(event.target))); const expiresAt = new Date(r.expires_at); const payload = r.qr_payload || `ATTENDQR:${r.token}`; output.innerHTML = `<div class="token"><small>ACTIVE QR TOKEN</small><img id="attendance-qr" alt="Attendance QR code" src="${qrImageUrl(payload)}"><strong>${escapeHtml(r.token)}</strong><p>${escapeHtml(r.class)} · ${escapeHtml(r.subject.code)} — ${escapeHtml(r.subject.name)}</p><p>Expires <time id="qr-expiry" datetime="${expiresAt.toISOString()}">${expiresAt.toLocaleTimeString()}</time></p><p id="qr-countdown"></p><div id="qr-image-error"></div></div>`; document.querySelector('#attendance-qr').onerror = imageEvent => { imageEvent.currentTarget.hidden = true; document.querySelector('#qr-image-error').innerHTML = notice('QR image could not be loaded. Check your internet connection, then use the token shown above.', 'error'); }; const countdown = document.querySelector('#qr-countdown'); const updateCountdown = () => { const remaining = expiresAt.getTime() - Date.now(); if (remaining <= 0) { clearInterval(qrExpiryTimer); countdown.textContent = 'This QR code has expired.'; countdown.className = 'notice error'; return; } countdown.textContent = `Valid for ${Math.ceil(remaining / 1000)} seconds`; }; updateCountdown(); qrExpiryTimer = setInterval(updateCountdown, 1000) } catch (error) { output.innerHTML = notice(error.message, 'error') } finally { button.disabled = false } }
async function submitScan(event) { event.preventDefault(); const form = event.target; const token = form.elements.token.value.trim(); const result = document.querySelector('#result'); if (!token) { result.innerHTML = notice('Enter or scan a QR token first.', 'error'); return; } stopCamera(); const button = form.querySelector('button[type="submit"]'); if (!button) { result.innerHTML = notice('The attendance form is unavailable. Refresh the page and try again.', 'error'); return; } button.disabled = true; try { const r = await api('student/scan', { token }); result.innerHTML = notice(r.message) } catch (error) { result.innerHTML = notice(error.message, 'error') } finally { button.disabled = false } }
function stopCamera() { if (activeCameraStream) { activeCameraStream.getTracks().forEach(track => track.stop()); activeCameraStream = null; } const video = document.querySelector('#preview'); if (video) { video.pause(); video.srcObject = null; video.hidden = true; } }
function decodeQrCanvas(canvas) { if (typeof jsQR !== 'function') return null; const context = canvas.getContext('2d', { willReadFrequently: true }); const frame = context.getImageData(0, 0, canvas.width, canvas.height); return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data || null; }
async function qrCanvasFromFile(file) {
  const canvas = document.createElement('canvas');
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url; });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
async function scanQrPhoto(event) {
  const input = event.target;
  const file = input.files?.[0];
  const result = document.querySelector('#result');
  if (!file) return;
  try {
    const canvas = await qrCanvasFromFile(file);
    const value = decodeQrCanvas(canvas);
    if (!value) throw new Error('No QR code was found in that image. Try again with the QR code filling more of the photo.');
    document.querySelector('#scan [name=token]').value = value;
    document.querySelector('#scan').requestSubmit();
  } catch (error) { result.innerHTML = notice(error.message || 'The selected image could not be read.', 'error'); }
  finally { input.value = ''; }
}
async function startCamera() {
  const result = document.querySelector('#result');
  if (!navigator.mediaDevices?.getUserMedia) {
    result.innerHTML = notice('Live camera access requires HTTPS on this phone. Opening the camera-photo fallback instead.', 'error');
    document.querySelector('#qr-photo-input').click();
    return;
  }
  const hasNativeDetector = 'BarcodeDetector' in window;
  if (!hasNativeDetector && typeof jsQR !== 'function') { result.innerHTML = notice('No QR decoder is available. Refresh the page and try again.', 'error'); return; }
  stopCamera();
  try {
    const video = document.querySelector('#preview');
    activeCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    video.srcObject = activeCameraStream; video.hidden = false; await video.play();
    const detector = hasNativeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas');
    const detect = async () => {
      if (!activeCameraStream) return;
      try {
        let value = null;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (detector) value = (await detector.detect(video))[0]?.rawValue || null;
          else if (video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); value = decodeQrCanvas(canvas); }
          if (value) { document.querySelector('#scan [name=token]').value = value; document.querySelector('#scan').requestSubmit(); return; }
        }
      } catch (error) { stopCamera(); result.innerHTML = notice('The camera could not read the QR code. Try the photo option instead.', 'error'); return; }
      requestAnimationFrame(detect);
    };
    detect();
  } catch (error) { stopCamera(); result.innerHTML = notice('Camera permission was denied or unavailable. Use “Take or choose QR photo” instead.', 'error'); }
}
function start(user) { sessionStorage.user = JSON.stringify(user); page(user); } (async () => { try { const r = await api('me', null, 'GET'); start(r.user) } catch (e) { loginView() } })();
