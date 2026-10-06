const SAMPLES_PER_CAPTURE = 300;
const MAX_ADC_VALUE = 262_143;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidCapture(samples) {
  return (
    Array.isArray(samples) &&
    samples.length === SAMPLES_PER_CAPTURE &&
    samples.every(
      (sample) =>
        sample &&
        ['ir', 'red'].every((channel) => {
          const value = sample[channel];
          return isFiniteNumber(value) && value >= 0 && value <= MAX_ADC_VALUE;
        }),
    )
  );
}

export function hasNumericVitals(input) {
  return Boolean(input && ['heartRate', 'oxygen'].some((key) => isFiniteNumber(input[key])));
}

/** Missing or invalid device values remain unavailable, never guessed. */
export function parseVitals(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid vitals payload');
  }

  const heartRateValid =
    isFiniteNumber(input.heartRate) &&
    input.heartRate > 0 &&
    input.heartRate <= 300 &&
    input.heartRateValid !== false;

  const oxygenValid =
    isFiniteNumber(input.oxygen) &&
    input.oxygen > 0 &&
    input.oxygen <= 100 &&
    input.oxygenValid !== false;

  return {
    receivedAt: new Date().toISOString(),
    heartRate: heartRateValid ? input.heartRate : null,
    oxygen: oxygenValid ? input.oxygen : null,
    oxygenExperimental: input.oxygenExperimental === true,
  };
}
