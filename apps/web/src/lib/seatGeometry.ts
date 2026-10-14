/**
 * Stadium (pill) seat layout — same math as docs/design/prototype/poker-table.html.
 * Host locks to top-center; everyone else is equal arc-length clockwise.
 */

export type Geom = {
  W: number;
  H: number;
  cx: number;
  cy: number;
  R: number;
  sh: number;
  P: number;
};

export type RailPoint = { x: number; y: number; nx: number; ny: number };

export function geometry(W?: number, H?: number): Geom {
  const w = W && W > 0 ? W : 780;
  const h = H && H > 0 ? H : 332;
  const R = h / 2;
  const sh = Math.max(0, (w - h) / 2);
  return { W: w, H: h, cx: w / 2, cy: h / 2, R, sh, P: 4 * sh + 2 * Math.PI * R };
}

export function feltGeometry(wrapW: number, wrapH: number): Geom {
  return geometry((wrapW || 780) - 32, (wrapH || 332) - 32);
}

export function perimeterPoint(d: number, g: Geom): RailPoint {
  const arc = Math.PI * g.R;
  let t = ((d % g.P) + g.P) % g.P;

  if (t <= g.sh) return { x: g.cx + t, y: g.cy - g.R, nx: 0, ny: -1 };
  t -= g.sh;
  if (t <= arc) {
    const a = t / g.R;
    return {
      x: g.cx + g.sh + g.R * Math.sin(a),
      y: g.cy - g.R * Math.cos(a),
      nx: Math.sin(a),
      ny: -Math.cos(a),
    };
  }
  t -= arc;
  if (t <= 2 * g.sh) return { x: g.cx + g.sh - t, y: g.cy + g.R, nx: 0, ny: 1 };
  t -= 2 * g.sh;
  if (t <= arc) {
    const a = t / g.R;
    return {
      x: g.cx - g.sh - g.R * Math.sin(a),
      y: g.cy + g.R * Math.cos(a),
      nx: -Math.sin(a),
      ny: Math.cos(a),
    };
  }
  t -= arc;
  return { x: g.cx - g.sh + t, y: g.cy - g.R, nx: 0, ny: -1 };
}

export function anchorIndex(participants: Array<{ isHost: boolean }>): number {
  const i = participants.findIndex((p) => p.isHost);
  return i < 0 ? 0 : i;
}

export function seatPoint(index: number, total: number, g: Geom, anchor: number): RailPoint {
  const n = Math.max(total, 1);
  const step = g.P / n;
  const offset = (((index - anchor) % n) + n) % n;
  return perimeterPoint(offset * step, g);
}

export function placeSeatPct(
  index: number,
  total: number,
  g: Geom,
  anchor: number,
): { left: number; top: number } {
  const q = seatPoint(index, total, g, anchor);
  const out = 46 + 14 * Math.abs(q.nx);
  return {
    left: ((q.x + q.nx * out) / g.W) * 100,
    top: ((q.y + q.ny * out) / g.H) * 100,
  };
}

export function cardRotation(nx: number, ny: number): number {
  let a = (Math.atan2(nx, -ny) * 180) / Math.PI;
  while (a > 90) a -= 180;
  while (a < -90) a += 180;
  return a;
}

export function placeCardPct(
  index: number,
  total: number,
  g: Geom,
  anchor: number,
): { left: number; top: number; rot: number } {
  const q = seatPoint(index, total, g, anchor);
  const inward = 48 - 8 * Math.abs(q.nx);
  return {
    left: ((q.x - q.nx * inward) / g.W) * 100,
    top: ((q.y - q.ny * inward) / g.H) * 100,
    rot: cardRotation(q.nx, q.ny),
  };
}

export function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

export function fanFor(index: number, total: number): { fan: number; lift: number } {
  const mid = (total - 1) / 2;
  const k = index - mid;
  return { fan: k * 5.5, lift: k * k * 1.4 };
}
