/**
 * RewardTierTracker.js
 *
 * Shows all reward tiers as a visual step tracker.
 * Dynamically renders from settings.rewardTiers — supports unlimited tiers.
 */
import React from 'react';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { formatCurrency } from '../../utils/cartHelpers.js';

export function RewardTierTracker() {
  const { rewardState, settings } = useCartElevate();
  if (!rewardState || !settings) return null;

  const { unlockedTiers } = rewardState;
  const tiers = settings.rewardTiers || [];
  const currencySymbol = settings.currencySymbol || '$';
  const unlockedIds = new Set(unlockedTiers.map((t) => t.id));

  return (
    <div className="ce-reward-tracker">
      {tiers.map((tier) => {
        const isUnlocked = unlockedIds.has(tier.id);
        const isNext = rewardState.nextTier?.id === tier.id;
        return (
          <div
            key={tier.id}
            className={`ce-reward-item${isUnlocked ? ' unlocked' : isNext ? ' active' : ''}`}
          >
            <span className={`ce-reward-dot${isUnlocked ? ' unlocked' : isNext ? ' active' : ''}`} />
            <span>
              {isUnlocked
                ? `${tier.unlockedMessage}`
                : isNext
                ? `${tier.icon} ${formatCurrency(Math.max(0, tier.goal - rewardState.cartTotal), currencySymbol)} away from ${tier.rewardLabel}`
                : `${tier.icon} ${tier.rewardLabel} at ${formatCurrency(tier.goal, currencySymbol)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default RewardTierTracker;
