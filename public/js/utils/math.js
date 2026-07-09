export function withTimeout(promise, timeoutMs, message) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
}

export function formatMeters(value) {
  if (!Number.isFinite(value)) return '–';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} km`;
  return `${Math.round(value)} m`;
}

export function angleDelta(target, current) {
  return ((target - current + 540) % 360) - 180;
}

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

export function radiansToDegrees(radians) {
  return radians * 180 / Math.PI;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
