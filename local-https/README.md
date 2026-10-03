# EasyAttend local HTTPS

The frontend runs separately at:

`https://172.31.86.42:8000/index.html`

Apache serves the backend at:

`https://172.31.86.42/4th_Year_Pj_Backend/public/index.php`

Start the frontend by running `start-frontend-https.cmd` in the project root.
The old PHP `-S` command is not used because it cannot provide HTTPS.

Before connecting from a phone for the first time, right-click
`local-https/allow-frontend-port.cmd` and select **Run as administrator**.

The public local CA certificate that the phone must trust is:

`attendqr-local-ca.crt`

It can be downloaded on the same Wi-Fi from:

`http://172.31.86.42/attendqr-local-ca.crt`

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

This certificate is valid for `172.31.86.42`, the previously used
`192.168.100.227`, `127.0.0.1`, and `localhost`. If the computer receives a
different LAN address, generate a new server certificate for that address.
