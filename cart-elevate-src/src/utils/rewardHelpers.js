/**
 * rewardHelpers.js
 *
 * Pure utility functions for reward tier calculations.
 * All math lives here — components only consume results.
 */

/**
 * Finds the current active tier (the highest tier that has NOT been unlocked yet)
 * and the next upcoming tier.
 *
 * @param {number} cartTotal - Current cart total in dollars
 * @param {Array} tiers - Array of reward tier objects from settings
 * @returns {{ currentTier: object|null, nextTier: object|null, unlockedTiers: Array }}
 */
export function evaluateTiers(cartTotal, tiers) {
  if (!tiers || tiers.length === 0) {
    return { currentTier: null, nextTier: null, unlockedTiers: [] };
  }

  const sorted = [...tiers].sort((a, b) => a.goal - b.goal);
  const unlockedTiers = sorted.filter((t) => cartTotal >= t.goal);
  const lockedTiers = sorted.filter((t) => cartTotal < t.goal);

  return {
    /** The highest tier the customer has unlocked */
    currentTier: unlockedTiers.length > 0 ? unlockedTiers[unlockedTiers.length - 1] : null,
    /** The next tier the customer is working toward */
    nextTier: lockedTiers.length > 0 ? lockedTiers[0] : null,
    /** All unlocked tiers */
    unlockedTiers,
    /** All locked tiers */
    lockedTiers,
  };
}

/**
 * Calculates progress percentage toward a goal.
 * @param {number} current
 * @param {number} goal
 * @returns {number} 0–100
 */
export function calcProgress(current, goal) {
  if (!goal || goal === 0) return 100;
  return Math.min(Math.round((current / goal) * 100), 100);
}

/**
 * Returns the dollar amount remaining to reach a goal.
 * @param {number} current
 * @param {number} goal
 * @returns {number}
 */
export function calcRemaining(current, goal) {
  return Math.max(0, goal - current);
}

/**
 * Checks if all tiers have been unlocked.
 * @param {number} cartTotal
 * @param {Array} tiers
 * @returns {boolean}
 */
export function allTiersUnlocked(cartTotal, tiers) {
  if (!tiers || tiers.length === 0) return false;
  return tiers.every((t) => cartTotal >= t.goal);
}
