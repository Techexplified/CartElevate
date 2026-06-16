/**
 * settingsService.js
 *
 * Responsible for loading merchant settings.
 * Parses the window.CartElevateSettings injected by the app embed block
 * and falls back to mockSettings if not present.
 */

import { mockSettings } from '../config/mockSettings.js';

/**
 * Fetches settings for a given shop.
 * @param {string} [shopDomain] - The merchant's myshopify.com domain
 * @returns {Promise<object>} Resolved settings object
 */
export async function fetchSettings(shopDomain) {
  // Simulate network latency during development
  await new Promise((resolve) => setTimeout(resolve, 200));

  let raw = window.CartElevateSettings;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      console.error('[CartElevate] Failed to parse CartElevateSettings:', e);
    }
  }

  if (!raw) {
    console.log('[CartElevate] No custom settings found, using defaults/mock settings.');
    return mockSettings;
  }

  console.log('[CartElevate] Loaded settings from shop metafield:', raw);

  // 1. Map goals to rewardTiers
  const rawGoals = raw.goals || [];
  const rewardTiers = rawGoals
    .filter((g) => g.spendGoal && String(g.spendGoal).trim() !== '')
    .map((goal, index) => {
      const cleanGoal = String(goal.spendGoal || '').replace(/[^0-9.]/g, '');
      const goalVal = parseFloat(cleanGoal) || 0;
      const rewardType = goal.rewardType || 'FREE_SHIPPING';
      const rewardProductId = goal.rewardProductId || '';
      const rewardVariantId = goal.rewardVariantId || '';
      const rewardProductTitle = goal.rewardProductTitle || '';
      
      const icon = rewardType === 'FREE_PRODUCT' ? '🎁' : '🚚';
      
      let label = goal.spendMessage || '';
      if (!label) {
        label = rewardType === 'FREE_PRODUCT'
          ? (rewardProductTitle ? `Free ${rewardProductTitle}` : 'Free Product')
          : 'Free Shipping';
      }

      const unlockedMessage = rewardType === 'FREE_PRODUCT'
        ? `${rewardProductTitle ? `Free ${rewardProductTitle}` : 'Free Product'} Unlocked! 🎉`
        : 'Free Shipping Unlocked! 🎉';

      return {
        id: `tier-${index + 1}`,
        goal: goalVal,
        rewardType,
        rewardProductId,
        rewardVariantId,
        rewardProductTitle,
        rewardLabel: label,
        icon,
        unlockedMessage,
      };
    });

  // 2. Map toggles to features
  const selectedToggle = raw.selectedToggle || '';
  const hasPackageProtection = selectedToggle === 'package-protection' || selectedToggle === 'both';
  const hasGiftWrapping = selectedToggle === 'gift-wrapping' || selectedToggle === 'both';

  // 3. Map upsellProducts array to upsells feature & products list
  const selectedUpsells = raw.upsellProducts || (raw.upsellProduct ? [raw.upsellProduct] : []);
  const hasUpsells = selectedUpsells.length > 0;

  let upsellProducts = [];
  if (hasUpsells) {
    if (raw.upsellProductsDetails && raw.upsellProductsDetails.length > 0) {
      upsellProducts = raw.upsellProductsDetails;
    } else if (raw.upsellProductDetail) {
      upsellProducts = [raw.upsellProductDetail];
    } else {
      // Fallback: resolve from selected IDs in mock settings
      upsellProducts = mockSettings.upsellProducts.filter((p) => selectedUpsells.includes(p.id));
    }
  }

  // 4. Map selectedTheme — controls the visual skin of the cart widget
  //    Primary: data-theme attribute on the embed div (direct Liquid output, no JSON parsing needed)
  //    Fallback: raw.selectedTheme from the parsed CartElevateSettings JSON
  //    Accepted values: 'dynamic' (default) | 'classic' | 'minimal'
  const validThemes = ['dynamic', 'classic', 'minimal'];
  const embedEl = document.getElementById('cart-elevate-app-embed');
  const dataTheme = embedEl?.dataset?.theme || '';
  const rawTheme = raw.selectedTheme || dataTheme || 'dynamic';
  const theme = validThemes.includes(rawTheme) ? rawTheme : 'dynamic';
  console.log('[CartElevate] Active theme:', theme, '| raw.selectedTheme:', raw.selectedTheme, '| data-theme attr:', dataTheme);

  const appUrl = raw.appUrl || '';

  const settings = {
    ...mockSettings,
    theme,
    appUrl,
    rewardTiers: rewardTiers,
    features: {
      progressBar: rewardTiers.length > 0,
      rewardTiers: rewardTiers.length > 0,
      upsells: hasUpsells && upsellProducts.length > 0,
      packageProtection: hasPackageProtection,
      giftWrapping: hasGiftWrapping,
    },
    packageProtection: {
      ...mockSettings.packageProtection,
      price: raw.packageProtectionPrice !== undefined && raw.packageProtectionPrice !== null && !isNaN(parseFloat(raw.packageProtectionPrice))
        ? parseFloat(raw.packageProtectionPrice)
        : mockSettings.packageProtection.price,
    },
    giftWrapping: {
      ...mockSettings.giftWrapping,
      price: raw.giftWrappingPrice !== undefined && raw.giftWrappingPrice !== null && !isNaN(parseFloat(raw.giftWrappingPrice))
        ? parseFloat(raw.giftWrappingPrice)
        : mockSettings.giftWrapping.price,
    },
    upsellProducts,
  };

  return settings;
}

/**
 * Updates a specific settings key for a shop.
 * @param {string} shopDomain
 * @param {string} key
 * @param {*} value
 * @returns {Promise<object>}
 */
export async function updateSetting(shopDomain, key, value) {
  console.log('[CartElevate] updateSetting — mock:', key, value);
  return { success: true };
}
