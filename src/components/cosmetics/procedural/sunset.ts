import { rgba, type BannerGenerator } from './core';

export const sunset: BannerGenerator = { create(rng, W, H, c) {
  const hz = H * (.54 + rng() * .08), sx = W * (.18 + rng() * .64), radius = H * .15;
  const clouds = Array.from({ length: 6 }, () => ({ x: rng() * W, y: hz * (.12 + rng() * .6), w: H * (.5 + rng() * 1.3), h: H * (.035 + rng() * .05), v: H * (.01 + rng() * .03) }));
  const bands = Array.from({ length: 8 }, (_, b) => ({ f1: (.006 + rng() * .01) * 600 / H, f2: (.014 + rng() * .02) * 600 / H, ph: rng() * 6.28, s: .6 + rng() * .8, b }));
  const glitter = Array.from({ length: 44 }, () => [rng(), rng(), rng() * 6.28]);
  return (ctx, t) => {
    let g = ctx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, c[0]); g.addColorStop(.6, c[1]); g.addColorStop(1, c[2]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
    g = ctx.createRadialGradient(sx, hz, 0, sx, hz, H * 1.1); g.addColorStop(0, rgba(c[3], .55)); g.addColorStop(1, rgba(c[3], 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
    for (const k of clouds) { const x = (k.x + t * k.v) % (W + k.w * 2) - k.w; ctx.fillStyle = rgba(c[2], .35); ctx.beginPath(); ctx.ellipse(x, k.y, k.w, k.h, 0, 0, 7); ctx.fill(); ctx.fillStyle = rgba(c[3], .25); ctx.beginPath(); ctx.ellipse(x, k.y + k.h * .4, k.w * .8, k.h * .45, 0, 0, 7); ctx.fill(); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip(); ctx.fillStyle = c[3]; ctx.beginPath(); ctx.arc(sx, hz - radius * .3 + Math.sin(t * .22) * radius * .08, radius, 0, 7); ctx.fill(); ctx.restore();
    g = ctx.createLinearGradient(0, hz, 0, H); g.addColorStop(0, c[4]); g.addColorStop(1, c[5]); ctx.fillStyle = g; ctx.fillRect(0, hz, W, H - hz);
    for (const [a, b, p] of glitter) { const k = Math.pow(a, 1.5), y = hz + k * (H - hz), w = radius * (.5 + k * 2.2), x = sx + (b - .5) * w * 2, alpha = Math.pow(Math.max(0, Math.sin(t * 2.6 + p)), 3); ctx.fillStyle = rgba(c[3], alpha * .9); ctx.fillRect(x - w * .18, y, w * .36, Math.max(1, H * .006)); }
    ctx.lineWidth = Math.max(1, H * .004);
    for (const B of bands) { const k = (B.b + 1) / bands.length, y0 = hz + Math.pow(k, 1.7) * (H - hz), a = H * .008 * (1 + k * 2); ctx.strokeStyle = rgba(c[2], .18 + k * .12); ctx.beginPath(); for (let x = 0; x <= W; x += 6) { const y = y0 + a * (Math.sin(x * B.f1 + t * B.s + B.ph) + .5 * Math.sin(x * B.f2 - t * B.s * 1.3)); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  };
} };
