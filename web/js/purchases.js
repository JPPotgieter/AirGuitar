// Free version: guitar. One Google Play in-app purchase unlocks every other instrument.
import { BUILD } from './version.js';

export const PRODUCT_ID = 'all_instruments';
export const FREE_INSTRUMENTS = ['guitar'];
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.jppotgieter.airguitar';
const CACHE_KEY = 'airguitar-unlocked';

// Android PurchaseState: 1 = purchased, 2 = pending (e.g. paying with cash at a shop).
const isPurchased = (t) => t && (t.purchaseState === undefined || String(t.purchaseState) === '1');
const isPending = (t) => t && String(t.purchaseState) === '2';

function billingPlugin() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.registerPlugin?.('NativePurchases') ?? cap.Plugins?.NativePurchases ?? null;
}

export class Entitlements {
  constructor(onChange) {
    this.onChange = onChange;
    this.plugin = BUILD.channel === 'play' ? billingPlugin() : null;
    this.price = null;
    this.ready = false;
    let cached = false;
    try {
      cached = localStorage.getItem(CACHE_KEY) === '1';
    } catch {}
    // Test builds (sideloaded from GitHub) have everything unlocked for trying things out.
    this.unlocked = BUILD.channel === 'test' || cached;
  }

  // Can this build sell the upgrade? Only the Google Play build can.
  get canBuy() {
    return !!this.plugin && this.ready;
  }

  isLocked(instrumentId) {
    return !this.unlocked && !FREE_INSTRUMENTS.includes(instrumentId);
  }

  set(unlocked) {
    if (unlocked === this.unlocked) return;
    this.unlocked = unlocked;
    try {
      localStorage.setItem(CACHE_KEY, unlocked ? '1' : '0');
    } catch {}
    this.onChange();
  }

  async init() {
    if (!this.plugin) return;
    try {
      const { isBillingSupported } = await this.plugin.isBillingSupported();
      if (!isBillingSupported) return;
      const { products } = await this.plugin.getProducts({ productIdentifiers: [PRODUCT_ID], productType: 'inapp' });
      this.price = products?.[0]?.priceString || null;
      this.ready = true;
      await this.refresh();
    } catch (e) {
      // No Play services / offline: keep the cached answer.
      console.warn('Billing unavailable', e);
    }
    this.onChange();
  }

  // Ask Google Play what this account owns. Authoritative when it answers (handles refunds too).
  async refresh() {
    if (!this.plugin) return;
    const { purchases } = await this.plugin.getPurchases({ productType: 'inapp' });
    const mine = (purchases || []).filter((p) => p.productIdentifier === PRODUCT_ID);
    this.set(mine.some(isPurchased));
    this.pending = !this.unlocked && mine.some(isPending);
  }

  // Resolves to 'unlocked', 'pending' or 'cancelled'; throws on errors.
  async buy() {
    if (!this.canBuy) throw new Error('Purchases are only available in the Google Play app.');
    let t;
    try {
      t = await this.plugin.purchaseProduct({ productIdentifier: PRODUCT_ID, productType: 'inapp' });
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e?.code || e))) return 'cancelled';
      throw e;
    }
    if (isPurchased(t)) {
      this.set(true);
      return 'unlocked';
    }
    if (isPending(t)) return 'pending';
    await this.refresh();
    return this.unlocked ? 'unlocked' : 'cancelled';
  }

  async restore() {
    if (!this.plugin) return false;
    await this.plugin.restorePurchases?.();
    await this.refresh();
    return this.unlocked;
  }
}
