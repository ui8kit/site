// Small colour helpers shared by gen-skins.mjs and check-contrast.mjs (hex #rrggbb and hsl(h s% l%) only).
export const hslToRgb = (h, s, l) => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
export const rgb = (v) => { if (Array.isArray(v)) return v; let m = v.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = v.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/); if (m) return hslToRgb(+m[1], +m[2], +m[3]); throw new Error("colour " + v); };
export const lum = (c) => { const f = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
export const ratioRgb = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const ratio = (a, b) => ratioRgb(rgb(a), rgb(b));
export const mix = (a, b, t) => rgb(a).map((x, i) => x * t + rgb(b)[i] * (1 - t)); // t of a over b
export const toHsl = (c) => { const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l * 100]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, s * 100, l * 100]; };
export const hex = (c) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0")).join("");
// move lightness (dir -1 darker, +1 lighter) in 0.5% steps until ok(colour) holds; returns hex
export const nudge = (v, dir, ok) => { let [h, s, l] = toHsl(rgb(v)); for (let i = 0; i < 200; i++) { const c = hslToRgb(h, s, l); if (ok(c)) return hex(c); l += dir * 0.5; if (l < 0 || l > 100) break; } return null; };
