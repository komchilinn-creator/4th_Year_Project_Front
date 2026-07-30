window.api = async (action, payload, method = 'POST') => {
  const base = 'http://localhost/4th_Year_Pj_Backend/public/index.php';
  //const base = 'http://10.181.20.42/4th_Year_Pj_Backend/public/index.php';
  const token = localStorage.getItem('attendqr-token');
  const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
  let url = `${base}?action=${encodeURIComponent(action)}`;
  if (method === 'GET') url += payload ? `&${new URLSearchParams(payload)}` : ''; else options.body = JSON.stringify(payload || {});
  const response = await fetch(url, options); const data = await response.json().catch(() => ({ ok:false, message:'Server returned an invalid response.' }));
  if (!data.ok) throw new Error(data.message || 'Request failed'); return data;
};
