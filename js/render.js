// All canvas drawing: stage, avatar, guitar, particles.
// Guitar dimensions are in multiples of S (the avatar's shoulder width).
export const GEO = {
  bridge: -0.55,
  neckStart: 0.42,
  nut: 2.7,
  zoneEnd: 1.05, // chords live between zoneEnd and nut
  head: 3.15,
};

const SKIN = '#f1c27d';
const SKIN_DARK = '#c99a5b';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.flash = 0;
    this.stringEnergy = new Array(6).fill(0);
    this.look = { shirt: '#1f2937', pants: '#111827', hair: '#2b1b12', accent: '#f43f5e' };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  onStrum(direction, velocity, at, color) {
    this.flash = Math.min(1, this.flash + 0.4 + velocity * 0.6);
    for (let s = 0; s < 6; s++) this.stringEnergy[s] = 0.6 + velocity * 0.6;
    const n = 2 + Math.round(velocity * 4);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: at.x,
        y: at.y,
        vx: (Math.random() - 0.5) * 160,
        vy: -80 - Math.random() * 160,
        life: 1,
        glyph: ['♪', '♫', '♬', '♩'][Math.floor(Math.random() * 4)],
        color,
        size: 18 + Math.random() * 18,
      });
    }
  }

  frame(dt, scene) {
    const { ctx } = this;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (let s = 0; s < 6; s++) this.stringEnergy[s] *= Math.exp(-dt * 3);
    this.drawStage(scene.time);
    ctx.save();
    ctx.translate(scene.view.x, scene.view.y);
    ctx.scale(scene.view.k, scene.view.k);
    if (scene.body) {
      ctx.save();
      ctx.globalAlpha = scene.alpha;
      this.drawAvatar(scene);
      ctx.restore();
    }
    this.drawParticles(dt);
    ctx.restore();
  }

  drawStage(time) {
    const { ctx, w, h } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0820');
    bg.addColorStop(0.7, '#1a0f3a');
    bg.addColorStop(1, '#2a1240');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Spotlights that sweep slowly and flare on each strum.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beams = [
      { x: w * 0.15, hue: 280, phase: 0 },
      { x: w * 0.85, hue: 190, phase: 2 },
      { x: w * 0.5, hue: 330, phase: 4 },
    ];
    for (const b of beams) {
      const swing = Math.sin(time * 0.5 + b.phase) * w * 0.25;
      const tx = w / 2 + swing;
      const a = 0.07 + this.flash * 0.12;
      const g = ctx.createLinearGradient(b.x, 0, tx, h);
      g.addColorStop(0, `hsla(${b.hue},90%,65%,${a * 2})`);
      g.addColorStop(1, `hsla(${b.hue},90%,65%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, -10);
      ctx.lineTo(b.x + 10, -10);
      ctx.lineTo(tx + w * 0.22, h);
      ctx.lineTo(tx - w * 0.22, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Stage floor.
    const fy = h * 0.86;
    const fg = ctx.createLinearGradient(0, fy, 0, h);
    fg.addColorStop(0, '#2d1b4e');
    fg.addColorStop(1, '#120a24');
    ctx.fillStyle = fg;
    ctx.fillRect(0, fy, w, h - fy);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(w, fy);
    ctx.stroke();
  }

  drawAvatar(scene) {
    const { ctx } = this;
    const b = scene.body;
    const S = b.S;
    const look = this.look;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Legs
    for (const side of ['L', 'R']) {
      limb(ctx, [b.hip[side], b.knee[side], b.ankle[side]], S * 0.3, look.pants);
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      const a = b.ankle[side];
      const toe = Math.sign(a.x - b.hipMid.x) || 1; // feet point outwards
      ctx.ellipse(a.x + toe * S * 0.08, a.y + S * 0.05, S * 0.17, S * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Neck + torso
    limb(ctx, [b.neckBase, b.head.c], S * 0.2, SKIN_DARK);
    const sh = b.shoulder;
    const hp = b.hip;
    const out = (p, q, k) => ({ x: p.x + (p.x - q.x) * k, y: p.y + (p.y - q.y) * k });
    const sL = out(sh.L, sh.R, 0.08);
    const sR = out(sh.R, sh.L, 0.08);
    const hL = out(hp.L, hp.R, 0.15);
    const hR = out(hp.R, hp.L, 0.15);
    ctx.fillStyle = look.shirt;
    ctx.beginPath();
    ctx.moveTo(sL.x, sL.y - S * 0.06);
    ctx.quadraticCurveTo(b.neckBase.x, b.neckBase.y - S * 0.12, sR.x, sR.y - S * 0.06);
    ctx.lineTo(hR.x, hR.y);
    ctx.lineTo(hL.x, hL.y);
    ctx.closePath();
    ctx.fill();
    // Belt
    ctx.strokeStyle = '#000';
    ctx.lineWidth = S * 0.08;
    ctx.beginPath();
    ctx.moveTo(hL.x, hL.y);
    ctx.lineTo(hR.x, hR.y);
    ctx.stroke();

    this.drawHead(b.head, S, scene.mouth);

    // Guitar strap from strum-side shoulder to the neck joint.
    const g = scene.guitar;
    const strapEnd = g.at(GEO.neckStart, -0.15);
    const strapStart = g.at(GEO.bridge - 0.05, 0);
    ctx.strokeStyle = '#3b0d0d';
    ctx.lineWidth = S * 0.09;
    ctx.beginPath();
    ctx.moveTo(strapStart.x, strapStart.y);
    ctx.quadraticCurveTo(b.shoulder[g.fretSide].x, b.shoulder[g.fretSide].y - S * 0.1, strapEnd.x, strapEnd.y);
    ctx.stroke();

    this.drawGuitar(scene);

    // Arms go over the guitar so hands sit on the strings.
    for (const side of ['L', 'R']) {
      limb(ctx, [b.shoulder[side], b.elbow[side]], S * 0.27, look.shirt);
      limb(ctx, [b.elbow[side], b.wrist[side]], S * 0.2, SKIN);
      const hand = b.hand[side];
      ctx.fillStyle = SKIN;
      ctx.strokeStyle = SKIN_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, S * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Pick in the strumming hand.
    const sh2 = b.hand[g.strumSide];
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.moveTo(sh2.x, sh2.y + S * 0.16);
    ctx.lineTo(sh2.x - S * 0.06, sh2.y + S * 0.04);
    ctx.lineTo(sh2.x + S * 0.06, sh2.y + S * 0.04);
    ctx.closePath();
    ctx.fill();
  }

  drawHead(head, S, mouth) {
    const { ctx, look } = this;
    const r = head.r;
    ctx.save();
    ctx.translate(head.c.x, head.c.y);
    ctx.rotate(head.angle);
    // Spiky hair behind
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const a = Math.PI + (i / 9) * Math.PI;
      const rr = i % 2 ? r * 1.45 : r * 1.05;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr - r * 0.1;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.lineTo(r * 1.05, r * 0.6);
    ctx.lineTo(-r * 1.05, r * 0.6);
    ctx.closePath();
    ctx.fill();
    // Face
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.88, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fringe
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.ellipse(-r * 0.1, -r * 0.72, r * 0.85, r * 0.38, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Sunglasses
    ctx.fillStyle = '#0b0b0b';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      roundRect(ctx, sx * r * 0.42 - r * 0.32, -r * 0.2, r * 0.64, r * 0.36, r * 0.12);
      ctx.fill();
    }
    ctx.fillRect(-r * 0.12, -r * 0.14, r * 0.24, r * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-r * 0.66, -r * 0.14, r * 0.14, r * 0.06);
    ctx.fillRect(r * 0.18, -r * 0.14, r * 0.14, r * 0.06);
    // Mouth: opens when you rock out
    const open = Math.min(1, mouth);
    ctx.fillStyle = '#5b1a1a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.48, r * 0.3, r * (0.06 + open * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawGuitar(scene) {
    const { ctx } = this;
    const g = scene.guitar;
    const S = g.S;
    const rock = scene.tone === 'rock';
    ctx.save();
    ctx.translate(g.origin.x, g.origin.y);
    ctx.rotate(Math.atan2(g.dir.y, g.dir.x));
    // Local frame: +x along the neck, +y towards the floor-side of the strings.
    ctx.scale(S, S * g.flip);
    ctx.lineWidth = 0.02;

    // Body
    const grad = ctx.createRadialGradient(-0.15, 0, 0.05, -0.15, 0, 0.75);
    if (rock) {
      grad.addColorStop(0, '#ff3b3b');
      grad.addColorStop(1, '#5a0000');
    } else {
      grad.addColorStop(0, '#ffcf6b');
      grad.addColorStop(0.6, '#d9731f');
      grad.addColorStop(1, '#4a1d06');
    }
    ctx.fillStyle = grad;
    ctx.strokeStyle = rock ? '#ffffff' : '#2a1204';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.ellipse(-0.38, 0, 0.6, 0.6, 0, 0, Math.PI * 2);
    ctx.moveTo(0.64, 0);
    ctx.ellipse(0.22, 0, 0.42, 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.38, 0, 0.6, 0.6, 0, Math.PI * 0.25, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0.22, 0, 0.42, 0.46, 0, -Math.PI * 0.62, Math.PI * 0.62);
    ctx.stroke();

    if (rock) {
      // Pickups + pickguard
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(-0.6, 0.12);
      ctx.quadraticCurveTo(-0.1, 0.5, 0.35, 0.12);
      ctx.lineTo(0.35, 0.12);
      ctx.closePath();
      ctx.fill();
      for (const u of [-0.32, 0.12]) {
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(u - 0.06, -0.14, 0.12, 0.28);
        ctx.fillStyle = '#9ca3af';
        for (let i = 0; i < 6; i++) ctx.fillRect(u - 0.012, -0.11 + i * 0.044, 0.024, 0.02);
      }
    } else {
      // Sound hole with rosette
      ctx.fillStyle = '#120700';
      ctx.beginPath();
      ctx.arc(0, 0, 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f5deb3';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.arc(0, 0, 0.21, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Bridge
    ctx.fillStyle = '#1a0b02';
    ctx.fillRect(GEO.bridge - 0.04, -0.17, 0.08, 0.34);

    // Neck
    const nw = 0.2;
    ctx.fillStyle = '#5b3412';
    ctx.fillRect(GEO.neckStart, -nw / 2, GEO.nut - GEO.neckStart, nw);
    // Chord zones on the fretboard
    const zones = scene.chords.length;
    const zl = (GEO.nut - GEO.zoneEnd) / zones;
    for (let i = 0; i < zones; i++) {
      const u1 = GEO.nut - i * zl;
      if (i === scene.zone) {
        ctx.fillStyle = `rgba(255,214,90,${0.45 + this.flash * 0.4})`;
        ctx.fillRect(u1 - zl, -nw / 2, zl, nw);
      } else if (i % 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(u1 - zl, -nw / 2, zl, nw);
      }
    }
    // Frets
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 0.015;
    for (let i = 0; i <= zones; i++) {
      const u = GEO.nut - i * zl;
      ctx.beginPath();
      ctx.moveTo(u, -nw / 2);
      ctx.lineTo(u, nw / 2);
      ctx.stroke();
    }
    // Headstock + tuners
    ctx.fillStyle = rock ? '#111' : '#3a1f08';
    ctx.beginPath();
    ctx.moveTo(GEO.nut, -nw / 2);
    ctx.lineTo(GEO.head, -0.16);
    ctx.lineTo(GEO.head, 0.16);
    ctx.lineTo(GEO.nut, nw / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d1d5db';
    for (let i = 0; i < 3; i++) {
      const u = GEO.nut + 0.12 + i * 0.13;
      ctx.beginPath();
      ctx.arc(u, -0.17, 0.035, 0, Math.PI * 2);
      ctx.arc(u, 0.17, 0.035, 0, Math.PI * 2);
      ctx.fill();
    }

    // Strings (wobble after each strum)
    for (let s = 0; s < 6; s++) {
      const yb = -0.13 + s * 0.052;
      const yn = -0.075 + s * 0.03;
      const e = this.stringEnergy[s];
      const wob = Math.sin(scene.time * (90 + s * 25)) * e * 0.03;
      ctx.strokeStyle = s < 3 ? '#e8d6a8' : '#f3f4f6';
      ctx.lineWidth = 0.012 - s * 0.0012;
      ctx.beginPath();
      ctx.moveTo(GEO.bridge, yb);
      ctx.quadraticCurveTo((GEO.bridge + GEO.nut) / 2, (yb + yn) / 2 + wob, GEO.nut, yn);
      ctx.stroke();
    }
    ctx.restore();

    // Chord labels, drawn upright beside the neck.
    const fs = Math.max(12, S * 0.17);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < zones; i++) {
      const u = GEO.nut - (i + 0.5) * zl;
      const p = g.at(u, -0.26);
      const active = i === scene.zone;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(scene.chords[i], p.x, p.y);
      ctx.fillStyle = active ? '#ffd65a' : 'rgba(255,255,255,0.75)';
      ctx.fillText(scene.chords[i], p.x, p.y);
    }
  }

  drawParticles(dt) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.particles = this.particles.filter((p) => (p.life -= dt * 0.8) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.glyph, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}

function limb(ctx, pts, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
