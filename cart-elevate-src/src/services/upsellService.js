/**
 * upsellService.js
 *
 * Provides upsell product recommendations.
 *
 * Currently returns mock products from settings.
 * Future: AI recommendation engine, Shopify product API,
 *         or merchant-configured product rules from Neon DB.
 *
 * Replace `getRecommendations` implementation without
 * changing any component code.
 */

/**
 * Fetches recommended upsell products for the current cart.
 * @param {object} cart - Current cart state
 * @param {object} settings - App settings
 * @returns {Promise<Array>} Array of product objects
 */
export async function getRecommendations(cart, settings) {
  // TODO: Replace with:
  // - Shopify Recommendations API
  // - AI recommendation engine
  // - Merchant-configured product rules

  await new Promise((resolve) => setTimeout(resolve, 100));

  const products = settings?.upsellProducts || [];

  // Future: filter out products already in cart
  // const cartVariantIds = cart?.items?.map(i => i.variant_id) || [];
  // return products.filter(p => !cartVariantIds.includes(p.variantId));

  return products;
}

/**
 * Adds a product to the cart.
 * @param {string} variantId
 * @param {number} [quantity=1]
 * @returns {Promise<object>} Updated cart
 */
export async function addToCart(variantId, quantity = 1) {
  // TODO: Real Shopify AJAX Cart API call:
  // const res = await fetch('/cart/add.js', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ id: variantId, quantity }),
  // });
  // return res.json();

  console.log('[CartElevate] addToCart — mock:', variantId, quantity);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { success: true, variantId, quantity };
}
