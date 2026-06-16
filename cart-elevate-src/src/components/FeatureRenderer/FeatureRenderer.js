/**
 * FeatureRenderer.js
 *
 * Plugin registry engine for CartElevate.
 *
 * HOW IT WORKS:
 * 1. FEATURE_MAP maps feature keys → React components
 * 2. FEATURE_RENDER_ORDER defines the display sequence
 * 3. FeatureRenderer reads `features` from context and renders
 *    only enabled components in order
 *
 * HOW TO ADD A NEW FEATURE (zero modification to existing code):
 * 1. Create your new component
 * 2. Add its key to featureTypes.js FEATURE_TYPES
 * 3. Add it to FEATURE_RENDER_ORDER in featureTypes.js
 * 4. Register it in FEATURE_MAP below
 * 5. Add it to mockSettings.js features object
 * Done — FeatureRenderer automatically renders it.
 */
import React from 'react';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { FEATURE_TYPES, FEATURE_RENDER_ORDER } from '../../constants/featureTypes.js';

// ── Feature component imports ──────────────────────────────────
import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import { RewardTierTracker } from '../RewardTierTracker/RewardTierTracker.js';
import { UpsellSection } from '../UpsellSection/UpsellSection.js';
import { PackageProtection } from '../PackageProtection/PackageProtection.js';
import { GiftWrapping } from '../GiftWrapping/GiftWrapping.js';

/**
 * FEATURE_MAP — the plugin registry.
 * Maps feature keys to React components.
 *
 * To register a new module, add one line here.
 * No other files need to change.
 */
const FEATURE_MAP = {
  [FEATURE_TYPES.PROGRESS_BAR]: ProgressBar,
  [FEATURE_TYPES.REWARD_TIERS]: RewardTierTracker,
  [FEATURE_TYPES.UPSELLS]: UpsellSection,
  [FEATURE_TYPES.PACKAGE_PROTECTION]: PackageProtection,
  [FEATURE_TYPES.GIFT_WRAPPING]: GiftWrapping,
};

/**
 * FeatureRenderer
 *
 * Dynamically renders all enabled feature modules in configured order.
 * Adding a new feature requires zero changes to this component.
 */
export function FeatureRenderer() {
  const { features, loading } = useCartElevate();

  if (loading) return null;

  return (
    <>
      {FEATURE_RENDER_ORDER.map((featureKey) => {
        const isEnabled = features[featureKey];
        const Component = FEATURE_MAP[featureKey];

        if (!isEnabled || !Component) return null;

        return <Component key={featureKey} />;
      })}
    </>
  );
}

export default FeatureRenderer;
