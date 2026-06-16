/**
 * rewardTypes.js
 *
 * Enum-style constants for reward tier types.
 * Add new reward types here as CartElevate grows.
 */

export const REWARD_TYPES = {
  FREE_SHIPPING: 'FREE_SHIPPING',
  FREE_GIFT: 'FREE_GIFT',
  DISCOUNT: 'DISCOUNT',
  LOYALTY_POINTS: 'LOYALTY_POINTS',
  FREE_SAMPLE: 'FREE_SAMPLE',
};

/** Human-readable labels for each reward type */
export const REWARD_TYPE_LABELS = {
  [REWARD_TYPES.FREE_SHIPPING]: 'Free Shipping',
  [REWARD_TYPES.FREE_GIFT]: 'Free Gift',
  [REWARD_TYPES.DISCOUNT]: 'Discount',
  [REWARD_TYPES.LOYALTY_POINTS]: 'Loyalty Points',
  [REWARD_TYPES.FREE_SAMPLE]: 'Free Sample',
};

/** Icons mapped to reward types */
export const REWARD_TYPE_ICONS = {
  [REWARD_TYPES.FREE_SHIPPING]: '🎁',
  [REWARD_TYPES.FREE_GIFT]: '🎁',
  [REWARD_TYPES.DISCOUNT]: '💸',
  [REWARD_TYPES.LOYALTY_POINTS]: '⭐',
  [REWARD_TYPES.FREE_SAMPLE]: '🎀',
};
