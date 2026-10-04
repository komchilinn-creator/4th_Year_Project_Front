(function () {
  const WYTU_LOCATION = Object.freeze({
    latitude: 16.8695824,
    longitude: 96.0071808,
    allowedRadiusMeters: 1609.344,
  });
  const EARTH_RADIUS_METERS = 6371000;

  const locationError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  const toRadians = degrees => degrees * Math.PI / 180;

  const distanceFromWytu = (latitude, longitude) => {
    const latitudeDelta = toRadians(WYTU_LOCATION.latitude - latitude);
    const longitudeDelta = toRadians(WYTU_LOCATION.longitude - longitude);
    const fromLatitude = toRadians(latitude);
    const toLatitude = toRadians(WYTU_LOCATION.latitude);
    const a = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    const boundedA = Math.min(1, Math.max(0, a));

    return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(boundedA), Math.sqrt(1 - boundedA));
  };

  window.getAttendanceLocation = () => new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(locationError(
        'LOCATION_UNAVAILABLE',
        'Unable to determine your current location. Please make sure GPS/location services are enabled and try again.'
      ));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const rawLatitude = position.coords.latitude;
        const rawLongitude = position.coords.longitude;
        const latitude = rawLatitude === null || rawLatitude === undefined ? NaN : Number(rawLatitude);
        const longitude = rawLongitude === null || rawLongitude === undefined ? NaN : Number(rawLongitude);
        const rawAccuracy = position.coords.accuracy;
        const accuracy = rawAccuracy === null || rawAccuracy === undefined ? null : Number(rawAccuracy);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(locationError(
            'LOCATION_UNAVAILABLE',
            'Unable to determine your current location. Please make sure GPS/location services are enabled and try again.'
          ));
          return;
        }

        const distance = distanceFromWytu(latitude, longitude);
        if (distance > WYTU_LOCATION.allowedRadiusMeters) {
          reject(locationError(
            'OUTSIDE_ALLOWED_AREA',
            'Attendance cannot be recorded because you are outside the allowed university area.'
          ));
          return;
        }

        resolve({
          latitude,
          longitude,
          ...(accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
        });
      },
      error => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(locationError(
            'LOCATION_PERMISSION_REQUIRED',
            'Location permission is required to record attendance. Please enable location access and try again.'
          ));
          return;
        }
        reject(locationError(
          'LOCATION_UNAVAILABLE',
          'Unable to determine your current location. Please make sure GPS/location services are enabled and try again.'
        ));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
})();
