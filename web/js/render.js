// All canvas drawing: stage, avatar, guitar, particles.
// Guitar dimensions are in multiples of S (the avatar's shoulder width).
export const GEO = {
  bridge: -0.55,
  neckStart: 0.42,
  nut: 2.7,
  zoneEnd: 1.05, // chords live between zoneEnd and nut
  head: 3.15,
};

import { DEFAULT_LOOK } from './looks.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.flash = 0;
    this.stringEnergy = new Array(6).fill(0);
    this.look = { ...DEFAULT_LOOK };
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
    const skinDark = shade(look.skin, -0.18);
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
    limb(ctx, [b.neckBase, b.head.c], S * 0.2, skinDark);
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
    ctx.strokeStyle = scene.guitarStyle.strap;
    ctx.lineWidth = S * 0.09;
    ctx.beginPath();
    ctx.moveTo(strapStart.x, strapStart.y);
    ctx.quadraticCurveTo(b.shoulder[g.fretSide].x, b.shoulder[g.fretSide].y - S * 0.1, strapEnd.x, strapEnd.y);
    ctx.stroke();

    this.drawGuitar(scene);

    // Arms go over the guitar so hands sit on the strings.
    for (const side of ['L', 'R']) {
      limb(ctx, [b.shoulder[side], b.elbow[side]], S * 0.27, look.shirt);
      limb(ctx, [b.elbow[side], b.wrist[side]], S * 0.2, look.skin);
      const hand = b.hand[side];
      ctx.fillStyle = look.skin;
      ctx.strokeStyle = skinDark;
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
    this.drawHairBack(r);
    // Face
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.88, r, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawHairFront(r);
    this.drawEyes(r);
    // Mouth: opens when you rock out
    const open = Math.min(1, mouth);
    ctx.fillStyle = '#5b1a1a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.48, r * 0.3, r * (0.06 + open * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawHat(r);
    ctx.restore();
  }

  // Head-local drawing helpers: origin at the face centre, r = head radius.
  drawHairBack(r) {
    const { ctx, look } = this;
    ctx.fillStyle = look.hairColor;
    ctx.beginPath();
    switch (look.hairStyle) {
      case 'spiky':
        for (let i = 0; i <= 9; i++) {
          const a = Math.PI + (i / 9) * Math.PI;
          const rr = i % 2 ? r * 1.45 : r * 1.05;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr - r * 0.1;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.lineTo(r * 1.05, r * 0.6);
        ctx.lineTo(-r * 1.05, r * 0.6);
        break;
      case 'long':
        roundRect(ctx, -r * 1.08, -r * 1.12, r * 2.16, r * 2.75, r * 0.9);
        break;
      case 'mohawk':
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI * (1.3 + (i / 6) * 0.4);
          const rr = i % 2 ? r * 1.75 : r * 0.95;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        break;
      case 'afro':
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          ctx.moveTo(Math.cos(a) * r * 1.15 + r * 0.42, Math.sin(a) * r * 1.15 - r * 0.3);
          ctx.arc(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15 - r * 0.3, r * 0.42, 0, Math.PI * 2);
        }
        ctx.moveTo(r * 1.3, -r * 0.3);
        ctx.arc(0, -r * 0.3, r * 1.3, 0, Math.PI * 2);
        break;
      default:
        return;
    }
    ctx.closePath();
    ctx.fill();
  }

  drawHairFront(r) {
    const { ctx, look } = this;
    ctx.fillStyle = look.hairColor;
    ctx.beginPath();
    switch (look.hairStyle) {
      case 'spiky':
        ctx.ellipse(-r * 0.1, -r * 0.72, r * 0.85, r * 0.38, -0.2, 0, Math.PI * 2);
        break;
      case 'long':
        ctx.ellipse(r * 0.15, -r * 0.75, r * 0.85, r * 0.4, 0.25, 0, Math.PI * 2);
        break;
      case 'afro':
        ctx.ellipse(0, -r * 0.82, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
        break;
      case 'buzz':
        ctx.ellipse(0, -r * 0.05, r * 0.9, r * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92);
        ctx.quadraticCurveTo(0, -r * 0.55, -r * 0.88, -r * 0.3);
        break;
      case 'bald':
        // A little shine
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.ellipse(-r * 0.35, -r * 0.65, r * 0.18, r * 0.08, -0.5, 0, Math.PI * 2);
        break;
      default:
        return;
    }
    ctx.fill();
  }

  drawEyes(r) {
    const { ctx, look } = this;
    const eye = (x) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x, -r * 0.05, r * 0.16, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f1308';
      ctx.beginPath();
      ctx.arc(x, -r * 0.04, r * 0.075, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (look.eyewear) {
      case 'shades':
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
        break;
      case 'round':
        eye(-r * 0.38);
        eye(r * 0.38);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = r * 0.07;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * r * 0.38, -r * 0.05, r * 0.27, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-r * 0.11, -r * 0.08);
        ctx.quadraticCurveTo(0, -r * 0.16, r * 0.11, -r * 0.08);
        ctx.stroke();
        break;
      case 'star':
        ctx.fillStyle = look.accent;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          starPath(ctx, sx * r * 0.4, -r * 0.05, r * 0.36, r * 0.17, 5);
          ctx.fill();
        }
        ctx.fillRect(-r * 0.12, -r * 0.1, r * 0.24, r * 0.06);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * r * 0.4, -r * 0.04, r * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      default:
        eye(-r * 0.36);
        eye(r * 0.36);
        // Eyebrows
        ctx.strokeStyle = look.hairStyle === 'bald' ? '#3b2a1a' : look.hairColor;
        ctx.lineWidth = r * 0.08;
        ctx.lineCap = 'round';
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.52, -r * 0.27);
          ctx.lineTo(sx * r * 0.2, -r * 0.33);
          ctx.stroke();
        }
    }
  }

  drawHat(r) {
    const { ctx, look } = this;
    ctx.fillStyle = look.accent;
    switch (look.hat) {
      case 'cap':
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.5, r * 0.97, r * 0.68, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(look.accent, -0.25);
        ctx.beginPath();
        ctx.ellipse(r * 0.55, -r * 0.5, r * 0.75, r * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'cowboy': {
        const c = '#8b5a2b';
        ctx.fillStyle = c;
        ctx.beginPath();
        roundRect(ctx, -r * 0.72, -r * 1.55, r * 1.44, r * 1.0, r * 0.35);
        ctx.fill();
        ctx.fillStyle = look.accent;
        ctx.fillRect(-r * 0.72, -r * 0.82, r * 1.44, r * 0.16);
        ctx.fillStyle = shade(c, -0.15);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.62, r * 1.75, r * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'beanie':
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.42, r * 0.98, r * 0.85, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(look.accent, -0.25);
        ctx.beginPath();
        roundRect(ctx, -r * 1.0, -r * 0.62, r * 2.0, r * 0.3, r * 0.12);
        ctx.fill();
        ctx.fillStyle = '#f9fafb';
        ctx.beginPath();
        ctx.arc(0, -r * 1.3, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  drawGuitar(scene) {
    const { ctx } = this;
    const g = scene.guitar;
    const S = g.S;
    const gs = scene.guitarStyle;
    ctx.save();
    ctx.translate(g.origin.x, g.origin.y);
    ctx.rotate(Math.atan2(g.dir.y, g.dir.x));
    // Local frame: +x along the neck, +y towards the floor-side of the strings.
    ctx.scale(S, S * g.flip);

    // Body
    const grad = ctx.createRadialGradient(-0.15, 0, 0.05, -0.15, 0, 0.8);
    grad.addColorStop(0, gs.body[0]);
    grad.addColorStop(0.6, gs.body[1]);
    grad.addColorStop(1, gs.body[2]);
    ctx.fillStyle = grad;
    ctx.strokeStyle = gs.outline;
    // Stroke first, then fill over it, so only the outer edge of the outline shows.
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    bodyPath(ctx, gs.shape);
    ctx.stroke();
    ctx.fill();

    if (gs.shape === 'acoustic') {
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
    } else {
      // Pickguard, pickups and knobs
      ctx.save();
      ctx.fillStyle = gs.guard;
      ctx.globalAlpha *= 0.9;
      ctx.beginPath();
      ctx.moveTo(-0.5, 0.1);
      ctx.quadraticCurveTo(-0.15, 0.42, 0.3, 0.12);
      ctx.lineTo(0.3, 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      for (const u of [-0.3, 0.1]) {
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(u - 0.06, -0.14, 0.12, 0.28);
        ctx.fillStyle = '#9ca3af';
        for (let i = 0; i < 6; i++) ctx.fillRect(u - 0.012, -0.11 + i * 0.044, 0.024, 0.02);
      }
      ctx.fillStyle = '#e5e7eb';
      for (const [u, v] of [[-0.55, 0.28], [-0.4, 0.34]]) {
        ctx.beginPath();
        ctx.arc(u, v, 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
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
    ctx.fillStyle = gs.head;
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

function starPath(ctx, cx, cy, outer, inner, points) {
  for (let i = 0; i <= points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? inner : outer;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// Guitar body outlines in guitar-local units (sound hole / strum point at 0,0; neck towards +x).
function bodyPath(ctx, shape) {
  switch (shape) {
    case 'strat':
      ctx.moveTo(0.5, -0.12);
      ctx.bezierCurveTo(0.62, -0.2, 0.62, -0.42, 0.42, -0.42);
      ctx.bezierCurveTo(0.25, -0.42, 0.2, -0.3, 0.05, -0.36);
      ctx.bezierCurveTo(-0.15, -0.6, -0.95, -0.62, -0.95, 0);
      ctx.bezierCurveTo(-0.95, 0.62, -0.15, 0.6, 0.05, 0.36);
      ctx.bezierCurveTo(0.2, 0.3, 0.3, 0.38, 0.4, 0.36);
      ctx.bezierCurveTo(0.55, 0.33, 0.55, 0.18, 0.5, 0.12);
      ctx.closePath();
      break;
    case 'lespaul':
      ctx.moveTo(0.45, -0.14);
      ctx.bezierCurveTo(0.5, -0.4, 0.2, -0.46, 0.05, -0.36);
      ctx.bezierCurveTo(-0.15, -0.6, -0.95, -0.6, -0.95, 0);
      ctx.bezierCurveTo(-0.95, 0.6, -0.15, 0.6, 0.05, 0.38);
      ctx.bezierCurveTo(0.15, 0.3, 0.2, 0.2, 0.28, 0.14);
      ctx.lineTo(0.45, 0.14);
      ctx.closePath();
      break;
    case 'flyingv':
      ctx.moveTo(0.5, -0.12);
      ctx.lineTo(-1.0, -0.62);
      ctx.lineTo(-1.08, -0.42);
      ctx.lineTo(-0.45, 0);
      ctx.lineTo(-1.08, 0.42);
      ctx.lineTo(-1.0, 0.62);
      ctx.lineTo(0.5, 0.12);
      ctx.closePath();
      break;
    case 'star':
      starPath(ctx, -0.3, 0, 0.78, 0.36, 5);
      break;
    default: // acoustic: two bouts and a waist
      ctx.ellipse(-0.38, 0, 0.6, 0.6, 0, 0, Math.PI * 2);
      ctx.moveTo(0.64, 0);
      ctx.ellipse(0.22, 0, 0.42, 0.46, 0, 0, Math.PI * 2);
  }
}

// Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Small side-on picture of a guitar for the guitar picker.
export function drawGuitarThumb(canvas, gs) {
  const ctx = canvas.getContext('2d');
  const k = canvas.height / 1.5;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width * 0.3, canvas.height / 2);
  ctx.rotate(-0.12);
  ctx.scale(k, k);
  ctx.fillStyle = '#5b3412';
  ctx.fillRect(0.4, -0.08, 1.75, 0.16);
  ctx.fillStyle = gs.head;
  ctx.beginPath();
  ctx.moveTo(2.15, -0.08);
  ctx.lineTo(2.5, -0.14);
  ctx.lineTo(2.5, 0.14);
  ctx.lineTo(2.15, 0.08);
  ctx.closePath();
  ctx.fill();
  const grad = ctx.createRadialGradient(-0.15, 0, 0.05, -0.15, 0, 0.8);
  grad.addColorStop(0, gs.body[0]);
  grad.addColorStop(0.6, gs.body[1]);
  grad.addColorStop(1, gs.body[2]);
  ctx.fillStyle = grad;
  ctx.strokeStyle = gs.outline;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  bodyPath(ctx, gs.shape);
  ctx.stroke();
  ctx.fill();
  if (gs.shape === 'acoustic') {
    ctx.fillStyle = '#120700';
    ctx.beginPath();
    ctx.arc(0, 0, 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(-0.36, -0.13, 0.12, 0.26);
    ctx.fillRect(0.04, -0.13, 0.12, 0.26);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.012;
  for (let i = 0; i < 6; i++) {
    const v = -0.06 + i * 0.024;
    ctx.beginPath();
    ctx.moveTo(-0.55, v * 1.6);
    ctx.lineTo(2.15, v);
    ctx.stroke();
  }
  ctx.restore();
}
