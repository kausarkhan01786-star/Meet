// Ask browsers to clean up speech, but let unsupported devices use their defaults.
export const speechAudioConstraints = Object.freeze({
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
});
