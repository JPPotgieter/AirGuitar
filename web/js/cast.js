// Phone side of Google Cast: the cast button, connection state, and sending to the TV app.
import { nativePlugin } from './native.js';

export class CastLink {
  constructor(onChange) {
    this.plugin = nativePlugin('GoogleCast');
    this.onChange = onChange;
    this.available = false; // a Chromecast is on the network
    this.state = 'idle'; // idle | connecting | connected
    this.device = '';
  }

  get connected() {
    return this.state === 'connected';
  }

  async init() {
    if (!this.plugin) return;
    try {
      this.plugin.addListener('castState', (s) => this.update(s));
      this.update(await this.plugin.getState());
    } catch (e) {
      console.warn('Cast unavailable', e);
    }
  }

  update(s) {
    if (!s) return;
    const was = this.state;
    this.available = !!s.available;
    this.state = s.state || 'idle';
    this.device = s.device || '';
    this.onChange(was);
  }

  // Shown like YouTube's: only when a Chromecast is around (or we're already casting).
  get showButton() {
    return !!this.plugin && (this.available || this.state !== 'idle');
  }

  picker() {
    return this.plugin?.showPicker().catch((e) => console.warn(e));
  }

  stop() {
    return this.plugin?.stop().catch(() => {});
  }

  // Fire-and-forget; frames go out ~30 times a second.
  send(msg) {
    if (!this.connected) return;
    this.plugin.send({ message: JSON.stringify(msg) }).catch(() => {});
  }
}
