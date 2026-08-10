const studentScanApp = document.querySelector('#student-scan-app');
const studentScanToken = localStorage.getItem('attendqr-token');
let studentCameraStream = null;
const studentEscape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const studentNotice = (message, type = 'success') => `<p class="notice ${type}" role="status">${studentEscape(message)}</p>`;

async function studentApi(action, payload, method = 'POST') {
  const base = 'http://10.181.20.42/4th_Year_Pj_Backend/public/index.php';
  //const base = 'http://localhost/4th_Year_Pj_Backend/public/index.php';
  const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(studentScanToken ? { Authorization: `Bearer ${studentScanToken}` } : {}) } };
  let url = `${base}?action=${encodeURIComponent(action)}`;
  if (method === 'GET') url += payload ? `&${new URLSearchParams(payload)}` : ''; else options.body = JSON.stringify(payload || {});
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Server returned an invalid response.' }));
  if (response.status === 401) localStorage.removeItem('attendqr-token');
  if (!data.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

function stopStudentCamera() {
  if (studentCameraStream) { studentCameraStream.getTracks().forEach(track => track.stop()); studentCameraStream = null; }
  const video = document.querySelector('#student-preview');
  if (video) { video.pause(); video.srcObject = null; video.hidden = true; }
}

async function submitStudentScan(event) {
  event.preventDefault();
  const form = event.target;
  const result = document.querySelector('#student-scan-result');
  const token = form.elements.token.value.trim();
  if (!token) { result.innerHTML = studentNotice('Scan a QR code or enter the token shown by your teacher.', 'error'); return; }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  stopStudentCamera();
  try { const response = await studentApi('student/scan', { token }); result.innerHTML = studentNotice(response.message); }
  catch (error) { result.innerHTML = studentNotice(error.message, 'error'); }
  finally { button.disabled = false; }
}

async function openStudentCamera() {
  const result = document.querySelector('#student-scan-result');
  if (!navigator.mediaDevices?.getUserMedia || !('BarcodeDetector' in window)) { result.innerHTML = studentNotice('Camera scanning is not supported in this browser. Enter the token shown by your teacher.', 'error'); return; }
  stopStudentCamera();
  try {
    const video = document.querySelector('#student-preview');
    studentCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    video.srcObject = studentCameraStream; video.hidden = false; await video.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const detect = async () => {
      if (!studentCameraStream) return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) { document.querySelector('[name="token"]').value = codes[0].rawValue; document.querySelector('#student-scan-form').requestSubmit(); return; }
        }
      } catch (error) { stopStudentCamera(); result.innerHTML = studentNotice('The camera could not read that QR code. Enter the token instead.', 'error'); return; }
      requestAnimationFrame(detect);
    };
    detect();
  } catch (error) { stopStudentCamera(); result.innerHTML = studentNotice('Camera permission was not granted. Enter the token instead.', 'error'); }
}

function renderStudentScanner(user) {
  studentScanApp.innerHTML = `<aside><div class="brand">ATTEND<span>QR</span></div><p>${studentEscape(user.full_name)}</p><small>student</small><nav><a href="../../index.html">Dashboard</a><a href="scan-qr.html">Scan QR</a><a href="attendance-history.html">Attendance history</a><a href="schedule.html">Schedule</a></nav></aside><section class="workspace"><header><span class="eyebrow">Student</span><h1>Scan attendance QR</h1></header><div class="card scan-card"><p>Open your camera to scan the teacher's active QR code, or enter the displayed token.</p><button class="secondary" id="student-camera" type="button">Open camera</button><video id="student-preview" autoplay playsinline hidden></video><form id="student-scan-form"><label>QR token<input name="token" autocomplete="off" required autofocus></label><button type="submit">Record attendance</button></form><div id="student-scan-result" aria-live="polite"></div></div></section>`;
  document.querySelector('#student-camera').onclick = openStudentCamera;
  document.querySelector('#student-scan-form').onsubmit = submitStudentScan;
}

(async () => {
  if (!studentScanToken) { studentScanApp.innerHTML = `${studentNotice('Please sign in with an active student account first.', 'error')}<p><a href="../../index.html">Go to sign in</a></p>`; return; }
  try {
    const response = await studentApi('me', null, 'GET');
    if (response.user?.role !== 'student') { studentScanApp.innerHTML = studentNotice('Student access is required to scan attendance.', 'error'); return; }
    renderStudentScanner(response.user);
  } catch (error) { studentScanApp.innerHTML = `${studentNotice(error.message, 'error')}<p><a href="../../index.html">Go to sign in</a></p>`; }
})();
