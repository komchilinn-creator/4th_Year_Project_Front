// Central place to configure the backend API base URL.
// Change ONLY the value of API_BASE_URL below when moving between environments.
// This does not change how the API is called anywhere else in the app -
// api-client.js and the standalone page scripts simply read this value.
const apiProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const apiHost = window.location.hostname || 'localhost';

window.APP_CONFIG = {
  // The frontend runs separately on port 8000. Apache serves the backend on
  // the standard HTTP/HTTPS port using the same hostname.
  API_BASE_URL: `${apiProtocol}//${apiHost}/4th_Year_Pj_Backend/public/index.php`,

  // --- LAN testing (phone/laptop on the same Wi-Fi as the dev machine) ---
  //API_BASE_URL: 'http://10.181.20.42/4th_Year_Pj_Backend/public/index.php',

  // --- Production ---
  // API_BASE_URL: 'https://your-production-domain.com/api/index.php',
};
