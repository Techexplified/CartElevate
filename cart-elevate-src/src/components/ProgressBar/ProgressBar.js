/**
 * ProgressBar.js
 *
 * Displays a visual progress bar toward the next reward tier.
 * Fully driven by context — reads cartTotal and rewardState.
 *
 * Reusable: pass a specific tier via props to override context.
 */
import React from 'react';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { formatCurrency } from '../../utils/cartHelpers.js';

/**
 * @param {{ tier?: object }} props
 *   tier — optional override tier (for multi-bar layouts)
 */
export function ProgressBar({ tier }) {
  const { rewardState, cartTotal, settings } = useCartElevate();
  if (!rewardState || !settings) return null;

  const currencySymbol = window.Shopify?.currency?.symbol || settings.currencySymbol || '$';
  const tiers = settings.rewardTiers || [];
  if (tiers.length === 0) return null;

  // Sort tiers ascending by goal
  const sortedTiers = [...tiers].sort((a, b) => a.goal - b.goal);
  const maxGoal = sortedTiers[sortedTiers.length - 1].goal;

  const activeTier = tier || rewardState.nextTier;
  const isComplete = rewardState.isComplete;

  let message, sublabel;

  if (isComplete) {
    message = '🎉 All rewards unlocked! Enjoy your benefits.';
    sublabel = '';
  } else if (activeTier) {
    const remaining = Math.max(0, activeTier.goal - cartTotal);
    message = `${activeTier.icon} Add ${formatCurrency(remaining, currencySymbol)} more to unlock ${activeTier.rewardLabel}`;
    sublabel = `${formatCurrency(cartTotal, currencySymbol)} / ${formatCurrency(maxGoal, currencySymbol)}`;
  }

  const overallPercent = Math.min(Math.round((cartTotal / maxGoal) * 100), 100);

  return (
    <div className={`ce-progress-wrap${isComplete ? ' complete' : ''}`}>
      <p className={`ce-progress-message${isComplete ? ' unlocked' : ''}`}>
        {message}
      </p>

      <div className="ce-progress-container">
        <div className="ce-progress-track" role="progressbar" aria-valuenow={overallPercent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`ce-progress-fill${isComplete ? ' complete' : ''}`}
            style={{ width: `${overallPercent}%` }}
          />
        </div>

        {sortedTiers.map((t, index) => {
          const isUnlocked = cartTotal >= t.goal;
          const positionPercent = (t.goal / maxGoal) * 100;
          const isLast = index === sortedTiers.length - 1;
          const isEven = index % 2 === 0;
          const labelClass = `ce-milestone-label${isLast ? ' is-last' : ''}${!isEven ? ' label-below' : ' label-above'}`;
          return (
            <div
              key={t.id}
              className={`ce-progress-milestone${isUnlocked ? ' unlocked' : ''}`}
              style={{ left: `${positionPercent}%` }}
            >
              <span className={labelClass}>{t.rewardLabel}</span>
              <div className="ce-milestone-dot">
                <span className="ce-milestone-check">✓</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ce-progress-footer">
        {sublabel && <p className="ce-progress-sublabel">{sublabel}</p>}
      </div>
    </div>
  );
}

export default ProgressBar;
