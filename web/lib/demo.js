export const DEMO_ESTIMATE = 106.4;
export const DEMO_HEART_RATE = 72;
export const DEMO_OXYGEN = 98;

/** 300 synthetic IR/red pairs: a steady pulse, or a weak signal that quality checks reject. */
export function syntheticWave(lowSignal = false) {
  return Array.from({ length: 300 }, (_, i) => {
    const t = i / 25;
    const pulse = Math.sin(t * 7.3) + 0.32 * Math.sin(t * 14.6 + 0.7) + 0.14 * Math.sin(t * 21.9);
    return {
      ir: Math.round((lowSignal ? 760 : 21000) + (lowSignal ? 2 : 260) * pulse),
      red: Math.round((lowSignal ? 770 : 19900) + (lowSignal ? 1 : 185) * pulse),
    };
  });
}
