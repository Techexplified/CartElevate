/**
 * index.js — CartElevate Storefront Entry Point
 *
 * This file is bundled into assets/cart-elevate.js by Vite.
 * It is loaded by app-embed.liquid on every storefront page
 * after the merchant enables CartElevate in Theme Editor → App Embeds.
 *
 * Responsibilities:
 *  1. Find the #cart-elevate-root mount point (injected by app-embed.liquid)
 *  2. Mount CartElevateExtension (enhancement modules only)
 *  3. Re-render when Shopify AJAX cart events fire
 *
 * CartElevate renders ONLY:
 *  - Progress Bar
 *  - Reward Tier Messaging
 *  - Upsell Section
 *  - Package Protection
 *  - Gift Wrapping
 *
 * CartElevate does NOT render any cart UI, drawer, items, or checkout button.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CartElevateExtension } from './components/CartElevateExtension/CartElevateExtension.js';
import './styles/cart-elevate.css';

const MOUNT_ID = 'cart-elevate-root';

/** Reads shop domain set by app-embed.liquid on the embed div */
function getShopDomain() {
  const embedEl = document.getElementById('cart-elevate-app-embed');
  return embedEl ? embedEl.getAttribute('data-shop') : null;
}

let reactRoot = null;
let currentMountElement = null;

/**
 * Mounts or re-renders CartElevateExtension into the DOM mount point.
 */
function mountCartElevate() {
  const mountPoint = document.getElementById(MOUNT_ID);

  // Mount point not present = app embed not enabled, exit silently
  if (!mountPoint) return;

  const shopDomain = getShopDomain();

  // If the mount point element in the DOM has changed (e.g. dynamic theme re-render),
  // we must create a new React root for the new element.
  if (mountPoint !== currentMountElement) {
    currentMountElement = mountPoint;
    reactRoot = createRoot(mountPoint);
  }

  reactRoot.render(
    <CartElevateExtension shopDomain={shopDomain} />
  );
}

/**
 * Initialize on DOM ready.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountCartElevate);
} else {
  mountCartElevate();
}

/**
 * Re-render when Shopify AJAX cart updates.
 * Covers themes that update the cart without a full page reload.
 *
 * Common events fired by Shopify themes:
 *  - cart:updated        (custom event, many themes)
 *  - cart:refresh        (some themes)
 *  - sections:rendered   (Shopify Section Rendering API)
 */
['cart:updated', 'cart:refresh', 'sections:rendered'].forEach((event) => {
  document.addEventListener(event, () => {
    // Small delay to let the theme re-render its cart DOM first
    setTimeout(mountCartElevate, 50);
  });
});

/**
 * Intercept AJAX Add-To-Cart requests and open the theme's cart drawer automatically.
 */
function openCartDrawer() {
  // 1. Try Dawn theme custom element .open()
  const cartDrawer = document.querySelector('cart-drawer');
  if (cartDrawer && typeof cartDrawer.open === 'function') {
    cartDrawer.open();
    return;
  }

  // 2. Try triggering click on the cart icon bubble/link
  const cartBubble = document.getElementById('cart-icon-bubble') || 
                     document.querySelector('.header__icon--cart') ||
                     document.querySelector('.cart-toggle') ||
                     document.querySelector('.CartLink');
  if (cartBubble) {
    cartBubble.click();
    cartBubble.dispatchEvent(new Event('click', { bubbles: true }));
    return;
  }
  

  // 3. Fallback: Toggle classes on drawer elements
  const selectors = ['.cart-drawer', '.drawer', '#cart-drawer', '.mini-cart', '.CartDrawer', '#sidebar-cart'];
  selectors.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) {
      el.classList.add('active', 'is-active', 'drawer--active');
    }
  });
}

// Intercept window.fetch
const originalFetch = window.fetch;
window.fetch = function () {
  return originalFetch.apply(this, arguments).then((response) => {
    try {
      const url = arguments[0];
      if (typeof url === 'string' && (url.includes('/cart/add.js') || url.includes('/cart/add'))) {
        if (response.ok && !window.cartElevateOwnMutation) {
          // Delay slightly to let the theme update its cart state first
          setTimeout(openCartDrawer, 400);
        }
      }
    } catch (e) {
      console.error('[CartElevate] Fetch intercept error:', e);
    }
    return response;
  });
};

// Intercept XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url) {
  try {
    if (typeof url === 'string' && (url.includes('/cart/add.js') || url.includes('/cart/add'))) {
      this.addEventListener('load', function () {
        if (this.status >= 200 && this.status < 300 && !window.cartElevateOwnMutation) {
          // Delay slightly to let the theme update its cart state first
          setTimeout(openCartDrawer, 400);
        }
      });
    }
  } catch (e) {
    console.error('[CartElevate] XHR intercept error:', e);
  }
  return originalOpen.apply(this, arguments);
};

// Self-healing observer: watch for dynamic cart re-renders that replace the mount point element
const domObserver = new MutationObserver(() => {
  const mountPoint = document.getElementById(MOUNT_ID);
  if (mountPoint && mountPoint !== currentMountElement) {
    mountCartElevate();
  }
});
domObserver.observe(document.body, { childList: true, subtree: true });
