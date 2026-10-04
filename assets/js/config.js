// Central API configuration shared by the main app and standalone pages.
// Localhost/LAN development keeps using the local Apache backend. Any hosted
// frontend uses the HTTPS production API and never receives database details.
(() => {
  const hostname = window.location.hostname || 'localhost';
  const isLocalHostname = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

  const localProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const localApiUrl = `${localProtocol}//${hostname}/4th_Year_Pj_Backend/public/index.php`;

  window.APP_CONFIG = Object.freeze({
    ENVIRONMENT: isLocalHostname ? 'development' : 'production',
    API_BASE_URL: isLocalHostname
      ? localApiUrl
      : 'https://easyqrapi.freedev.app/api/index.php',
  });
})();
