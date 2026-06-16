/**
 * rewardService.js
 *
 * Business logic for reward tier evaluation.
 * Separated from UI so it can be tested independently
 * and replaced with server-side logic in the future.
 */

import { evaluateTiers, calcProgress, calcRemaining, allTiersUnlocked } from '../utils/rewardHelpers.js';

/**
 * Evaluates the full reward state for the current cart.
 *
 * @param {number} cartTotal - Current cart value in dollars
 * @param {Array} tiers - Reward tiers from settings
 * @returns {object} Full reward state
 */
export function evaluateRewardState(cartTotal, tiers) {
  const { currentTier, nextTier, unlockedTiers, lockedTiers } = evaluateTiers(cartTotal, tiers);

  const progressGoal = nextTier ? nextTier.goal : (currentTier ? currentTier.goal : 0);
  const progressPercent = calcProgress(cartTotal, progressGoal);
  const remaining = nextTier ? calcRemaining(cartTotal, nextTier.goal) : 0;
  const isComplete = allTiersUnlocked(cartTotal, tiers);

  return {
    currentTier,
    nextTier,
    unlockedTiers,
    lockedTiers,
    progressPercent: isComplete ? 100 : progressPercent,
    remaining,
    isComplete,
    cartTotal,
  };
}
