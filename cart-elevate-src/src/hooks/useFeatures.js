/**
 * useFeatures.js — Feature flags hook
 */
import { useCartElevate } from '../context/CartElevateContext.js';

/**
 * @returns {{ features: object, isEnabled: Function }}
 */
export function useFeatures() {
  const { features } = useCartElevate();
  return {
    features,
    /** @param {string} key @returns {boolean} */
    isEnabled: (key) => Boolean(features[key]),
  };
}
