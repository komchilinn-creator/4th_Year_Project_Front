const root = document.getElementById('app');
let activeCameraStream = null;
let teacherLiveTimer = null;
let teacherQrTimer = null;
let teacherQrLatestKey = null;
let currentPage = 'home';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const notice = (message, type = 'success') => `<p class="notice ${type}">${escapeHtml(message)}</p>`;
const qrImageUrl = (payload, size = 220) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=svg&data=${encodeURIComponent(payload)}`;
const subjectCode = subject => subject.code || 'No code';
const subjectText = subject => `${subjectCode(subject)} — ${subject.name}`;
function loginView(message = '') {
  root.innerHTML = `<section class="auth-page auth-focused"><div class="auth-box auth-simple"><div class="auth-panel"><h2>Sign in</h2>${message}<form id="login"><label>Username<input name="username" required></label><label>Password<input type="password" name="password" required></label><button>Log in</button></form><div class="auth-switch"><span>New user?</span><button class="secondary" id="switch-to-signup">Sign up</button></div></div></div></section>`;
  document.querySelector('#login').onsubmit = login;
  document.querySelector('#switch-to-signup').onclick = () => signupView();
}
async function signupView(message = '') {
  let catalog = { academic_years: [], semesters: [], classes: [], subjects: [] };
  try { catalog = await api('registration/subjects', null, 'GET'); } catch (error) { message += notice(error.message, 'error'); }
  const years = catalog.academic_years || [];
  const semesters = catalog.semesters || [];
  const classes = catalog.classes || [];
  const subjects = catalog.subjects || [];
  root.innerHTML = `<section class="auth-page auth-focused"><div class="auth-box auth-simple"><div class="auth-panel"><h2>Create your account</h2>${message}<form id="register"><label>Full name<input name="full_name" required></label><label>Username<input name="username" required></label><label>Password<input type="password" name="password" minlength="6" required></label><label>Role<select name="role" id="registration-role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label id="registration-identifier-field">Student number<input name="identifier" placeholder="e.g. 4IT15" autocomplete="off"></label><label>Academic year<select name="academic_year_id" id="registration-year" required>${years.map(year => `<option value="${year.id}">${escapeHtml(year.name)}</option>`).join('')}</select></label><label>Semester<select name="semester_id" id="registration-semester" required></select></label><label id="registration-class-field">Class<select name="class_id" id="registration-class" required></select></label><div id="class-validation" aria-live="polite"></div><fieldset id="student-subject-field"><legend>Subjects in your semester</legend><div class="check-list" id="student-subject-list"></div></fieldset><fieldset id="teacher-subject-field" hidden><legend>Subjects taught</legend><p class="field-help">Only subjects from the selected academic year and semester are available.</p><div class="check-list" id="teacher-subject-list"></div></fieldset><button>Register</button></form><div class="auth-switch"><span>Already have an account?</span><button class="secondary" id="switch-to-login">Sign in</button></div></div></div></section>`;
  const role = document.querySelector('#registration-role');
  const identifierField = document.querySelector('#registration-identifier-field');
  const identifier = identifierField.querySelector('input');
  const classField = document.querySelector('#registration-class-field');
  const classSelect = document.querySelector('#registration-class');
  const yearSelect = document.querySelector('#registration-year');
  const semesterSelect = document.querySelector('#registration-semester');
  const validation = document.querySelector('#class-validation');
  const studentSubjectField = document.querySelector('#student-subject-field');
  const studentSubjectList = document.querySelector('#student-subject-list');
  const subjectField = document.querySelector('#teacher-subject-field');
  const subjectList = document.querySelector('#teacher-subject-list');
  const updateSubjects = () => {
    const available = subjects.filter(subject => Number(subject.academic_year_id) === Number(yearSelect.value) && Number(subject.semester_id) === Number(semesterSelect.value));
    if (role.value === 'teacher') {
      subjectList.innerHTML = available.length ? available.map(subject => `<label class="check-option"><input type="checkbox" name="subject_ids" value="${subject.id}"><span><strong>${escapeHtml(subjectCode(subject))}</strong> — ${escapeHtml(subject.name)}</span></label>`).join('') : '<p class="field-help">No subjects are configured for this semester. The term can still be saved.</p>';
      validation.innerHTML = `<p class="notice">${available.length} subject${available.length === 1 ? '' : 's'} available.</p>`;
    } else {
      studentSubjectList.innerHTML = available.length ? available.map(subject => `<div class="check-option"><span><strong>${escapeHtml(subjectCode(subject))}</strong> — ${escapeHtml(subject.name)}</span></div>`).join('') : '<p class="field-help">No subjects are configured for this semester.</p>';
    }
  };
  const updateTermOptions = () => {
    const semesterId = semesterSelect.value;
    semesterSelect.innerHTML = semesters.filter(semester => Number(semester.academic_year_id) === Number(yearSelect.value)).map(semester => `<option value="${semester.id}">${escapeHtml(semester.name)}</option>`).join('');
    if ([...semesterSelect.options].some(option => option.value === semesterId)) semesterSelect.value = semesterId;
    const classId = classSelect.value;
    classSelect.innerHTML = classes.filter(item => Number(item.academic_year_id) === Number(yearSelect.value)).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    if ([...classSelect.options].some(option => option.value === classId)) classSelect.value = classId;
    updateSubjects();
  };
  const updateStudentNumber = () => {
    if (role.value !== 'student') return;
    identifier.value = identifier.value.toUpperCase().replace(/\s+/g, '');
    const match = identifier.value.match(/^([1-9])IT[0-9]+$/);
    if (!identifier.value) { validation.innerHTML = '<p class="field-help">Your student number determines your academic year.</p>'; return; }
    if (!match) { validation.innerHTML = notice('Use a student roll number such as 4IT15.', 'error'); return; }
    const matchingYear = years.find(year => Number(year.year_level) === Number(match[1]));
    if (matchingYear) { yearSelect.value = String(matchingYear.id); updateTermOptions(); }
    validation.innerHTML = `<p class="notice">Student number ${escapeHtml(identifier.value)} belongs to ${match[1]}IT. Semester is stored separately.</p>`;
  };
  const updateRole = () => {
    const teacher = role.value === 'teacher';
    identifierField.hidden = teacher;
    identifier.disabled = teacher;
    identifier.required = !teacher;
    identifier.pattern = '[1-9]IT[0-9]+';
    classField.hidden = !teacher;
    classSelect.disabled = !teacher;
    classSelect.required = teacher;
    subjectField.hidden = !teacher;
    studentSubjectField.hidden = teacher;
    validation.innerHTML = teacher ? '<p class="field-help">Choose a year and semester to see valid subjects.</p>' : '<p class="field-help">Your student number determines your academic year; semester is selected separately.</p>';
    updateTermOptions();
    if (!teacher) updateStudentNumber();
  };
  document.querySelector('#register').onsubmit = event => {
    const available = subjects.filter(subject => Number(subject.academic_year_id) === Number(yearSelect.value) && Number(subject.semester_id) === Number(semesterSelect.value));
    if (role.value === 'teacher' && available.length && !document.querySelector('input[name="subject_ids"]:checked')) {
      event.preventDefault();
      validation.innerHTML = notice('Select at least one subject you teach.', 'error');
      return;
    }
    register(event);
  };
  role.onchange = updateRole;
  identifier.oninput = updateStudentNumber;
  yearSelect.onchange = updateTermOptions;
  semesterSelect.onchange = updateSubjects;
  updateRole();
  document.querySelector('#switch-to-login').onclick = () => loginView();
}
async function login(event) { event.preventDefault(); const f = Object.fromEntries(new FormData(event.target)); try { const r = await api('login', { ...f, device_uuid: deviceUuid }); localStorage.setItem('attendqr-token', r.token); start(r.user); } catch (e) { loginView(notice(e.message, 'error')); } }
async function register(event) { event.preventDefault(); const formData = new FormData(event.target); const payload = Object.fromEntries(formData); payload.subject_ids = formData.getAll('subject_ids'); try { const r = await api('register', payload); loginView(notice(r.message, 'success')); } catch (e) { signupView(notice(e.message, 'error')); } }
function layout(user, content) { root.innerHTML = `<aside><div class="brand">Easy<span>Attend</span></div><p>${escapeHtml(user.full_name)}</p><small>${escapeHtml(user.role)}</small><nav><button data-page="home">Dashboard</button>${user.role === 'student' ? '<button data-page="scan">Scan QR</button><button data-page="report">Monthly attendance</button><button data-page="attendance">Attendance history</button><button data-page="schedule">Schedule</button>' : ''}${user.role === 'teacher' ? '<button data-page="create">Create QR session</button><button data-page="live">Attendance</button><button data-page="report">Reports</button><button data-page="academic">Academic assignments</button>' : ''}${user.role === 'admin' ? '<button data-page="users">Users</button><button data-page="subjects">Subjects</button>' : ''}<button id="logout">Log out</button></nav></aside><section class="workspace">${content}</section>`; document.querySelector(`[data-page="${currentPage}"]`)?.setAttribute('aria-current', 'page'); document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => page(user, b.dataset.page)); document.querySelector('#logout').onclick = async () => { clearInterval(teacherLiveTimer); clearInterval(teacherQrTimer); await api('logout', {}); localStorage.removeItem('attendqr-token'); sessionStorage.removeItem('user'); loginView(); }; }
const title = (heading, body = '') => `<header><span class="eyebrow">${escapeHtml(body)}</span><h1>${escapeHtml(heading)}</h1></header>`;
const ordinalSuffix = value => (value % 100 >= 11 && value % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[value % 10] || 'th';
const yearLabel = value => `${value}${ordinalSuffix(Number(value))} Year`;
const subjectOptions = (subjects, year, semesterId = null) => subjects.filter(subject => Number(subject.year_level) === Number(year) && (!semesterId || Number(subject.semester_id) === Number(semesterId))).map(subject => `<option value="${subject.assignment_id || subject.id}">${escapeHtml(subjectText(subject))}</option>`).join('');

function teacherSessionMarkup(session) {
  if (!session.token) return `${notice('The active QR token cannot be restored. End this legacy session and create a new one.', 'error')}<p><span class="status-pill">Session Status: ${escapeHtml(session.status)}</span></p><button class="danger" id="end-qr-session" type="button">End QR Session</button><div id="end-session-result"></div>`;
  const payload = session.qr_payload || `ATTENDQR:${session.token}`;
  return `<div class="qr-session-layout"><div class="teacher-token"><small>ACTIVE QR TOKEN</small><span class="status-pill">Session Status: ACTIVE</span><img id="attendance-qr" alt="Attendance QR code" src="${qrImageUrl(payload, 320)}"><strong>${escapeHtml(session.token)}</strong><p>${escapeHtml(session.title)}</p><p>${escapeHtml(session.class_name)} · ${escapeHtml(subjectText(session.subject))}</p><p>Started ${new Date(session.starts_at).toLocaleString()}</p><div id="qr-image-error"></div><div class="teacher-controls"><button class="secondary" id="open-live-attendance" type="button">View attendance</button><button class="danger" id="end-qr-session" type="button">End QR Session</button></div><div id="end-session-result"></div></div><section class="qr-attendance-popup" id="qr-attendance-popup" aria-live="polite"><div class="qr-attendance-popup__header"><span><i></i>Recent check-ins</span><small id="qr-popup-count">0 present</small></div><div class="qr-attendance-popup__rows" id="qr-popup-rows"><p class="qr-attendance-popup__empty">Waiting for students…</p></div></section></div>`;
}

function renderTeacherQrPopup(data) {
  const target = document.querySelector('#qr-popup-rows');
  const count = document.querySelector('#qr-popup-count');
  if (!target || !count) return;
  const rows = data.attendance || [];
  const nextKey = rows[0] ? `${rows[0].student_no}|${rows[0].recorded_at}` : null;
  const highlightFirst = Boolean(teacherQrLatestKey && nextKey && nextKey !== teacherQrLatestKey);
  count.textContent = `${Number(data.present_students || 0)} present`;
  target.innerHTML = rows.length ? rows.map((student, index) => `<div class="qr-attendance-notification${highlightFirst && index === 0 ? ' is-new' : ''}"><span class="qr-attendance-notification__icon">✓</span><span><strong>${escapeHtml(student.full_name)}</strong><small>${escapeHtml(student.student_no)}</small></span><time>${new Date(student.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('') : '<p class="qr-attendance-popup__empty">Waiting for students…</p>';
  teacherQrLatestKey = nextKey;
}

async function startTeacherQrPopup(session) {
  clearInterval(teacherQrTimer);
  teacherQrLatestKey = null;
  const refresh = async () => {
    const target = document.querySelector('#qr-attendance-popup');
    if (currentPage !== 'create' || !target) { clearInterval(teacherQrTimer); return false; }
    try {
      const data = await api('attendance/live', { session_id: session.id || session.session_id }, 'GET');
      if (!document.querySelector('#qr-attendance-popup')) return;
      renderTeacherQrPopup(data);
      if (data.session?.status !== 'ACTIVE') {
        clearInterval(teacherQrTimer);
        target.classList.add('is-ended');
        return false;
      }
      return true;
    } catch (error) {
      const rows = document.querySelector('#qr-popup-rows');
      if (rows) rows.innerHTML = `<p class="qr-attendance-popup__empty">${escapeHtml(error.message)}</p>`;
      return true;
    }
  };
  if (await refresh()) teacherQrTimer = setInterval(refresh, 2000);
}

function bindTeacherSession(user, session) {
  startTeacherQrPopup(session);
  const image = document.querySelector('#attendance-qr');
  if (image) image.onerror = event => { event.currentTarget.hidden = true; document.querySelector('#qr-image-error').innerHTML = notice('QR image could not be loaded. Check your internet connection, then use the token shown above.', 'error'); };
  const liveButton = document.querySelector('#open-live-attendance');
  if (liveButton) liveButton.onclick = () => page(user, 'live');
  document.querySelector('#end-qr-session').onclick = async event => {
    if (!confirm('Are you sure you want to end this QR attendance session? Students will no longer be able to submit attendance.')) return;
    event.currentTarget.disabled = true;
    try {
      const response = await api('attendance/end', { session_id: session.id || session.session_id });
      clearInterval(teacherQrTimer);
      layout(user, `${title('QR session', 'Teacher')}<div class="card qr-display-card">${notice(response.message)}<p><span class="status-pill">Session Status: ENDED</span></p><button id="new-qr-session" type="button">Create another QR session</button></div>`);
      document.querySelector('#new-qr-session').onclick = () => teacherCreatePage(user);
    } catch (error) {
      event.currentTarget.disabled = false;
      document.querySelector('#end-session-result').innerHTML = notice(error.message, 'error');
    }
  };
}

async function teacherCreatePage(user) {
  const active = await api('attendance/active', null, 'GET');
  if (active.session) {
    layout(user, `${title('QR session', 'Teacher')}<div class="card qr-display-card">${teacherSessionMarkup(active.session)}</div>`);
    bindTeacherSession(user, active.session);
    return;
  }
  const subjects = user.subjects || [];
  const years = [...new Map(subjects.map(subject => [subject.academic_year_id, subject])).values()];
  layout(user, `${title('Create QR session', 'Teacher')}<div class="card"><p class="notice">The QR session remains active until you explicitly end it.</p><form id="create"><label>Academic year<select id="session-year" required>${years.map(subject => `<option value="${subject.academic_year_id}">${escapeHtml(subject.academic_year_name)}</option>`).join('')}</select></label><label>Semester<select id="session-semester" required></select></label><label>Subject<select name="teacher_subject_id" id="session-subject" required></select></label><label>Class<select id="session-class" required></select></label><label>Session title<input name="title" value="Class attendance" required></label><button${subjects.length ? '' : ' disabled'}>Generate QR</button></form><div id="token" aria-live="polite"></div></div>`);
  const year = document.querySelector('#session-year');
  const semester = document.querySelector('#session-semester');
  const subject = document.querySelector('#session-subject');
  const classSelect = document.querySelector('#session-class');
  const updateClass = () => {
    const selected = subjects.find(item => Number(item.assignment_id) === Number(subject.value));
    classSelect.innerHTML = selected ? `<option value="${selected.class_id}">${escapeHtml(selected.class_name)}</option>` : '';
  };
  const updateSubjects = () => {
    const available = subjects.filter(item => Number(item.academic_year_id) === Number(year.value) && Number(item.semester_id) === Number(semester.value));
    subject.innerHTML = available.map(item => `<option value="${item.assignment_id}">${escapeHtml(subjectText(item))}</option>`).join('');
    updateClass();
  };
  const updateSemesters = () => {
    const available = [...new Map(subjects.filter(item => Number(item.academic_year_id) === Number(year.value)).map(item => [item.semester_id, item])).values()];
    semester.innerHTML = available.map(item => `<option value="${item.semester_id}">${escapeHtml(item.semester_name)}</option>`).join('');
    updateSubjects();
  };
  year.onchange = updateSemesters;
  semester.onchange = updateSubjects;
  subject.onchange = updateClass;
  updateSemesters();
  document.querySelector('#create').onsubmit = event => createAttendanceSession(event, user);
}

function attendanceDate(value) {
  return new Date(String(value || '').replace(' ', 'T'));
}

function attendanceTime(value, seconds = false) {
  if (!value) return '—';
  return attendanceDate(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}

function attendanceSessionList(sessions) {
  if (!sessions.length) return '<div class="empty-state">No attendance sessions for this subject.</div>';
  const groups = new Map();
  sessions.forEach(session => {
    const date = attendanceDate(session.starts_at);
    const month = date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(session);
  });
  return [...groups.entries()].map(([month, items]) => `<section class="attendance-month"><h3>${escapeHtml(month)}</h3>${items.map(session => { const date = attendanceDate(session.starts_at); const active = session.status === 'ACTIVE'; return `<button type="button" class="attendance-session-item${active ? ' is-live' : ''}" data-session-id="${session.id}"><span class="attendance-session-date">${active ? '<i class="attendance-live-dot" aria-label="Live"></i>' : ''}<strong>${escapeHtml(date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))}</strong></span><span>${escapeHtml(attendanceTime(session.starts_at))} – ${active ? '<b>LIVE</b>' : escapeHtml(attendanceTime(session.ends_at))}</span><small>${escapeHtml(session.class_name || 'Class not specified')} · ${active ? 'Active' : 'Ended'}</small></button>`; }).join('')}</section>`).join('');
}

function attendanceDetails(data) {
  const session = data.session;
  const active = session.status === 'ACTIVE';
  const start = attendanceDate(session.starts_at);
  const rows = data.attendance || [];
  return `<div class="attendance-detail-heading"><div><span class="eyebrow">Selected session</span><h2 id="attendance-modal-title">${active ? '<i class="attendance-live-dot" aria-label="Live"></i>' : ''}${escapeHtml(start.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }))}</h2><p>${escapeHtml(attendanceTime(session.starts_at))} – ${active ? '<strong>LIVE</strong>' : escapeHtml(attendanceTime(session.ends_at))} · ${escapeHtml(session.class_name || 'Class not specified')}</p></div><span class="status-pill">${escapeHtml(session.status)}</span></div><div class="attendance-detail-summary"><strong>${Number(data.present_students || 0)}</strong><span>QR submissions</span></div>${active ? '<p class="field-help">Showing the latest 3 submissions. This list updates automatically.</p>' : '<p class="field-help">Showing every student who submitted attendance for this session.</p>'}<div class="table-responsive"><table><thead><tr><th>Student Name</th><th>Roll No.</th><th>Submitted</th></tr></thead><tbody>${rows.map(item => `<tr><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.student_no)}</td><td>${escapeHtml(attendanceTime(item.recorded_at, true))}</td></tr>`).join('') || '<tr><td colspan="3">No students submitted attendance for this session.</td></tr>'}</tbody></table></div>`;
}

async function teacherAttendancePage(user) {
  const subjects = user.subjects || [];
  const years = [...new Map(subjects.map(subject => [subject.academic_year_id, subject])).values()];
  layout(user, `${title('Attendance', 'Teacher')}<div class="card attendance-subject-filter"><label>Academic year<select id="attendance-year"${subjects.length ? '' : ' disabled'}>${years.map(subject => `<option value="${subject.academic_year_id}">${escapeHtml(subject.academic_year_name)}</option>`).join('')}</select></label><label>Semester<select id="attendance-semester"${subjects.length ? '' : ' disabled'}></select></label><label>Subject<select id="attendance-subject"${subjects.length ? '' : ' disabled'}></select></label></div><section class="card attendance-session-pane attendance-session-pane--wide"><h2>Attendance Sessions</h2><div id="attendance-session-list"></div></section><div class="attendance-modal" id="attendance-modal" hidden><button class="attendance-modal__backdrop" type="button" data-close-attendance aria-label="Close attendance details"></button><section class="attendance-modal__window" role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title"><button class="attendance-modal__close" type="button" data-close-attendance aria-label="Close attendance details">×</button><div class="attendance-detail-pane" id="attendance-detail"><div class="empty-state">Loading attendance…</div></div></section></div>`);
  if (!subjects.length) {
    document.querySelector('#attendance-session-list').innerHTML = '<div class="empty-state">No subjects are assigned to this teacher account.</div>';
    return;
  }

  const yearSelect = document.querySelector('#attendance-year');
  const semesterSelect = document.querySelector('#attendance-semester');
  const subjectSelect = document.querySelector('#attendance-subject');
  const sessionList = document.querySelector('#attendance-session-list');
  const detail = document.querySelector('#attendance-detail');
  const modal = document.querySelector('#attendance-modal');
  let selectedSessionId = null;
  let requestSequence = 0;

  const closeModal = () => {
    clearInterval(teacherLiveTimer);
    requestSequence++;
    selectedSessionId = null;
    modal.hidden = true;
    document.body.classList.remove('attendance-modal-open');
    document.querySelectorAll('.attendance-session-item').forEach(item => item.classList.remove('is-selected'));
  };
  modal.querySelectorAll('[data-close-attendance]').forEach(button => button.onclick = closeModal);

  const loadDetail = async sessionId => {
    const sequence = ++requestSequence;
    const data = await api('attendance/session', { session_id: sessionId }, 'GET');
    if (sequence !== requestSequence || currentPage !== 'live') return null;
    detail.innerHTML = attendanceDetails(data);
    document.querySelectorAll('.attendance-session-item').forEach(item => item.classList.toggle('is-selected', Number(item.dataset.sessionId) === Number(sessionId)));
    return data;
  };

  const selectSession = async sessionId => {
    clearInterval(teacherLiveTimer);
    selectedSessionId = Number(sessionId);
    modal.hidden = false;
    document.body.classList.add('attendance-modal-open');
    detail.innerHTML = '<div class="empty-state">Loading attendance…</div>';
    try {
      const data = await loadDetail(selectedSessionId);
      if (data?.session?.status === 'ACTIVE') {
        teacherLiveTimer = setInterval(async () => {
          if (currentPage !== 'live') { clearInterval(teacherLiveTimer); return; }
          try {
            const update = await loadDetail(selectedSessionId);
            if (update?.session?.status !== 'ACTIVE') {
              clearInterval(teacherLiveTimer);
              await loadSessions(true);
            }
          } catch (error) { detail.innerHTML = notice(error.message, 'error'); }
        }, 2000);
      }
    } catch (error) { detail.innerHTML = notice(error.message, 'error'); }
  };

  const loadSessions = async keepModalOpen => {
    clearInterval(teacherLiveTimer);
    sessionList.innerHTML = '<div class="empty-state">Loading sessions…</div>';
    if (!keepModalOpen) closeModal();
    try {
      const data = await api('attendance/sessions', { teacher_subject_id: subjectSelect.value }, 'GET');
      sessionList.innerHTML = attendanceSessionList(data.sessions || []);
      document.querySelectorAll('.attendance-session-item').forEach(item => item.onclick = () => selectSession(item.dataset.sessionId));
      if (keepModalOpen && selectedSessionId) document.querySelector(`[data-session-id="${selectedSessionId}"]`)?.classList.add('is-selected');
    } catch (error) { sessionList.innerHTML = notice(error.message, 'error'); }
  };

  const updateSubjects = () => {
    const available = subjects.filter(subject => Number(subject.academic_year_id) === Number(yearSelect.value) && Number(subject.semester_id) === Number(semesterSelect.value));
    subjectSelect.innerHTML = available.map(subject => `<option value="${subject.assignment_id}">${escapeHtml(subjectText(subject))}</option>`).join('');
    loadSessions(false);
  };
  const updateSemesters = () => {
    const available = [...new Map(subjects.filter(subject => Number(subject.academic_year_id) === Number(yearSelect.value)).map(subject => [subject.semester_id, subject])).values()];
    semesterSelect.innerHTML = available.map(subject => `<option value="${subject.semester_id}">${escapeHtml(subject.semester_name)}</option>`).join('');
    updateSubjects();
  };
  yearSelect.onchange = updateSemesters;
  semesterSelect.onchange = updateSubjects;
  subjectSelect.onchange = () => loadSessions(false);
  try {
    const active = await api('attendance/active', null, 'GET');
    if (active.session) {
      const selected = subjects.find(subject => Number(subject.assignment_id) === Number(active.session.teacher_subject_id));
      if (selected) {
        yearSelect.value = String(selected.academic_year_id);
        updateSemesters();
        semesterSelect.value = String(selected.semester_id);
        updateSubjects();
        subjectSelect.value = String(selected.assignment_id);
      }
    }
  } catch (error) { /* Session history remains available when there is no active session. */ }
  if (!subjectSelect.options.length) updateSemesters();
  await loadSessions(false);
}

async function adminSubjectsPage(user) {
  const catalog = await api('registration/subjects', null, 'GET');
  layout(user, `${title('Subjects', 'Administrator')}<div class="card"><form id="subject"><label>Code <small>(optional)</small><input name="code" maxlength="30"></label><label>Name<input name="name" maxlength="120" required></label><label>Academic year<select id="admin-subject-year" required>${catalog.academic_years.map(year => `<option value="${year.id}">${escapeHtml(year.name)}</option>`).join('')}</select></label><label>Semester<select name="semester_id" id="admin-subject-semester" required></select></label><button>Save subject</button></form><div id="saved"></div></div>`);
  const year = document.querySelector('#admin-subject-year');
  const semester = document.querySelector('#admin-subject-semester');
  const updateSemesters = () => { semester.innerHTML = catalog.semesters.filter(item => Number(item.academic_year_id) === Number(year.value)).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join(''); };
  year.onchange = updateSemesters;
  updateSemesters();
  document.querySelector('#subject').onsubmit = async event => { event.preventDefault(); try { const response = await api('admin/subject', Object.fromEntries(new FormData(event.target))); document.querySelector('#saved').innerHTML = notice(response.message); event.target.reset(); } catch (error) { document.querySelector('#saved').innerHTML = notice(error.message, 'error'); } };
}

async function teacherAssignmentsPage(user) {
  const catalog = await api('registration/subjects', null, 'GET');
  const terms = user.terms || [];
  const termCards = terms.map(term => `<div class="card"><strong>${escapeHtml(term.academic_year_name)} · ${escapeHtml(term.semester_name)} · ${escapeHtml(term.class_name)}</strong><p>${term.subjects.length ? term.subjects.map(subject => escapeHtml(subjectText(subject))).join('<br>') : 'No subjects assigned.'}</p></div>`).join('');
  layout(user, `${title('Academic assignments', 'Teacher')}<div class="card"><p class="field-help">Choose a year, semester, and class. Saving replaces subjects only for that selected term.</p><form id="teacher-assignment-form"><label>Academic year<select name="academic_year_id" id="assignment-year" required>${catalog.academic_years.map(year => `<option value="${year.id}">${escapeHtml(year.name)}</option>`).join('')}</select></label><label>Semester<select name="semester_id" id="assignment-semester" required></select></label><label>Class<select name="class_id" id="assignment-class" required></select></label><fieldset><legend>Subjects</legend><div class="check-list" id="assignment-subjects"></div></fieldset><button>Save assignment</button></form><div id="assignment-result"></div></div><section><h2>Current assignments</h2>${termCards || '<div class="empty-state">No academic assignments yet.</div>'}</section>`);
  const year = document.querySelector('#assignment-year');
  const semester = document.querySelector('#assignment-semester');
  const classSelect = document.querySelector('#assignment-class');
  const list = document.querySelector('#assignment-subjects');
  const updateSubjects = () => {
    const available = catalog.subjects.filter(subject => Number(subject.academic_year_id) === Number(year.value) && Number(subject.semester_id) === Number(semester.value));
    const current = terms.find(term => Number(term.academic_year_id) === Number(year.value) && Number(term.semester_id) === Number(semester.value) && Number(term.class_id) === Number(classSelect.value));
    const selected = new Set((current?.subjects || []).map(subject => Number(subject.id)));
    list.innerHTML = available.length ? available.map(subject => `<label class="check-option"><input type="checkbox" name="subject_ids" value="${subject.id}"${selected.has(Number(subject.id)) ? ' checked' : ''}><span><strong>${escapeHtml(subjectCode(subject))}</strong> — ${escapeHtml(subject.name)}</span></label>`).join('') : '<p class="field-help">No subjects are configured for this semester. You may still save the term.</p>';
  };
  const updateTerm = () => {
    semester.innerHTML = catalog.semesters.filter(item => Number(item.academic_year_id) === Number(year.value)).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    classSelect.innerHTML = catalog.classes.filter(item => Number(item.academic_year_id) === Number(year.value)).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    updateSubjects();
  };
  year.onchange = updateTerm;
  semester.onchange = updateSubjects;
  classSelect.onchange = updateSubjects;
  updateTerm();
  document.querySelector('#teacher-assignment-form').onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData);
    payload.subject_ids = formData.getAll('subject_ids');
    try {
      const response = await api('teacher/assignments', payload);
      sessionStorage.user = JSON.stringify(response.user);
      await teacherAssignmentsPage(response.user);
    } catch (error) { document.querySelector('#assignment-result').innerHTML = notice(error.message, 'error'); }
  };
}

async function attendanceReportPage(user) {
  const params = new URLSearchParams(location.search);
  const query = { month: params.get('month') || new Date().toISOString().slice(0, 7) };
  if (user.role === 'teacher' && params.get('teacher_subject_id')) query.teacher_subject_id = params.get('teacher_subject_id');
  const data = await api('reports/monthly', query, 'GET');
  const studentView = user.role === 'student';
  const subjects = data.subjects || [];
  const years = [...new Map(subjects.map(subject => [subject.academic_year_id, subject])).values()];
  const filters = studentView ? '' : `<label>Academic year<select name="academic_year_id" id="report-year">${years.map(subject => `<option value="${subject.academic_year_id}">${escapeHtml(subject.academic_year_name)}</option>`).join('')}</select></label><label>Semester<select name="semester_id" id="report-semester"></select></label><label>Subject<select name="teacher_subject_id" id="report-subject"></select></label>`;
  const contextLabel = studentView ? `${yearLabel(data.year_level)}${user.semester?.name ? ` · ${user.semester.name}` : ''}` : `${data.academic_year?.name || yearLabel(data.year_level)} · ${data.semester?.name || ''}`;
  layout(user, `${title('Monthly attendance', contextLabel)}<div class="card"><form id="month-report"><label>Month<input type="month" name="month" value="${escapeHtml(data.month)}" required></label>${filters}<button>View report</button></form></div><table><thead><tr>${studentView ? '<th>Subject</th>' : '<th>Student</th><th>Number</th>'}<th>Attended</th><th>Total classes</th><th>Attendance</th><th>Status</th></tr></thead><tbody>${data.report.map(item => `<tr class="${!studentView && item.highlight_red === true ? 'report-student-highlight' : ''}"><td>${escapeHtml(studentView ? subjectText(item) : item.full_name)}</td>${studentView ? '' : `<td>${escapeHtml(item.student_no)}</td>`}<td>${item.attended}</td><td>${item.total_sessions}</td><td class="${item.meets_requirement ? 'attendance-good' : 'attendance-bad'}">${Number(item.percentage).toFixed(2)}%</td><td class="${item.meets_requirement ? 'attendance-good' : 'attendance-bad'}">${escapeHtml(item.status)}</td></tr>`).join('') || `<tr><td colspan="${studentView ? 5 : 6}">No data for this month.</td></tr>`}</tbody></table>`);
  if (!studentView) {
    const year = document.querySelector('#report-year');
    const semester = document.querySelector('#report-semester');
    const subject = document.querySelector('#report-subject');
    const updateSubjects = () => { subject.innerHTML = subjectOptions(subjects, year.value, semester.value); };
    const updateSemesters = () => {
      const available = [...new Map(subjects.filter(item => Number(item.academic_year_id) === Number(year.value)).map(item => [item.semester_id, item])).values()];
      semester.innerHTML = available.map(item => `<option value="${item.semester_id}">${escapeHtml(item.semester_name)}</option>`).join('');
      updateSubjects();
    };
    year.onchange = updateSemesters;
    semester.onchange = updateSubjects;
    year.value = String(data.academic_year?.id || years[0]?.academic_year_id || '');
    updateSemesters();
    semester.value = String(data.semester?.id || '');
    updateSubjects();
    subject.value = String(data.subject?.assignment_id || '');
  }
  document.querySelector('#month-report').onsubmit = event => { event.preventDefault(); const next = new URLSearchParams(Object.fromEntries(new FormData(event.target))); history.replaceState(null, '', `${location.pathname}?${next}`); page(user, 'report'); };
}

async function page(user, which = 'home') {
  clearInterval(teacherLiveTimer);
  clearInterval(teacherQrTimer);
  document.body.classList.remove('attendance-modal-open');
  currentPage = which;
  try {
    if (which === 'create') { await teacherCreatePage(user); return; }
    if (which === 'subjects') { await adminSubjectsPage(user); return; }
    if (which === 'academic') { await teacherAssignmentsPage(user); return; }
    if (which === 'report') { await attendanceReportPage(user); return; }
    if (which === 'home') return layout(user, `${title(user.welcome_message || 'Welcome back', user.role === 'student' && user.year_level ? `${yearLabel(user.year_level)} · ${user.semester?.name || ''} · ${user.class_name}` : user.role === 'teacher' ? user.class_name : user.role)}<div class="card"><h2>Quick start</h2><p>${user.role === 'student' ? 'Review your semester subjects, monthly attendance, or scan your teacher’s active QR token.' : user.role === 'teacher' ? `Create attendance sessions for ${user.subjects?.length || 0} assigned subjects across ${user.terms?.length || 0} academic term${user.terms?.length === 1 ? '' : 's'}.` : 'Approve new student accounts, reset registered devices, and maintain subjects.'}</p></div>`);
    if (which === 'scan') { stopCamera(); layout(user, `${title('Scan QR', 'Student')}<div class="card scan-card"><p>Point the scanner at your teacher's active QR code. Attendance requires precise location access and is accepted only inside the configured school area.</p><button class="secondary" id="camera" type="button">Scan QR code</button><video id="preview" autoplay playsinline hidden></video><form id="scan"><label>QR token<input name="token" autocomplete="off" required autofocus></label><button type="submit">Record attendance</button></form><div id="result" role="status" aria-live="polite"></div></div>`); document.querySelector('#scan').onsubmit = submitScan; document.querySelector('#camera').onclick = startCamera; return; }
    if (which === 'attendance') { const d = await api('student/attendance', null, 'GET'); layout(user, `${title('My attendance', 'Student')}<table><thead><tr><th>Subject</th><th>Semester</th><th>Session</th><th>Status</th><th>Time</th></tr></thead><tbody>${d.attendance.map(x => `<tr><td>${escapeHtml(subjectText(x))}</td><td>${escapeHtml(x.semester_name)}</td><td>${escapeHtml(x.title)}</td><td><b>${escapeHtml(x.status)}</b></td><td>${new Date(x.recorded_at).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="5">No attendance records yet.</td></tr>'}</tbody></table>`); return; }
    if (which === 'schedule') { const d = await api('student/schedule', null, 'GET'); layout(user, `${title('Schedule', 'Student')}<table><thead><tr><th>Subject</th><th>Day</th><th>Time</th><th>Room</th></tr></thead><tbody>${d.schedules.map(x => `<tr><td>${escapeHtml(x.code)} — ${escapeHtml(x.name)}</td><td>${escapeHtml(x.day_of_week)}</td><td>${escapeHtml(x.start_time)}–${escapeHtml(x.end_time)}</td><td>${escapeHtml(x.classroom || '—')}</td></tr>`).join('') || '<tr><td colspan="4">No schedules added yet.</td></tr>'}</tbody></table>`); return; }
    if (which === 'live') { await teacherAttendancePage(user); return; }
    if (which === 'users') { const d = await api('admin/users', null, 'GET'); layout(user, `${title('User management', 'Administrator')}<table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.users.map(x => `<tr><td>${escapeHtml(x.full_name)}<small>${escapeHtml(x.username)}</small></td><td>${escapeHtml(x.role)}</td><td>${escapeHtml(x.status)}</td><td>${x.status === 'pending' ? `<button onclick="approve(${x.id})">Approve</button>` : ''}${x.role === 'student' ? ` <button class="secondary" onclick="resetDevice(${x.id})">Reset device</button>` : ''}</td></tr>`).join('')}</tbody></table>`); return; }
  } catch (error) { if (error.message === 'Your session has expired. Please sign in again.') { loginView(notice(error.message, 'error')); return; } layout(user, notice(error.message, 'error')); }
}
window.approve = async id => { await api('admin/verify', { user_id: id }); page(JSON.parse(sessionStorage.user), 'users') }; window.resetDevice = async id => { await api('admin/device/reset', { user_id: id }); page(JSON.parse(sessionStorage.user), 'users') };
async function createAttendanceSession(event, user) { event.preventDefault(); const output = document.querySelector('#token'); const button = event.target.querySelector('button'); button.disabled = true; try { await api('attendance/create', Object.fromEntries(new FormData(event.target))); await teacherCreatePage(user); } catch (error) { output.innerHTML = notice(error.message, 'error'); button.disabled = false; } }
async function submitScan(event) { event.preventDefault(); const form = event.target; const token = form.elements.token.value.trim(); const result = document.querySelector('#result'); if (!token) { result.innerHTML = notice('Enter or scan a QR token first.', 'error'); return; } stopCamera(); const button = form.querySelector('button[type="submit"]'); if (!button) { result.innerHTML = notice('The attendance form is unavailable. Refresh the page and try again.', 'error'); return; } button.disabled = true; try { result.innerHTML = notice('QR detected. Checking your precise location…'); const location = await window.getAttendanceLocation(); result.innerHTML = notice('Location received. Verifying attendance area…'); const r = await api('student/scan', { token, ...location }); result.innerHTML = notice(r.message) } catch (error) { result.innerHTML = notice(error.message, 'error') } finally { button.disabled = false } }
function stopCamera() { if (activeCameraStream) { activeCameraStream.getTracks().forEach(track => track.stop()); activeCameraStream = null; } const video = document.querySelector('#preview'); if (video) { video.pause(); video.srcObject = null; video.hidden = true; } }
function decodeQrCanvas(canvas) { if (typeof jsQR !== 'function') return null; const context = canvas.getContext('2d', { willReadFrequently: true }); const frame = context.getImageData(0, 0, canvas.width, canvas.height); return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data || null; }
async function startCamera() {
  const result = document.querySelector('#result');
  if (!navigator.mediaDevices?.getUserMedia) {
    result.innerHTML = notice('QR scanning requires camera access over HTTPS. Open this site with HTTPS and try again.', 'error');
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
      } catch (error) { stopCamera(); result.innerHTML = notice('The QR scanner stopped because the camera frame could not be read. Try scanning again.', 'error'); return; }
      requestAnimationFrame(detect);
    };
    detect();
  } catch (error) { stopCamera(); result.innerHTML = notice('Camera permission was denied or unavailable. Allow camera access, then scan again.', 'error'); }
}
function start(user) { sessionStorage.user = JSON.stringify(user); page(user); } (async () => { try { const r = await api('me', null, 'GET'); start(r.user) } catch (e) { loginView() } })();
