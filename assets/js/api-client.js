window.api = async (action, payload, method = 'POST') => {
  const base = window.APP_CONFIG?.API_BASE_URL || 'http://localhost/4th_Year_Pj_Backend/public/index.php';
  const token = localStorage.getItem('attendqr-token');
  const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
  let url = `${base}?action=${encodeURIComponent(action)}`;
  if (method === 'GET') url += payload ? `&${new URLSearchParams(payload)}` : ''; else options.body = JSON.stringify(payload || {});
  const response = await fetch(url, options); const data = await response.json().catch(() => ({ ok:false, message:'Server returned an invalid response.' }));
  if (response.status === 401) { localStorage.removeItem('attendqr-token'); throw new Error('Your session has expired. Please sign in again.'); }
  if (!data.ok) throw new Error(data.message || 'Request failed'); return data;
};