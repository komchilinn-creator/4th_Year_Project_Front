(function () {
  const locationError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  window.getAttendanceLocation = () => new Promise((resolve, reject) => {
    const localComputer = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (localComputer && window.confirm(
      'Local development: continue without GPS for this attendance request?\n\nOK = skip GPS temporarily. Cancel = use normal location verification.\nThe backend must also allow local development bypass.'
    )) {
      resolve({ development_location_bypass: true });
      return;
    }

    if (!window.isSecureContext || !navigator.geolocation) {
      reject(locationError(
        'LOCATION_UNAVAILABLE',
        'Location is unavailable. Open this page over HTTPS, enable location/GPS, and try again.'
      ));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      error => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(locationError(
            'LOCATION_PERMISSION_REQUIRED',
            'Location permission is required. Allow precise location access for this site and try again.'
          ));
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(locationError(
            'LOCATION_UNAVAILABLE',
            'Location timed out. Move near a window, enable GPS/location, and try again.'
          ));
          return;
        }
        reject(locationError(
          'LOCATION_UNAVAILABLE',
          'Your location could not be determined. Enable GPS/location and try again.'
        ));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
})();
