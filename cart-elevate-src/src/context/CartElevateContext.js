/**
 * CartElevateContext.js
 *
 * Global state provider for CartElevate Shopify Theme App Extension.
 *
 * Provides to all child components:
 *  - settings  (from settingsService — currently mock, future: Neon DB)
 *  - cart      (from Shopify AJAX Cart API /cart.js)
 *  - rewardState (evaluated reward tier progress)
 *  - features  (enabled module flags)
 *  - addToCart (action)
 *
 * No prop drilling. All components consume via useCartElevate().
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchSettings } from '../services/settingsService.js';
import { evaluateRewardState } from '../services/rewardService.js';
import { getCartTotal, getCartItemCount, normalizCart } from '../utils/cartHelpers.js';

const CartElevateContext = createContext(null);

/**
 * Fetches the live Shopify cart via the AJAX Cart API.
 * Returns an empty normalized cart on failure so the extension degrades gracefully.
 * @returns {Promise<object>}
 */
async function fetchShopifyCart() {
  try {
    const res = await fetch('/cart.js', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Cart fetch failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[CartElevate] Could not fetch cart:', err.message);
    return normalizCart(null);
  }
}

/**
 * CartElevateProvider
 *
 * Wraps CartElevateExtension. Loads settings and cart on mount,
 * evaluates reward state, exposes actions.
 *
 * @param {{ children: React.ReactNode, shopDomain?: string }} props
 */
export function CartElevateProvider({ children, shopDomain }) {
  const [settings, setSettings] = useState(null);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addedItems, setAddedItems] = useState({});
  const rootRef = useRef(null);
  const isOurOwnMutationRef = useRef(false);

  const setOwnMutation = (val) => {
    isOurOwnMutationRef.current = val;
    window.cartElevateOwnMutation = val;
  };

  const [packageProtectionChecked, setPackageProtectionChecked] = useState(false);
  const [giftWrappingChecked, setGiftWrappingChecked] = useState(false);
  const [shippingRate, setShippingRate] = useState(10.00);

  // Initialize checked states from settings
  useEffect(() => {
    if (settings) {
      setPackageProtectionChecked(settings.packageProtection?.defaultChecked || false);
      setGiftWrappingChecked(settings.giftWrapping?.defaultChecked || false);
    }
  }, [settings]);

  // Fetch shipping rates dynamically
  useEffect(() => {
    if (!cart || cart.item_count === 0) {
      setShippingRate(0); // If cart is empty, shipping is 0
      return;
    }

    const fetchRates = async () => {
      try {
        const country = window.Shopify?.country || 'United States';
        const res = await fetch(`/cart/shipping_rates.json?shipping_address[country]=${encodeURIComponent(country)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.shipping_rates && data.shipping_rates.length > 0) {
            // Find standard rate or first rate price
            const ratePrice = parseFloat(data.shipping_rates[0].price);
            if (!isNaN(ratePrice)) {
              setShippingRate(ratePrice);
              return;
            }
          }
        }
      } catch (e) {
        console.warn('[CartElevate] Failed to fetch shipping rates:', e);
      }
      // Fallback standard rate if API fails or returns no rates
      setShippingRate(10.00);
    };

    fetchRates();
  }, [cart]);

  // Load settings + cart in parallel on mount
  useEffect(() => {
    Promise.all([
      fetchSettings(shopDomain),
      fetchShopifyCart(),
    ])
      .then(([loadedSettings, loadedCart]) => {
        setSettings(loadedSettings);
        setCart(normalizCart(loadedCart));
      })
      .catch((err) => {
        console.error('[CartElevate] Initialization error:', err);
        setError(err);
      })
      .finally(() => setLoading(false));
  }, [shopDomain]);

  /** Refreshes cart state from Shopify */
  const refreshCart = useCallback(async () => {
    const updated = await fetchShopifyCart();
    setCart(normalizCart(updated));
  }, []);

  useEffect(() => {
    let debounceTimer = null;
    const handleCartChange = () => {
      if (isOurOwnMutationRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('[CartElevate] Storefront cart change detected via fetch/XHR. Refreshing...');
        refreshCart();
      }, 100);
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : '';
      const isCartMutation =
        url.includes('/cart/add') ||
        url.includes('/cart/change') ||
        url.includes('/cart/update') ||
        url.includes('/cart/clear');

      if (isCartMutation && isOurOwnMutationRef.current) {
        return originalFetch.apply(this, args);
      }

      const response = await originalFetch.apply(this, args);
      if (isCartMutation) {
        setTimeout(handleCartChange, 300);
      }
      return response;
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      const url = this._url || '';
      const isCartMutation =
        url.includes('/cart/add') ||
        url.includes('/cart/change') ||
        url.includes('/cart/update') ||
        url.includes('/cart/clear');

      if (isCartMutation && isOurOwnMutationRef.current) {
        return originalSend.apply(this, args);
      }

      this.addEventListener('load', () => {
        if (isCartMutation) {
          setTimeout(handleCartChange, 300);
        }
      });
      return originalSend.apply(this, args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._url = url;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    const eventNames = ['cart:updated', 'cart:changed', 'cart:change', 'ajaxProduct:added'];
    eventNames.forEach((evt) => {
      document.addEventListener(evt, handleCartChange);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.send = originalSend;
      XMLHttpRequest.prototype.open = originalOpen;
      eventNames.forEach((evt) => {
        document.removeEventListener(evt, handleCartChange);
      });
    };
  }, [refreshCart]);

  /** Helper to send storefront logs to Neon DB */
  const logAnalyticsEvent = useCallback(async (eventType, targetVariantId = null, value = 0.00) => {
    if (!settings || !settings.appUrl) return;
    const cartToken = cart?.token || 'unknown';
    try {
      await fetch(`${settings.appUrl}/api/analytics`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopDomain || settings.shopDomain || window.Shopify?.shop || 'unknown',
          cartToken,
          eventType,
          targetVariantId: targetVariantId ? String(targetVariantId) : null,
          value,
        }),
      });
    } catch (err) {
      console.warn('[CartElevate] Failed to log analytics event:', err);
    }
  }, [settings, cart, shopDomain]);

  // Log storefront widget impression once per page load per cart session
  const loggedTokensRef = useRef(new Set());
  useEffect(() => {
    if (settings && cart && cart.token) {
      const key = `${cart.token}_impression`;
      if (!loggedTokensRef.current.has(key)) {
        loggedTokensRef.current.add(key);
        logAnalyticsEvent('impression');
      }
    }
  }, [settings, cart, logAnalyticsEvent]);

  // Log package protection checkbox toggles
  const prevPPChecked = useRef(null);
  useEffect(() => {
    if (settings && packageProtectionChecked !== null) {
      if (prevPPChecked.current !== null && prevPPChecked.current !== packageProtectionChecked) {
        const ppPrice = parseFloat(settings.packageProtection?.price) || 2.99;
        logAnalyticsEvent('protection_toggle', 'package-protection', packageProtectionChecked ? ppPrice : 0);
      }
      prevPPChecked.current = packageProtectionChecked;
    }
  }, [packageProtectionChecked, settings, logAnalyticsEvent]);

  // Log gift wrapping checkbox toggles
  const prevGWChecked = useRef(null);
  useEffect(() => {
    if (settings && giftWrappingChecked !== null) {
      if (prevGWChecked.current !== null && prevGWChecked.current !== giftWrappingChecked) {
        const gwPrice = parseFloat(settings.giftWrapping?.price) || 4.99;
        logAnalyticsEvent('gift_wrap_toggle', 'gift-wrapping', giftWrappingChecked ? gwPrice : 0);
      }
      prevGWChecked.current = giftWrappingChecked;
    }
  }, [giftWrappingChecked, settings, logAnalyticsEvent]);

  /** Adds a variant to the Shopify cart and refreshes cart state */
  const addToCart = useCallback(async (variantId, quantity = 1) => {
    // Proactively extract the numeric ID if a full Shopify GID was passed
    const cleanVariantId = String(variantId).includes('ProductVariant/')
      ? String(variantId).split('/').pop()
      : variantId;

    setAddedItems((prev) => ({ ...prev, [variantId]: 'loading' }));
    setOwnMutation(true);
    try {
      const sections = ['cart-drawer', 'cart-icon-bubble', 'main-cart-items', 'cart-items'];
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cleanVariantId,
          quantity,
          sections: sections.join(','),
        }),
      });
      if (!res.ok) throw new Error('Add to cart failed');

      const responseData = await res.json();

      // Update the theme drawer natively if possible to prevent event listener detachment & out of sync states
      const nativeCartElement = document.querySelector('cart-drawer') || 
                                document.querySelector('cart-items') || 
                                document.querySelector('cart-notification');

      if (nativeCartElement && typeof nativeCartElement.renderContents === 'function') {
        nativeCartElement.renderContents(responseData);
      } else if (responseData.sections) {
        // Fallback: manual DOM replacement for custom themes
        Object.keys(responseData.sections).forEach((sectionId) => {
          const html = responseData.sections[sectionId];
          if (!html) return;

          let targetEl = document.getElementById(`shopify-section-${sectionId}`);
          if (!targetEl) {
            targetEl = document.querySelector(`.${sectionId}`) ||
                       document.querySelector(`#${sectionId}`) ||
                       document.querySelector(sectionId);
          }
          if (targetEl) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newContent = doc.body.firstChild;
            if (newContent) {
              targetEl.innerHTML = newContent.innerHTML;
            }
          }
        });
      }

      await refreshCart();
      setAddedItems((prev) => ({ ...prev, [variantId]: 'added' }));

      // Log the upsell addition to Neon DB
      const addedProduct = settings?.upsellProductsDetails?.find(
        (p) => String(p.variantId).split('/').pop() === String(variantId).split('/').pop()
      ) || settings?.upsellProducts?.find(
        (p) => String(p.variantId).split('/').pop() === String(variantId).split('/').pop()
      );
      const itemPrice = addedProduct ? parseFloat(addedProduct.price) || 0.00 : 0.00;
      logAnalyticsEvent('upsell_add', variantId, itemPrice);

      // Dispatch event so the merchant's theme can update its cart UI
      document.dispatchEvent(new CustomEvent('cart:updated'));
      setTimeout(() => {
        setAddedItems((prev) => ({ ...prev, [variantId]: null }));
      }, 2000);
      return true;
    } catch (err) {
      console.error('[CartElevate] addToCart error:', err);
      setAddedItems((prev) => ({ ...prev, [variantId]: null }));
      return false;
    } finally {
      setOwnMutation(false);
    }
  }, [refreshCart, settings, logAnalyticsEvent]);

  // Storefront Auto-Add / Auto-Remove logic for FREE_PRODUCT rewards
  // Use a ref instead of state to avoid cascading re-renders on every processing toggle
  const isProcessingRewardRef = useRef(false);
 
  useEffect(() => {
    if (!settings || !cart) return;
    if (isProcessingRewardRef.current) return;

    // Find all tiers configured with rewardType === 'FREE_PRODUCT' and a variant ID
    const productTiers = (settings.rewardTiers || []).filter(
      (t) => t.rewardType === 'FREE_PRODUCT' && t.rewardVariantId
    );

    if (productTiers.length === 0) return;

    const getNumericId = (id) => {
      if (!id) return '';
      const str = String(id);
      return str.includes('/') ? str.split('/').pop() : str;
    };

    // All reward variant numeric IDs (for excluding from spend total)
    const allRewardVariantNumericIds = new Set(
      productTiers.map((t) => getNumericId(t.rewardVariantId))
    );

    // Find the one correctly-tagged reward item for a specific tier
    const findTaggedCartItem = (variantId, tierId) => {
      const numericId = getNumericId(variantId);
      return cart.items.find((item) => {
        const matchesId = String(item.variant_id) === numericId;
        const prop = item.properties && (
          item.properties._cart_elevate_reward ||
          item.properties['_cart_elevate_reward']
        );
        return matchesId && String(prop) === String(tierId);
      });
    };

    // Find ALL cart items for a given reward variant (tagged or untagged, any tag)
    const findAllVariantItems = (variantId) => {
      const numericId = getNumericId(variantId);
      return cart.items.filter((item) => String(item.variant_id) === numericId);
    };

    // Spend total = sum of NON-reward items using original (pre-discount) price
    // This avoids dependency on Shopify's BXGY discount timing
    const nonRewardTotal = cart.items.reduce((sum, item) => {
      if (allRewardVariantNumericIds.has(String(item.variant_id))) return sum;
      return sum + (item.original_line_price || item.line_price || 0) / 100;
    }, 0);

    // Helper: refresh Dawn theme cart drawer sections after silent cart mutations
    const refreshDawnCartSections = async () => {
      try {
        const sectionsRes = await fetch('/?sections=cart-drawer,cart-icon-bubble');
        if (!sectionsRes.ok) return;
        const sectionsData = await sectionsRes.json();
        const cartDrawer = document.querySelector('cart-drawer');
        if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
          // renderContents expects { sections: { 'cart-drawer': html, ... } }
          cartDrawer.renderContents({ sections: sectionsData });
        }
      } catch (e) {
        // Non-critical: fall back to event dispatch
      }
    };

    const checkAndApplyRewards = async () => {
      isProcessingRewardRef.current = true;
      setOwnMutation(true);
      let cartUpdated = false;

      try {
        for (const tier of productTiers) {
          const numericVariantId = getNumericId(tier.rewardVariantId);
          const allCopies = findAllVariantItems(tier.rewardVariantId);
          const taggedCartItem = findTaggedCartItem(tier.rewardVariantId, tier.id);
          const milestoneReached = nonRewardTotal >= tier.goal;

          if (milestoneReached) {
            // --- MILESTONE REACHED ---
            // Step 1: Remove every copy that is NOT the correctly-tagged one
            const extraCopies = allCopies.filter((item) => item.key !== taggedCartItem?.key);
            if (extraCopies.length > 0) {
              const updatesObj = {};
              extraCopies.forEach((item) => {
                updatesObj[item.key] = 0;
              });
              console.log(`[CartElevate] Removing extra/orphaned reward copies:`, updatesObj);
              await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: updatesObj }),
              });
              cartUpdated = true;
            }

            // Step 2: If no correctly-tagged item exists yet, add one
            if (!taggedCartItem) {
              console.log(`[CartElevate] Milestone reached (${nonRewardTotal} >= ${tier.goal}). Adding reward: ${numericVariantId}`);
              const res = await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: numericVariantId,
                  quantity: 1,
                  properties: { _cart_elevate_reward: tier.id }
                }),
              });
              if (res.ok) {
                cartUpdated = true;
              }
            } else if (taggedCartItem.quantity > 1) {
              // Clamp quantity to exactly 1
              console.log(`[CartElevate] Reward quantity > 1 (${taggedCartItem.quantity}), reverting to 1.`);
              await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: { [taggedCartItem.key]: 1 } }),
              });
              cartUpdated = true;
            }
          } else {
            // --- MILESTONE NOT REACHED ---
            // Remove ALL copies of the reward variant (tagged or not)
            if (allCopies.length > 0) {
              const updatesObj = {};
              allCopies.forEach((item) => {
                updatesObj[item.key] = 0;
              });
              console.log(`[CartElevate] Milestone lost (${nonRewardTotal} < ${tier.goal}). Removing reward copies:`, updatesObj);
              await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: updatesObj }),
              });
              cartUpdated = true;
            }
          }
        }

        if (cartUpdated) {
          const updatedCart = await fetchShopifyCart();
          setCart(normalizCart(updatedCart));

          if (updatedCart && updatedCart.item_count === 0) {
            console.log('[CartElevate] Cart became empty after reward removal. Reloading page...');
            window.location.reload();
            return;
          }

          await refreshDawnCartSections();
          // Dispatch events for broad theme compatibility
          ['cart:updated', 'cart:refresh', 'cart:change'].forEach((evt) => {
            document.dispatchEvent(new CustomEvent(evt, { bubbles: true }));
          });
        }
      } catch (err) {
        console.error('[CartElevate] Error in reward auto-add/remove:', err);
      } finally {
        isProcessingRewardRef.current = false;
        setOwnMutation(false);
      }
    };

    checkAndApplyRewards();
  // Only re-run when cart data or settings change
  }, [cart, settings, refreshCart]);

  // Derived state
  const cartTotal = cart ? getCartTotal(cart) : 0;
  const cartItemCount = cart ? getCartItemCount(cart) : 0;
  const rewardState = settings
    ? evaluateRewardState(cartTotal, settings.rewardTiers)
    : null;

  // Update DOM subtotal only when addons (package protection / gift wrapping) are active
  // If no addons, let Shopify's theme handle the subtotal display to avoid price flickering
  useEffect(() => {
    if (!cart || !settings) return;

    const ppConfig = settings?.packageProtection;
    const gwConfig = settings?.giftWrapping;

    const hasPP = ppConfig && ppConfig.enabled;
    const hasGW = gwConfig && gwConfig.enabled;

    // If neither addon feature is enabled in settings, do not touch the DOM subtotal
    if (!hasPP && !hasGW) return;

    const ppPrice = (hasPP && packageProtectionChecked) ? parseFloat(ppConfig.price) || 0 : 0;
    const gwPrice = (hasGW && giftWrappingChecked) ? parseFloat(gwConfig.price) || 0 : 0;

    // Base = non-reward items only (identified by the custom property added by our app)
    const baseTotal = (cart.items || []).reduce((sum, item) => {
      const isReward = item.properties && (
        item.properties._cart_elevate_reward ||
        item.properties['_cart_elevate_reward']
      );
      if (isReward) return sum;
      return sum + (item.final_line_price || 0) / 100;
    }, 0);

    const totalWithAddons = baseTotal + ppPrice + gwPrice;
    const currencySymbol = window.Shopify?.currency?.symbol || settings?.currencySymbol || '$';
    const formattedPrice = `${currencySymbol}${Number(totalWithAddons).toFixed(2)}`;

    const selectors = [
      '.totals__subtotal-value',
      '.cart__subtotal-value',
      '.cart-subtotal__price',
      '[data-cart-subtotal]'
    ];

    const updateDOM = () => {
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          const currentText = el.textContent || '';
          const suffixMatch = currentText.match(/\s*[A-Z]{3}$/);
          const suffix = suffixMatch ? suffixMatch[0] : '';
          const expectedText = formattedPrice + suffix;
          if (currentText !== expectedText) {
            el.textContent = expectedText;
          }
        });
      });
    };

    // Run immediately
    updateDOM();

    // Listen to theme render/change events to update the subtotal DOM
    const handleThemeUpdate = () => {
      setTimeout(updateDOM, 50);
      setTimeout(updateDOM, 150);
    };

    const events = ['cart:updated', 'cart:refresh', 'cart:change', 'sections:rendered'];
    events.forEach((evt) => {
      document.addEventListener(evt, handleThemeUpdate);
    });

    // Fallback periodic sync to catch any other DOM modifications
    const interval = setInterval(updateDOM, 500);

    return () => {
      events.forEach((evt) => {
        document.removeEventListener(evt, handleThemeUpdate);
      });
      clearInterval(interval);
    };
  }, [cartTotal, packageProtectionChecked, giftWrappingChecked, settings, cart]);

  // Derive the active theme — defaults to 'dynamic' until settings load
  const theme = settings?.theme || 'dynamic';

  const value = {
    settings,
    cart,
    loading,
    error,
    cartTotal,
    cartItemCount,
    rewardState,
    features: settings?.features || {},
    theme,
    addToCart,
    addedItems,
    refreshCart,
    packageProtectionChecked,
    setPackageProtectionChecked,
    giftWrappingChecked,
    setGiftWrappingChecked,
    shippingRate,
  };

  return (
    <CartElevateContext.Provider value={value}>
      {children}
    </CartElevateContext.Provider>
  );
}

/**
 * useCartElevate — primary context hook for all CartElevate components.
 * @returns {object}
 */
export function useCartElevate() {
  const ctx = useContext(CartElevateContext);
  if (!ctx) {
    throw new Error('useCartElevate must be used inside CartElevateProvider');
  }
  return ctx;
}

export default CartElevateContext;
