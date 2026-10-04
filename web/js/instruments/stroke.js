// Shared by the trombone and saxophone: a "stroke" is the hand moving along the instrument and
// then stopping (or turning back). The note sounds when the stroke ends, at the new position.
export class StrokeDetector {
  constructor({ moveSpeed = 1.2, stopSpeed = 0.45 } = {}) {
    this.moveSpeed = moveSpeed; // shoulder-widths/s that counts as moving
    this.stopSpeed = stopSpeed; // below this, the hand has stopped
    this.reset();
  }
  reset() {
    this.e = null;
    this.t = 0;
    this.peak = 0;
    this.dir = 0;
  }
  // e: hand position along the instrument (shoulder-widths), t: seconds.
  // Returns the stroke's peak speed when a stroke ends, else 0.
  push(e, t) {
    if (!Number.isFinite(e) || (this.e !== null && t - this.t < 0.011)) return 0;
    const prev = this.e;
    const dt = t - this.t;
    this.e = e;
    this.t = t;
    if (prev === null) return 0;
    const v = (e - prev) / dt;
    const speed = Math.abs(v);
    let fired = 0;
    if (speed > this.moveSpeed) {
      // Turning back mid-stroke ends the first stroke.
      if (this.dir && Math.sign(v) !== this.dir && this.peak) fired = this.end();
      this.dir = Math.sign(v);
      this.peak = Math.max(this.peak, speed);
    } else if (this.peak && speed < this.stopSpeed) {
      fired = this.end();
      this.dir = 0;
    }
    return fired;
  }
  end() {
    const peak = this.peak;
    this.peak = 0;
    return peak;
  }
}
