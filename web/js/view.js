// Auto-zoom: keeps the avatar and its instrument fitted on screen, easing towards the target.
// Shared by the phone app and the TV (Chromecast) app.
// margins: { top, bottom, side } in pixels. Returns the updated view ({ k, x, y }).
export function fitView(view, b, instrumentPoints, W, H, margins, dt) {
  const S = b.S;
  const pts = [
    { x: b.head.c.x, y: b.head.c.y - b.head.r * 1.6 },
    b.ankle.L, b.ankle.R, b.hand.L, b.hand.R, b.elbow.L, b.elbow.R, b.shoulder.L, b.shoulder.R,
    ...instrumentPoints,
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + S * 0.1);
  }
  // Leave room for the thickness of arms, body and hands.
  x0 -= S * 0.3;
  x1 += S * 0.3;
  const { top, bottom, side } = margins;
  const k = Math.min(2.5, (W - side * 2) / (x1 - x0), (H - top - bottom) / (y1 - y0));
  // Centre horizontally, rest the feet just above the bottom strip.
  const tx = W / 2 - ((x0 + x1) / 2) * k;
  const ty = H - bottom - y1 * k;
  if (!view || !Number.isFinite(view.k)) return { k, x: tx, y: ty };
  const a = Math.min(1, dt * 2.5);
  view.k += (k - view.k) * a;
  view.x += (tx - view.x) * a;
  view.y += (ty - view.y) * a;
  return view;
}
