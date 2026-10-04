# EasyAttend Frontend

Open `index.html` with a local web server (for example, VS Code Live Server) after Apache and MySQL are running. The centralized API configuration automatically uses:

`http://localhost/4th_Year_Pj_Backend/public/index.php`

for local HTTP development (and the matching host over HTTPS for local HTTPS/LAN testing). When hosted, it uses:

`https://easyqrapi.freedev.app/api/index.php`

The production database credentials are never included in frontend files.

The single-page app implements login and registration plus role-specific Student, Teacher, and Administrator dashboards. It uses a locally stored UUID to enforce the student one-device restriction.

Student attendance also requires browser geolocation. Serve the frontend over HTTPS when testing from an Android phone; camera and precise location access are restricted to secure browser contexts. After a QR code is detected, the frontend requests a fresh high-accuracy location, calculates the distance from WYTU (`16.8695824`, `96.0071808`) with the Haversine formula, and proceeds only within `1609.344` meters. It sends latitude, longitude, and available accuracy with the existing `student/scan` request, and the backend independently repeats the distance check before creating the attendance record.

For development, log in as `admin` / `admin123`, add a subject, and then register a teacher and student account.
