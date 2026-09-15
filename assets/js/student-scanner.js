const studentScanApp = document.querySelector('#student-scan-app');
const studentScanToken = localStorage.getItem('attendqr-token');
let studentCameraStream = null;
let studentScanGeneration = 0; // bumped every time the camera (re)starts so old detect loops stop themselves
let studentScanLocked = false; // true the instant a code is detected, until the request finishes

const studentEscape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const studentNotice = (message, type = 'success') => `<p class="notice ${type}" role="status">${studentEscape(message)}</p>`;

// API calls go through the existing shared client (assets/js/api-client.js), the same one
// index.html/app.js uses. This page now loads config.js + api-client.js before this file,
// so no duplicate request/auth logic is kept here. window.api() already reads the
// 'attendqr-token' from localStorage and clears it on 401.
const studentApi = window.api;

function stopStudentCamera() {
  studentScanGeneration += 1; // invalidates any in-flight detect loop
  if (studentCameraStream) { studentCameraStream.getTracks().forEach(track => track.stop()); studentCameraStream = null; }
  const video = document.querySelector('#student-preview');
  if (video) { video.pause(); video.srcObject = null; video.hidden = true; }
  studentScanLocked = false;
}

async function submitStudentScan(event) {
  event.preventDefault();
  const form = event.target;
  const result = document.querySelector('#student-scan-result');
  const token = form.elements.token.value.trim();
  if (!token) { result.innerHTML = studentNotice('Scan a QR code or enter the token shown by your teacher.', 'error'); studentScanLocked = false; return; }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  stopStudentCamera(); // stop the camera the moment we have a token, before the request even goes out
  try {
    const response = await studentApi('student/scan', { token });
    if (response.attendance_recorded !== true) {
      throw new Error('Attendance was not recorded. Please scan the active QR code again.');
    }
    result.innerHTML = studentNotice(response.message || 'Yes - your attendance has been recorded in the teacher\'s roll call.');
    form.reset();
  } catch (error) {
    result.innerHTML = studentNotice(error.message, 'error');
  } finally {
    button.disabled = false;
    studentScanLocked = false; // allow the student to open the camera again and retry
  }
}

function handleStudentDetectedCode(rawValue) {
  if (studentScanLocked || !rawValue) return; // ignore repeat detections of the same/other codes mid-submit
  studentScanLocked = true;
  document.querySelector('[name="token"]').value = rawValue;
  document.querySelector('#student-scan-form').requestSubmit();
}

// Primary path: native BarcodeDetector (fast, no extra library; Chrome/Edge/Android).
function runBarcodeDetectorLoop(video, generation, onError) {
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const detect = async () => {
    if (generation !== studentScanGeneration) return; // camera was stopped/restarted, abandon this loop
    try {
      if (!studentScanLocked && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) { handleStudentDetectedCode(codes[0].rawValue); return; }
      }
    } catch (error) {
      onError('The camera could not read that QR code. Enter the token instead.');
      return;
    }
    requestAnimationFrame(detect);
  };
  detect();
}

// Fallback path: jsQR, sampling frames onto a hidden canvas. Used for Safari/iPhone/Firefox
// and any other browser that doesn't implement BarcodeDetector.
function runJsQrLoop(video, generation, onError) {
  if (typeof jsQR !== 'function') { onError('Camera scanning is not supported in this browser. Enter the token instead.'); return; }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const scan = () => {
    if (generation !== studentScanGeneration) return;
    try {
      if (!studentScanLocked && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) { handleStudentDetectedCode(code.data); return; }
      }
    } catch (error) {
      onError('The camera could not read that QR code. Enter the token instead.');
      return;
    }
    requestAnimationFrame(scan);
  };
  scan();
}

async function openStudentCamera() {
  const result = document.querySelector('#student-scan-result');
  if (!navigator.mediaDevices?.getUserMedia) {
    result.innerHTML = studentNotice('Camera access is not supported in this browser. Enter the token shown by your teacher.', 'error');
    return;
  }
  const hasBarcodeDetector = 'BarcodeDetector' in window;
  const hasJsQr = typeof jsQR === 'function';
  if (!hasBarcodeDetector && !hasJsQr) {
    result.innerHTML = studentNotice('Camera scanning is not supported in this browser. Enter the token shown by your teacher.', 'error');
    return;
  }
  stopStudentCamera(); // clears any previous stream/loop and bumps the generation counter, so this can be re-clicked any time
  const generation = studentScanGeneration;
  result.innerHTML = '';
  try {
    const video = document.querySelector('#student-preview');
    studentCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    if (generation !== studentScanGeneration) { studentCameraStream.getTracks().forEach(track => track.stop()); return; } // stopped again while awaiting permission
    video.srcObject = studentCameraStream;
    video.hidden = false;
    await video.play();
    const onError = message => { stopStudentCamera(); result.innerHTML = studentNotice(message, 'error'); };
    if (hasBarcodeDetector) runBarcodeDetectorLoop(video, generation, onError);
    else runJsQrLoop(video, generation, onError);
  } catch (error) {
    stopStudentCamera();
    result.innerHTML = studentNotice('Camera permission was not granted. Enter the token instead.', 'error');
  }
}

function renderStudentScanner(user) {
  studentScanApp.innerHTML = `<aside><div class="brand">ATTEND<span>QR</span></div><p>${studentEscape(user.full_name)}</p><small>student</small><nav><a href="../../index.html">Dashboard</a><a href="scan-qr.html">Scan QR</a><a href="attendance-history.html">Attendance history</a><a href="schedule.html">Schedule</a></nav></aside><section class="workspace"><header><span class="eyebrow">Student</span><h1>Scan attendance QR</h1></header><div class="card scan-card"><p>Open your camera to scan the teacher's active QR code, or enter the displayed token.</p><button class="secondary" id="student-camera" type="button">Open camera</button><video id="student-preview" autoplay playsinline hidden></video><form id="student-scan-form"><label>QR token<input name="token" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus></label><button type="submit">Record attendance</button></form><div id="student-scan-result" aria-live="polite"></div></div></section>`;
  document.querySelector('#student-camera').onclick = openStudentCamera;
  document.querySelector('#student-scan-form').onsubmit = submitStudentScan;
}

(async () => {
  if (!studentScanToken) { studentScanApp.innerHTML = `${studentNotice('Please sign in with an active student account first.', 'error')}<p><a href="../../index.html">Go to sign in</a></p>`; return; }
  try {
    const response = await studentApi('me', null, 'GET');
    if (response.user?.role !== 'student') { studentScanApp.innerHTML = studentNotice('Student access is required to scan attendance.', 'error'); return; }
    renderStudentScanner(response.user);
  } catch (error) {
    studentScanApp.innerHTML = `${studentNotice(error.message, 'error')}<p><a href="../../index.html">Go to sign in</a></p>`;
  }
})();

window.addEventListener('beforeunload', stopStudentCamera); // release the camera if the student navigates away
