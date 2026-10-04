// Free version: guitar. A monthly Google Play subscription unlocks every other instrument.
import { BUILD } from './version.js';
import { nativePlugin } from './native.js';

// Play Console: Monetize -> Subscriptions. Product ID and base plan ID must match exactly.
export const PRODUCT_ID = 'full_access';
export const PLAN_ID = 'monthly';
// Free-trial offer on the monthly plan (Play Console offer ID). Google Play only lists it for
// people who are eligible (new subscribers), so if it's there, we offer the trial.
export const TRIAL_OFFER_ID = 'free-trial';
export const TRIAL_DAYS = 7;
const TYPE = 'subs';
export const FREE_INSTRUMENTS = ['guitar'];
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.jppotgieter.airguitar';
const CACHE_KEY = 'airguitar-unlocked';

// Android PurchaseState: 1 = purchased, 2 = pending (e.g. paying with cash at a shop).
const isPurchased = (t) => t && (t.purchaseState === undefined || String(t.purchaseState) === '1');
const isPending = (t) => t && String(t.purchaseState) === '2';

function billingPlugin() {
  return nativePlugin('NativePurchases');
}

export class Entitlements {
  constructor(onChange) {
    this.onChange = onChange;
    this.plugin = BUILD.channel === 'play' ? billingPlugin() : null;
    this.price = null;
    this.trial = null; // eligible free-trial offer, if any
    this.base = null; // the plain monthly plan
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
      const { products } = await this.plugin.getProducts({ productIdentifiers: [PRODUCT_ID], productType: TYPE });
      // For subscriptions the plugin returns one entry per offer; prefer our monthly base plan.
      // (On Android it reports the base plan in `identifier` and the product in `planIdentifier`.)
      const onPlan = (p) => p.identifier === PLAN_ID || p.planIdentifier === PLAN_ID;
      this.base = products?.find((p) => onPlan(p) && !p.offerId) || products?.find(onPlan) || products?.[0] || null;
      this.trial = products?.find((p) => onPlan(p) && p.offerId === TRIAL_OFFER_ID) || null;
      this.price = this.base?.priceString || null;
      this.ready = true;
      await this.refresh();
    } catch (e) {
      // No Play services / offline: keep the cached answer.
      console.warn('Billing unavailable', e);
    }
    this.onChange();
  }

  // Ask Google Play whether this account has an active subscription. Authoritative when it
  // answers: cancelled subscriptions stay active until the paid month ends, then drop off.
  async refresh() {
    if (!this.plugin) return;
    const { purchases } = await this.plugin.getPurchases({ productType: TYPE });
    const mine = (purchases || []).filter((p) => p.productIdentifier === PRODUCT_ID);
    this.set(mine.some(isPurchased));
    this.pending = !this.unlocked && mine.some(isPending);
  }

  // Resolves to 'unlocked', 'pending' or 'cancelled'; throws on errors.
  async buy() {
    if (!this.canBuy) throw new Error('Purchases are only available in the Google Play app.');
    let t;
    try {
      // Ask for the exact offer: the free trial when eligible, otherwise the plain monthly plan.
      const offerToken = (this.trial || this.base)?.offerToken;
      t = await this.plugin.purchaseProduct({
        productIdentifier: PRODUCT_ID,
        planIdentifier: PLAN_ID,
        productType: TYPE,
        ...(offerToken ? { offerToken } : {}),
      });
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e?.code || e))) return 'cancelled';
      throw e;
    }
    if (isPurchased(t)) {
      const trial = !!this.trial;
      this.trial = null; // one trial per customer
      this.set(true);
      return trial ? 'trial' : 'unlocked';
    }
    if (isPending(t)) return 'pending';
    await this.refresh();
    return this.unlocked ? 'unlocked' : 'cancelled';
  }

  // Google Play's own page for cancelling or changing the subscription.
  async manage() {
    await this.plugin?.manageSubscriptions?.();
  }

  async restore() {
    if (!this.plugin) return false;
    await this.plugin.restorePurchases?.();
    await this.refresh();
    return this.unlocked;
  }
}
