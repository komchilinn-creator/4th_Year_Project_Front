# EasyAttend Frontend

Open `index.html` with a local web server (for example, VS Code Live Server) after Apache and MySQL are running. The API is set to:

`http://localhost/4th_Year_Pj_Backend/public/index.php`

The single-page app implements login and registration plus role-specific Student, Teacher, and Administrator dashboards. It uses a locally stored UUID to enforce the student one-device restriction.

Student attendance also requires browser geolocation. Serve the frontend over HTTPS when testing from an Android phone; camera and precise location access are restricted to secure browser contexts. After a QR code is detected, the frontend requests a fresh high-accuracy location and sends latitude, longitude, and accuracy with the existing `student/scan` request. The backend remains responsible for the final location decision.

For development, log in as `admin` / `admin123`, add a subject, and then register a teacher and student account.
