/**
 * CartElevateExtension.js
 *
 * Root component for the CartElevate Shopify Theme App Extension.
 *
 * This is the ONLY thing CartElevate renders in the merchant's storefront.
 * It mounts inside the merchant's existing cart drawer or cart page via
 * the app-embed.liquid block — it does NOT own any cart UI.
 *
 * What CartElevate owns:
 *   ✅ Progress Bar
 *   ✅ Reward Tier Messaging
 *   ✅ Upsell Section
 *   ✅ Package Protection
 *   ✅ Gift Wrapping
 *
 * What the merchant theme owns (NOT our concern):
 *   ❌ Cart header / title
 *   ❌ Cart items / product rows
 *   ❌ Quantity controls
 *   ❌ Cart totals
 *   ❌ Checkout button
 *   ❌ Cart drawer shell
 */
import React from 'react';
import { CartElevateProvider } from '../../context/CartElevateContext.js';
import { FeatureRenderer } from '../FeatureRenderer/FeatureRenderer.js';
import { LoadingState } from '../LoadingState/LoadingState.js';
import { useCartElevate } from '../../context/CartElevateContext.js';

/**
 * Inner render tree — consumes context set up by CartElevateProvider.
 * Renders only enhancement modules via FeatureRenderer.
 */
function CartElevateModules() {
  const { loading, error, theme } = useCartElevate();

  // Silent fail — never break the merchant's cart on error
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CartElevate] Error loading settings:', error);
    }
    return null;
  }

  if (loading) {
    return <LoadingState />;
  }

  const activeTheme = theme || 'dynamic';

  return (
    // ce-root scopes all CartElevate CSS to avoid merchant theme conflicts
    <div className={`ce-root ce-theme--${activeTheme}`} data-cart-elevate="true">
      <FeatureRenderer />
    </div>
  );
}

/**
 * CartElevateExtension
 *
 * The public-facing root component.
 * Mounted by index.js into #cart-elevate-root injected by app-embed.liquid.
 *
 * @param {{ shopDomain?: string }} props
 */
export function CartElevateExtension({ shopDomain }) {
  return (
    <CartElevateProvider shopDomain={shopDomain}>
      <CartElevateModules />
    </CartElevateProvider>
  );
}

export default CartElevateExtension;
