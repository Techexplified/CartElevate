/**
 * useRewards.js — Reward tier state hook
 */
import { useCartElevate } from '../context/CartElevateContext.js';

/**
 * @returns {{ rewardState: object, settings: object }}
 */
export function useRewards() {
  const { rewardState, settings } = useCartElevate();
  return { rewardState, tiers: settings?.rewardTiers || [] };
}
