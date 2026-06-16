/**
 * featureTypes.js
 *
 * Registry of all CartElevate feature keys.
 * When adding a new feature module, add its key here first.
 *
 * FeatureRenderer uses these keys to look up enabled features
 * from settings and render the correct component.
 */

export const FEATURE_TYPES = {
  PROGRESS_BAR: 'progressBar',
  REWARD_TIERS: 'rewardTiers',
  UPSELLS: 'upsells',
  PACKAGE_PROTECTION: 'packageProtection',
  GIFT_WRAPPING: 'giftWrapping',
};

/**
 * Render order — features are rendered top to bottom in this order.
 * Reorder here without touching any component.
 */
export const FEATURE_RENDER_ORDER = [
  FEATURE_TYPES.PROGRESS_BAR,
  FEATURE_TYPES.REWARD_TIERS,
  FEATURE_TYPES.UPSELLS,
  FEATURE_TYPES.PACKAGE_PROTECTION,
  FEATURE_TYPES.GIFT_WRAPPING,
];
