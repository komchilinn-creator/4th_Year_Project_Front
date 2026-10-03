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
const classChoices = (classes, name, selectedId = null) => classes.map((item, index) => `<label class="class-choice"><input type="radio" name="${name}" value="${item.id}" data-academic-year-id="${item.academic_year_id}"${Number(selectedId) === Number(item.id) || (selectedId === null && index === 0) ? ' checked' : ''}><span>${escapeHtml(item.name)}</span></label>`).join('');
const selectedChoice = container => container?.querySelector('input[type="radio"]:checked') || null;
const setChoice = (container, value) => {
  const input = [...(container?.querySelectorAll('input[type="radio"]') || [])].find(item => Number(item.value) === Number(value));
  if (input) input.checked = true;
  return input || null;
};
const normaliseTeacherClassName = value => {
  const name = String(value || '').trim().toUpperCase();
  const reversed = name.match(/^IT([1-9])$/);
  return reversed ? `${reversed[1]}IT` : name;
};
const teacherClassNames = value => [...new Set(String(value || '').split(',').map(normaliseTeacherClassName).filter(Boolean))];
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
  root.innerHTML = `<section class="auth-page auth-focused"><div class="auth-box auth-simple"><div class="auth-panel"><h2>Create your account</h2>${message}<form id="register"><label>Full name<input name="full_name" required></label><label>Username<input name="username" required></label><label>Password<input type="password" name="password" minlength="6" required></label><label>Role<select name="role" id="registration-role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label id="registration-identifier-field">Student number<input name="identifier" placeholder="e.g. 4IT15" autocomplete="off"></label><input type="hidden" name="academic_year_id" id="registration-year"><label id="registration-student-class-field">Academic year / Class<input id="registration-student-class" readonly placeholder="Determined by student number"></label><label id="registration-class-field">Academic year / Classes<input name="class_names" id="registration-class" placeholder="e.g. 4IT, 3IT" autocomplete="off"></label><label>Semester<select name="semester_id" id="registration-semester" required></select></label><div id="class-validation" aria-live="polite"></div><fieldset id="student-subject-field"><legend>Subjects in your semester</legend><div class="check-list" id="student-subject-list"></div></fieldset><fieldset id="teacher-subject-field" hidden><legend>Subjects taught</legend><p class="field-help">Select every subject you teach across the entered classes for this semester.</p><div class="check-list" id="teacher-subject-list"></div></fieldset><button>Register</button></form><div class="auth-switch"><span>Already have an account?</span><button class="secondary" id="switch-to-login">Sign in</button></div></div></div></section>`;
  const role = document.querySelector('#registration-role');
  const identifierField = document.querySelector('#registration-identifier-field');
  const identifier = identifierField.querySelector('input');
  const classField = document.querySelector('#registration-class-field');
  const classInput = document.querySelector('#registration-class');
  const studentClassField = document.querySelector('#registration-student-class-field');
  const studentClass = document.querySelector('#registration-student-class');
  const yearSelect = document.querySelector('#registration-year');
  const semesterSelect = document.querySelector('#registration-semester');
  const validation = document.querySelector('#class-validation');
  const studentSubjectField = document.querySelector('#student-subject-field');
  const studentSubjectList = document.querySelector('#student-subject-list');
  const subjectField = document.querySelector('#teacher-subject-field');
  const subjectList = document.querySelector('#teacher-subject-list');
  const updateSubjects = () => {
    if (role.value === 'teacher') {
      const names = teacherClassNames(classInput.value);
      const selectedClasses = names.map(name => classes.find(item => item.name.toUpperCase() === name)).filter(Boolean);
      const yearIds = new Set(selectedClasses.map(item => Number(item.academic_year_id)));
      const available = subjects.filter(subject => yearIds.has(Number(subject.academic_year_id)) && Number(subject.semester_number) === Number(semesterSelect.value));
      subjectList.innerHTML = available.length ? available.map(subject => `<label class="check-option"><input type="checkbox" name="subject_ids" value="${subject.id}"><span><strong>${escapeHtml(subjectCode(subject))}</strong> — ${escapeHtml(subject.name)}</span></label>`).join('') : '<p class="field-help">No subjects are configured for the entered classes and semester.</p>';
    } else {
      const available = subjects.filter(subject => Number(subject.academic_year_id) === Number(yearSelect.value) && Number(subject.semester_id) === Number(semesterSelect.value));
      studentSubjectList.innerHTML = available.length ? available.map(subject => `<div class="check-option"><span><strong>${escapeHtml(subjectCode(subject))}</strong> — ${escapeHtml(subject.name)}</span></div>`).join('') : '<p class="field-help">No subjects are configured for this semester.</p>';
    }
  };
  const updateTermOptions = () => {
    const semesterId = semesterSelect.value;
    semesterSelect.innerHTML = semesters.filter(semester => Number(semester.academic_year_id) === Number(yearSelect.value)).map(semester => `<option value="${semester.id}">${escapeHtml(semester.name)}</option>`).join('');
    if ([...semesterSelect.options].some(option => option.value === semesterId)) semesterSelect.value = semesterId;
    updateSubjects();
  };
  const updateTeacherClasses = () => {
    if (role.value !== 'teacher') return;
    classInput.value = classInput.value.toUpperCase();
    const names = teacherClassNames(classInput.value);
    subjectList.innerHTML = '';
    if (!names.length) { validation.innerHTML = '<p class="field-help">Enter one or more classes, such as 4IT, 3IT, to see their subjects.</p>'; return; }
    const unknown = names.filter(name => !classes.some(item => item.name.toUpperCase() === name));
    if (unknown.length) { validation.innerHTML = notice(`Unknown class${unknown.length === 1 ? '' : 'es'}: ${unknown.join(', ')}. Use existing values such as 4IT, 3IT.`, 'error'); return; }
    const selectedClasses = names.map(name => classes.find(item => item.name.toUpperCase() === name));
    const yearIds = new Set(selectedClasses.map(item => Number(item.academic_year_id)));
    const available = subjects.filter(subject => yearIds.has(Number(subject.academic_year_id)) && Number(subject.semester_number) === Number(semesterSelect.value));
    validation.innerHTML = `<p class="notice">${available.length} subject${available.length === 1 ? '' : 's'} available for ${escapeHtml(names.join(', '))}.</p>`;
    updateSubjects();
  };
  const updateStudentNumber = () => {
    if (role.value !== 'student') return;
    identifier.value = identifier.value.toUpperCase().replace(/\s+/g, '');
    const match = identifier.value.match(/^([1-9])IT[0-9]+$/);
    if (!identifier.value) { yearSelect.value = ''; studentClass.value = ''; updateTermOptions(); validation.innerHTML = '<p class="field-help">Your student number determines your class.</p>'; return; }
    if (!match) { yearSelect.value = ''; studentClass.value = ''; updateTermOptions(); validation.innerHTML = notice('Use a student roll number such as 4IT15.', 'error'); return; }
    const matchingYear = years.find(year => Number(year.year_level) === Number(match[1]));
    const matchingClass = classes.find(item => Number(item.academic_year_id) === Number(matchingYear?.id) && item.name.toUpperCase() === `${match[1]}IT`);
    if (matchingYear) { yearSelect.value = String(matchingYear.id); studentClass.value = matchingClass?.name || `${match[1]}IT`; updateTermOptions(); }
    validation.innerHTML = `<p class="notice">Student number ${escapeHtml(identifier.value)} belongs to ${match[1]}IT. Semester is stored separately.</p>`;
  };
  const updateRole = () => {
    const teacher = role.value === 'teacher';
    identifierField.hidden = teacher;
    identifier.disabled = teacher;
    identifier.required = !teacher;
    identifier.pattern = '[1-9]IT[0-9]+';
    classField.hidden = !teacher;
    studentClassField.hidden = teacher;
    classInput.disabled = !teacher;
    classInput.required = teacher;
    yearSelect.disabled = teacher;
    subjectField.hidden = !teacher;
    studentSubjectField.hidden = teacher;
    semesterSelect.name = teacher ? 'semester_number' : 'semester_id';
    if (teacher) {
      const availableSemesters = [...new Map(semesters.map(item => [item.semester_number, item])).values()];
      semesterSelect.innerHTML = availableSemesters.map(item => `<option value="${item.semester_number}">${escapeHtml(item.name)}</option>`).join('');
      validation.innerHTML = '<p class="field-help">Enter one or more classes, such as 4IT, 3IT, to see their subjects.</p>';
      updateTeacherClasses();
    } else {
      updateStudentNumber();
    }
  };
  document.querySelector('#register').onsubmit = event => {
    if (role.value === 'teacher') {
      const names = teacherClassNames(classInput.value);
      const selectedClasses = names.map(name => classes.find(item => item.name.toUpperCase() === name)).filter(Boolean);
      const selectedSubjectIds = new Set([...document.querySelectorAll('input[name="subject_ids"]:checked')].map(input => Number(input.value)));
      if (selectedClasses.length !== names.length) {
        event.preventDefault();
        validation.innerHTML = notice('Enter only existing classes, such as 4IT, 3IT.', 'error');
        return;
      }
      const missingClasses = selectedClasses.filter(item => !subjects.some(subject => selectedSubjectIds.has(Number(subject.id)) && Number(subject.academic_year_id) === Number(item.academic_year_id) && Number(subject.semester_number) === Number(semesterSelect.value)));
      if (!selectedSubjectIds.size || missingClasses.length) {
        event.preventDefault();
        validation.innerHTML = notice(missingClasses.length ? `Select at least one subject for ${missingClasses.map(item => item.name).join(', ')}.` : 'Select at least one subject you teach.', 'error');
        return;
      }
    }
    register(event);
  };
  role.onchange = updateRole;
  identifier.oninput = updateStudentNumber;
  classInput.oninput = updateTeacherClasses;
  classInput.onblur = () => { if (role.value === 'teacher') { classInput.value = teacherClassNames(classInput.value).join(', '); updateTeacherClasses(); } };
  semesterSelect.onchange = () => role.value === 'teacher' ? updateTeacherClasses() : updateSubjects();
  updateRole();
  document.querySelector('#switch-to-login').onclick = () => loginView();
}
async function login(event) { event.preventDefault(); const f = Object.fromEntries(new FormData(event.target)); try { const r = await api('login', { ...f, device_uuid: deviceUuid }); localStorage.setItem('attendqr-token', r.token); start(r.user); } catch (e) { loginView(notice(e.message, 'error')); } }
async function register(event) { event.preventDefault(); const formData = new FormData(event.target); const payload = Object.fromEntries(formData); payload.subject_ids = formData.getAll('subject_ids'); try { const r = await api('register', payload); loginView(notice(r.message, 'success')); } catch (e) { signupView(notice(e.message, 'error')); } }
function layout(user, content) { root.innerHTML = `<aside><div class="brand">Easy<span>Attend</span></div><p>${escapeHtml(user.full_name)}</p><small>${escapeHtml(user.role)}</small><nav><button data-page="home">Dashboard</button>${user.role === 'student' ? '<button data-page="scan">Scan QR</button><button data-page="report">Monthly attendance</button><button data-page="attendance">Attendance history</button><button data-page="schedule">Schedule</button>' : ''}${user.role === 'teacher' ? '<button data-page="create">Create QR session</button><button data-page="live">Attendance</button><button data-page="report">Reports</button><button data-page="academic">Academic assignments</button>' : ''}${user.role === 'admin' ? '<button data-page="users">Users</button><button data-page="subjects">Subjects</button>' : ''}<button id="logout">Log out</button></nav></aside><section class="workspace">${content}</section>`; document.querySelector(`[data-page="${currentPage}"]`)?.setAttribute('aria-current', 'page'); document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => page(user, b.dataset.page)); document.querySelector('#logout').onclick = async () => { clearInterval(teacherLiveTimer); clearInterval(teacherQrTimer); await api('logout', {}); localStorage.removeItem('attendqr-token'); sessionStorage.removeItem('user'); loginView(); }; }
const title = (heading, body = '') => `<header><span class="eyebrow">${escapeHtml(body)}</span><h1>${escapeHtml(heading)}</h1></header>`;
const ordinalSuffix = value => (value % 100 >= 11 && value % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[value % 10] || 'th';
const yearLabel = value => `${value}${ordinalSuffix(Number(value))} Year`;
const sameLocalDay = value => {
  if (!value) return false;
  const date = attendanceDate(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
};
const dashboardIcon = name => {
  const paths = {
    classes: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15A2.5 2.5 0 0 1 6.5 18H20"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    attendance: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 15l2 2 5-5"/>',
    missed: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
    scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 9h6v6H9z"/>',
    subject: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 20a3 3 0 0 1 0-6h11"/>',
  };
  return `<svg class="dashboard-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.attendance}</svg>`;
};
const dashboardGreeting = name => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${name}`;
};

async function teacherDashboard(user) {
  const terms = user.terms || [];
  const subjects = user.subjects || [];
  let live = { session: null, total_students: 0, present_students: 0, absent_students: 0 };
  let liveError = '';
  try {
    live = await api('attendance/live', null, 'GET');
  } catch (error) {
    if (error.message === 'Your session has expired. Please sign in again.') throw error;
    liveError = error.message;
  }
  const todaySession = live.session && sameLocalDay(live.session.starts_at) ? live.session : null;
  const presentToday = todaySession ? Number(live.present_students || 0) : 0;
  const classCards = terms.map(term => `<article class="dashboard-data-card"><div class="dashboard-data-card__icon">${dashboardIcon('classes')}</div><div><span class="dashboard-card-label">${escapeHtml(term.semester_name)}</span><h3>${escapeHtml(term.class_name)}</h3><p>${term.subjects.length} assigned subject${term.subjects.length === 1 ? '' : 's'}</p><small>${term.subjects.slice(0, 2).map(subject => escapeHtml(subjectCode(subject))).join(' · ') || 'No subjects assigned'}</small></div></article>`).join('');
  const studentPanel = live.session ? `<div class="dashboard-metric-grid"><article class="dashboard-metric-card"><span>Total students</span><strong>${Number(live.total_students || 0)}</strong><small>${escapeHtml(live.session.class_name || 'Latest class')}</small></article><article class="dashboard-metric-card dashboard-metric-card--accent"><span>${todaySession ? 'Present today' : 'Latest check-ins'}</span><strong>${Number(live.present_students || 0)}</strong><small>of ${Number(live.total_students || 0)} students</small></article></div>` : `<div class="dashboard-empty dashboard-empty--compact">${dashboardIcon('users')}<p>Student totals will appear after you create an attendance session.</p></div>`;
  const todayRows = todaySession ? `<article class="dashboard-attendance-row"><div class="dashboard-attendance-row__subject"><span class="dashboard-subject-mark">${escapeHtml(subjectCode(todaySession.subject).slice(0, 2))}</span><div><strong>${escapeHtml(subjectText(todaySession.subject))}</strong><small>${escapeHtml(todaySession.class_name)} · ${escapeHtml(todaySession.semester?.name || '')}</small></div></div><span class="status-pill${todaySession.status === 'ACTIVE' ? ' dashboard-live-status' : ''}">${escapeHtml(todaySession.status)}</span><div class="dashboard-attendance-count"><strong>${presentToday}/${Number(live.total_students || 0)}</strong><small>students attended</small></div></article>` : `<div class="dashboard-empty">${dashboardIcon('attendance')}<h3>No attendance sessions today</h3><p>Create a QR session when your class begins. Today’s attendance will appear here automatically.</p><button type="button" data-page="create">Create QR session</button></div>`;
  layout(user, `<div class="role-dashboard teacher-dashboard"><header class="dashboard-hero"><div><span class="eyebrow">Teacher dashboard</span><h1>${escapeHtml(dashboardGreeting(user.full_name))}</h1><p>${escapeHtml(new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p></div><button type="button" data-page="create" class="dashboard-primary-action">${dashboardIcon('scan')}Create QR session</button></header>${liveError ? notice(liveError, 'error') : ''}<section class="dashboard-summary" aria-label="Teaching overview"><article><span>${dashboardIcon('classes')}</span><div><strong>${terms.length}</strong><small>Academic classes</small></div></article><article><span>${dashboardIcon('subject')}</span><div><strong>${subjects.length}</strong><small>Assigned subjects</small></div></article><article><span>${dashboardIcon('attendance')}</span><div><strong>${presentToday}</strong><small>Present today</small></div></article></section><div class="dashboard-reference-grid"><section class="dashboard-panel"><div class="dashboard-section-heading"><div><span class="eyebrow">Teaching load</span><h2>My classes</h2></div><button type="button" class="dashboard-text-action" data-page="academic">Manage assignments</button></div><div class="dashboard-card-grid">${classCards || `<div class="dashboard-empty dashboard-empty--compact">${dashboardIcon('classes')}<p>No academic classes are assigned yet.</p></div>`}</div></section><section class="dashboard-panel"><div class="dashboard-section-heading"><div><span class="eyebrow">Latest roster</span><h2>Students</h2></div><button type="button" class="dashboard-text-action" data-page="live">View attendance</button></div>${studentPanel}</section></div><section class="dashboard-panel dashboard-today"><div class="dashboard-section-heading"><div><span class="eyebrow">${escapeHtml(new Date().toLocaleDateString([], { month: 'long', day: 'numeric' }))}</span><h2>Today’s attendance</h2></div><button type="button" class="dashboard-text-action" data-page="live">All sessions</button></div><div class="dashboard-attendance-list">${todayRows}</div></section></div>`);
}

async function studentDashboard(user) {
  const month = new Date().toISOString().slice(0, 7);
  let report = { report: [], month };
  let history = { attendance: [] };
  const errors = [];
  const [reportResult, historyResult] = await Promise.allSettled([
    api('reports/monthly', { month }, 'GET'),
    api('student/attendance', null, 'GET'),
  ]);
  if (reportResult.status === 'fulfilled') report = reportResult.value;
  else if (reportResult.reason?.message === 'Your session has expired. Please sign in again.') throw reportResult.reason;
  else errors.push(reportResult.reason?.message || 'Monthly attendance could not be loaded.');
  if (historyResult.status === 'fulfilled') history = historyResult.value;
  else if (historyResult.reason?.message === 'Your session has expired. Please sign in again.') throw historyResult.reason;
  else errors.push(historyResult.reason?.message || 'Attendance history could not be loaded.');
  const subjectRows = report.report || [];
  const missedTotal = subjectRows.reduce((sum, item) => sum + Math.max(0, Number(item.total_sessions) - Number(item.attended)), 0);
  const attendedTotal = subjectRows.reduce((sum, item) => sum + Number(item.attended), 0);
  const sessionsTotal = subjectRows.reduce((sum, item) => sum + Number(item.total_sessions), 0);
  const overallPercentage = sessionsTotal ? Math.round(attendedTotal * 100 / sessionsTotal) : 0;
  const todayAttendance = (history.attendance || []).filter(item => sameLocalDay(item.recorded_at));
  const missedCards = subjectRows.map(item => {
    const missed = Math.max(0, Number(item.total_sessions) - Number(item.attended));
    return `<article class="dashboard-data-card student-missed-card${missed ? ' has-missed' : ''}"><div class="dashboard-data-card__icon">${dashboardIcon(missed ? 'missed' : 'attendance')}</div><div><span class="dashboard-card-label">${escapeHtml(subjectCode(item))}</span><h3>${missed}</h3><p>class${missed === 1 ? '' : 'es'} missed</p><small>${escapeHtml(item.name)}</small></div></article>`;
  }).join('');
  const todayRows = todayAttendance.map(item => `<article class="dashboard-attendance-row"><div class="dashboard-attendance-row__subject"><span class="dashboard-subject-mark">${escapeHtml(subjectCode(item).slice(0, 2))}</span><div><strong>${escapeHtml(subjectText(item))}</strong><small>${escapeHtml(item.title)} · ${escapeHtml(item.teacher_name)}</small></div></div><span class="status-pill">${escapeHtml(item.status)}</span><div class="dashboard-attendance-count"><strong>${escapeHtml(attendanceTime(item.recorded_at))}</strong><small>recorded today</small></div></article>`).join('');
  layout(user, `<div class="role-dashboard student-dashboard"><header class="dashboard-hero"><div><span class="eyebrow">Student dashboard</span><h1>${escapeHtml(dashboardGreeting(user.full_name))}</h1><p>${escapeHtml(user.class_name)} · ${escapeHtml(user.semester?.name || '')}</p></div><button type="button" data-page="scan" class="dashboard-primary-action">${dashboardIcon('scan')}Scan attendance QR</button></header>${errors.map(error => notice(error, 'error')).join('')}<section class="dashboard-summary" aria-label="Attendance overview"><article><span>${dashboardIcon('missed')}</span><div><strong>${missedTotal}</strong><small>Classes missed</small></div></article><article><span>${dashboardIcon('attendance')}</span><div><strong>${attendedTotal}</strong><small>Classes attended</small></div></article><article><span>${dashboardIcon('subject')}</span><div><strong>${overallPercentage}%</strong><small>Monthly attendance</small></div></article></section><section class="dashboard-panel"><div class="dashboard-section-heading"><div><span class="eyebrow">${escapeHtml(new Date(`${report.month}-01T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' }))}</span><h2>Missed classes</h2></div><button type="button" class="dashboard-text-action" data-page="report">View monthly report</button></div><div class="dashboard-card-grid dashboard-card-grid--student">${missedCards || `<div class="dashboard-empty dashboard-empty--compact">${dashboardIcon('subject')}<p>No subject attendance data is available for this month.</p></div>`}</div></section><section class="dashboard-panel dashboard-today"><div class="dashboard-section-heading"><div><span class="eyebrow">${escapeHtml(new Date().toLocaleDateString([], { month: 'long', day: 'numeric' }))}</span><h2>Today’s attendance</h2></div><button type="button" class="dashboard-text-action" data-page="attendance">Attendance history</button></div><div class="dashboard-attendance-list">${todayRows || `<div class="dashboard-empty">${dashboardIcon('attendance')}<h3>No attendance recorded today</h3><p>Your submitted attendance will appear here after you scan a teacher’s active QR code.</p><button type="button" data-page="scan">Scan QR code</button></div>`}</div></section></div>`);
}

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
  const classes = [...new Map(subjects.map(subject => [subject.class_id, { id: subject.class_id, name: subject.class_name, academic_year_id: subject.academic_year_id }])).values()];
  layout(user, `${title('Create QR session', 'Teacher')}<div class="card"><p class="notice">The QR session remains active until you explicitly end it.</p><form id="create"><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="session-classes">${classChoices(classes, 'session_class_id')}</div></fieldset><label>Semester<select id="session-semester" required></select></label><label>Subject<select name="teacher_subject_id" id="session-subject" required></select></label><label>Session title<input name="title" value="Class attendance" required></label><button${subjects.length ? '' : ' disabled'}>Generate QR</button></form><div id="token" aria-live="polite"></div></div>`);
  const classChoicesRoot = document.querySelector('#session-classes');
  const semester = document.querySelector('#session-semester');
  const subject = document.querySelector('#session-subject');
  const updateSubjects = () => {
    const classId = selectedChoice(classChoicesRoot)?.value;
    const available = subjects.filter(item => Number(item.class_id) === Number(classId) && Number(item.semester_id) === Number(semester.value));
    subject.innerHTML = available.map(item => `<option value="${item.assignment_id}">${escapeHtml(subjectText(item))}</option>`).join('');
  };
  const updateSemesters = () => {
    const classId = selectedChoice(classChoicesRoot)?.value;
    const available = [...new Map(subjects.filter(item => Number(item.class_id) === Number(classId)).map(item => [item.semester_id, item])).values()];
    semester.innerHTML = available.map(item => `<option value="${item.semester_id}">${escapeHtml(item.semester_name)}</option>`).join('');
    updateSubjects();
  };
  classChoicesRoot.onchange = updateSemesters;
  semester.onchange = updateSubjects;
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
  const classes = [...new Map(subjects.map(subject => [subject.class_id, { id: subject.class_id, name: subject.class_name, academic_year_id: subject.academic_year_id }])).values()];
  layout(user, `${title('Attendance', 'Teacher')}<div class="card attendance-subject-filter"><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="attendance-classes">${classChoices(classes, 'attendance_class_id')}</div></fieldset><label>Semester<select id="attendance-semester"${subjects.length ? '' : ' disabled'}></select></label><label>Subject<select id="attendance-subject"${subjects.length ? '' : ' disabled'}></select></label></div><section class="card attendance-session-pane attendance-session-pane--wide"><h2>Attendance Sessions</h2><div id="attendance-session-list"></div></section><div class="attendance-modal" id="attendance-modal" hidden><button class="attendance-modal__backdrop" type="button" data-close-attendance aria-label="Close attendance details"></button><section class="attendance-modal__window" role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title"><button class="attendance-modal__close" type="button" data-close-attendance aria-label="Close attendance details">×</button><div class="attendance-detail-pane" id="attendance-detail"><div class="empty-state">Loading attendance…</div></div></section></div>`);
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
    const classId = selectedChoice(classChoicesRoot)?.value;
    const available = subjects.filter(subject => Number(subject.class_id) === Number(classId) && Number(subject.semester_id) === Number(semesterSelect.value));
    subjectSelect.innerHTML = available.map(subject => `<option value="${subject.assignment_id}">${escapeHtml(subjectText(subject))}</option>`).join('');
    loadSessions(false);
  };
  const updateSemesters = () => {
    const classId = selectedChoice(classChoicesRoot)?.value;
    const available = [...new Map(subjects.filter(subject => Number(subject.class_id) === Number(classId)).map(subject => [subject.semester_id, subject])).values()];
    semesterSelect.innerHTML = available.map(subject => `<option value="${subject.semester_id}">${escapeHtml(subject.semester_name)}</option>`).join('');
    updateSubjects();
  };
  classChoicesRoot.onchange = updateSemesters;
  semesterSelect.onchange = updateSubjects;
  subjectSelect.onchange = () => loadSessions(false);
  try {
    const active = await api('attendance/active', null, 'GET');
    if (active.session) {
      const selected = subjects.find(subject => Number(subject.assignment_id) === Number(active.session.teacher_subject_id));
      if (selected) {
        setChoice(classChoicesRoot, selected.class_id);
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
  const yearClasses = catalog.academic_years.map(year => ({ id: year.id, academic_year_id: year.id, name: catalog.classes.find(item => Number(item.academic_year_id) === Number(year.id) && item.name.toUpperCase() === `${year.year_level}IT`)?.name || `${year.year_level}IT` }));
  layout(user, `${title('Subjects', 'Administrator')}<div class="card"><form id="subject"><label>Code <small>(optional)</small><input name="code" maxlength="30"></label><label>Name<input name="name" maxlength="120" required></label><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="admin-subject-classes">${classChoices(yearClasses, 'admin_subject_year')}</div></fieldset><label>Semester<select name="semester_id" id="admin-subject-semester" required></select></label><button>Save subject</button></form><div id="saved"></div></div>`);
  const yearChoicesRoot = document.querySelector('#admin-subject-classes');
  const semester = document.querySelector('#admin-subject-semester');
  const updateSemesters = () => { const yearId = selectedChoice(yearChoicesRoot)?.value; semester.innerHTML = catalog.semesters.filter(item => Number(item.academic_year_id) === Number(yearId)).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join(''); };
  yearChoicesRoot.onchange = updateSemesters;
  updateSemesters();
  document.querySelector('#subject').onsubmit = async event => { event.preventDefault(); try { const response = await api('admin/subject', Object.fromEntries(new FormData(event.target))); document.querySelector('#saved').innerHTML = notice(response.message); event.target.reset(); updateSemesters(); } catch (error) { document.querySelector('#saved').innerHTML = notice(error.message, 'error'); } };
}

async function teacherAssignmentsPage(user) {
  const catalog = await api('registration/subjects', null, 'GET');
  const terms = user.terms || [];
  const termCards = terms.map(term => `<div class="card"><strong>${escapeHtml(term.academic_year_name)} · ${escapeHtml(term.semester_name)} · ${escapeHtml(term.class_name)}</strong><p>${term.subjects.length ? term.subjects.map(subject => escapeHtml(subjectText(subject))).join('<br>') : 'No subjects assigned.'}</p></div>`).join('');
  layout(user, `${title('Academic assignments', 'Teacher')}<div class="card"><p class="field-help">Choose a class and semester. Saving replaces subjects only for that selected term.</p><form id="teacher-assignment-form"><input type="hidden" name="academic_year_id" id="assignment-year"><fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="assignment-classes">${classChoices(catalog.classes, 'class_id')}</div></fieldset><label>Semester<select name="semester_id" id="assignment-semester" required></select></label><fieldset><legend>Subjects</legend><div class="check-list" id="assignment-subjects"></div></fieldset><button>Save assignment</button></form><div id="assignment-result"></div></div><section><h2>Current assignments</h2>${termCards || '<div class="empty-state">No academic assignments yet.</div>'}</section>`);
  const year = document.querySelector('#assignment-year');
  const semester = document.querySelector('#assignment-semester');
  const classChoicesRoot = document.querySelector('#assignment-classes');
  const list = document.querySelector('#assignment-subjects');
  const updateSubjects = () => {
    const available = catalog.subjects.filter(subject => Number(subject.academic_year_id) === Number(year.value) && Number(subject.semester_id) === Number(semester.value));
    const classId = selectedChoice(classChoicesRoot)?.value;
    const current = terms.find(term => Number(term.academic_year_id) === Number(year.value) && Number(term.semester_id) === Number(semester.value) && Number(term.class_id) === Number(classId));
    const selected = new Set((current?.subjects || []).map(subject => Number(subject.id)));
    list.innerHTML = available.length ? available.map(subject => `<label class="check-option"><input type="checkbox" name="subject_ids" value="${subject.id}"${selected.has(Number(subject.id)) ? ' checked' : ''}><span><strong>${escapeHtml(subjectCode(subject))}</strong> — ${escapeHtml(subject.name)}</span></label>`).join('') : '<p class="field-help">No subjects are configured for this semester. You may still save the term.</p>';
  };
  const updateTerm = () => {
    year.value = selectedChoice(classChoicesRoot)?.dataset.academicYearId || '';
    semester.innerHTML = catalog.semesters.filter(item => Number(item.academic_year_id) === Number(year.value)).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    updateSubjects();
  };
  classChoicesRoot.onchange = updateTerm;
  semester.onchange = updateSubjects;
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
  const classes = [...new Map(subjects.map(subject => [subject.class_id, { id: subject.class_id, name: subject.class_name, academic_year_id: subject.academic_year_id }])).values()];
  const filters = studentView ? '' : `<fieldset><legend>Academic year / Class</legend><div class="class-choice-list" id="report-classes">${classChoices(classes, 'report_class_id')}</div></fieldset><label>Semester<select id="report-semester"></select></label><label>Subject<select name="teacher_subject_id" id="report-subject"></select></label>`;
  const contextLabel = studentView ? `${yearLabel(data.year_level)}${user.semester?.name ? ` · ${user.semester.name}` : ''}` : `${data.academic_year?.name || yearLabel(data.year_level)} · ${data.semester?.name || ''}`;
  layout(user, `${title('Monthly attendance', contextLabel)}<div class="card"><form id="month-report"><label>Month<input type="month" name="month" value="${escapeHtml(data.month)}" required></label>${filters}<button>View report</button></form></div><table><thead><tr>${studentView ? '<th>Subject</th>' : '<th>Student</th><th>Number</th>'}<th>Attended</th><th>Total classes</th><th>Attendance</th><th>Status</th></tr></thead><tbody>${data.report.map(item => `<tr class="${!studentView && item.highlight_red === true ? 'report-student-highlight' : ''}"><td>${escapeHtml(studentView ? subjectText(item) : item.full_name)}</td>${studentView ? '' : `<td>${escapeHtml(item.student_no)}</td>`}<td>${item.attended}</td><td>${item.total_sessions}</td><td class="${item.meets_requirement ? 'attendance-good' : 'attendance-bad'}">${Number(item.percentage).toFixed(2)}%</td><td class="${item.meets_requirement ? 'attendance-good' : 'attendance-bad'}">${escapeHtml(item.status)}</td></tr>`).join('') || `<tr><td colspan="${studentView ? 5 : 6}">No data for this month.</td></tr>`}</tbody></table>`);
  if (!studentView) {
    const classChoicesRoot = document.querySelector('#report-classes');
    const semester = document.querySelector('#report-semester');
    const subject = document.querySelector('#report-subject');
    const updateSubjects = () => { const classId = selectedChoice(classChoicesRoot)?.value; subject.innerHTML = subjects.filter(item => Number(item.class_id) === Number(classId) && Number(item.semester_id) === Number(semester.value)).map(item => `<option value="${item.assignment_id}">${escapeHtml(subjectText(item))}</option>`).join(''); };
    const updateSemesters = () => {
      const classId = selectedChoice(classChoicesRoot)?.value;
      const available = [...new Map(subjects.filter(item => Number(item.class_id) === Number(classId)).map(item => [item.semester_id, item])).values()];
      semester.innerHTML = available.map(item => `<option value="${item.semester_id}">${escapeHtml(item.semester_name)}</option>`).join('');
      updateSubjects();
    };
    classChoicesRoot.onchange = updateSemesters;
    semester.onchange = updateSubjects;
    setChoice(classChoicesRoot, data.class?.id || classes[0]?.id);
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
    if (which === 'home') {
      if (user.role === 'teacher') { await teacherDashboard(user); return; }
      if (user.role === 'student') { await studentDashboard(user); return; }
      return layout(user, `${title(user.welcome_message || 'Welcome back', user.role)}<div class="card"><h2>Quick start</h2><p>Approve new student accounts, reset registered devices, and maintain subjects.</p></div>`);
    }
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
