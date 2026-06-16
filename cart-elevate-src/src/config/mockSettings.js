/**
 * mockSettings.js
 *
 * Central mock configuration for CartElevate.
 * Replace this with a real settingsService fetch (Neon DB) in the future.
 *
 * All components consume values from here — nothing is hardcoded in UI.
 */

export const mockSettings = {
  /** App identity */
  appName: 'CartElevate',
  shopDomain: 'mock-shop.myshopify.com',
  currencyCode: 'USD',
  currencySymbol: '$',

  /** Free shipping top-level goal (used as a quick reference) */
  freeShippingGoal: 100,

  /**
   * Reward tiers — ordered by goal amount ascending.
   * FeatureRenderer and RewardTierTracker iterate these dynamically.
   * Add new tiers here without touching any component.
   */
  rewardTiers: [
    {
      id: 'tier1',
      goal: 100,
      rewardType: 'FREE_SHIPPING',
      rewardLabel: 'Free Shipping',
      icon: '🎁',
      unlockedMessage: 'Free Shipping Unlocked! 🎉',
    },
    {
      id: 'tier2',
      goal: 150,
      rewardType: 'FREE_GIFT',
      rewardLabel: 'Free Gift',
      icon: '🎁',
      unlockedMessage: 'Free Gift Unlocked! 🎁',
    },
  ],

  /**
   * Feature flags — toggled per merchant from settings.
   * FeatureRenderer reads these to decide what to render.
   */
  features: {
    progressBar: true,
    rewardTiers: true,
    upsells: true,
    packageProtection: true,
    giftWrapping: true,
  },

  /**
   * Package Protection config.
   * Future: fetched from merchant settings in Neon DB.
   */
  packageProtection: {
    enabled: true,
    price: 2.99,
    label: 'Package Protection',
    description: 'Protect against loss, theft and damage.',
    defaultChecked: false,
  },

  /**
   * Gift Wrapping config.
   * Future: fetched from merchant settings in Neon DB.
   */
  giftWrapping: {
    enabled: true,
    price: 4.99,
    label: 'Gift Wrapping',
    description: 'Add gift wrapping to this order.',
    defaultChecked: false,
  },

  /**
   * Upsell products — mock product catalog.
   * Future: replaced by AI recommendation engine or merchant-configured products.
   */
  upsellProducts: [
    {
      id: 'upsell-1',
      title: 'Minimalist Leather Wallet',
      price: 19.99,
      image: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=120&h=120&fit=crop',
      compareAtPrice: null,
      available: true,
      variantId: 'gid://shopify/ProductVariant/mock-1',
    },
    {
      id: 'upsell-2',
      title: 'Ceramic Travel Mug',
      price: 49.99,
      image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=120&h=120&fit=crop',
      compareAtPrice: 69.99,
      available: true,
      variantId: 'gid://shopify/ProductVariant/mock-2',
    },
    {
      id: 'upsell-3',
      title: 'Wool Knit Phone Case',
      price: 14.99,
      image: 'https://images.unsplash.com/photo-1565992441121-4367c2967103?w=120&h=120&fit=crop',
      compareAtPrice: null,
      available: true,
      variantId: 'gid://shopify/ProductVariant/mock-3',
    },
  ],
};

export default mockSettings;
