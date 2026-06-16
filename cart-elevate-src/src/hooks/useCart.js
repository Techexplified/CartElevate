/**
 * useCart.js — Cart state hook
 * Convenience wrapper around CartElevateContext.
 */
import { useCartElevate } from '../context/CartElevateContext.js';

/**
 * @returns {{ cart: object, cartTotal: number, cartItemCount: number, addToCart: Function, addedItems: object }}
 */
export function useCart() {
  const { cart, cartTotal, cartItemCount, addToCart, addedItems } = useCartElevate();
  return { cart, cartTotal, cartItemCount, addToCart, addedItems };
}
