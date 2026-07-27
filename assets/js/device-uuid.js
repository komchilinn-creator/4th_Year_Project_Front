window.deviceUuid = (() => {
  const key = 'attendqr-device-id'; let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; localStorage.setItem(key, value); }
  return value;
})();
