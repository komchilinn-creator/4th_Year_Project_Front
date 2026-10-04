const teacherApp = document.querySelector('#teacher-app');
const teacherToken = localStorage.getItem('attendqr-token');
let liveTimer;
let qrAttendanceTimer;
let liveCountdownTimer;
let qrCountdownTimer;
let qrAttendanceLatestKey = null;

function teacherEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

const teacherClassChoices = (classes, name) => classes.map((item, index) => `<label class="class-choice"><input type="radio" name="${name}" value="${item.id}" data-academic-year-id="${item.academic_year_id}"${index === 0 ? ' checked' : ''}><span>${teacherEscape(item.name)}</span></label>`).join('');
const teacherSelectedClass = container => container?.querySelector('input[type="radio"]:checked') || null;
const setTeacherClass = (container, value) => {
  const input = [...(container?.querySelectorAll('input[type="radio"]') || [])].find(item => Number(item.value) === Number(value));
  if (input) input.checked = true;
};

async function teacherApi(action, payload, method = 'POST') {
  const base = window.APP_CONFIG?.API_BASE_URL;
  if (!base) throw new Error('API configuration is missing. Load config.js before teacher-attendance.js.');
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
  teacherApp.innerHTML = `<aside><div class="brand"><span class="brand-name">Easy<span>Attend</span></span><img class="brand-logo" src="../../assets/images/ITdepartmentlogo.jpg" alt="Department logo"></div><nav><a href="dashboard.html">Dashboard</a><a href="create-session.html">Create QR session</a><a href="live-attendance.html">Attendance</a><a href="manual-attendance.html">Manual attendance</a><a href="reports.html">Reports</a></nav></aside><section class="workspace">${content}</section>`;
}

function sessionCountdownMarkup(session) {
  if (session.expires_at_timestamp == null) return '<div class="session-countdown"><span>Time Remaining</span><strong>Manual end</strong><small>This legacy session has no automatic expiration.</small></div>';
  const duration = Number(session.duration_minutes);
  const durationText = Number.isFinite(duration) ? `${duration} minute${duration === 1 ? '' : 's'}` : 'Timed session';
  return `<div class="session-countdown" aria-live="polite"><span>Time Remaining</span><strong data-session-countdown>--:--</strong><small>${teacherEscape(durationText)} · Expires ${teacherEscape(teacherAttendanceTime(session.expires_at, true))}</small></div>`;
}

function startSessionCountdown(session, target, onExpire) {
  if (session.expires_at_timestamp == null || session.server_timestamp == null || !target) return null;
  const expiresAt = Number(session.expires_at_timestamp);
  const serverTime = Number(session.server_timestamp);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(serverTime)) return null;
  const receivedAt = performance.now();
  let expirationHandled = false;
  const update = () => {
    const estimatedServerTime = serverTime + ((performance.now() - receivedAt) / 1000);
    const seconds = Math.max(0, Math.ceil(expiresAt - estimatedServerTime));
    const minutes = Math.floor(seconds / 60);
    target.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds === 0 && !expirationHandled) {
      expirationHandled = true;
      Promise.resolve(onExpire?.()).catch(() => {});
    }
  };
  update();
  return setInterval(update, 1000);
}

function closedSessionMarkup(session) {
  const expired = session?.status === 'EXPIRED';
  return `${message(expired ? 'This QR attendance session has expired. Students can no longer submit attendance.' : 'This QR attendance session has ended. Students can no longer submit attendance.', 'error')}<p><span class="status-pill">Session Status: ${teacherEscape(session?.status || 'ENDED')}</span></p><p><a class="button-link" href="create-session.html">Create another QR session</a></p>`;
}

function renderQrDisplay(session, targetId = 'qr-result') {
  const target = document.querySelector(`#${targetId}`);
  if (!target || !session) return;
  if (session.status !== 'ACTIVE' || !session.token) {
    target.innerHTML = session.status === 'EXPIRED' || session.status === 'ENDED'
      ? closedSessionMarkup(session)
      : `${message('The active QR token cannot be restored. End this legacy session and create a new one.', 'error')}<p><span class="status-pill">Session Status: ${teacherEscape(session.status || 'UNKNOWN')}</span></p>`;
    return;
  }
  const payload = session.qr_payload || `ATTENDQR:${session.token}`;
  const context = session.subject ? `${session.class_name || session.class || ''} · ${teacherSubjectText(session.subject)}` : '';
  target.innerHTML = `<div class="qr-session-layout"><div class="teacher-token"><small>ACTIVE QR TOKEN</small><span class="status-pill">Session Status: ACTIVE</span>${sessionCountdownMarkup(session)}<img id="attendance-qr" alt="Attendance QR code" src="${qrImageUrl(payload)}"><strong>${teacherEscape(session.token)}</strong><p>${teacherEscape(session.title || 'Attendance session')}</p>${context ? `<p>${teacherEscape(context)}</p>` : ''}<p>Started ${new Date(session.starts_at).toLocaleString()}</p><div id="qr-image-error"></div><div class="teacher-controls"><a class="button-link secondary" href="live-attendance.html">View attendance</a><button class="danger" type="button" data-end-session>End QR Session</button></div><div data-end-result></div></div><section class="qr-attendance-popup" id="qr-attendance-popup" aria-live="polite"><div class="qr-attendance-popup__header"><span><i></i>Recent check-ins</span><small id="qr-popup-count">0 present</small></div><div class="qr-attendance-popup__rows" id="qr-popup-rows"><p class="qr-attendance-popup__empty">Waiting for students…</p></div></section></div>`;
  clearInterval(qrCountdownTimer);
  qrCountdownTimer = startSessionCountdown(session, target.querySelector('[data-session-countdown]'), async () => {
    const data = await teacherApi('attendance/live', { session_id: session.id || session.session_id }, 'GET');
    if (data.session?.status !== 'ACTIVE' && document.querySelector(`#${targetId}`) === target) {
      clearInterval(qrAttendanceTimer);
      target.innerHTML = closedSessionMarkup(data.session);
    }
  });
  document.querySelector('#attendance-qr').onerror = event => {
    event.currentTarget.hidden = true;
    document.querySelector('#qr-image-error').innerHTML = message('QR image could not be loaded. Check your internet connection, then use the token shown above.', 'error');
  };
  document.querySelector('[data-end-session]').onclick = async event => {
    if (!confirm('Are you sure you want to end this QR attendance session? Students will no longer be able to submit attendance.')) return;
    event.currentTarget.disabled = true;
    try {
      const data = await teacherApi('attendance/end', { session_id: session.id || session.session_id });
      clearInterval(qrAttendanceTimer);
      clearInterval(qrCountdownTimer);
      target.innerHTML = `${message(data.message)}<p><span class="status-pill">Session Status: ENDED</span></p><p><a class="button-link" href="create-session.html">Create another QR session</a></p>`;
    } catch (error) {
      event.currentTarget.disabled = false;
      document.querySelector('[data-end-result]').innerHTML = message(error.message, 'error');
    }
  };
  startQrAttendancePopup(session);
}

const teacherSubjectCode = subject => subject.code || 'No code';
const teacherSubjectText = subject => `${teacherSubjectCode(subject)} — ${subject.name}`;

function renderQrAttendancePopup(data) {
  const target = document.querySelector('#qr-popup-rows');
  const count = document.querySelector('#qr-popup-count');
  if (!target || !count) return;
  const rows = data.attendance || [];
  const nextKey = rows[0] ? `${rows[0].student_no}|${rows[0].recorded_at}` : null;
  const highlightFirst = Boolean(qrAttendanceLatestKey && nextKey && nextKey !== qrAttendanceLatestKey);
  count.textContent = `${Number(data.present_students || 0)} present`;
  target.innerHTML = rows.length ? rows.map((student, index) => `<div class="qr-attendance-notification${highlightFirst && index === 0 ? ' is-new' : ''}"><span class="qr-attendance-notification__icon">✓</span><span><strong>${teacherEscape(student.full_name)}</strong><small>${teacherEscape(student.student_no)}</small></span><time>${new Date(student.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('') : '<p class="qr-attendance-popup__empty">Waiting for students…</p>';
  qrAttendanceLatestKey = nextKey;
}

async function startQrAttendancePopup(session) {
  clearInterval(qrAttendanceTimer);
  qrAttendanceLatestKey = null;
  const refresh = async () => {
    const popup = document.querySelector('#qr-attendance-popup');
    if (!popup) { clearInterval(qrAttendanceTimer); return false; }
    try {
      const data = await teacherApi('attendance/live', { session_id: session.id || session.session_id }, 'GET');
      if (!document.querySelector('#qr-attendance-popup')) return;
      renderQrAttendancePopup(data);
      if (data.session?.status !== 'ACTIVE') {
        clearInterval(qrAttendanceTimer);
        popup.classList.add('is-ended');
        return false;
      }
      return true;
    } catch (error) {
      const rows = document.querySelector('#qr-popup-rows');
      if (rows) rows.innerHTML = `<p class="qr-attendance-popup__empty">${teacherEscape(error.message)}</p>`;
      return true;
    }
  };
  if (await refresh()) qrAttendanceTimer = setInterval(refresh, 2000);
}

async function createSession(user) {
  const active = await teacherApi('attendance/active', null, 'GET');
  if (active.session) {
    render(`<header><span class="eyebrow">Teacher</span><h1>QR session</h1></header><div class="card qr-display-card"><div id="qr-result"></div></div>`);
    renderQrDisplay(active.session);
    return;
  }
  const subjects = user.subjects || [];
  const classes = [...new Map(subjects.map(subject => [subject.class_id, { id: subject.class_id, name: subject.class_name, academic_year_id: subject.academic_year_id }])).values()];
  render(`<header><span class="eyebrow">Teacher</span><h1>Create QR session</h1></header><div class="card"><p class="notice">Choose how long students can use the QR code. You can still end the session early at any time.</p><form id="session-form"><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="teacher-classes">${teacherClassChoices(classes, 'teacher_class_id')}</div></fieldset><label>Semester<select id="teacher-semester" required></select></label><label>Subject<select name="teacher_subject_id" id="teacher-subject" required></select></label><label>Session title<input name="title" value="Class attendance" required></label><label>Session duration<select name="duration_minutes" required>${Array.from({ length: 15 }, (_, index) => `<option value="${index + 1}"${index === 4 ? ' selected' : ''}>${index + 1} minute${index ? 's' : ''}</option>`).join('')}</select><small class="field-help">The QR code expires automatically after 1–15 minutes.</small></label><button${subjects.length ? '' : ' disabled'}>Generate QR</button></form><div id="qr-result"></div></div>`);
  const classChoicesRoot = document.querySelector('#teacher-classes');
  const semester = document.querySelector('#teacher-semester');
  const subject = document.querySelector('#teacher-subject');
  const updateSubjects = () => {
    const classId = teacherSelectedClass(classChoicesRoot)?.value;
    const available = subjects.filter(item => Number(item.class_id) === Number(classId) && Number(item.semester_id) === Number(semester.value));
    subject.innerHTML = available.map(item => `<option value="${item.assignment_id}">${teacherEscape(teacherSubjectText(item))}</option>`).join('');
  };
  const updateSemesters = () => {
    const classId = teacherSelectedClass(classChoicesRoot)?.value;
    const available = [...new Map(subjects.filter(item => Number(item.class_id) === Number(classId)).map(item => [item.semester_id, item])).values()];
    semester.innerHTML = available.map(item => `<option value="${item.semester_id}">${teacherEscape(item.semester_name)}</option>`).join('');
    updateSubjects();
  };
  classChoicesRoot.onchange = updateSemesters;
  semester.onchange = updateSubjects;
  updateSemesters();
  document.querySelector('#session-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const result = document.querySelector('#qr-result');
    button.disabled = true;
    try {
      const formData = Object.fromEntries(new FormData(event.target));
      await teacherApi('attendance/create', formData);
      await createSession(user);
    } catch (error) {
      result.innerHTML = message(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };
}

function teacherAttendanceDate(value) {
  return new Date(String(value || '').replace(' ', 'T'));
}

function teacherAttendanceTime(value, seconds = false) {
  if (!value) return '—';
  return teacherAttendanceDate(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}

function teacherAttendanceSessionList(sessions) {
  if (!sessions.length) return '<div class="empty-state">No attendance sessions for this subject.</div>';
  const groups = new Map();
  sessions.forEach(session => {
    const date = teacherAttendanceDate(session.starts_at);
    const month = date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(session);
  });
  return [...groups.entries()].map(([month, items]) => `<section class="attendance-month"><h3>${teacherEscape(month)}</h3>${items.map(session => { const date = teacherAttendanceDate(session.starts_at); const active = session.status === 'ACTIVE'; return `<button type="button" class="attendance-session-item${active ? ' is-live' : ''}" data-session-id="${session.id}"><span class="attendance-session-date">${active ? '<i class="attendance-live-dot" aria-label="Live"></i>' : ''}<strong>${teacherEscape(date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))}</strong></span><span>${teacherEscape(teacherAttendanceTime(session.starts_at))} – ${active ? '<b>LIVE</b>' : teacherEscape(teacherAttendanceTime(session.ends_at))}</span><small>${teacherEscape(session.class_name || 'Class not specified')} · ${active ? 'Active' : teacherEscape(session.status === 'EXPIRED' ? 'Expired' : 'Ended')}</small></button>`; }).join('')}</section>`).join('');
}

function teacherAttendanceDetails(data) {
  const session = data.session;
  const active = session.status === 'ACTIVE';
  const start = teacherAttendanceDate(session.starts_at);
  const rows = data.attendance || [];
  return `<div class="attendance-detail-heading"><div><span class="eyebrow">Selected session</span><h2 id="attendance-modal-title">${active ? '<i class="attendance-live-dot" aria-label="Live"></i>' : ''}${teacherEscape(start.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }))}</h2><p>${teacherEscape(teacherAttendanceTime(session.starts_at))} – ${active ? '<strong>LIVE</strong>' : teacherEscape(teacherAttendanceTime(session.ends_at))} · ${teacherEscape(session.class_name || 'Class not specified')}</p></div><span class="status-pill">${teacherEscape(session.status)}</span></div>${active ? `${sessionCountdownMarkup(session)}<div class="teacher-controls attendance-live-controls"><button class="danger" type="button" data-live-end-session>End Session</button></div><div data-live-end-result></div>` : (session.status === 'EXPIRED' ? message('Session expired. This QR code can no longer accept attendance.', 'error') : '')}<div class="attendance-detail-summary"><strong>${Number(data.present_students || 0)}</strong><span>QR submissions</span></div>${active ? '<p class="field-help">Showing the latest 3 submissions. This list updates automatically.</p>' : '<p class="field-help">Showing every student who submitted attendance for this session.</p>'}<div class="table-responsive"><table><thead><tr><th>Student Name</th><th>Roll No.</th><th>Submitted</th></tr></thead><tbody>${rows.map(item => `<tr><td>${teacherEscape(item.full_name)}</td><td>${teacherEscape(item.student_no)}</td><td>${teacherEscape(teacherAttendanceTime(item.recorded_at, true))}</td></tr>`).join('') || '<tr><td colspan="3">No students submitted attendance for this session.</td></tr>'}</tbody></table></div>`;
}

async function attendancePage(user) {
  const subjects = user.subjects || [];
  const classes = [...new Map(subjects.map(subject => [subject.class_id, { id: subject.class_id, name: subject.class_name, academic_year_id: subject.academic_year_id }])).values()];
  render(`<header><span class="eyebrow">Teacher</span><h1>Attendance</h1></header><div class="card attendance-subject-filter"><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="attendance-classes">${teacherClassChoices(classes, 'attendance_class_id')}</div></fieldset><label>Semester<select id="attendance-semester"${subjects.length ? '' : ' disabled'}></select></label><label>Subject<select id="attendance-subject"${subjects.length ? '' : ' disabled'}></select></label></div><section class="card attendance-session-pane attendance-session-pane--wide"><h2>Attendance Sessions</h2><div id="attendance-session-list"></div></section><div class="attendance-modal" id="attendance-modal" hidden><button class="attendance-modal__backdrop" type="button" data-close-attendance aria-label="Close attendance details"></button><section class="attendance-modal__window" role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title"><button class="attendance-modal__close" type="button" data-close-attendance aria-label="Close attendance details">×</button><div class="attendance-detail-pane" id="attendance-detail"><div class="empty-state">Loading attendance…</div></div></section></div>`);
  if (!subjects.length) {
    document.querySelector('#attendance-session-list').innerHTML = '<div class="empty-state">No subjects are assigned to this teacher account.</div>';
    return;
  }

  const classChoicesRoot = document.querySelector('#attendance-classes');
  const semesterSelect = document.querySelector('#attendance-semester');
  const subjectSelect = document.querySelector('#attendance-subject');
  const sessionList = document.querySelector('#attendance-session-list');
  const detail = document.querySelector('#attendance-detail');
  const modal = document.querySelector('#attendance-modal');
  let selectedSessionId = null;
  let requestSequence = 0;
  let listRequestSequence = 0;

  const closeModal = () => {
    clearInterval(liveTimer);
    clearInterval(liveCountdownTimer);
    requestSequence++;
    selectedSessionId = null;
    modal.hidden = true;
    document.body.classList.remove('attendance-modal-open');
    document.querySelectorAll('.attendance-session-item').forEach(item => item.classList.remove('is-selected'));
  };
  modal.querySelectorAll('[data-close-attendance]').forEach(button => button.onclick = closeModal);

  const loadDetail = async sessionId => {
    const sequence = ++requestSequence;
    const data = await teacherApi('attendance/session', { session_id: sessionId }, 'GET');
    if (sequence !== requestSequence || !document.querySelector('#attendance-detail')) return null;
    clearInterval(liveCountdownTimer);
    detail.innerHTML = teacherAttendanceDetails(data);
    if (data.session?.status === 'ACTIVE') {
      liveCountdownTimer = startSessionCountdown(data.session, detail.querySelector('[data-session-countdown]'), async () => {
        const update = await loadDetail(sessionId);
        if (update?.session?.status !== 'ACTIVE') {
          clearInterval(liveTimer);
          await loadSessions(true);
        }
      });
      const endButton = detail.querySelector('[data-live-end-session]');
      endButton.onclick = async () => {
        if (!confirm('Are you sure you want to end this QR attendance session? Students will no longer be able to submit attendance.')) return;
        endButton.disabled = true;
        try {
          await teacherApi('attendance/end', { session_id: data.session.id || data.session.session_id });
          clearInterval(liveTimer);
          clearInterval(liveCountdownTimer);
          await loadDetail(sessionId);
          await loadSessions(true);
        } catch (error) {
          endButton.disabled = false;
          detail.querySelector('[data-live-end-result]').innerHTML = message(error.message, 'error');
        }
      };
    }
    document.querySelectorAll('.attendance-session-item').forEach(item => item.classList.toggle('is-selected', Number(item.dataset.sessionId) === Number(sessionId)));
    return data;
  };

  const selectSession = async sessionId => {
    clearInterval(liveTimer);
    selectedSessionId = Number(sessionId);
    modal.hidden = false;
    document.body.classList.add('attendance-modal-open');
    detail.innerHTML = '<div class="empty-state">Loading attendance…</div>';
    try {
      const data = await loadDetail(selectedSessionId);
      if (data?.session?.status === 'ACTIVE') {
        liveTimer = setInterval(async () => {
          if (!document.querySelector('#attendance-detail')) { clearInterval(liveTimer); return; }
          try {
            const update = await loadDetail(selectedSessionId);
            if (update?.session?.status !== 'ACTIVE') {
              clearInterval(liveTimer);
              await loadSessions(true);
            }
          } catch (error) { detail.innerHTML = message(error.message, 'error'); }
        }, 2000);
      }
    } catch (error) { detail.innerHTML = message(error.message, 'error'); }
  };

  const loadSessions = async keepModalOpen => {
    const sequence = ++listRequestSequence;
    clearInterval(liveTimer);
    if (!keepModalOpen) clearInterval(liveCountdownTimer);
    sessionList.innerHTML = '<div class="empty-state">Loading sessions…</div>';
    if (!keepModalOpen) closeModal();
    try {
      const data = await teacherApi('attendance/sessions', { teacher_subject_id: subjectSelect.value }, 'GET');
      if (sequence !== listRequestSequence) return;
      sessionList.innerHTML = teacherAttendanceSessionList(data.sessions || []);
      document.querySelectorAll('.attendance-session-item').forEach(item => item.onclick = () => selectSession(item.dataset.sessionId));
      if (keepModalOpen && selectedSessionId) document.querySelector(`[data-session-id="${selectedSessionId}"]`)?.classList.add('is-selected');
    } catch (error) { sessionList.innerHTML = message(error.message, 'error'); }
  };

  const updateSubjects = () => {
    const classId = teacherSelectedClass(classChoicesRoot)?.value;
    const available = subjects.filter(subject => Number(subject.class_id) === Number(classId) && Number(subject.semester_id) === Number(semesterSelect.value));
    subjectSelect.innerHTML = available.map(subject => `<option value="${subject.assignment_id}">${teacherEscape(teacherSubjectText(subject))}</option>`).join('');
    loadSessions(false);
  };
  const updateSemesters = () => {
    const classId = teacherSelectedClass(classChoicesRoot)?.value;
    const available = [...new Map(subjects.filter(subject => Number(subject.class_id) === Number(classId)).map(subject => [subject.semester_id, subject])).values()];
    semesterSelect.innerHTML = available.map(subject => `<option value="${subject.semester_id}">${teacherEscape(subject.semester_name)}</option>`).join('');
    updateSubjects();
  };
  classChoicesRoot.onchange = updateSemesters;
  semesterSelect.onchange = updateSubjects;
  subjectSelect.onchange = () => loadSessions(false);
  let activeSession = null;
  try {
    const active = await teacherApi('attendance/active', null, 'GET');
    if (active.session) {
      activeSession = active.session;
      const selected = subjects.find(subject => Number(subject.assignment_id) === Number(active.session.teacher_subject_id));
      if (selected) {
        setTeacherClass(classChoicesRoot, selected.class_id);
        updateSemesters();
        semesterSelect.value = String(selected.semester_id);
        updateSubjects();
        subjectSelect.value = String(selected.assignment_id);
      }
    }
  } catch (error) { /* Session history remains available when there is no active session. */ }
  if (!subjectSelect.options.length) updateSemesters();
  await loadSessions(false);
  if (activeSession) await selectSession(activeSession.id || activeSession.session_id);
}

function manualAttendance() {
  render(`<header><span class="eyebrow">Teacher</span><h1>Manual attendance</h1></header><div class="card"><form id="manual-form"><label>Session ID<input name="session_id" type="number" min="1" required></label><label>Student ID<input name="student_id" type="number" min="1" required></label><label>Status<select name="status"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></label><button>Record attendance</button></form><div id="manual-result"></div></div>`);
  document.querySelector('#manual-form').onsubmit = async event => {
    event.preventDefault();
    try { const data = await teacherApi('attendance/manual', Object.fromEntries(new FormData(event.target))); document.querySelector('#manual-result').innerHTML = message(data.message || 'Attendance recorded.'); event.target.reset(); }
    catch (error) { document.querySelector('#manual-result').innerHTML = message(error.message, 'error'); }
  };
}

async function qrDisplay() {
  const data = await teacherApi('attendance/active', null, 'GET');
  const session = data.session;
  render(`<header><span class="eyebrow">Teacher</span><h1>Display QR code</h1></header><div class="card qr-display-card"><div id="qr-display-result"></div></div>`);
  if (!session) { document.querySelector('#qr-display-result').innerHTML = message('No QR session is available. Create a session first.', 'error'); return; }
  renderQrDisplay(session, 'qr-display-result');
}

async function reportsForTeacher(user) {
  const subjects = user.subjects || [];
  const classes = [...new Map(subjects.map(subject => [subject.class_id, { id: subject.class_id, name: subject.class_name, academic_year_id: subject.academic_year_id }])).values()];
  render(`<header><span class="eyebrow">Teacher</span><h1>Attendance reports</h1></header><div class="card"><form id="teacher-report-filter"><label>Month<input name="month" type="month" value="${new Date().toISOString().slice(0, 7)}" required></label><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="report-classes">${teacherClassChoices(classes, 'report_class_id')}</div></fieldset><label>Semester<select id="report-semester"></select></label><label>Subject<select name="teacher_subject_id" id="report-subject"></select></label><button>View report</button></form></div><div id="report-result"></div>`);
  const classChoicesRoot = document.querySelector('#report-classes'); const semester = document.querySelector('#report-semester'); const subject = document.querySelector('#report-subject');
  const updateSubjects = () => { const classId = teacherSelectedClass(classChoicesRoot)?.value; subject.innerHTML = subjects.filter(item => Number(item.class_id) === Number(classId) && Number(item.semester_id) === Number(semester.value)).map(item => `<option value="${item.assignment_id}">${teacherEscape(teacherSubjectText(item))}</option>`).join(''); };
  const updateSemesters = () => { const classId = teacherSelectedClass(classChoicesRoot)?.value; const available = [...new Map(subjects.filter(item => Number(item.class_id) === Number(classId)).map(item => [item.semester_id, item])).values()]; semester.innerHTML = available.map(item => `<option value="${item.semester_id}">${teacherEscape(item.semester_name)}</option>`).join(''); updateSubjects(); };
  classChoicesRoot.onchange = updateSemesters; semester.onchange = updateSubjects; updateSemesters();
  const load = async () => {
    try {
      const data = await teacherApi('reports/monthly', Object.fromEntries(new FormData(document.querySelector('#teacher-report-filter'))), 'GET');
      document.querySelector('#report-result').innerHTML = `<div class="card"><div class="table-responsive"><table><thead><tr><th>Student</th><th>Number</th><th>Attended</th><th>Total sessions</th><th>Percentage</th><th>Status</th></tr></thead><tbody>${data.report.map(item => `<tr class="${item.highlight_red === true ? 'report-student-highlight' : ''}"><td>${teacherEscape(item.full_name)}</td><td>${teacherEscape(item.student_no)}</td><td>${teacherEscape(item.attended)}</td><td>${teacherEscape(item.total_sessions)}</td><td>${teacherEscape(item.percentage)}%</td><td>${teacherEscape(item.status)}</td></tr>`).join('') || '<tr><td colspan="6">No attendance data.</td></tr>'}</tbody></table></div></div>`;
    } catch (error) { document.querySelector('#report-result').innerHTML = message(error.message, 'error'); }
  };
  document.querySelector('#teacher-report-filter').onsubmit = event => { event.preventDefault(); load(); };
  if (subjects.length) await load();
}

async function reports() {
  render(`<header><span class="eyebrow">Teacher</span><h1>Attendance reports</h1></header><div id="report-result"></div>`);
  try {
    const data = await teacherApi('reports/monthly', null, 'GET');
    document.querySelector('#report-result').innerHTML = `<div class="card"><div class="table-responsive"><table><thead><tr><th>Student</th><th>Number</th><th>Attended</th><th>Total sessions</th><th>Percentage</th><th>Semester percentage</th></tr></thead><tbody>${data.report.map(item => `<tr class="${item.highlight_red === true ? 'report-student-highlight' : ''}"><td>${teacherEscape(item.full_name)}</td><td>${teacherEscape(item.student_no)}</td><td>${teacherEscape(item.attended)}</td><td>${teacherEscape(item.total_sessions ?? '—')}</td><td>${item.percentage == null ? '—' : `${teacherEscape(item.percentage)}%`}</td><td>${item.semester_percentage == null ? '—' : `${teacherEscape(item.semester_percentage)}%`}</td></tr>`).join('') || '<tr><td colspan="6">No attendance data.</td></tr>'}</tbody></table></div></div>`;
  } catch (error) { document.querySelector('#report-result').innerHTML = message(error.message, 'error'); }
}

async function initTeacherPage() {
  if (!teacherToken) { render(`${message('Please sign in before opening teacher attendance pages.', 'error')}<p><a href="../../index.html">Return to sign in</a></p>`); return; }
  try {
    const user = await teacherApi('me', null, 'GET');
    if (user.user?.role !== 'teacher') { render(message('Teacher access is required.', 'error')); return; }
    const page = document.body.dataset.teacherPage;
    if (page === 'create') await createSession(user.user);
    if (page === 'qr-display') await qrDisplay();
    if (page === 'live') await attendancePage(user.user);
    if (page === 'manual') manualAttendance();
    if (page === 'reports') await reportsForTeacher(user.user);
  } catch (error) { render(message(error.message, 'error')); }
}

initTeacherPage();
