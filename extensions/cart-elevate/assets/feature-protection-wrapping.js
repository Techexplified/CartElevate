/* eslint-disable no-empty, no-unused-vars, no-redeclare */
/* CartElevate — Feature: Protection and Wrapping (Storefront Integration)
 * Mounts package protection & gift wrapping checkboxes at the bottom of the cart
 * directly ABOVE the checkout button.
 * Adds/removes real Shopify line items via /cart/add.js & /cart/change.js.
 */
(function () {
  'use strict';

  var MOUNT_ID = 'ce-protection-wrapping-root';
  var isOperationBusy = false;
  var pendingCartOperation = null;
  var isBypassingCheckoutGate = false;
  var userGiftNoteText = null;
  var isGiftNoteDirty = false;
  var giftNoteTimer = null;
  var giftNoteSavePromise = null;
  var retryTimer = null;
  var lastRenderedKey = '';
  var latestCart = null;
  var lastSyncedCartTotal = null;

  var CHECKOUT_SELECTOR = [
    'button[name="checkout"]',
    'input[name="checkout"]',
    'a[href^="/checkout"]',
    'a[href*="/checkout"]',
    '[data-cart-checkout]',
    'button[data-checkout]',
    '.cart__checkout-button',
    '#checkout',
    '#CartDrawer-Checkout',
    '.cart__checkout',
    '#cart-checkout-btn',
    '.cart-drawer__checkout',
    '[data-action="checkout"]',
    '.checkout-button',
    '.cart__ctas button',
    '.cart__ctas a[href*="checkout"]',
    'button[type="submit"][id*="checkout"]',
    'button[type="submit"][class*="checkout"]',
    'form[action*="/cart"] button[name="checkout"]',
    'form[action*="/cart"] [type="submit"]',
    'form[action*="/checkout"] [type="submit"]'
  ].join(', ');

  /* ─────────────────────── Utility helpers ─────────────────────── */

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getBrandingAccentColor() {
    if (window.CartElevateBranding && typeof window.CartElevateBranding === 'object' && window.CartElevateBranding.accentColor) {
      return window.CartElevateBranding.accentColor;
    }
    if (window.CartElevateBranding && typeof window.CartElevateBranding === 'string') {
      try {
        var parsed = JSON.parse(window.CartElevateBranding);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (parsed && parsed.accentColor) return parsed.accentColor;
      } catch (e) {}
    }
    var docVal = document.documentElement.style.getPropertyValue('--ce-accent-color');
    if (docVal && docVal.trim()) return docVal.trim();
    return '#F95738';
  }

  function isCheckoutElement(el) {
    if (!el) return false;
    var form = el.closest('form');
    if (form) {
      var action = (form.getAttribute('action') || '').toLowerCase();
      if (action.indexOf('/cart/add') !== -1) return false;
      if (action.indexOf('/cart') !== -1 || action.indexOf('/checkout') !== -1) {
        var btnName = (el.getAttribute('name') || el.name || '').toLowerCase();
        if (btnName && btnName !== 'checkout' && btnName !== '') {
          if (btnName === 'updates[]' || btnName === 'update' || btnName === 'minus' || btnName === 'plus') {
            return false;
          }
        }
      }
    }
    return true;
  }

  function getCheckoutUrl() {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    return root.replace(/\/+$/, '') + '/checkout';
  }

  function flushGiftNote() {
    clearTimeout(giftNoteTimer);
    giftNoteTimer = null;

    if (!isGiftNoteDirty) {
      return giftNoteSavePromise || Promise.resolve();
    }

    var textToSave = (userGiftNoteText != null ? userGiftNoteText : '').trim();
    isGiftNoteDirty = false;

    giftNoteSavePromise = postJSON('/cart/update.js?ce_internal=1', {
      attributes: { 'Gift Note': textToSave }
    }).then(function (res) {
      console.log('[CartElevate PW] Gift note saved to cart attributes ✓:', textToSave);
      giftNoteSavePromise = null;
      return res;
    }).catch(function (err) {
      console.warn('[CartElevate PW] Gift note save failed:', err);
      giftNoteSavePromise = null;
    });

    return giftNoteSavePromise;
  }

  function handleCheckoutGate(e, triggerEl, formEl) {
    if (isBypassingCheckoutGate) return;

    var noteInput = document.getElementById('ce-pw-gift-note');
    if (noteInput && isGiftNoteDirty) {
      userGiftNoteText = noteInput.value;
    }

    var isPending = isOperationBusy || (pendingCartOperation !== null) || isGiftNoteDirty || (giftNoteSavePromise !== null);
    if (!isPending) {
      return;
    }

    console.log('[CartElevate PW] Intercepting checkout: cart operations or gift note are in flight...');
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }

    var targetBtn = triggerEl || (formEl && formEl.querySelector(CHECKOUT_SELECTOR)) || formEl;
    var origHtml = '';
    var origDisabled = false;

    if (targetBtn) {
      origHtml = targetBtn.innerHTML || targetBtn.value || '';
      origDisabled = Boolean(targetBtn.disabled);
      targetBtn.classList.add('ce-pw-btn-loading');
      targetBtn.setAttribute('aria-busy', 'true');
      if (targetBtn.tagName === 'BUTTON' && origHtml.trim().length > 0) {
        targetBtn.innerHTML = '<span class="ce-pw-spinner"></span> Updating cart...';
      }
    }

    var notePromise = flushGiftNote();

    Promise.all([
      pendingCartOperation || Promise.resolve(),
      notePromise || Promise.resolve()
    ]).then(function () {
      return new Promise(function (res) { setTimeout(res, 80); });
    }).then(function () {
      if (targetBtn) {
        targetBtn.classList.remove('ce-pw-btn-loading');
        targetBtn.removeAttribute('aria-busy');
        if (targetBtn.tagName === 'BUTTON' && origHtml) {
          targetBtn.innerHTML = origHtml;
        }
        targetBtn.disabled = origDisabled;
      }

      console.log('[CartElevate PW] Cart operations complete. Safely proceeding to checkout...');
      isBypassingCheckoutGate = true;

      if (formEl && typeof formEl.submit === 'function' && (!targetBtn || targetBtn.tagName === 'FORM')) {
        formEl.submit();
      } else if (targetBtn && typeof targetBtn.click === 'function') {
        try {
          targetBtn.click();
        } catch (err) {
          window.location.href = getCheckoutUrl();
        }
      } else if (targetBtn && targetBtn.href) {
        window.location.href = targetBtn.href;
      } else {
        window.location.href = getCheckoutUrl();
      }

      setTimeout(function () {
        isBypassingCheckoutGate = false;
      }, 2500);
    }).catch(function (err) {
      console.warn('[CartElevate PW] Error waiting for cart operations before checkout:', err);
      if (targetBtn) {
        targetBtn.classList.remove('ce-pw-btn-loading');
        targetBtn.removeAttribute('aria-busy');
        if (targetBtn.tagName === 'BUTTON' && origHtml) {
          targetBtn.innerHTML = origHtml;
        }
        targetBtn.disabled = origDisabled;
      }
      isBypassingCheckoutGate = true;
      window.location.href = getCheckoutUrl();
      setTimeout(function () {
        isBypassingCheckoutGate = false;
      }, 2500);
    });
  }

  function parse(val) {
    if (!val) return null;
    if (typeof val === 'string') { try { val = JSON.parse(val); } catch (e) {} }
    if (typeof val === 'string') { try { val = JSON.parse(val); } catch (e) {} }
    return (val && typeof val === 'object') ? val : null;
  }

  function getConfig() {
    return parse(window.CartElevateProtectionWrapping);
  }

  function getCurrencySymbol() {
    return window.CartElevateCurrencySymbol || '$';
  }

  /** Extract numeric variant ID from GID ("gid://shopify/ProductVariant/12345") or plain number */
  function getNumericId(gidOrNum) {
    if (!gidOrNum) return null;
    var str = String(gidOrNum);
    var match = str.match(/ProductVariant\/(\d+)/);
    if (match && match[1]) return parseInt(match[1], 10);
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    return null;
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; });
    });
  }

  /* ─────────────── Resolve App Base URL & Fallback Config Fetch ─────────────── */

  function resolveAppBaseUrl() {
    if (window.CartElevateAppUrl && typeof window.CartElevateAppUrl === 'string' && window.CartElevateAppUrl.indexOf('http') === 0) {
      return window.CartElevateAppUrl.replace(/\/+$/, '');
    }
    var rawPW = parse(window.CartElevateProtectionWrapping);
    if (rawPW && rawPW.appUrl && typeof rawPW.appUrl === 'string' && rawPW.appUrl.indexOf('http') === 0) {
      return rawPW.appUrl.replace(/\/+$/, '');
    }
    var rawPP = parse(window.CartElevatePostPurchase);
    if (rawPP && rawPP.appUrl && typeof rawPP.appUrl === 'string' && rawPP.appUrl.indexOf('http') === 0) {
      return rawPP.appUrl.replace(/\/+$/, '');
    }
    var rawRec = parse(window.CartElevateRecommendations);
    if (rawRec && rawRec.appUrl && typeof rawRec.appUrl === 'string' && rawRec.appUrl.indexOf('http') === 0) {
      return rawRec.appUrl.replace(/\/+$/, '');
    }
    var rawSettings = parse(window.CartElevateSettings);
    if (rawSettings && rawSettings.appUrl && typeof rawSettings.appUrl === 'string' && rawSettings.appUrl.indexOf('http') === 0) {
      return rawSettings.appUrl.replace(/\/+$/, '');
    }
    return 'https://cart-elevate.vercel.app';
  }

  function fetchConfigFallback(cb, force) {
    var cur = getConfig();
    var hasProt = cur && cur.serviceProductIds && cur.serviceProductIds.protectionVariantId;
    var hasGift = cur && cur.serviceProductIds && cur.serviceProductIds.giftWrappingVariantId;

    if (cur && hasProt && hasGift && !force) {
      if (cb) cb(cur);
      return;
    }

    var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop);
    if (!shop) {
      if (cb) cb(cur);
      return;
    }

    var baseUrl = resolveAppBaseUrl();
    var apiUrl = (baseUrl ? baseUrl : '') + '/api/protection-wrapping?shop=' + encodeURIComponent(shop);

    fetch(apiUrl, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.settings) {
          window.CartElevateProtectionWrapping = d.settings;
          if (cb) cb(d.settings);
          triggerCartSync();
        } else if (cb) {
          cb(cur);
        }
      })
      .catch(function (err) {
        console.warn('[CartElevate PW] Config fetch error:', err);
        if (cb) cb(cur);
      });
  }

  /* ─────────────── Mount: directly before checkout button ─────────────── */

  function findOrCreateMount() {
    var el = document.getElementById(MOUNT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = MOUNT_ID;
    }

    // 1. Right before the checkout button at the bottom of the cart (preferred)
    var checkoutSelectors = [
      '#CartDrawer-Checkout',
      'button[name="checkout"]',
      '.cart__checkout-button',
      '[data-cart-checkout]',
      'button[data-checkout]',
      '.cart-drawer__checkout',
      '.checkout-button',
      'input[name="checkout"]',
      'button[type="submit"][id*="checkout"]',
      'button[type="submit"][class*="checkout"]',
      '.cart__ctas button',
      'form[action*="/cart"] button[name="checkout"]',
      'form[action*="/cart"] [type="submit"]',
    ];

    for (var ci = 0; ci < checkoutSelectors.length; ci++) {
      var btn = document.querySelector(checkoutSelectors[ci]);
      if (btn && btn.parentNode) {
        if (btn.previousElementSibling !== el) {
          btn.parentNode.insertBefore(el, btn);
        }
        return el;
      }
    }

    // 2. Top of cart drawer footer / bottom of cart
    var footerSelectors = [
      '.cart-drawer__footer',
      '.drawer__footer',
      '[data-cart-drawer-footer]',
      '.CartDrawer__Footer',
      '.cart__footer',
      '#CartDrawer-Footer',
      '.cart-footer',
    ];
    for (var fi = 0; fi < footerSelectors.length; fi++) {
      var footer = document.querySelector(footerSelectors[fi]);
      if (footer) {
        if (footer.firstChild !== el) {
          footer.insertBefore(el, footer.firstChild);
        }
        return el;
      }
    }

    // 3. Fallback: After cart items list
    var itemsSelectors = [
      '#CartDrawer-CartItems',
      'cart-drawer-items',
      '.cart-drawer__cart-items-wrapper',
      '.drawer__contents',
      '.cart-items',
    ];
    for (var ii = 0; ii < itemsSelectors.length; ii++) {
      var items = document.querySelector(itemsSelectors[ii]);
      if (items && items.parentNode) {
        if (items.nextSibling !== el) {
          items.parentNode.insertBefore(el, items.nextSibling);
        }
        return el;
      }
    }

    return el.parentNode ? el : null;
  }

  /* ─────────────── Dispatch Theme & Global Events ─────────────── */

  function dispatchThemeCartEvents(cart) {
    try {
      var detail = { cart: cart, timestamp: Date.now() };
      document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true, detail: detail }));
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: detail }));
      document.dispatchEvent(new CustomEvent('cart:change', { bubbles: true, detail: detail }));
      document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: detail }));

      // Online Store 2.0 (Dawn/Horizon) custom element refresh
      var drawer = document.querySelector('cart-drawer, #CartDrawer');
      if (drawer) {
        if (typeof drawer.renderContents === 'function') {
          fetch('/cart?sections=cart-drawer,cart-icon-bubble')
            .then(function (r) { return r.json(); })
            .then(function (sections) {
              if (sections && drawer.renderContents) {
                drawer.renderContents({ sections: sections });
              }
            })
            .catch(function () {});
        } else if (typeof drawer.onCartUpdate === 'function') {
          drawer.onCartUpdate();
        }
      }

      if (window.Shopify && typeof window.Shopify.onCartUpdate === 'function') {
        window.Shopify.onCartUpdate();
      }
    } catch (e) {
      console.warn('[CartElevate PW] Theme event dispatch error:', e);
    }
    hideServiceLineItems();
  }

  /* ─────────────── Hide service items from drawer list (Option 1) ─────────────── */

  function hideServiceLineItems() {
    try {
      // 1. By service product links (cartelevate- handles)
      var serviceLinks = document.querySelectorAll(
        'a[href*="cartelevate-package-protection"], a[href*="cartelevate-gift-wrapping"], a[href*="cartelevate-"]'
      );
      for (var i = 0; i < serviceLinks.length; i++) {
        var link = serviceLinks[i];
        if (link.closest('#' + MOUNT_ID)) continue;
        var row = link.closest('.cart-item, .cart-drawer__item, tr, li, [id*="CartDrawer-Item"], [data-cart-item], .line-item, [data-line-item]');
        if (row && row.id !== MOUNT_ID) {
          row.style.setProperty('display', 'none', 'important');
        }
      }

      // 2. By item titles containing "[CartElevate]" or service names
      var allTitles = document.querySelectorAll(
        '.cart-item__name, .cart-item__title, .product-title, .cart-item a, [data-cart-item-title], .cart__item-title'
      );
      for (var j = 0; j < allTitles.length; j++) {
        var el = allTitles[j];
        if (el.closest('#' + MOUNT_ID)) continue;
        var text = (el.textContent || '').trim();
        if (
          text.indexOf('[CartElevate]') !== -1 ||
          (text.indexOf('Package Protection') !== -1 && el.closest('.cart-item, .cart-drawer__item, [id*="CartDrawer-Item"]')) ||
          (text.indexOf('Gift Wrapping') !== -1 && el.closest('.cart-item, .cart-drawer__item, [id*="CartDrawer-Item"]'))
        ) {
          var itemRow = el.closest('.cart-item, .cart-drawer__item, tr, li, [id*="CartDrawer-Item"], [data-cart-item], .line-item, [data-line-item]');
          if (itemRow && itemRow.id !== MOUNT_ID) {
            itemRow.style.setProperty('display', 'none', 'important');
          }
        }
      }
    } catch (e) {
      console.warn('[CartElevate PW] hideServiceLineItems error:', e);
    }
  }

  /* ──────────────────────── Main render ──────────────────────── */

  function render(detail) {
    var config = getConfig();
    if (!config) {
      fetchConfigFallback(function () {
        render(detail);
      });
      return;
    }

    var protection = config.protection || {};
    var giftWrapping = config.giftWrapping || {};
    var protEnabled = Boolean(protection.enabled);
    var giftEnabled = Boolean(giftWrapping.enabled);

    if (!protEnabled && !giftEnabled) {
      var elClear = document.getElementById(MOUNT_ID);
      if (elClear) elClear.innerHTML = '';
      return;
    }

    var cart = (detail && detail.cart) || latestCart;
    if (cart) latestCart = cart;

    var items = (cart && Array.isArray(cart.items)) ? cart.items : [];

    // Extract variant IDs
    var svcIds = config.serviceProductIds || {};
    var protVarIdNum = getNumericId(svcIds.protectionVariantId);
    var giftVarIdNum = getNumericId(svcIds.giftWrappingVariantId);

    // Proactively fetch and auto-provision service products in background if missing
    if ((protEnabled && !protVarIdNum) || (giftEnabled && !giftVarIdNum)) {
      fetchConfigFallback(function (newCfg) {
        if (newCfg && newCfg.serviceProductIds) {
          var nProt = getNumericId(newCfg.serviceProductIds.protectionVariantId);
          var nGift = getNumericId(newCfg.serviceProductIds.giftWrappingVariantId);
          if ((!protVarIdNum && nProt) || (!giftVarIdNum && nGift)) {
            triggerCartSync();
          }
        }
      }, true);
    }

    // Count non-service items and detect orphaned service items
    var realItemCount = 0;
    var realCartTotal = 0;
    var orphanedUpdates = {};
    var hasOrphans = false;

    for (var k = 0; k < items.length; k++) {
      var itk = items[k];
      var propsK = itk.properties || {};
      var titleK = (itk.title || '') + ' ' + (itk.product_title || '');
      var itVarId = itk.variant_id || itk.id;
      var isSvc = propsK._cartelevate_service === 'true' || propsK._cartelevate_service === true ||
                  (protVarIdNum && itVarId === protVarIdNum) ||
                  (giftVarIdNum && itVarId === giftVarIdNum) ||
                  titleK.indexOf('Package Protection') !== -1 ||
                  titleK.indexOf('Gift Wrapping') !== -1;

      if (isSvc) {
        orphanedUpdates[String(itk.key || itk.id)] = 0;
        if (itk.variant_id) {
          orphanedUpdates[String(itk.variant_id)] = 0;
        }
        hasOrphans = true;
      } else {
        realItemCount += (itk.quantity || 1);
        realCartTotal += (typeof itk.final_line_price === 'number')
          ? itk.final_line_price / 100
          : ((itk.price || 0) / 100) * (itk.quantity || 1);
      }
    }

    // If there are NO regular products in the cart, service items (protection, gift wrapping)
    // MUST NOT remain in the cart! Purge them immediately so the cart is genuinely empty.
    if (realItemCount === 0) {
      var elEmpty = document.getElementById(MOUNT_ID);
      if (elEmpty) elEmpty.innerHTML = '';

      if (hasOrphans && !isOperationBusy) {
        isOperationBusy = true;
        console.log('[CartElevate PW] Cart has 0 regular products. Auto-purging orphaned service items...', orphanedUpdates);
        var purgeP = postJSON('/cart/update.js?ce_internal=1', { updates: orphanedUpdates })
          .then(function (clearedCart) {
            console.log('[CartElevate PW] Orphaned service items purged ✓');
            latestCart = clearedCart;
          })
          .catch(function (err) {
            console.warn('[CartElevate PW] Auto-purge error:', err);
          })
          .finally(function () {
            if (pendingCartOperation === purgeP) pendingCartOperation = null;
            isOperationBusy = false;
            triggerCartSync();
          });
        pendingCartOperation = purgeP;
      }
      return;
    }

    // Find existing service lines in cart
    var protLine = null;
    var giftLine = null;
    var duplicateServiceKeys = [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var props = it.properties || {};
      var isService = props._cartelevate_service === 'true' || props._cartelevate_service === true;
      var titleStr = (it.title || '') + ' ' + (it.product_title || '');
      var itVar = it.variant_id || it.id;

      if ((protVarIdNum && itVar === protVarIdNum) || (isService && titleStr.indexOf('Package Protection') !== -1)) {
        if (!protLine) {
          protLine = it;
        } else {
          duplicateServiceKeys.push(String(it.key || it.id));
        }
      }
      if ((giftVarIdNum && itVar === giftVarIdNum) || (isService && titleStr.indexOf('Gift Wrapping') !== -1)) {
        if (!giftLine) {
          giftLine = it;
        } else {
          duplicateServiceKeys.push(String(it.key || it.id));
        }
      }
    }

    // Calculate gift wrap pricing & quantity based on settings
    var giftUnitPrice = Number(giftWrapping.price >= 0 ? giftWrapping.price : 4.0);
    var isGiftPerItem = giftWrapping.applies === 'per_item';
    var expectedGiftQty = isGiftPerItem ? Math.max(1, realItemCount) : 1;
    var giftTotalPrice = (giftUnitPrice * expectedGiftQty).toFixed(2);
    var sym = getCurrencySymbol();
    var giftLabelText = (isGiftPerItem && realItemCount > 1)
      ? 'Add gift wrapping (' + sym + giftUnitPrice.toFixed(2) + '/item · ' + sym + giftTotalPrice + ')'
      : 'Add gift wrapping (' + sym + giftTotalPrice + ')';

    // Clamp / sync service items quantities
    var clampUpdates = {};
    var needsClamp = false;

    // Protection is always quantity 1
    if (protLine && protLine.quantity > 1) {
      clampUpdates[String(protLine.key || protLine.id)] = 1;
      needsClamp = true;
    }

    // Gift wrapping sync:
    // If applies === 'per_item', quantity equals realItemCount
    // If applies === 'per_order', quantity is clamped to 1
    if (giftLine && giftLine.quantity !== expectedGiftQty) {
      clampUpdates[String(giftLine.key || giftLine.id)] = expectedGiftQty;
      needsClamp = true;
    }

    // Remove any duplicate service line items
    for (var d = 0; d < duplicateServiceKeys.length; d++) {
      clampUpdates[duplicateServiceKeys[d]] = 0;
      needsClamp = true;
    }

    if (needsClamp && !isOperationBusy) {
      isOperationBusy = true;
      console.log('[CartElevate PW] Syncing service item quantities (prot=1, gift=' + expectedGiftQty + ')...', clampUpdates);
      var clampP = postJSON('/cart/update.js?ce_internal=1', { updates: clampUpdates })
        .catch(function () {})
        .finally(function () {
          if (pendingCartOperation === clampP) pendingCartOperation = null;
          isOperationBusy = false;
          triggerCartSync();
        });
      pendingCartOperation = clampP;
    }

    // Calculate target and display prices
    var protTargetPrice;
    if (protection.priceType === 'flat') {
      protTargetPrice = Number(protection.flatFee || 1.99).toFixed(2);
    } else {
      var pct = Number(protection.percentage || 2);
      var calcProt = (realCartTotal * pct) / 100;
      protTargetPrice = Math.max(0.10, calcProt).toFixed(2);
    }
    var protDisplayPrice = protTargetPrice;

    // Auto-sync protection price when cart total changes or line item price is stale
    if (protLine && protVarIdNum && !isOperationBusy && lastSyncedCartTotal !== realCartTotal) {
      var actualProtCents = protLine.final_price !== undefined ? protLine.final_price : protLine.price;
      var targetProtCents = Math.round(Number(protTargetPrice) * 100);

      if (Math.abs(actualProtCents - targetProtCents) > 1) {
        lastSyncedCartTotal = realCartTotal;
        isOperationBusy = true;
        console.log('[CartElevate PW] Protection price out of sync (' + actualProtCents + ' vs ' + targetProtCents + '). Updating to $' + protTargetPrice + '...');

        var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop) || '';
        var appBaseUrl = resolveAppBaseUrl();
        var syncApiPromise = Promise.resolve();

        if (shop && appBaseUrl) {
          var apiEndpoint = appBaseUrl.replace(/\/+$/, '') + '/api/protection-wrapping';
          syncApiPromise = fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shop: shop,
              action: 'update-price',
              variantId: protVarIdNum,
              price: protTargetPrice,
            }),
          }).catch(function (e) {
            console.warn('[CartElevate PW] Price API sync error:', e);
          });
        }

        var lineKeyToRemove = protLine.key ? String(protLine.key) : String(protVarIdNum);

        var protSyncP = syncApiPromise.then(function () {
          return postJSON('/cart/change.js?ce_internal=1', {
            id: lineKeyToRemove,
            quantity: 0,
          });
        }).then(function () {
          return postJSON('/cart/add.js?ce_internal=1', {
            items: [{ id: protVarIdNum, quantity: 1, properties: { _cartelevate_service: 'true' } }],
          });
        }).then(function () {
          console.log('[CartElevate PW] Protection line successfully synced to $' + protTargetPrice + ' ✓');
        }).catch(function (err) {
          console.warn('[CartElevate PW] Failed to sync protection price:', err);
        }).finally(function () {
          if (pendingCartOperation === protSyncP) pendingCartOperation = null;
          isOperationBusy = false;
          triggerCartSync();
        });
        pendingCartOperation = protSyncP;
      }
    }

    var isProtChecked = Boolean(protLine);
    var isGiftChecked = Boolean(giftLine);
    var existingNote = (cart && cart.attributes && cart.attributes['Gift Note']) || '';
    if (userGiftNoteText === null && existingNote) {
      userGiftNoteText = existingNote;
    }
    var sym = getCurrencySymbol();

    // Check if user is currently focused and typing in the gift note input
    var activeEl = document.activeElement;
    var isNoteFocused = Boolean(activeEl && activeEl.id === 'ce-pw-gift-note');
    var existingNoteEl = document.getElementById('ce-pw-gift-note');
    if (existingNoteEl && isGiftNoteDirty) {
      userGiftNoteText = existingNoteEl.value;
    }

    var mount = findOrCreateMount();
    if (!mount) {
      scheduleRetry();
      return;
    }

    // Apply branding accent color
    mount.style.setProperty('--ce-accent-color', getBrandingAccentColor());

    // If user is actively typing in the note textarea, do not wipe innerHTML!
    if (isNoteFocused && mount.children.length > 0) {
      var pc = document.getElementById('ce-pw-prot-chk');
      var gc = document.getElementById('ce-pw-gift-chk');
      if (pc && !isOperationBusy) pc.checked = isProtChecked;
      if (gc && !isOperationBusy) gc.checked = isGiftChecked;
      return;
    }

    // Cache key to avoid redundant DOM re-writes
    var key = [
      protEnabled,
      giftEnabled,
      isProtChecked,
      isGiftChecked,
      protDisplayPrice,
      giftLabelText,
      expectedGiftQty,
      Boolean(giftWrapping.allowGiftNote),
      isOperationBusy,
    ].join('|');

    if (key === lastRenderedKey && mount.children.length > 0) {
      return;
    }
    lastRenderedKey = key;

    /* ─── Build HTML ─── */
    var html = '<div class="ce-pw-container' + (isOperationBusy ? ' ce-pw-loading-indicator' : '') + '">';

    if (protEnabled) {
      html +=
        '<div class="ce-pw-item">' +
          '<label class="ce-pw-label-group" for="ce-pw-prot-chk">' +
            '<input type="checkbox" class="ce-pw-checkbox" id="ce-pw-prot-chk"' + (isProtChecked ? ' checked' : '') +
              (isOperationBusy ? ' disabled' : '') + ' />' +
            '<span class="ce-pw-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>' +
            '<span class="ce-pw-title">Protect your order (' + sym + protDisplayPrice + ')</span>' +
          '</label>' +
          '<div class="ce-pw-info-wrap">' +
            '<button type="button" class="ce-pw-info-btn" aria-label="Protection info" title="' + escapeHtml(protection.description || 'Protect your order from loss or damage') + '">ⓘ</button>' +
            '<div class="ce-pw-tooltip">' + escapeHtml(protection.description || 'Protect your order from loss or damage') + '</div>' +
          '</div>' +
        '</div>';
    }

    if (giftEnabled) {
      html +=
        '<div class="ce-pw-item">' +
          '<label class="ce-pw-label-group" for="ce-pw-gift-chk">' +
            '<input type="checkbox" class="ce-pw-checkbox" id="ce-pw-gift-chk"' + (isGiftChecked ? ' checked' : '') +
              (isOperationBusy ? ' disabled' : '') + ' />' +
            '<span class="ce-pw-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg></span>' +
            '<span class="ce-pw-title">' + giftLabelText + '</span>' +
          '</label>' +
        '</div>';

      if (giftWrapping.allowGiftNote) {
        var noteVal = userGiftNoteText !== null ? userGiftNoteText : existingNote;
        var noteDisplay = isGiftChecked ? 'display: block;' : 'display: none;';
        html +=
          '<div class="ce-pw-gift-note-wrapper" id="ce-pw-gift-note-wrapper" style="' + noteDisplay + '">' +
            '<textarea class="ce-pw-gift-note-input" id="ce-pw-gift-note" placeholder="Add a gift message for the recipient...">' +
              escapeHtml(noteVal) +
            '</textarea>' +
          '</div>';
      }
    }

    html += '</div>';
    mount.innerHTML = html;

    // Restore note input value and focus if needed
    var newNoteEl = document.getElementById('ce-pw-gift-note');
    if (newNoteEl && userGiftNoteText !== null) {
      newNoteEl.value = userGiftNoteText;
      if (isNoteFocused) {
        newNoteEl.focus();
        try {
          var cursorLen = newNoteEl.value.length;
          newNoteEl.setSelectionRange(cursorLen, cursorLen);
        } catch (err) {}
      }
    }

    /* ─── Event listeners ─── */
    var protChk = document.getElementById('ce-pw-prot-chk');
    if (protChk) {
      protChk.onchange = function (e) {
        e.stopPropagation();
        var checkedState = this.checked;
        handleProtectionToggle(checkedState, protVarIdNum, protLine, protDisplayPrice);
      };
    }

    var giftChk = document.getElementById('ce-pw-gift-chk');
    if (giftChk) {
      giftChk.onchange = function (e) {
        e.stopPropagation();
        var checkedState = this.checked;

        // OPTIMISTIC UI: Instantly toggle note box visibility without waiting for network!
        var noteWrap = document.getElementById('ce-pw-gift-note-wrapper');
        if (noteWrap) {
          noteWrap.style.display = (checkedState && giftWrapping.allowGiftNote) ? 'block' : 'none';
          if (checkedState && giftWrapping.allowGiftNote) {
            var ta = document.getElementById('ce-pw-gift-note');
            if (ta) {
              setTimeout(function () {
                try { ta.focus(); } catch (err) {}
              }, 50);
            }
          }
        }

        handleGiftWrapToggle(checkedState, giftVarIdNum, giftLine, giftUnitPrice.toFixed(2), expectedGiftQty);
      };
    }

    var noteInput = document.getElementById('ce-pw-gift-note');
    if (noteInput) {
      noteInput.addEventListener('input', function () {
        userGiftNoteText = this.value;
        isGiftNoteDirty = true;
        clearTimeout(giftNoteTimer);
        giftNoteTimer = setTimeout(function () {
          flushGiftNote();
        }, 500);
      });

      noteInput.addEventListener('blur', function () {
        if (isGiftNoteDirty) {
          flushGiftNote();
        }
      });
    }

    hideServiceLineItems();
  }

  /* ─────────────── Toggle handlers ─────────────── */

  function handleProtectionToggle(isChecked, numericVarId, knownLine, displayPrice) {
    if (isOperationBusy) return;

    if (isChecked && !numericVarId) {
      console.log('[CartElevate PW] Protection variant ID missing. Auto-resolving from backend API...');
      var chk = document.getElementById('ce-pw-prot-chk');
      var itemEl = chk ? chk.closest('.ce-pw-item') : null;
      if (itemEl) itemEl.classList.add('ce-pw-loading');
      isOperationBusy = true;

      fetchConfigFallback(function (newCfg) {
        isOperationBusy = false;
        if (itemEl) itemEl.classList.remove('ce-pw-loading');
        var resolvedVarId = newCfg && newCfg.serviceProductIds && getNumericId(newCfg.serviceProductIds.protectionVariantId);
        if (resolvedVarId) {
          console.log('[CartElevate PW] Auto-resolved protection variant ID ✓:', resolvedVarId);
          handleProtectionToggle(true, resolvedVarId, knownLine, displayPrice);
        } else {
          console.error('[CartElevate PW] Could not resolve protection variant ID. Please check app configuration.');
          if (chk) chk.checked = false;
        }
      }, true);
      return;
    }

    isOperationBusy = true;
    lastRenderedKey = ''; // Invalidate render cache

    var p;
    if (isChecked) {
      console.log('[CartElevate PW] Adding Package Protection variant', numericVarId, 'to cart at price:', displayPrice);
      var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop) || '';
      var appBaseUrl = resolveAppBaseUrl();
      var priceSyncPromise = Promise.resolve();

      if (displayPrice && shop && appBaseUrl) {
        var apiEndpoint = appBaseUrl.replace(/\/+$/, '') + '/api/protection-wrapping';
        priceSyncPromise = fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop: shop,
            action: 'update-price',
            variantId: numericVarId,
            price: displayPrice,
          }),
        }).catch(function () {});
      }

      p = priceSyncPromise.then(function () {
        return postJSON('/cart/add.js?ce_internal=1', {
          items: [{ id: numericVarId, quantity: 1, properties: { _cartelevate_service: 'true' } }],
        });
      }).then(function (res) {
        if (res && res.status >= 400) {
          console.error('[CartElevate PW] Cart add failed:', res.description || res.message || res);
          var c = document.getElementById('ce-pw-prot-chk');
          if (c) c.checked = false;
        } else {
          console.log('[CartElevate PW] Protection added to cart ✓');
        }
        return res;
      });
    } else {
      console.log('[CartElevate PW] Removing Package Protection from cart...');
      // Determine line key or fallback to variant ID
      var lineIdToRemove = (knownLine && (knownLine.key || knownLine.id))
        ? String(knownLine.key || knownLine.id)
        : String(numericVarId);

      p = postJSON('/cart/change.js?ce_internal=1', {
        id: lineIdToRemove,
        quantity: 0,
      }).then(function (res) {
        // Also ensure via /cart/update.js if change didn't wipe variant
        if (numericVarId) {
          var upd = {};
          upd[String(numericVarId)] = 0;
          postJSON('/cart/update.js?ce_internal=1', { updates: upd }).catch(function () {});
        }
        console.log('[CartElevate PW] Protection removed from cart ✓');
        return res;
      });
    }

    pendingCartOperation = p;

    p.catch(function (err) {
      console.error('[CartElevate PW] Protection toggle error:', err);
    }).finally(function () {
      if (pendingCartOperation === p) pendingCartOperation = null;
      isOperationBusy = false;
      triggerCartSync();
    });
  }

  function handleGiftWrapToggle(isChecked, numericVarId, knownLine, unitPrice, quantityToAdd) {
    if (isOperationBusy) return;

    if (isChecked && !numericVarId) {
      console.log('[CartElevate PW] Gift wrap variant ID missing. Auto-resolving from backend API...');
      var chk = document.getElementById('ce-pw-gift-chk');
      var itemEl = chk ? chk.closest('.ce-pw-item') : null;
      if (itemEl) itemEl.classList.add('ce-pw-loading');
      isOperationBusy = true;

      fetchConfigFallback(function (newCfg) {
        isOperationBusy = false;
        if (itemEl) itemEl.classList.remove('ce-pw-loading');
        var resolvedVarId = newCfg && newCfg.serviceProductIds && getNumericId(newCfg.serviceProductIds.giftWrappingVariantId);
        if (resolvedVarId) {
          console.log('[CartElevate PW] Auto-resolved gift wrap variant ID ✓:', resolvedVarId);
          handleGiftWrapToggle(true, resolvedVarId, knownLine, unitPrice, quantityToAdd);
        } else {
          console.error('[CartElevate PW] Could not resolve gift wrap variant ID. Please check app configuration.');
          if (chk) chk.checked = false;
          var nw = document.getElementById('ce-pw-gift-note-wrapper');
          if (nw) nw.style.display = 'none';
        }
      }, true);
      return;
    }

    isOperationBusy = true;
    lastRenderedKey = '';

    var targetQty = (typeof quantityToAdd === 'number' && quantityToAdd > 0) ? quantityToAdd : 1;
    var p;
    if (isChecked) {
      console.log('[CartElevate PW] Adding Gift Wrapping variant', numericVarId, 'to cart (qty: ' + targetQty + ')...');
      p = postJSON('/cart/add.js?ce_internal=1', {
        items: [{ id: numericVarId, quantity: targetQty, properties: { _cartelevate_service: 'true' } }],
      }).then(function (res) {
        if (res && res.status >= 400) {
          console.error('[CartElevate PW] Cart add failed:', res.description || res.message || res);
          var c = document.getElementById('ce-pw-gift-chk');
          if (c) c.checked = false;
          var nw = document.getElementById('ce-pw-gift-note-wrapper');
          if (nw) nw.style.display = 'none';
        } else {
          console.log('[CartElevate PW] Gift wrap added to cart ✓');
        }
        return res;
      });
    } else {
      console.log('[CartElevate PW] Removing Gift Wrapping from cart...');
      userGiftNoteText = '';
      isGiftNoteDirty = false;
      var lineIdToRemove = (knownLine && (knownLine.key || knownLine.id))
        ? String(knownLine.key || knownLine.id)
        : String(numericVarId);

      p = postJSON('/cart/change.js?ce_internal=1', {
        id: lineIdToRemove,
        quantity: 0,
      }).then(function (res) {
        var updPayload = { attributes: { 'Gift Note': '' } };
        if (numericVarId) {
          var upd = {};
          upd[String(numericVarId)] = 0;
          updPayload.updates = upd;
        }
        return postJSON('/cart/update.js?ce_internal=1', updPayload).catch(function () {});
      }).then(function (res) {
        console.log('[CartElevate PW] Gift wrap removed from cart ✓');
        return res;
      });
    }

    pendingCartOperation = p;

    p.catch(function (err) {
      console.error('[CartElevate PW] Gift wrap toggle error:', err);
    }).finally(function () {
      if (pendingCartOperation === p) pendingCartOperation = null;
      isOperationBusy = false;
      triggerCartSync();
    });
  }

  /* ─────────────── Cart sync ─────────────── */

  function triggerCartSync() {
    // 1. Fetch fresh cart directly to guarantee accuracy
    fetch('/cart.js?ce_sync=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        if (!cart) return;
        latestCart = cart;
        render({ cart: cart, count: cart.item_count, cartTotal: cart.total_price / 100 });
        dispatchThemeCartEvents(cart);
      })
      .catch(function () {});

    // 2. Also notify global hub
    if (window.CartElevate && typeof window.CartElevate.fetchCount === 'function') {
      window.CartElevate.fetchCount();
    }
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      lastRenderedKey = '';
      triggerCartSync();
    }, 400);
  }

  /* ─────────────── Event listeners ─────────────── */

  document.addEventListener('cartelevate:cart-updated', function (e) {
    if (e.detail && e.detail.cart) {
      latestCart = e.detail.cart;
    }
    render(e.detail);
    hideServiceLineItems();
  });

  /* ─────────────── Checkout Interceptors ─────────────── */

  document.addEventListener('click', function (e) {
    if (isBypassingCheckoutGate) return;
    var el = e.target && e.target.closest && e.target.closest(CHECKOUT_SELECTOR);
    if (!el) return;
    if (!isCheckoutElement(el)) return;
    handleCheckoutGate(e, el, el.closest('form'));
  }, true);

  document.addEventListener('submit', function (e) {
    if (isBypassingCheckoutGate) return;
    var form = e.target;
    if (!form) return;
    var action = (form.getAttribute('action') || '').toLowerCase();
    if (action.indexOf('/cart/add') !== -1) return;
    if (action.indexOf('/cart') !== -1 || action.indexOf('/checkout') !== -1) {
      var submitter = e.submitter || form.querySelector(CHECKOUT_SELECTOR) || form;
      if (!isCheckoutElement(submitter)) return;
      handleCheckoutGate(e, submitter, form);
    }
  }, true);

  // Re-mount observer: checks if checkout button was added or re-rendered
  var mountObs = new MutationObserver(function (mutations) {
    hideServiceLineItems();
    for (var mi = 0; mi < mutations.length; mi++) {
      var t = mutations[mi].target;
      if (!t) continue;
      if (t.id === MOUNT_ID || (t.closest && t.closest('#' + MOUNT_ID))) continue;

      var addedNodes = mutations[mi].addedNodes;
      for (var ni = 0; ni < addedNodes.length; ni++) {
        var node = addedNodes[ni];
        if (node && node.nodeType === 1) {
          var isCheckout = (node.matches && node.matches('button[name="checkout"], #CartDrawer-Checkout, .cart__checkout-button, .cart-drawer__footer, #CartDrawer-Footer')) ||
            (node.querySelector && node.querySelector('button[name="checkout"], #CartDrawer-Checkout, .cart__checkout-button, .cart-drawer__footer, #CartDrawer-Footer'));
          if (isCheckout) {
            lastRenderedKey = '';
            scheduleRetry();
            return;
          }
        }
      }
    }
  });
  mountObs.observe(document.body, { childList: true, subtree: true });

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      fetchConfigFallback();
      triggerCartSync();
      hideServiceLineItems();
    });
  } else {
    fetchConfigFallback();
    triggerCartSync();
    hideServiceLineItems();
  }

  // Public namespace
  window.CartElevateProtectionWrappingFeature = {
    render: render,
    getConfig: getConfig,
    sync: triggerCartSync,
  };

})();
