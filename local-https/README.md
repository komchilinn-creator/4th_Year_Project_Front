# EasyAttend local HTTPS at 10.62.109.42

XAMPP Apache serves the existing frontend at:

`https://10.62.109.42/`

The existing backend remains available at:

`https://10.62.109.42/4th_Year_Pj_Backend/public/index.php`

Run `start-easyattend-phone.cmd` from the project root to start Apache and
MySQL and display the phone URLs. Before connecting from a phone for the first
time, right-click `local-https/setup-phone-firewall.cmd` and choose
**Run as administrator**.

The only certificate that should be copied to the phone is:

`local-https/attendqr-local-ca.crt`

The CA private key and the server key stay on the host computer under
`C:\xampp2\apache\ssl` and must never be copied to the phone.

## Android

1. Download the CA certificate using the HTTP URL above.
2. Open Settings and search for **Install a certificate**.
3. Choose **CA certificate** and install `attendqr-local-ca.crt`.
4. Open the HTTPS EasyAttend URL in Chrome and allow camera access.

## iPhone or iPad

1. Download the CA certificate using the HTTP URL above and install the profile.
2. Open **Settings > General > VPN & Device Management** and complete installation.
3. Open **Settings > General > About > Certificate Trust Settings**.
4. Enable full trust for **AttendQR Local Development CA**.
5. Open the HTTPS EasyAttend URL in Safari and allow camera access.

The server certificate is valid for the IP address `10.62.109.42`. The PC and
phone must be connected to the same local network, and the PC must keep this IP.
If the address changes, generate a new server certificate with the new IP SAN.
