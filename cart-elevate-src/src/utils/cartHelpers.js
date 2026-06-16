/**
 * cartHelpers.js
 *
 * Pure utility functions for cart data manipulation.
 * No React dependencies — safe to use anywhere.
 */

/**
 * Calculates total cart value from Shopify cart object.
 * @param {object} cart - Shopify cart object
 * @returns {number} Total in dollars
 */
export function getCartTotal(cart) {
  if (!cart) return 0;
  // Shopify returns total_price in cents
  if (typeof cart.total_price === 'number') {
    return cart.total_price / 100;
  }
  return cart.total_price || 0;
}

/**
 * Returns the number of items in the cart.
 * @param {object} cart
 * @returns {number}
 */
export function getCartItemCount(cart) {
  if (!cart) return 0;
  return cart.item_count || 0;
}

/**
 * Formats a dollar amount as a currency string.
 * @param {number} amount
 * @param {string} [currencySymbol='$']
 * @returns {string}
 */
export function formatCurrency(amount, currencySymbol = '$') {
  if (isNaN(amount)) return `${currencySymbol}0.00`;
  return `${currencySymbol}${Number(amount).toFixed(2)}`;
}

/**
 * Checks whether a cart item exists by variant ID.
 * @param {object} cart
 * @param {string} variantId
 * @returns {boolean}
 */
export function cartContainsVariant(cart, variantId) {
  if (!cart || !cart.items) return false;
  return cart.items.some((item) => String(item.variant_id) === String(variantId));
}

/**
 * Returns a safe cart object with defaults.
 * Prevents null-ref errors when cart hasn't loaded.
 * @param {object|null} rawCart
 * @returns {object}
 */
export function normalizCart(rawCart) {
  return {
    total_price: 0,
    item_count: 0,
    items: [],
    ...rawCart,
  };
}
