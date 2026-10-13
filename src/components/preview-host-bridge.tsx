/**
 * Preview host bridge for embedded preview environments.
 *
 * This is intentionally a no-op in a standalone app. The app keeps its normal
 * router behavior without depending on the Grok preview host bridge.
 */

export function PreviewHostBridge() {
  return null;
}
