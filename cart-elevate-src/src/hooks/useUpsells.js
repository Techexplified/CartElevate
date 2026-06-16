/**
 * useUpsells.js — Upsell products hook
 * Loads recommendations from upsellService.
 */
import { useState, useEffect } from 'react';
import { useCartElevate } from '../context/CartElevateContext.js';
import { getRecommendations } from '../services/upsellService.js';

/**
 * @returns {{ products: Array, loading: boolean }}
 */
export function useUpsells() {
  const { cart, settings } = useCartElevate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!settings) return;
    getRecommendations(cart, settings)
      .then(setProducts)
      .finally(() => setLoading(false));
  }, [cart, settings]);

  return { products, loading };
}
