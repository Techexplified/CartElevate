/* eslint-disable no-empty, no-unused-vars */
/* CartElevate — Feature: Post-Purchase / Pre-Checkout Upsell Interceptor
 * Intercepts checkout clicks on the cart drawer and cart page to display
 * a high-converting 1-click upsell offer before redirecting to Shopify checkout.
 */
(function () {
  'use strict';

  var CHECKOUT_SELECTOR = [
    'button[name="checkout"]',
    'input[name="checkout"]',
    'a[href^="/checkout"]',
    '[data-cart-checkout]',
    '.cart__checkout-button',
    '#checkout',
    '#CartDrawer-Checkout',
    '.cart__checkout',
    '#cart-checkout-btn',
    '.cart-drawer__checkout',
    '[data-action="checkout"]'
  ].join(', ');

  // Quick guard: returns true only for genuine checkout buttons (not add-to-cart buttons)
  function isCheckoutElement(el) {
    if (!el) return false;
    var form = el.closest('form');
    if (form) {
      var action = (form.getAttribute('action') || '').toLowerCase();
      if (action.indexOf('/cart/add') !== -1) return false;
      if (action.indexOf('/cart') !== -1 || action.indexOf('/checkout') !== -1) {
        var btnName = (el.getAttribute('name') || el.name || '').toLowerCase();
        if (btnName && btnName !== 'checkout') return false;
      }
    }
    return true;
  }

  var activeOffer = null;
  var isNavigatingToCheckout = false;
  var timerInterval = null;
  var latestCartData = null;

  function parse(r) {
    if (!r) return null;
    if (typeof r === 'string') {
      try { r = JSON.parse(r); } catch (e) {}
    }
    if (typeof r === 'string') {
      try { r = JSON.parse(r); } catch (e) {}
    }
    return (r && typeof r === 'object') ? r : null;
  }

  function getCurrencySymbol() {
    if (window.CartElevateCurrencySymbol) return window.CartElevateCurrencySymbol;
    return '$';
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
      } catch (e) { /* ignore */ }
    }
    var docVal = document.documentElement.style.getPropertyValue('--ce-accent-color');
    if (docVal && docVal.trim()) return docVal.trim();
    return '#F95738';
  }

  function getRootUrl() {
    if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
      return window.Shopify.routes.root;
    }
    return '/';
  }

  function clearAcceptedSession() {
    sessionStorage.removeItem('ce_ppo_accepted');
    sessionStorage.removeItem('ce_ppo_expires_at');
    sessionStorage.removeItem('ce_ppo_variant_id');
    sessionStorage.removeItem('ce_ppo_product_id');
    sessionStorage.removeItem('ce_ppo_product_title');
    sessionStorage.removeItem('ce_ppo_discount');
    sessionStorage.removeItem('ce_ppo_orig_price');
    sessionStorage.removeItem('ce_ppo_disc_price');
    sessionStorage.removeItem('ce_ppo_line_key');
    sessionStorage.removeItem('ce_ppo_line_index');
  }

  function resolveActiveOffer() {
    var raw = parse(window.CartElevatePostPurchase);
    var offers = [];
    if (raw) {
      if (Array.isArray(raw.offers)) offers = raw.offers;
      else if (Array.isArray(raw)) offers = raw;
    }

    if (offers.length > 0) {
      for (var i = 0; i < offers.length; i++) {
        if (offers[i] && offers[i].status === 'PUBLISHED') {
          return offers[i];
        }
      }
    }
    return null;
  }

  // Pre-load offer on boot
  activeOffer = resolveActiveOffer();

  function resolveAppBaseUrl() {
    if (window.CartElevateAppUrl && typeof window.CartElevateAppUrl === 'string' && window.CartElevateAppUrl.indexOf('http') === 0) {
      return window.CartElevateAppUrl.replace(/\/+$/, '');
    }
    var rawPP = parse(window.CartElevatePostPurchase);
    if (rawPP && rawPP.appUrl && typeof rawPP.appUrl === 'string' && rawPP.appUrl.indexOf('http') === 0) {
      return rawPP.appUrl.replace(/\/+$/, '');
    }
    var rawRec = parse(window.CartElevateRecommendations);
    if (rawRec && rawRec.appUrl && typeof rawRec.appUrl === 'string' && rawRec.appUrl.indexOf('http') === 0) {
      return rawRec.appUrl.replace(/\/+$/, '');
    }
    var rawPW = parse(window.CartElevateProtectionWrapping);
    if (rawPW && rawPW.appUrl && typeof rawPW.appUrl === 'string' && rawPW.appUrl.indexOf('http') === 0) {
      return rawPW.appUrl.replace(/\/+$/, '');
    }
    var rawSettings = parse(window.CartElevateSettings);
    if (rawSettings && rawSettings.appUrl && typeof rawSettings.appUrl === 'string' && rawSettings.appUrl.indexOf('http') === 0) {
      return rawSettings.appUrl.replace(/\/+$/, '');
    }
    return '';
  }

  function callPostPurchaseApi(actionParam, cb) {
    var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop);
    if (!shop) {
      if (typeof cb === 'function') cb(null);
      return Promise.resolve(null);
    }

    var isAccepted = sessionStorage.getItem('ce_ppo_accepted') === 'true';
    var queryStr = '?shop=' + encodeURIComponent(shop) +
      '&accepted=' + (isAccepted ? 'true' : 'false') +
      (actionParam ? '&action=' + encodeURIComponent(actionParam) : '') +
      '&t=' + Date.now();

    var baseUrl = resolveAppBaseUrl();
    var primaryUrl = baseUrl ? (baseUrl + '/api/post-purchase' + queryStr) : ('/api/post-purchase' + queryStr);
    var fallbackUrl = 'https://cart-elevate.vercel.app/api/post-purchase' + queryStr;

    function handleData(d) {
      if (d && d.success) {
        if (d.offer) {
          activeOffer = d.offer;
          window.CartElevatePostPurchase = { offers: [d.offer] };
        }
        if (d.currencySymbol) window.CartElevateCurrencySymbol = d.currencySymbol;
        if (typeof cb === 'function') cb(d.offer || d);
        return d;
      }
      if (typeof cb === 'function') cb(null);
      return null;
    }

    return fetch(primaryUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(handleData)
      .catch(function () {
        if (fallbackUrl && fallbackUrl !== primaryUrl) {
          return fetch(fallbackUrl)
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
            .then(handleData)
            .catch(function () {
              if (typeof cb === 'function') cb(null);
              return null;
            });
        }
        if (typeof cb === 'function') cb(null);
        return null;
      });
  }

  function fetchOfferFallback(cb) {
    return callPostPurchaseApi('', cb);
  }

  function extractNumericId(idOrGid) {
    if (!idOrGid) return null;
    var str = String(idOrGid);
    var match = str.match(/\d+$/);
    return match ? Number(match[0]) : null;
  }

  function syncAcceptedLineMetaFromCart(cart) {
    if (!cart || !Array.isArray(cart.items)) return;
    latestCartData = cart;
    var targetVid = sessionStorage.getItem('ce_ppo_variant_id');
    var targetProdId = sessionStorage.getItem('ce_ppo_product_id');

    for (var i = 0; i < cart.items.length; i++) {
      var it = cart.items[i];
      if (!it) continue;
      var props = it.properties;
      var matchesProp = props && String(props._cartelevate_postpurchase) === 'true';
      var matchesVid = targetVid && (Number(it.variant_id) === Number(targetVid) || Number(it.id) === Number(targetVid));
      var matchesPid = targetProdId && extractNumericId(targetProdId) === Number(it.product_id);

      if (matchesProp || (sessionStorage.getItem('ce_ppo_accepted') === 'true' && (matchesVid || matchesPid))) {
        if (it.key) sessionStorage.setItem('ce_ppo_line_key', String(it.key));
        sessionStorage.setItem('ce_ppo_line_index', String(i + 1));
        return;
      }
    }
  }

  function getCartData() {
    return fetch(getRootUrl() + 'cart.js?ce_internal=1&t=' + Date.now(), {
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
      credentials: 'same-origin'
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        if (cart) syncAcceptedLineMetaFromCart(cart);
        return cart;
      })
      .catch(function () { return null; });
  }

  /**
   * Returns true ONLY if the cart contains the post-purchase item added/updated via the Upsell Modal.
   * Requires either `_cartelevate_postpurchase: 'true'` on the line item OR `ce_ppo_accepted === 'true'` in sessionStorage.
   */
  function hasAcceptedPostPurchaseItemInCart(cart) {
    if (!cart || !Array.isArray(cart.items)) return false;
    var wasAccepted = sessionStorage.getItem('ce_ppo_accepted') === 'true';
    var targetVid = sessionStorage.getItem('ce_ppo_variant_id');
    var targetProdId = sessionStorage.getItem('ce_ppo_product_id');

    for (var i = 0; i < cart.items.length; i++) {
      var it = cart.items[i];
      if (!it || Number(it.quantity) <= 0) continue;

      if (it.properties && String(it.properties._cartelevate_postpurchase) === 'true') {
        return true;
      }
      if (wasAccepted) {
        if (targetVid && (Number(it.variant_id) === Number(targetVid) || Number(it.id) === Number(targetVid))) {
          return true;
        }
        if (targetProdId && extractNumericId(targetProdId) === Number(it.product_id)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Deduplicates any split rows for the same variant in the cart into a single line item
   * so the customer never sees two separate rows for the same product.
   */
  function deduplicateCartVariantRows(cart, targetVid) {
    if (!cart || !Array.isArray(cart.items) || !targetVid) return Promise.resolve(cart);
    var matchingItems = [];
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (item && (Number(item.variant_id) === Number(targetVid) || Number(item.id) === Number(targetVid))) {
        matchingItems.push(item);
      }
    }

    // If 0 or 1 line item exists for this variant, no deduplication is needed
    if (matchingItems.length <= 1) return Promise.resolve(cart);

    var totalQty = 0;
    var mergedProps = {};
    for (var m = 0; m < matchingItems.length; m++) {
      totalQty += Number(matchingItems[m].quantity) || 0;
      if (matchingItems[m].properties && typeof matchingItems[m].properties === 'object') {
        var pKeys = Object.keys(matchingItems[m].properties);
        for (var pk = 0; pk < pKeys.length; pk++) {
          mergedProps[pKeys[pk]] = matchingItems[m].properties[pKeys[pk]];
        }
      }
    }
    mergedProps._cartelevate_postpurchase = 'true';

    var primaryKey = matchingItems[0].key;
    var duplicateKeys = matchingItems.slice(1).map(function (it) { return it.key; }).filter(Boolean);

    // Remove duplicate rows sequentially, then set total combined quantity on the primary row
    var chain = Promise.resolve();
    duplicateKeys.forEach(function (dupKey) {
      chain = chain.then(function () {
        return fetch(getRootUrl() + 'cart/change.js?ce_internal=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id: String(dupKey), quantity: 0 })
        }).then(function (r) { return r.json(); }).catch(function () {});
      });
    });

    return chain.then(function () {
      return fetch(getRootUrl() + 'cart/change.js?ce_internal=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          id: String(primaryKey),
          quantity: totalQty,
          properties: mergedProps
        })
      })
        .then(function (r) { return r.json(); })
        .catch(function () { return cart; });
    });
  }

  var isVerifying = false;
  var lastVerifyTime = 0;

  /**
   * Verifies that the discount state matches the actual cart contents.
   * - If 30-minute window has expired: clears session, deactivates discount, and updates DOM.
   * - If cart no longer has the post-purchase item: clears session and deactivates discount.
   */
  function verifyCartAcceptanceState(passedCart) {
    var wasMarkedAccepted = sessionStorage.getItem('ce_ppo_accepted') === 'true';
    var targetVid = sessionStorage.getItem('ce_ppo_variant_id');
    var targetProdId = sessionStorage.getItem('ce_ppo_product_id');

    // If no post-purchase offer was ever accepted, skip all verification logic
    if (!wasMarkedAccepted && !targetVid && !targetProdId) return;

    var expiresAt = Number(sessionStorage.getItem('ce_ppo_expires_at') || 0);
    if (expiresAt > 0 && Date.now() > expiresAt) {
      clearAcceptedSession();
      callPostPurchaseApi('deactivate');
      scheduleDiscountHighlights();
      return;
    }

    if (passedCart && typeof passedCart === 'object') {
      var hasItem = hasAcceptedPostPurchaseItemInCart(passedCart);
      if (!hasItem) {
        if (wasMarkedAccepted) {
          clearAcceptedSession();
          callPostPurchaseApi('deactivate');
          scheduleDiscountHighlights();
        }
      } else {
        syncAcceptedLineMetaFromCart(passedCart);
      }
      return;
    }

    if (isVerifying) return;
    if (Date.now() - lastVerifyTime < 2000) return;
    isVerifying = true;
    lastVerifyTime = Date.now();

    getCartData().then(function (cart) {
      isVerifying = false;
      if (!cart) return;
      var hasAcceptedItem = hasAcceptedPostPurchaseItemInCart(cart);

      if (!hasAcceptedItem) {
        if (wasMarkedAccepted) {
          clearAcceptedSession();
          callPostPurchaseApi('deactivate');
          scheduleDiscountHighlights();
        }
      } else {
        syncAcceptedLineMetaFromCart(cart);
      }
    });
  }

  // Run verification on boot
  verifyCartAcceptanceState();

  function getCartSectionIds() {
    var ids = ['cart-drawer', 'cart-icon-bubble', 'main-cart-items', 'main-cart-footer'];

    function addId(id) {
      if (!id || typeof id !== 'string') return;
      var clean = id.replace(/^shopify-section-/, '').trim();
      if (clean && ids.indexOf(clean) === -1) {
        ids.push(clean);
      }
    }

    var dataSecEls = document.querySelectorAll(
      'cart-items-component[data-section-id], cart-drawer-component[data-section-id], [data-cart-drawer][data-section-id], [data-section-type*="cart"][data-section-id]'
    );
    for (var i = 0; i < dataSecEls.length; i++) {
      addId(dataSecEls[i].getAttribute('data-section-id'));
    }

    var probes = document.querySelectorAll(
      'cart-drawer-component, cart-items-component, cart-drawer, cart-drawer-items, #CartDrawer, .cart-drawer, .cart-items, #main-cart-items, #main-cart-footer, cart-icon, .cart-count-bubble, #cart-icon-bubble, .header-actions__action.action__cart'
    );
    for (var j = 0; j < probes.length; j++) {
      var sec = probes[j].closest && probes[j].closest('.shopify-section');
      if (sec && sec.id) {
        addId(sec.id);
      }
    }

    return ids;
  }

  function syncCartDomFromDoc(doc) {
    if (!doc) return false;
    var updatedAny = false;

    var curCartComponents = document.querySelectorAll('cart-items-component');
    var newCartComponents = doc.querySelectorAll('cart-items-component');
    if (curCartComponents.length > 0 && newCartComponents.length > 0) {
      for (var cIdx = 0; cIdx < curCartComponents.length; cIdx++) {
        var curComp = curCartComponents[cIdx];
        var secId = curComp.getAttribute('data-section-id');
        var matchedNewComp = null;
        if (secId) {
          matchedNewComp = doc.querySelector('cart-items-component[data-section-id="' + secId + '"]');
        }
        if (!matchedNewComp) {
          matchedNewComp = newCartComponents[cIdx] || newCartComponents[0];
        }
        if (matchedNewComp && matchedNewComp.innerHTML.trim()) {
          curComp.innerHTML = matchedNewComp.innerHTML;
          curComp.classList.remove('is-empty');
          updatedAny = true;
        }
      }
    }

    var safeDrawerSelectors = [
      '#CartDrawer .drawer__inner',
      '#CartDrawer .cart-drawer__inner',
      'cart-drawer-component .cart-drawer__inner',
      'dialog.cart-drawer__dialog .cart-drawer__inner',
      '.cart-drawer .cart-drawer__inner',
      '.cart-drawer .drawer__inner',
      '.cart-drawer__inner',
      '.cart-drawer__content',
      '#CartDrawer-CartItems',
      'cart-drawer-items',
      '[data-cart-drawer-content]',
      '.CartDrawer__Content',
      '.js-drawer-content'
    ];

    for (var k = 0; k < safeDrawerSelectors.length; k++) {
      var sel = safeDrawerSelectors[k];
      var curDraw = document.querySelector(sel);
      var newDraw = doc.querySelector(sel);
      if (curDraw && newDraw && newDraw.innerHTML.trim()) {
        if (!updatedAny || !curDraw.querySelector('cart-items-component')) {
          curDraw.innerHTML = newDraw.innerHTML;
          updatedAny = true;
        }
        break;
      }
    }

    // Also update drawer footer / subtotal section if rendered separately
    var footerSelectors = [
      '#CartDrawer .drawer__footer',
      '.cart-drawer__footer',
      '.drawer__footer',
      '#main-cart-footer',
      '.cart__footer'
    ];
    for (var f = 0; f < footerSelectors.length; f++) {
      var curFoot = document.querySelector(footerSelectors[f]);
      var newFoot = doc.querySelector(footerSelectors[f]);
      if (curFoot && newFoot && newFoot.innerHTML.trim()) {
        curFoot.innerHTML = newFoot.innerHTML;
        break;
      }
    }

    var emptyTargets = document.querySelectorAll(
      '#CartDrawer.is-empty, cart-drawer.is-empty, cart-drawer-items.is-empty, cart-drawer-component.is-empty, .cart-drawer.is-empty'
    );
    for (var eIdx = 0; eIdx < emptyTargets.length; eIdx++) {
      emptyTargets[eIdx].classList.remove('is-empty');
    }

    var isCartPage = window.location.pathname.indexOf('/cart') !== -1;
    if (isCartPage && !updatedAny) {
      var curMain = document.querySelector('main#MainContent') || document.querySelector('main');
      var newMain = doc.querySelector('main#MainContent') || doc.querySelector('main');
      if (curMain && newMain && newMain.innerHTML.trim()) {
        curMain.innerHTML = newMain.innerHTML;
        updatedAny = true;
      } else {
        var itemSels = '#shopify-section-main-cart-items, [id$="__cart-items"], #main-cart-items, cart-items, .cart-items, form[action*="/cart"]';
        var curItems = document.querySelector(itemSels);
        var newItems = doc.querySelector(itemSels);
        if (curItems && newItems) {
          curItems.innerHTML = newItems.innerHTML;
          updatedAny = true;
        }

        var footerSels = '#shopify-section-main-cart-footer, [id$="__cart-footer"], #main-cart-footer, .cart__footer, .totals';
        var curFooter = document.querySelector(footerSels);
        var newFooter = doc.querySelector(footerSels);
        if (curFooter && newFooter) {
          curFooter.innerHTML = newFooter.innerHTML;
        }
      }
    }

    var countSelectors = '#cart-bubble-text, cart-icon, .cart-count-bubble, [data-cart-count], .cart-link__bubble, .cart__count, .cart-icon-bubble, #cart-icon-bubble, .header-actions__action.action__cart';
    var curCounts = document.querySelectorAll(countSelectors);
    var newCounts = doc.querySelectorAll(countSelectors);
    if (curCounts.length > 0 && newCounts.length > 0) {
      for (var c = 0; c < curCounts.length; c++) {
        if (newCounts[c] && newCounts[c].innerHTML.trim()) {
          curCounts[c].innerHTML = newCounts[c].innerHTML;
        }
      }
    }

    return updatedAny;
  }

  function ensureCartDrawerOpen() {
    var isCartPage = window.location.pathname.indexOf('/cart') !== -1;
    if (isCartPage) return;

    var horizonDrawer = document.querySelector('cart-drawer-component');
    if (horizonDrawer) {
      var hDialog = horizonDrawer.querySelector('dialog');
      if (hDialog && !hDialog.open && typeof hDialog.showModal === 'function') {
        try { hDialog.showModal(); } catch (e) {}
      }
    }

    var dawnDrawer = document.getElementById('CartDrawer') || document.querySelector('cart-drawer');
    if (dawnDrawer) {
      dawnDrawer.classList.add('active');
      if (typeof dawnDrawer.showModal === 'function' && !dawnDrawer.open) {
        try { dawnDrawer.showModal(); } catch (e) {}
      }
    }

    var genericDialog = document.querySelector('dialog.cart-drawer__dialog, dialog[id*="cart" i]');
    if (genericDialog && !genericDialog.open && typeof genericDialog.showModal === 'function') {
      try { genericDialog.showModal(); } catch (e) {}
    }
  }

  function removeModal() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    document.documentElement.style.overflow = '';
    var modal = document.getElementById('ce-ppo-modal-container');
    if (modal) {
      if (typeof modal.close === 'function' && modal.open) {
        try { modal.close(); } catch (e) {}
      }
      modal.remove();
    }
  }

  function proceedToCheckout(triggerEl) {
    removeModal();
    isNavigatingToCheckout = true;

    setTimeout(function () { isNavigatingToCheckout = false; }, 3000);

    if (triggerEl && typeof triggerEl.click === 'function' && triggerEl.tagName !== 'FORM') {
      try {
        triggerEl.click();
        return;
      } catch (err) {}
    }
    window.location.href = getRootUrl() + 'checkout';
  }

  function getFallbackSvg(title) {
    var lower = (title || '').toLowerCase();
    if (lower.indexOf('diwali') !== -1 || lower.indexOf('gift') !== -1 || lower.indexOf('box') !== -1) {
      return '<svg viewBox="0 0 48 48" fill="none" style="width:72px;height:72px;">' +
        '<rect x="8" y="19" width="32" height="23" rx="3" fill="#D7A168"/>' +
        '<rect x="6" y="15" width="36" height="7" rx="2" fill="#C48455"/>' +
        '<rect x="21" y="15" width="6" height="27" fill="#B3261E"/>' +
        '<path d="M24 15C20 9 12 9 12 12C12 15 24 15 24 15Z" fill="#B3261E"/>' +
        '<path d="M24 15C28 9 36 9 36 12C36 15 24 15 24 15Z" fill="#B3261E"/>' +
      '</svg>';
    }
    if (lower.indexOf('towel') !== -1 || lower.indexOf('bundle') !== -1 || lower.indexOf('tea') !== -1) {
      return '<svg viewBox="0 0 48 48" fill="none" style="width:72px;height:72px;">' +
        '<rect x="9" y="28" width="30" height="11" rx="3" fill="#5F826E"/>' +
        '<rect x="9" y="20" width="30" height="11" rx="3" fill="#84A794"/>' +
        '<rect x="9" y="12" width="30" height="11" rx="3" fill="#E6EFE9"/>' +
        '<line x1="13" y1="17" x2="35" y2="17" stroke="#5F826E" stroke-width="1.5" stroke-dasharray="2 2"/>' +
      '</svg>';
    }
    return '<svg viewBox="0 0 48 48" fill="none" style="width:72px;height:72px;">' +
      '<ellipse cx="24" cy="33" rx="17" ry="7.5" fill="#BF7E4C"/>' +
      '<ellipse cx="24" cy="29" rx="17" ry="7.5" fill="#D39768"/>' +
      '<ellipse cx="24" cy="25" rx="17" ry="7.5" fill="#E2AC7E"/>' +
      '<ellipse cx="24" cy="21" rx="17" ry="7.5" fill="#ECC095"/>' +
      '<ellipse cx="24" cy="17" rx="17" ry="7.5" fill="#F4D3B0"/>' +
    '</svg>';
  }

  function showUpsellModal(offer, triggerEl) {
    removeModal();

    var sym = getCurrencySymbol();
    var origPrice = Number(offer.productPrice) || 20.0;
    var discount = Number(offer.discountPercentage) || 20;
    var discPrice = (origPrice * (1 - discount / 100)).toFixed(2);
    var headline = offer.headline || "Wait! Add this before you go";
    var prodTitle = offer.productTitle || offer.name || "Special Offer Item";

    var supportsDialog = typeof HTMLDialogElement === 'function';
    var container = document.createElement(supportsDialog ? 'dialog' : 'div');
    container.id = 'ce-ppo-modal-container';
    container.className = 'ce-ppo-backdrop';
    var ac = getBrandingAccentColor();
    container.style.setProperty('--ce-accent-color', ac);
    container.style.setProperty('--ce-ppo-accent', ac);

    var timerHtml = '';
    if (offer.showTimer) {
      timerHtml = '<div class="ce-ppo-timer">' +
        '<span class="ce-ppo-timer-dot"></span>' +
        '<span id="ce-ppo-timer-text">0:47 left</span>' +
      '</div>';
    }

    var imageHtml = offer.productImage
      ? '<img src="' + offer.productImage + '" alt="' + prodTitle + '" class="ce-ppo-image" />'
      : getFallbackSvg(prodTitle);

    var discountBadgeHtml = discount > 0
      ? '<span class="ce-ppo-discount-badge">-' + discount + '% OFF</span>'
      : '';

    var saveTagHtml = discount > 0
      ? '<span class="ce-ppo-save-tag">Save ' + discount + '%</span>'
      : '';

    container.innerHTML =
      '<div class="ce-ppo-modal" role="dialog" aria-modal="true">' +
        '<button type="button" class="ce-ppo-close" id="ce-ppo-btn-close" aria-label="Close">✕</button>' +
        timerHtml +
        '<h3 class="ce-ppo-headline">' + headline + '</h3>' +
        '<div class="ce-ppo-image-box">' +
          discountBadgeHtml +
          imageHtml +
        '</div>' +
        '<div class="ce-ppo-title">' + prodTitle + '</div>' +
        '<div class="ce-ppo-pricing">' +
          '<span class="ce-ppo-old-price">' + sym + origPrice.toFixed(2) + '</span>' +
          '<span class="ce-ppo-new-price">' + sym + discPrice + '</span>' +
          saveTagHtml +
        '</div>' +
        '<button type="button" class="ce-ppo-btn-add" id="ce-ppo-btn-add">' +
          'Add for ' + sym + discPrice +
        '</button>' +
        '<button type="button" class="ce-ppo-btn-skip" id="ce-ppo-btn-skip">' +
          'No thanks' +
        '</button>' +
      '</div>';

    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart'].forEach(function (evtName) {
      container.addEventListener(evtName, function (e) {
        e.stopPropagation();
      });
    });

    document.body.appendChild(container);

    if (supportsDialog && typeof container.showModal === 'function') {
      try {
        container.showModal();
      } catch (err) {
        container.setAttribute('open', '');
      }

      container.addEventListener('cancel', function (e) {
        e.preventDefault();
        proceedToCheckout(triggerEl);
      });
    }

    document.documentElement.style.overflow = 'hidden';

    container.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target === container) {
        proceedToCheckout(triggerEl);
      }
    });

    if (offer.showTimer) {
      var secondsLeft = 47;
      var timerText = document.getElementById('ce-ppo-timer-text');
      timerInterval = setInterval(function () {
        secondsLeft--;
        if (secondsLeft <= 0) {
          if (timerText) timerText.textContent = '0:00 left';
          clearInterval(timerInterval);
        } else {
          var secStr = secondsLeft < 10 ? '0' + secondsLeft : String(secondsLeft);
          if (timerText) timerText.textContent = '0:' + secStr + ' left';
        }
      }, 1000);
    }

    var closeBtn = document.getElementById('ce-ppo-btn-close');
    var skipBtn = document.getElementById('ce-ppo-btn-skip');

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        proceedToCheckout(triggerEl);
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        proceedToCheckout(triggerEl);
      });
    }

    // Accept & Add/Update Cart Handler
    var addBtn = document.getElementById('ce-ppo-btn-add');
    if (addBtn) {
      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        addBtn.disabled = true;
        addBtn.innerHTML = '<span class="ce-ppo-spinner"></span> Applying offer...';

        var sectionIds = getCartSectionIds();

        /**
         * Checks whether the product/variant already exists in the cart:
         * - If it exists: updates the existing line item (incrementing its quantity by 1
         *   and merging any duplicate rows into 1 line item) via /cart/change.js.
         * - If it does NOT exist: adds it as a new line item via /cart/add.js.
         */
        function upsertPostPurchaseCartItem(targetVid) {
          var targetProdNumeric = extractNumericId(offer.productId);

          return getCartData().then(function (currentCart) {
            var matchingLines = [];
            if (currentCart && Array.isArray(currentCart.items)) {
              for (var i = 0; i < currentCart.items.length; i++) {
                var item = currentCart.items[i];
                if (!item) continue;
                var isSameVariant = Number(item.variant_id) === Number(targetVid) || Number(item.id) === Number(targetVid);
                var isSameProduct = targetProdNumeric && Number(item.product_id) === Number(targetProdNumeric);
                if (isSameVariant || isSameProduct) {
                  matchingLines.push({ item: item, lineIndex: i + 1 });
                }
              }
            }

            // CASE 1: Product/variant already exists in cart -> Update existing line item (no duplicate row)
            if (matchingLines.length > 0) {
              var primaryEntry = matchingLines[0];
              var primaryItem = primaryEntry.item;
              var existingTotalQty = 0;
              var mergedProps = {};

              for (var m = 0; m < matchingLines.length; m++) {
                existingTotalQty += Number(matchingLines[m].item.quantity) || 0;
                var itemProps = matchingLines[m].item.properties;
                if (itemProps && typeof itemProps === 'object') {
                  var keys = Object.keys(itemProps);
                  for (var k = 0; k < keys.length; k++) {
                    mergedProps[keys[k]] = itemProps[keys[k]];
                  }
                }
              }

              // Increment quantity by 1 for the accepted post-purchase offer
              var newTotalQty = existingTotalQty + 1;
              mergedProps._cartelevate_postpurchase = 'true';

              // If there were already multiple split rows for this variant, zero out the extras first
              var cleanupPromise = Promise.resolve();
              if (matchingLines.length > 1) {
                matchingLines.slice(1).forEach(function (dupEntry) {
                  if (dupEntry.item && dupEntry.item.key) {
                    cleanupPromise = cleanupPromise.then(function () {
                      return fetch(getRootUrl() + 'cart/change.js?ce_internal=1', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ id: String(dupEntry.item.key), quantity: 0 })
                      }).then(function (r) { return r.json(); }).catch(function () {});
                    });
                  }
                });
              }

              return cleanupPromise.then(function () {
                var changePayload = {
                  id: String(primaryItem.key || primaryItem.variant_id || targetVid),
                  quantity: newTotalQty,
                  properties: mergedProps,
                  sections: sectionIds.join(','),
                  sections_url: window.location.pathname
                };

                return fetch(getRootUrl() + 'cart/change.js?ce_internal=1', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  credentials: 'same-origin',
                  body: JSON.stringify(changePayload)
                }).then(function (res) {
                  return res.json().then(function (data) {
                    if (!res.ok || data.status === 422 || data.message === 'Cart Error') {
                      throw new Error(data.description || data.message || 'Cart change failed');
                    }
                    // Identify updated line key from returned cart state
                    if (data && Array.isArray(data.items)) {
                      var updatedLine = data.items.find(function (it) {
                        return Number(it.variant_id) === Number(targetVid) ||
                               (targetProdNumeric && Number(it.product_id) === Number(targetProdNumeric));
                      });
                      if (updatedLine && updatedLine.key) {
                        data.key = updatedLine.key;
                      }
                    }
                    return data;
                  });
                });
              });
            }

            // CASE 2: Product does NOT exist in cart -> Add as a new line item
            var addPayload = {
              id: Number(targetVid),
              quantity: 1,
              properties: {
                _cartelevate_postpurchase: 'true'
              },
              sections: sectionIds.join(','),
              sections_url: window.location.pathname
            };

            return fetch(getRootUrl() + 'cart/add.js?ce_internal=1', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              credentials: 'same-origin',
              body: JSON.stringify(addPayload)
            }).then(function (res) {
              return res.json().then(function (data) {
                if (!res.ok || data.status === 422 || data.message === 'Cart Error') {
                  throw new Error(data.description || data.message || 'Cart add failed');
                }
                return data;
              });
            });
          });
        }

        var handle = offer.productHandle || (offer.productTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        var initialVid = extractNumericId(offer.variantId);

        var resolveAvailableVidPromise = fetch(getRootUrl() + 'products/' + handle + '.js')
          .then(function (r) {
            if (!r.ok) return null;
            return r.json();
          })
          .then(function (p) {
            if (p && Array.isArray(p.variants) && p.variants.length > 0) {
              if (initialVid) {
                var exactAvail = p.variants.find(function (v) {
                  return Number(v.id) === Number(initialVid) && v.available;
                });
                if (exactAvail) return exactAvail.id;
              }
              var avail = p.variants.find(function (v) { return v.available; });
              if (avail) return avail.id;
              return p.variants[0].id;
            }
            return initialVid;
          })
          .catch(function () { return initialVid; });

        // 1. Activate backend Shopify Automatic Discount FIRST & resolve variant (8s safety timeout)
        var activateWithTimeout = Promise.race([
          callPostPurchaseApi('activate'),
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 8000); })
        ]);

        Promise.all([
          resolveAvailableVidPromise,
          activateWithTimeout
        ]).then(function (initResults) {
          var targetVid = initResults[0];
          var activateRes = initResults[1];
          if (!targetVid) {
            proceedToCheckout(triggerEl);
            return;
          }

          // 2. Upsert the product in cart (updates existing line item if present, or adds new if not)
          upsertPostPurchaseCartItem(targetVid)
            .then(function (upsertData) {
              // 3. Mark accepted in session storage with 30-minute auto-expiry window
              var PPO_TTL_MS = 30 * 60 * 1000;
              var expiresAt = (activateRes && activateRes.expiresAt) ? activateRes.expiresAt : (Date.now() + PPO_TTL_MS);

              sessionStorage.setItem('ce_ppo_accepted', 'true');
              sessionStorage.setItem('ce_ppo_expires_at', String(expiresAt));
              sessionStorage.setItem('ce_ppo_variant_id', String(targetVid));
              sessionStorage.setItem('ce_ppo_product_id', String(offer.productId || ''));
              sessionStorage.setItem('ce_ppo_product_title', String(prodTitle));
              sessionStorage.setItem('ce_ppo_discount', String(discount));
              sessionStorage.setItem('ce_ppo_orig_price', String(origPrice.toFixed(2)));
              sessionStorage.setItem('ce_ppo_disc_price', String(discPrice));
              if (upsertData && upsertData.key) {
                sessionStorage.setItem('ce_ppo_line_key', String(upsertData.key));
              }

              // 4. Trigger a no-op /cart/update.js so Shopify re-evaluates the newly activated automatic discount on the cart session
              return fetch(getRootUrl() + 'cart/update.js?ce_internal=1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  updates: {},
                  sections: sectionIds.join(','),
                  sections_url: window.location.pathname
                })
              })
                .then(function (r) { return r.ok ? r.json() : upsertData; })
                .catch(function () { return upsertData; })
                .then(function (recalcData) {
                  // Ensure no duplicate rows exist for this variant
                  return deduplicateCartVariantRows(recalcData, targetVid).then(function () {
                    return recalcData || upsertData;
                  });
                });
            })
            .then(function (finalData) {
              // 5. Remove the upsell modal popup
              removeModal();

              // 6. Immediately apply any rendered sections returned by Shopify
              var parser = new DOMParser();
              var updatedFromAddSections = false;
              if (finalData && finalData.sections && typeof finalData.sections === 'object') {
                var combinedSectionHtml = '';
                var secKeys = Object.keys(finalData.sections);
                for (var s = 0; s < secKeys.length; s++) {
                  if (finalData.sections[secKeys[s]]) {
                    combinedSectionHtml += finalData.sections[secKeys[s]] + '\n';
                  }
                }
                if (combinedSectionHtml) {
                  var secDoc = parser.parseFromString(combinedSectionHtml, 'text/html');
                  updatedFromAddSections = syncCartDomFromDoc(secDoc);
                }
              }

              ensureCartDrawerOpen();
              scheduleDiscountHighlights();

              // 7. Fetch fresh Section Rendering + Current Page / Cart HTML + Cart JSON in parallel
              var rootUrl = getRootUrl();
              var ts = Date.now();
              var sectionsFetchPromise = fetch(
                window.location.pathname + (window.location.search ? window.location.search + '&' : '?') +
                'sections=' + encodeURIComponent(sectionIds.join(',')) + '&ce_internal=1&t=' + ts,
                { headers: { 'Cache-Control': 'no-cache' }, credentials: 'same-origin' }
              ).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });

              var pageFetchUrl = window.location.pathname + (window.location.search ? window.location.search + '&' : '?') + 'ce_internal=1&t=' + ts;
              var pageFetchPromise = fetch(pageFetchUrl, {
                headers: { 'Cache-Control': 'no-cache' },
                credentials: 'same-origin'
              }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });

              var isCartPage = window.location.pathname.indexOf('/cart') !== -1;
              var cartPageFetchPromise = isCartPage
                ? Promise.resolve('')
                : fetch(rootUrl + 'cart?ce_internal=1&t=' + ts, {
                    headers: { 'Cache-Control': 'no-cache' },
                    credentials: 'same-origin'
                  }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });

              Promise.all([sectionsFetchPromise, pageFetchPromise, cartPageFetchPromise, getCartData()])
                .then(function (results) {
                  var fetchedSections = results[0];
                  var currentPageHtml = results[1];
                  var cartPageHtml = results[2];
                  var freshCart = results[3];

                  if (fetchedSections && typeof fetchedSections === 'object') {
                    var secHtml = '';
                    var fKeys = Object.keys(fetchedSections);
                    for (var k = 0; k < fKeys.length; k++) {
                      if (fetchedSections[fKeys[k]]) secHtml += fetchedSections[fKeys[k]] + '\n';
                    }
                    if (secHtml) {
                      syncCartDomFromDoc(parser.parseFromString(secHtml, 'text/html'));
                    }
                  }

                  if (currentPageHtml) {
                    syncCartDomFromDoc(parser.parseFromString(currentPageHtml, 'text/html'));
                  }

                  if (cartPageHtml && !updatedFromAddSections) {
                    syncCartDomFromDoc(parser.parseFromString(cartPageHtml, 'text/html'));
                  }

                  if (freshCart && typeof freshCart.item_count === 'number') {
                    window.CartElevateItemCount = freshCart.item_count;
                    var textBadges = document.querySelectorAll('[data-cart-count], #cart-bubble-text, .cart-count-bubble span[aria-hidden="true"]');
                    for (var b = 0; b < textBadges.length; b++) {
                      textBadges[b].textContent = String(freshCart.item_count);
                    }
                  }

                  ensureCartDrawerOpen();

                  var activeSectionsPayload = fetchedSections || (finalData && finalData.sections) || {};
                  document.dispatchEvent(new CustomEvent('cart:update', {
                    bubbles: true,
                    detail: {
                      resource: freshCart,
                      sourceId: 'cart-elevate',
                      data: {
                        source: 'cart-elevate',
                        itemCount: freshCart ? freshCart.item_count : 1,
                        sections: activeSectionsPayload
                      }
                    }
                  }));
                  document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true, detail: { cart: freshCart } }));
                  document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { cart: freshCart } }));
                  document.dispatchEvent(new CustomEvent('cart:change', { bubbles: true, detail: { cart: freshCart } }));
                  document.dispatchEvent(new CustomEvent('cartelevate:cart-updated', { bubbles: true, detail: { cart: freshCart } }));
                  document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));

                  if (window.CartElevate && typeof window.CartElevate.fetchCount === 'function') {
                    window.CartElevate.fetchCount();
                  }

                  scheduleDiscountHighlights();
                })
                .catch(function (e) {
                  console.warn('[CartElevate] Live cart DOM update error:', e);
                });
            })
            .catch(function (err) {
              console.warn('[CartElevate] Failed to upsert upsell product:', err);
              callPostPurchaseApi('deactivate');
              removeModal();
            });
        });
      });
    }
  }

  function findCartLineElements() {
    var selectorList = [
      'tr.cart-items__table-row',
      '.cart-items__table-row',
      'tr.cart-item',
      '.cart-item',
      'cart-item',
      '.cart__item',
      '.cart-drawer__item',
      '.line-item',
      '.cart__row',
      '[data-cart-item]',
      '[id^="CartDrawer-Item-"]',
      '[id^="CartItem-"]'
    ].join(', ');

    var els = document.querySelectorAll(selectorList);
    return els ? Array.prototype.slice.call(els) : [];
  }

  function isLineMatchingVariant(lineEl, targetVarId) {
    if (!targetVarId || !lineEl) return false;
    var varStr = String(targetVarId);
    var key = lineEl.getAttribute('data-key') || lineEl.getAttribute('data-line-item-key') || '';
    if (key && (key === varStr || key.indexOf(varStr + ':') === 0 || key.indexOf(varStr) !== -1)) {
      return true;
    }
    if (
      lineEl.getAttribute('data-variant-id') === varStr ||
      (lineEl.id && lineEl.id.indexOf(varStr) !== -1) ||
      lineEl.querySelector('[data-variant-id="' + varStr + '"]') ||
      lineEl.querySelector('a[href*="' + varStr + '"]')
    ) {
      return true;
    }
    var offerTitle = (sessionStorage.getItem('ce_ppo_product_title') || (activeOffer && activeOffer.productTitle) || '').toLowerCase().trim();
    if (offerTitle) {
      var titleEl = lineEl.querySelector('.cart-items__title, .cart-item__name, .product-title, .line-item__title, a.cart-items__title');
      if (titleEl) {
        var t = titleEl.textContent.toLowerCase().trim();
        if (t === offerTitle || t.indexOf(offerTitle) !== -1 || offerTitle.indexOf(t) !== -1) {
          return true;
        }
      }
    }
    return false;
  }

  var isApplyingHighlights = false;
  var highlightDebounceTimer = null;

  function scheduleDiscountHighlights() {
    if (isApplyingHighlights) return;
    if (highlightDebounceTimer) clearTimeout(highlightDebounceTimer);
    highlightDebounceTimer = setTimeout(function () {
      applyCartDiscountHighlights();
    }, 80);
  }

  function applyCartDiscountHighlights() {
    if (isApplyingHighlights) return;
    isApplyingHighlights = true;

    try {
      // STRICT GATE: Never highlight or discount any line item unless the customer
      // explicitly accepted the post-purchase offer by clicking the Add button.
      var accepted = sessionStorage.getItem('ce_ppo_accepted') === 'true';
      if (!accepted) {
        var existingBadges = document.querySelectorAll('.ce-ppo-cart-price-block, .ce-ppo-unit-price-inline');
        for (var b = 0; b < existingBadges.length; b++) {
          existingBadges[b].remove();
        }
        return;
      }

      var discount = sessionStorage.getItem('ce_ppo_discount');
      var origPrice = sessionStorage.getItem('ce_ppo_orig_price');
      var targetVarId = sessionStorage.getItem('ce_ppo_variant_id');
      var sym = getCurrencySymbol();

      if (!discount || !targetVarId) return;

      var lines = findCartLineElements();
      if (!lines || lines.length === 0) return;

      // Filter lines that actually belong to the post-purchase offer product
      var offerMatchingLines = [];
      for (var mIdx = 0; mIdx < lines.length; mIdx++) {
        if (isLineMatchingVariant(lines[mIdx], targetVarId)) {
          offerMatchingLines.push(lines[mIdx]);
        } else {
          // Immediately remove any accidental discount block from non-offer products
          var accidentalBlock = lines[mIdx].querySelector('.ce-ppo-cart-price-block');
          if (accidentalBlock) accidentalBlock.remove();
          var accidentalUnit = lines[mIdx].querySelector('.ce-ppo-unit-price-inline');
          if (accidentalUnit) accidentalUnit.remove();
        }
      }

      if (offerMatchingLines.length === 0) return;

      var origNum = parseFloat(origPrice) || 20;
      var discPct = parseFloat(discount) || 20;
      var unitDiscPrice = origNum * (1 - discPct / 100);
      var totalDiscountDollars = 0;

      // Only apply highlight to the primary merged line item
      var primaryLineEl = offerMatchingLines[0];

      // Read live line quantity
      var qty = 1;
      var qtyInput = primaryLineEl.querySelector('input.quantity__input, input[name="updates[]"], input[type="number"], quantity-selector input');
      if (qtyInput && qtyInput.value) {
        var pq = parseInt(qtyInput.value, 10);
        if (!isNaN(pq) && pq > 0) qty = pq;
      } else if (latestCartData && Array.isArray(latestCartData.items)) {
        var matchedCartItem = latestCartData.items.find(function (it) {
          return Number(it.variant_id) === Number(targetVarId);
        });
        if (matchedCartItem && Number(matchedCartItem.quantity) > 0) {
          qty = Number(matchedCartItem.quantity);
        }
      }

      // Check competing bundle discount on this item
      var targetProdId = sessionStorage.getItem('ce_ppo_product_id');
      var bundlePct = 0;
      if (typeof window.CartElevateGetBestBundleDiscountPct === 'function') {
        bundlePct = window.CartElevateGetBestBundleDiscountPct(targetVarId, targetProdId, qty);
      }

      // Check native Shopify line item discount (excluding our post-purchase discount)
      var nativePct = 0;
      var cartItemRef = null;
      if (latestCartData && Array.isArray(latestCartData.items)) {
        cartItemRef = latestCartData.items.find(function (it) {
          return Number(it.variant_id) === Number(targetVarId);
        });
      }
      if (cartItemRef && cartItemRef.original_line_price && cartItemRef.final_line_price && cartItemRef.original_line_price > cartItemRef.final_line_price) {
        var isPpoNative = false;
        if (Array.isArray(cartItemRef.discounts)) {
          isPpoNative = cartItemRef.discounts.some(function (d) {
            return d && d.title && (d.title.indexOf('Post-Purchase') !== -1 || d.title.indexOf('Special Offer') !== -1);
          });
        }
        if (!isPpoNative) {
          nativePct = Math.round(((cartItemRef.original_line_price - cartItemRef.final_line_price) / cartItemRef.original_line_price) * 100);
        }
      }

      var maxCompetingPct = Math.max(bundlePct, nativePct);

      // MAXIMUM APPLICABLE DISCOUNT RULE:
      // If another qualifying discount provides a higher percentage, yield to it.
      if (discPct < maxCompetingPct) {
        var exBlock = primaryLineEl.querySelector('.ce-ppo-cart-price-block');
        if (exBlock) exBlock.remove();
        var exUnit = primaryLineEl.querySelector('.ce-ppo-unit-price-inline');
        if (exUnit) exUnit.remove();
        return;
      }

      // Post-Purchase is the winning discount: Suppress lower competing bundle badges & discount text
      var competingBundleBadges = primaryLineEl.querySelectorAll('.ce-bundle-badge-wrapper, .ce-bundle-badge');
      for (var bb = 0; bb < competingBundleBadges.length; bb++) {
        competingBundleBadges[bb].remove();
      }

      var lowerDiscEls = primaryLineEl.querySelectorAll(
        '.discounts__discount, .cart-item__discount, [data-cart-item-discount], .line-item__discount, .cart-item__discounts, ul.discounts, .cart-item__discount-list, .cart-items__discount, [class*="discount"]'
      );
      for (var de = 0; de < lowerDiscEls.length; de++) {
        var dt = (lowerDiscEls[de].textContent || '').toLowerCase();
        if (dt.indexOf('volume discount') !== -1 || dt.indexOf('buy 2+') !== -1 || (bundlePct > 0 && dt.indexOf(bundlePct + '%') !== -1)) {
          lowerDiscEls[de].style.setProperty('display', 'none', 'important');
          var parentLi = lowerDiscEls[de].closest('li, ul, div');
          if (parentLi && parentLi !== primaryLineEl && !parentLi.contains(priceEl)) {
            parentLi.style.setProperty('display', 'none', 'important');
          }
        }
      }

      var lineOldTotal = origNum * qty;
      var lineNewTotal = unitDiscPrice * qty;
      totalDiscountDollars = lineOldTotal - lineNewTotal;

      var displayOldLine = sym + lineOldTotal.toFixed(2);
      var displayNewLine = sym + lineNewTotal.toFixed(2);
      var displayOldUnit = sym + origNum.toFixed(2);
      var displayNewUnit = sym + unitDiscPrice.toFixed(2);

      // Right-column Line Total price element
      var priceEl = primaryLineEl.querySelector('.cart-items__price') ||
                    primaryLineEl.querySelector('.cart-item__totals') ||
                    primaryLineEl.querySelector('.cart-item__price-wrapper') ||
                    primaryLineEl.querySelector('.line-item__price') ||
                    primaryLineEl.querySelector('[data-cart-item-price]');

      // 1. Update Right-Side Line Total Price Block (reflects combined quantity)
      if (priceEl) {
        var ac = getBrandingAccentColor();
        priceEl.style.setProperty('--ce-accent-color', ac);
        priceEl.style.setProperty('--ce-ppo-accent', ac);
        var existingBlock = priceEl.querySelector('.ce-ppo-cart-price-block');
        if (!existingBlock) {
          priceEl.innerHTML =
            '<div class="ce-ppo-cart-price-block">' +
              '<s class="ce-ppo-cart-old-price">' + displayOldLine + '</s>' +
              '<span class="ce-ppo-cart-new-price">' + displayNewLine + '</span>' +
              '<span class="ce-ppo-cart-badge">' + discount + '% OFF</span>' +
            '</div>';
        } else {
          var oldEl = existingBlock.querySelector('.ce-ppo-cart-old-price');
          var newEl = existingBlock.querySelector('.ce-ppo-cart-new-price');
          var badgeEl = existingBlock.querySelector('.ce-ppo-cart-badge');
          if (oldEl && oldEl.textContent !== displayOldLine) oldEl.textContent = displayOldLine;
          if (newEl && newEl.textContent !== displayNewLine) newEl.textContent = displayNewLine;
          if (badgeEl && badgeEl.textContent !== (discount + '% OFF')) badgeEl.textContent = discount + '% OFF';
        }
      }

      // 2. Update Left-Side Unit Price under the Product Title (Dawn theme & standard)
      var discountedPricesWrapper = primaryLineEl.querySelector('.cart-item__discounted-prices');
      if (discountedPricesWrapper) {
        var oldPriceNode = discountedPricesWrapper.querySelector('.cart-item__old-price');
        var finalPriceNode = discountedPricesWrapper.querySelector('.cart-item__final-price');
        if (oldPriceNode) oldPriceNode.textContent = displayOldUnit;
        if (finalPriceNode) {
          finalPriceNode.textContent = displayNewUnit;
          finalPriceNode.style.color = '#ea3e1e';
          finalPriceNode.style.fontWeight = '700';
        }
      } else {
        var unitPriceCandidates = primaryLineEl.querySelectorAll(
          '.cart-items__price-unit, .cart-item__details .product-option, .cart-item__details .price, .cart-item__price, .cart-items__details div, .cart-items__details span'
        );
        for (var u = 0; u < unitPriceCandidates.length; u++) {
          var uEl = unitPriceCandidates[u];
          if (priceEl && (priceEl === uEl || priceEl.contains(uEl) || uEl.contains(priceEl))) continue;
          if (uEl.children.length > 0 && !uEl.querySelector('.ce-ppo-unit-price-inline')) continue;

          var uText = (uEl.textContent || '').trim();
          if (/^(_cartelevate_postpurchase|_upsell_discount|discount\s*:)/i.test(uText)) {
            var propRow = uEl.closest('.product-option, li, div, .cart-items__properties');
            if (propRow && (!priceEl || !propRow.contains(priceEl))) {
              propRow.style.display = 'none';
            } else {
              uEl.style.display = 'none';
            }
            continue;
          }

          if (uText === displayOldUnit && !uEl.querySelector('.ce-ppo-unit-price-inline')) {
            uEl.innerHTML =
              '<span class="ce-ppo-unit-price-inline" style="display:inline-flex;align-items:center;gap:6px;">' +
                '<s style="color:#94a3b8;font-size:12px;">' + displayOldUnit + '</s>' +
                '<span style="color:#ea3e1e;font-weight:700;">' + displayNewUnit + '</span>' +
              '</span>';
          }
        }
      }

      // 3. Ensure Cart Subtotal in Footer reflects the actual single highest discounted price
      var cartSource = (window.CartElevate && typeof window.CartElevate.getCartData === 'function' && window.CartElevate.getCartData().cart) || latestCartData;
      if (cartSource && Array.isArray(cartSource.items)) {
        var rawOriginalTotalCents = 0;
        var nonOfferDiscountsCents = 0;

        for (var ci = 0; ci < cartSource.items.length; ci++) {
          var cItem = cartSource.items[ci];
          var lineOrigCents = (typeof cItem.original_line_price === 'number')
            ? cItem.original_line_price
            : (Number(cItem.price) * Number(cItem.quantity));
          rawOriginalTotalCents += lineOrigCents;

          if (Number(cItem.variant_id) !== Number(targetVarId)) {
            if (typeof cItem.final_line_price === 'number' && typeof cItem.original_line_price === 'number' && cItem.final_line_price < cItem.original_line_price) {
              nonOfferDiscountsCents += (cItem.original_line_price - cItem.final_line_price);
            }
          }
        }

        var expectedSubtotalDollars = Math.max(0, (rawOriginalTotalCents - nonOfferDiscountsCents) / 100 - totalDiscountDollars);
        var formattedSubtotal = sym + expectedSubtotalDollars.toFixed(2);

        var subtotalEls = document.querySelectorAll(
          '.totals__total-value, .totals__subtotal-value, .cart-drawer__footer .totals p, [data-cart-subtotal], .cart__subtotal'
        );
        for (var sIdx = 0; sIdx < subtotalEls.length; sIdx++) {
          var subEl = subtotalEls[sIdx];
          if (subEl && subEl.children.length === 0) {
            var currentSubText = (subEl.textContent || '').trim();
            if (currentSubText && currentSubText.indexOf(formattedSubtotal) === -1) {
              var suffixMatch = currentSubText.match(/\s+[A-Z]{3}$/);
              var nextText = formattedSubtotal + (suffixMatch ? suffixMatch[0] : '');
              if (subEl.textContent !== nextText) {
                subEl.textContent = nextText;
              }
            }
          }
        }
      }
    } finally {
      setTimeout(function () {
        isApplyingHighlights = false;
      }, 50);
    }
  }

  function handleCheckoutIntercept(e, triggerEl) {
    if (isNavigatingToCheckout) return;
    if (document.getElementById('ce-ppo-modal-container')) return;

    e.preventDefault();
    e.stopPropagation();

    if (sessionStorage.getItem('ce_ppo_accepted') === 'true') {
      var expiresAt = Number(sessionStorage.getItem('ce_ppo_expires_at') || 0);
      if (expiresAt > 0 && Date.now() > expiresAt) {
        clearAcceptedSession();
        callPostPurchaseApi('deactivate').then(function () {
          doEvaluate();
        });
        return;
      }

      getCartData().then(function (cart) {
        if (hasAcceptedPostPurchaseItemInCart(cart)) {
          proceedToCheckout(triggerEl);
        } else {
          // Post-purchase item was removed — clear session & revoke discount
          clearAcceptedSession();
          callPostPurchaseApi('deactivate').then(function () {
            doEvaluate();
          });
        }
      }).catch(function () {
        proceedToCheckout(triggerEl);
      });
      return;
    }

    doEvaluate();

    function doEvaluate() {
      if (activeOffer) {
        evaluateAndShow(activeOffer);
      } else {
        fetchOfferFallback(function (offer) {
          evaluateAndShow(offer);
        });
      }
    }

    function evaluateAndShow(offer) {
      if (!offer || offer.status !== 'PUBLISHED') {
        proceedToCheckout(triggerEl);
        return;
      }

      getCartData().then(function (cart) {
        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
          proceedToCheckout(triggerEl);
          return;
        }

        // Only skip the popup if the customer has ALREADY accepted the post-purchase offer
        if (hasAcceptedPostPurchaseItemInCart(cart)) {
          proceedToCheckout(triggerEl);
          return;
        }

        showUpsellModal(offer, triggerEl);
      }).catch(function () {
        proceedToCheckout(triggerEl);
      });
    }
  }

  // Intercept checkout clicks
  document.addEventListener('click', function (e) {
    if (isNavigatingToCheckout) return;
    var el = e.target && e.target.closest && e.target.closest(CHECKOUT_SELECTOR);
    if (!el) return;
    if (!isCheckoutElement(el)) return;

    handleCheckoutIntercept(e, el);
  }, true);

  // Intercept cart & checkout form submissions
  document.addEventListener('submit', function (e) {
    if (isNavigatingToCheckout) return;
    var form = e.target;
    if (!form) return;
    var action = (form.getAttribute('action') || '').toLowerCase();
    if (action.indexOf('/cart/add') !== -1) return;
    if (action.indexOf('/checkout') !== -1) {
      var btn = form.querySelector('button[name="checkout"], input[name="checkout"], #checkout') || form;
      if (!isCheckoutElement(btn)) return;
      handleCheckoutIntercept(e, btn);
    }
  }, true);

  // Re-verify acceptance state and apply discount styling when cart changes
  ['cartelevate:cart-updated', 'cart:updated', 'cart:update', 'cart:refresh', 'cart:change'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var cartFromEvent = (e && e.detail && e.detail.cart) ? e.detail.cart : null;
      verifyCartAcceptanceState(cartFromEvent);
      scheduleDiscountHighlights();
    });
  });

  if (typeof MutationObserver !== 'undefined') {
    var cartLineObserver = new MutationObserver(function (mutations) {
      if (isApplyingHighlights) return;
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var t = mutations[i].target;
        if (!t) continue;
        if (t.classList && (t.classList.contains('ce-ppo-cart-price-block') || t.classList.contains('ce-ppo-unit-price-inline'))) {
          continue;
        }
        if (t.closest && t.closest('.ce-ppo-cart-price-block, .ce-ppo-unit-price-inline, #ce-ppo-modal-container')) {
          continue;
        }
        if (t.closest && t.closest('cart-drawer, .cart-drawer, #CartDrawer, .cart-items, #main-cart-items, form[action*="/cart"]')) {
          relevant = true;
          break;
        }
      }
      if (relevant) {
        scheduleDiscountHighlights();
      }
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        cartLineObserver.observe(document.body, { childList: true, subtree: true });
        scheduleDiscountHighlights();
      });
    } else {
      cartLineObserver.observe(document.body, { childList: true, subtree: true });
      scheduleDiscountHighlights();
    }
  }

  window.CartElevateShowPostPurchase = function (triggerEl) {
    handleCheckoutIntercept({ preventDefault: function(){}, stopPropagation: function(){} }, triggerEl);
  };

})();