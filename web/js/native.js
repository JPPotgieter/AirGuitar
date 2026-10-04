// Access to native Android features (Capacitor plugins).
// The app isn't bundled, so Capacitor's JS library (and its registerPlugin) isn't loaded. The
// native bridge instead publishes every plugin as window.Capacitor.Plugins.<Name>, with its
// methods (returning promises) and addListener().
export const isNative = !!window.Capacitor?.isNativePlatform?.();

export function nativePlugin(name) {
  if (!isNative) return null;
  const cap = window.Capacitor;
  return cap.Plugins?.[name] ?? cap.registerPlugin?.(name) ?? null;
}
