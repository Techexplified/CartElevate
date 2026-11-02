/* CartElevate — Feature: Volume Discount Tiers & Cart Upsells */
(function () {
  'use strict';

  var BANNER_MOUNT_ID = 'ce-bundle-progress-banner';
  var lastCart = null;
  var isUpdating = false;
  var updateDebounceTimer = null;
  var fetchDebounceTimer = null;

  function parseJSON(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    return raw && typeof raw === 'object' ? raw : null;
  }

  function getActiveBundles() {
    var raw = parseJSON(window.CartElevateBundles);
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && Array.isArray(raw.bundles)) {
      list = raw.bundles;
    }
    return list.filter(function (b) {
      return b && b.status === 'PUBLISHED';
    });
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

  /**
   * Determine if a cart item is eligible for a specific bundle
   */
  function isItemEligible(item, bundle) {
    if (!item || !bundle) return false;
    if (bundle.appliesTo === 'all_products') return true;

    if (bundle.appliesTo === 'specific_products') {
      var prods = Array.isArray(bundle.products) ? bundle.products : [];
      if (prods.length === 0) return true;
      var itemProdId = String(item.product_id || item.id || '');
      var itemHandle = String(item.handle || '');
      return prods.some(function (p) {
        var pId = String(p.id || '').split('/').pop();
        var pHandle = String(p.handle || '');
        return (pId && pId === itemProdId) || (pHandle && pHandle === itemHandle);
      });
    }

    if (bundle.appliesTo === 'specific_collection') {
      var colTitles = Array.isArray(bundle.collections) ? bundle.collections : [];
      if (colTitles.length === 0) return true;

      var cartCollections = window.CartElevateCartCollections || {};
      var itemCols = cartCollections[String(item.product_id)] || [];
      return itemCols.some(function (c) {
        return colTitles.indexOf(c.title) !== -1 || colTitles.indexOf(c.handle) !== -1;
      });
    }

    return true;
  }

  /**
   * Evaluate tiers and calculate message + active badge
   */
  function evaluateBundle(bundle, cart) {
    var items = (cart && Array.isArray(cart.items)) ? cart.items : [];
    var qualifyingQty = 0;
    var eligibleItemKeys = [];
    var eligibleProductIds = [];
    var eligibleHandles = [];

    items.forEach(function (item) {
      if (isItemEligible(item, bundle)) {
        qualifyingQty += Number(item.quantity) || 1;
        eligibleItemKeys.push(String(item.key || item.id));
        if (item.product_id) eligibleProductIds.push(String(item.product_id));
        if (item.variant_id) eligibleProductIds.push(String(item.variant_id));
        if (item.handle) eligibleHandles.push(String(item.handle).toLowerCase());
      }
    });

    // If no qualifying items in cart for this bundle, do not show progress banner
    if (qualifyingQty <= 0) return null;

    var tiers = (bundle.tiers || []).slice().sort(function (a, b) {
      return (Number(a.buyQty) || 0) - (Number(b.buyQty) || 0);
    });

    if (tiers.length === 0) return null;

    var activeTier = null;
    var nextTier = null;

    for (var i = 0; i < tiers.length; i++) {
      var tQty = Number(tiers[i].buyQty) || 1;
      if (qualifyingQty >= tQty) {
        activeTier = tiers[i];
      } else {
        if (!nextTier) nextTier = tiers[i];
      }
    }

    if (!nextTier && qualifyingQty < (Number(tiers[0].buyQty) || 1)) {
      nextTier = tiers[0];
    }

    var bannerText = '';
    var template = bundle.cartMessage || 'Buy {qty} more and save {discount}%';

    if (nextTier) {
      var needed = Math.max(1, (Number(nextTier.buyQty) || 1) - qualifyingQty);
      bannerText = template
        .replace('{qty}', String(needed))
        .replace('{discount}', String(nextTier.discountPercent || 0));
    } else if (activeTier) {
      bannerText = '🎉 ' + activeTier.discountPercent + '% off volume discount unlocked!';
    }

    return {
      bundle: bundle,
      qualifyingQty: qualifyingQty,
      activeTier: activeTier,
      nextTier: nextTier,
      bannerText: bannerText,
      eligibleItemKeys: eligibleItemKeys,
      eligibleProductIds: eligibleProductIds,
      eligibleHandles: eligibleHandles
    };
  }

  var SAVINGS_SUMMARY_ID = 'ce-bundle-savings-summary';

  /**
   * Determine the highest non-bundle discount percentage applicable to this cart item.
   * Checks accepted Post-Purchase offers and native Shopify line item discounts (excluding our bundle discount).
   */
  function getOtherCompetingDiscountPct(cartItem) {
    if (!cartItem) return 0;
    var maxOther = 0;

    // 1. Check accepted Post-Purchase offer
    try {
      var ppoAccepted = sessionStorage.getItem('ce_ppo_accepted') === 'true';
      if (ppoAccepted) {
        var ppoExpiresAt = Number(sessionStorage.getItem('ce_ppo_expires_at') || 0);
        var isExpired = ppoExpiresAt > 0 && Date.now() > ppoExpiresAt;
        if (!isExpired) {
          var ppoVarId = sessionStorage.getItem('ce_ppo_variant_id');
          var ppoProdId = sessionStorage.getItem('ce_ppo_product_id');
          var ppoDisc = Number(sessionStorage.getItem('ce_ppo_discount')) || 0;

          var itemVarId = String(cartItem.variant_id || cartItem.id || '');
          var itemProdId = String(cartItem.product_id || '').split('/').pop();
          var ppoProdIdClean = String(ppoProdId || '').split('/').pop();

          var matchesVar = ppoVarId && itemVarId && (itemVarId === String(ppoVarId));
          var matchesProd = ppoProdIdClean && itemProdId && (itemProdId === ppoProdIdClean);
          var hasProp = cartItem.properties && (
            cartItem.properties._cartelevate_postpurchase === 'true' ||
            cartItem.properties._cartelevate_postpurchase === true
          );

          if ((matchesVar || matchesProd || hasProp) && ppoDisc > maxOther) {
            maxOther = ppoDisc;
          }
        }
      }
    } catch (e) { /* ignore */ }

    // 2. Check native line item discount (excluding our own volume bundle discount)
    try {
      if (cartItem.original_line_price && cartItem.final_line_price && cartItem.original_line_price > cartItem.final_line_price) {
        var isNativeVolume = false;
        if (Array.isArray(cartItem.discounts)) {
          isNativeVolume = cartItem.discounts.some(function (d) {
            return d && d.title && d.title.toLowerCase().indexOf('volume discount') !== -1;
          });
        }
        if (!isNativeVolume) {
          var nativePct = Math.round(((cartItem.original_line_price - cartItem.final_line_price) / cartItem.original_line_price) * 100);
          if (nativePct > maxOther) {
            maxOther = nativePct;
          }
        }
      }
    } catch (e) { /* ignore */ }

    return maxOther;
  }

  // Expose global helper for other features (e.g. Post-Purchase) to query best volume bundle discount
  window.CartElevateGetBestBundleDiscountPct = function (variantId, productId, quantity) {
    var bundles = getActiveBundles();
    if (bundles.length === 0) return 0;
    var dummyItem = {
      variant_id: variantId,
      product_id: productId,
      id: variantId,
      quantity: Number(quantity) || 1
    };
    var maxPct = 0;
    for (var b = 0; b < bundles.length; b++) {
      var bundle = bundles[b];
      if (isItemEligible(dummyItem, bundle)) {
        var tiers = (bundle.tiers || []).slice().sort(function (a, b) {
          return (Number(a.buyQty) || 0) - (Number(b.buyQty) || 0);
        });
        for (var t = 0; t < tiers.length; t++) {
          if ((Number(quantity) || 1) >= (Number(tiers[t].buyQty) || 1)) {
            var tp = Number(tiers[t].discountPercent) || 0;
            if (tp > maxPct) maxPct = tp;
          }
        }
      }
    }
    return maxPct;
  };

  /**
   * Filter and resolve overlapping bundle evaluations to enforce the rule:
   * When multiple discounts overlap on the same product(s), apply only the highest
   * available discount that provides maximum benefit to the customer, and do not stack/combine.
   */
  function resolveEffectiveEvaluations(evaluations, cart) {
    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      return [];
    }

    var items = (cart && Array.isArray(cart.items)) ? cart.items : [];
    if (items.length === 0) {
      return [];
    }

    // Step 1: For each item in cart, determine the highest active discount percentage and winning bundle ID,
    // taking into account competing non-bundle discounts (such as Post-Purchase or native discounts).
    var bestActivePctByItem = {};
    var bestActiveBundleIdByItem = {};

    items.forEach(function (it) {
      var itKey = String(it.key || it.id);
      var competingPct = getOtherCompetingDiscountPct(it);
      bestActivePctByItem[itKey] = competingPct;
      bestActiveBundleIdByItem[itKey] = null;

      evaluations.forEach(function (ev) {
        if (ev && ev.activeTier && isItemEligible(it, ev.bundle)) {
          var pct = Number(ev.activeTier.discountPercent) || 0;
          if (pct > bestActivePctByItem[itKey]) {
            bestActivePctByItem[itKey] = pct;
            bestActiveBundleIdByItem[itKey] = ev.bundle ? ev.bundle.id : null;
          }
        }
      });
    });

    // Step 2: Resolve evaluations for progress banner display
    var resolved = [];

    evaluations.forEach(function (ev) {
      if (!ev || ev.qualifyingQty <= 0) return;
      var bundleId = ev.bundle ? ev.bundle.id : null;

      // Find matching items for this bundle
      var matchingItems = items.filter(function (it) {
        return isItemEligible(it, ev.bundle);
      });

      if (matchingItems.length === 0) return;

      var hasActiveTier = !!(ev.activeTier && (Number(ev.activeTier.discountPercent) || 0) > 0);
      var activePct = hasActiveTier ? (Number(ev.activeTier.discountPercent) || 0) : 0;

      // Check if this bundle is the active winner for any item
      var isWinningActive = false;
      var maxCompActivePct = 0;

      matchingItems.forEach(function (it) {
        var itKey = String(it.key || it.id);
        if (bestActiveBundleIdByItem[itKey] === bundleId && activePct > 0) {
          isWinningActive = true;
        }
        var comp = bestActivePctByItem[itKey] || 0;
        if (comp > maxCompActivePct) {
          maxCompActivePct = comp;
        }
      });

      // Case A: This bundle has an active tier
      if (hasActiveTier) {
        if (isWinningActive) {
          // It provides the highest discount on at least one item
          resolved.push(ev);
          return;
        }

        // If not winning active, this active tier is superseded by a higher discount on the same items.
        // However, if it has a next tier with a higher discount than the current active discount,
        // we can still display the next tier upsell.
        if (ev.nextTier && (Number(ev.nextTier.discountPercent) || 0) > maxCompActivePct) {
          var needed = Math.max(1, (Number(ev.nextTier.buyQty) || 1) - ev.qualifyingQty);
          var template = ev.bundle.cartMessage || 'Buy {qty} more and save {discount}%';
          var upsellText = template
            .replace('{qty}', String(needed))
            .replace('{discount}', String(ev.nextTier.discountPercent || 0));

          resolved.push({
            bundle: ev.bundle,
            qualifyingQty: ev.qualifyingQty,
            activeTier: null,
            nextTier: ev.nextTier,
            bannerText: upsellText,
            eligibleItemKeys: ev.eligibleItemKeys,
            eligibleProductIds: ev.eligibleProductIds,
            eligibleHandles: ev.eligibleHandles
          });
        }
        return;
      }

      // Case B: No active tier, in progress
      if (ev.nextTier) {
        var nextPct = Number(ev.nextTier.discountPercent) || 0;

        // If the next tier discount is <= already active discount on those items, omit
        if (nextPct <= maxCompActivePct) {
          return;
        }

        // Check if another in-progress evaluation outclasses this on the same items
        var isOutclassed = false;
        evaluations.forEach(function (otherEv) {
          if (otherEv === ev || !otherEv || otherEv.qualifyingQty <= 0 || !otherEv.nextTier) return;

          var sharesItems = matchingItems.some(function (it) {
            return isItemEligible(it, otherEv.bundle);
          });

          if (sharesItems) {
            var evNeeded = Math.max(1, (Number(ev.nextTier.buyQty) || 1) - ev.qualifyingQty);
            var otherNeeded = Math.max(1, (Number(otherEv.nextTier.buyQty) || 1) - otherEv.qualifyingQty);
            var otherPct = Number(otherEv.nextTier.discountPercent) || 0;

            if (otherNeeded <= evNeeded && otherPct > nextPct) {
              isOutclassed = true;
            }
          }
        });

        if (!isOutclassed) {
          resolved.push(ev);
        }
      }
    });

    return resolved;
  }

  /**
   * Render the top progress banner(s) for all active bundles into cart drawer
   */
  function renderProgressBanners(evaluations, cart) {
    var existing = document.getElementById(BANNER_MOUNT_ID);

    var items = (cart && Array.isArray(cart.items)) ? cart.items : [];
    var itemCount = (cart && typeof cart.item_count === 'number') ? cart.item_count : items.length;

    // Do not show banner when no products are in the cart or evaluations are empty
    if (items.length === 0 || itemCount === 0 || !Array.isArray(evaluations) || evaluations.length === 0) {
      if (existing) existing.remove();
      return;
    }

    // Resolve overlapping bundles: prioritize maximum customer benefit and suppress superseded lower offers
    var activeEvals = resolveEffectiveEvaluations(evaluations, cart);

    if (activeEvals.length === 0) {
      if (existing) existing.remove();
      return;
    }

    var bannersHtml = '';

    for (var i = 0; i < activeEvals.length; i++) {
      var ev = activeEvals[i];
      var isUnlocked = !ev.nextTier && ev.activeTier;
      var progressPct = 0;
      if (ev.nextTier) {
        var totalNeeded = Number(ev.nextTier.buyQty) || 1;
        progressPct = Math.min(100, Math.max(10, Math.round((ev.qualifyingQty / totalNeeded) * 100)));
      } else if (isUnlocked) {
        progressPct = 100;
      }

      var iconSvg = isUnlocked
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>';

      var unlockedBadgeHtml = isUnlocked
        ? '<span class="ce-bundle-unlocked-badge">Unlocked</span>'
        : '';

      var progressTrackHtml = ev.nextTier
        ? '<div class="ce-bundle-progress-track"><div class="ce-bundle-progress-fill" style="width: ' + progressPct + '%;"></div></div>'
        : '';

      bannersHtml +=
        '<div class="ce-bundle-banner" data-bundle-id="' + escapeHtml(ev.bundle ? ev.bundle.id : '') + '">' +
        '<div class="ce-bundle-banner-left">' +
        '<div class="ce-bundle-banner-icon">' + iconSvg + '</div>' +
        '<div class="ce-bundle-banner-body">' +
        '<span class="ce-bundle-banner-text">' + escapeHtml(ev.bannerText) + '</span>' +
        progressTrackHtml +
        '</div>' +
        '</div>' +
        unlockedBadgeHtml +
        '</div>';
    }

    var ac = getBrandingAccentColor();

    // Mount banner wrapper
    if (!existing) {
      existing = document.createElement('div');
      existing.id = BANNER_MOUNT_ID;
      existing.className = 'ce-bundle-banner-wrapper';
    }
    existing.style.setProperty('--ce-accent-color', ac);
    existing.style.setProperty('--ce-bundle-accent', ac);

    var container = document.getElementById('cart-elevate-root');
    if (!container) {
      var selectors = [
        '[data-cart-drawer-content]',
        '.cart-drawer__content',
        '#CartDrawer-CartItems',
        '.CartDrawer__Content',
        '.cart-drawer .cart-items',
        'cart-drawer-items'
      ];
      for (var s = 0; s < selectors.length; s++) {
        var el = document.querySelector(selectors[s]);
        if (el) {
          container = el;
          break;
        }
      }
    }

    if (container) {
      var progressBar = container.querySelector('.ce-progress-bar-card');
      if (progressBar) {
        // Ensure bundle banner is placed directly below the shipping progress bar
        if (existing.previousElementSibling !== progressBar) {
          if (progressBar.nextSibling) {
            container.insertBefore(existing, progressBar.nextSibling);
          } else {
            container.appendChild(existing);
          }
        }
      } else if (!document.body.contains(existing)) {
        if (container.firstChild) {
          container.insertBefore(existing, container.firstChild);
        } else {
          container.appendChild(existing);
        }
      }
    }

    if (existing.innerHTML !== bannersHtml) {
      existing.innerHTML = bannersHtml;
    }
  }

  function getCartLineElements() {
    var selectors = [
      '.cart-items__table-row',
      '.cart-item',
      '.cart-items__item',
      'cart-drawer-items tr',
      '.cart-items tr',
      '.line-item',
      '.cart-drawer__item',
      '.drawer__item'
    ];
    var list = [];
    var found = document.querySelectorAll(selectors.join(', '));
    found.forEach(function (el) {
      if (el && list.indexOf(el) === -1) list.push(el);
    });

    // Fallback: look for product title links
    if (list.length === 0) {
      var titles = document.querySelectorAll('.cart-items__title, a[href*="/products/"]');
      titles.forEach(function (t) {
        if (t.closest('#cart-elevate-root, .ce-recommendations-wrapper, #ce-bundle-progress-banner')) return;
        var p = t.closest('.cart-items__table-row, tr, li') || t.parentElement;
        if (p && list.indexOf(p) === -1) {
          list.push(p);
        }
      });
    }

    return list;
  }

  function isLineElementEligible(el, evaluation) {
    if (!el || !evaluation || !evaluation.bundle) return false;
    if (evaluation.bundle.appliesTo === 'all_products') return true;

    var eligibleKeys = evaluation.eligibleItemKeys || [];
    var eligibleProds = evaluation.eligibleProductIds || [];
    var eligibleHandles = evaluation.eligibleHandles || [];

    // 1. Check keys
    for (var i = 0; i < eligibleKeys.length; i++) {
      var k = eligibleKeys[i];
      if (
        el.querySelector('[data-key="' + k + '"]') ||
        el.querySelector('[data-cart-item-key="' + k + '"]') ||
        (el.getAttribute('data-cart-item-key') === k) ||
        (el.getAttribute('data-key') === k) ||
        (el.id && el.id.indexOf(k) !== -1)
      ) {
        return true;
      }
    }

    // 2. Check product/variant IDs in attributes or links
    for (var j = 0; j < eligibleProds.length; j++) {
      var pid = eligibleProds[j];
      if (
        el.querySelector('a[href*="' + pid + '"]') ||
        el.querySelector('[data-product-id="' + pid + '"]') ||
        el.querySelector('[data-variant-id="' + pid + '"]') ||
        (el.getAttribute('data-product-id') === pid) ||
        (el.getAttribute('data-variant-id') === pid)
      ) {
        return true;
      }
    }

    // 3. Check handles in hrefs
    for (var m = 0; m < eligibleHandles.length; m++) {
      var h = eligibleHandles[m];
      if (
        el.querySelector('a[href*="/products/' + h + '"]') ||
        el.querySelector('a[href*="/products/' + encodeURIComponent(h) + '"]')
      ) {
        return true;
      }
    }

    // 4. Check specific products configured in bundle
    if (evaluation.bundle.appliesTo === 'specific_products' && Array.isArray(evaluation.bundle.products)) {
      for (var n = 0; n < evaluation.bundle.products.length; n++) {
        var sp = evaluation.bundle.products[n];
        var sTitle = String(sp.title || '').trim().toLowerCase();
        var sHandle = String(sp.handle || '').trim().toLowerCase();
        var sId = String(sp.id || '').split('/').pop();

        if (sId && el.querySelector('a[href*="' + sId + '"]')) return true;
        if (sHandle && el.querySelector('a[href*="/products/' + sHandle + '"]')) return true;
        if (sTitle && el.textContent.toLowerCase().indexOf(sTitle) !== -1) return true;
      }
    }

    return false;
  }

  function findBadgeContainer(el) {
    var titleEl = el.querySelector('.cart-items__title, .cart-item__name, .product-title, a[href*="/products/"]');
    if (titleEl && titleEl.parentElement) {
      return titleEl.parentElement;
    }
    return (
      el.querySelector('.cart-item__details') ||
      el.querySelector('.line-item__details') ||
      el.querySelector('.cart-drawer__item-info') ||
      el.querySelector('.drawer__item-info') ||
      el
    );
  }

  function findCartItemForElement(el, cart) {
    if (!el || !cart || !Array.isArray(cart.items)) return null;
    var items = cart.items;

    // 1. By variant ID in links, attributes, or inputs
    for (var v = 0; v < items.length; v++) {
      var vid = String(items[v].variant_id || items[v].id || '');
      if (vid) {
        if (
          el.getAttribute('data-variant-id') === vid ||
          el.querySelector('[data-variant-id="' + vid + '"]') ||
          el.querySelector('a[href*="' + vid + '"]') ||
          el.querySelector('[name*="' + vid + '"]')
        ) {
          return items[v];
        }
      }
    }

    // 2. By item key in attributes or links
    for (var k = 0; k < items.length; k++) {
      var key = String(items[k].key || items[k].id);
      if (key) {
        if (
          el.getAttribute('data-key') === key ||
          el.getAttribute('data-cart-item-key') === key ||
          (el.id && el.id.indexOf(key) !== -1) ||
          el.querySelector('[data-key="' + key + '"]') ||
          el.querySelector('[data-cart-item-key="' + key + '"]') ||
          el.querySelector('a[href*="' + encodeURIComponent(key) + '"]')
        ) {
          return items[k];
        }
      }
    }

    // 3. By handle in product href
    for (var h = 0; h < items.length; h++) {
      var handle = String(items[h].handle || '').toLowerCase();
      if (handle && el.querySelector('a[href*="/products/' + handle + '"]')) {
        return items[h];
      }
    }

    // 4. By product ID
    for (var p = 0; p < items.length; p++) {
      var pid = String(items[p].product_id || '');
      if (pid) {
        if (
          el.getAttribute('data-product-id') === pid ||
          el.querySelector('[data-product-id="' + pid + '"]') ||
          el.querySelector('a[href*="' + pid + '"]')
        ) {
          return items[p];
        }
      }
    }

    // 5. By line index fallback (e.g. id="CartItem-1" -> index 0)
    var matchIdx = el.id ? el.id.match(/CartItem-(\d+)/i) : null;
    if (matchIdx && matchIdx[1]) {
      var idx = parseInt(matchIdx[1], 10) - 1;
      if (items[idx]) return items[idx];
    }

    return null;
  }

  function findPriceElement(el) {
    return (
      el.querySelector('.cart-items__price') ||
      el.querySelector('.cart-item__totals') ||
      el.querySelector('.cart-item__price') ||
      el.querySelector('.line-item__price') ||
      el.querySelector('.cart-items__price-unit')
    );
  }

  function updateItemPriceDisplay(el, discountPct, item) {
    if (!el || !discountPct) return;

    var pEl = findPriceElement(el);
    if (!pEl) return;

    var sym = window.CartElevateCurrencySymbol || '$';
    var originalAmount = 0;
    var discountedAmount = 0;

    if (item) {
      var origLine = (typeof item.original_line_price === 'number' ? item.original_line_price : (item.price * item.quantity)) / 100;
      originalAmount = origLine;

      if (typeof item.final_line_price === 'number' && item.final_line_price < item.original_line_price) {
        // Shopify has already natively applied the discount at line level
        discountedAmount = item.final_line_price / 100;
      } else {
        discountedAmount = origLine * (1 - discountPct / 100);
      }
    } else {
      // Fallback: read stored pristine text
      var origText = pEl.getAttribute('data-ce-orig-text');
      if (!origText) {
        origText = pEl.textContent.trim();
        pEl.setAttribute('data-ce-orig-text', origText);
      }

      var match = origText.match(/([$€£₹¥]?)\s*([\d,]+\.?\d*)/);
      if (!match) return;

      sym = match[1] || sym;
      var numStr = match[2].replace(/,/g, '');
      var parsedAmount = parseFloat(numStr);
      if (isNaN(parsedAmount) || parsedAmount <= 0) return;

      originalAmount = parsedAmount;
      discountedAmount = originalAmount * (1 - discountPct / 100);
    }

    if (originalAmount <= 0 || discountedAmount <= 0) return;

    var currentPct = pEl.getAttribute('data-ce-discount-pct');
    var currentDisc = pEl.getAttribute('data-ce-discount-val');
    if (currentPct === String(discountPct) && currentDisc === discountedAmount.toFixed(2) && pEl.querySelector('.ce-discounted-price')) {
      return;
    }

    var origFormatted = sym + originalAmount.toFixed(2);
    var discFormatted = sym + discountedAmount.toFixed(2);

    pEl.setAttribute('data-ce-discount-pct', String(discountPct));
    pEl.setAttribute('data-ce-discount-val', discountedAmount.toFixed(2));
    pEl.innerHTML =
      '<div class="ce-price-block">' +
      '<s class="ce-old-price">' + origFormatted + '</s>' +
      '<span class="ce-discounted-price">' + discFormatted + '</span>' +
      '</div>';
  }

  function revertItemPriceDisplay(el) {
    if (!el) return;
    var pEl = findPriceElement(el);
    if (!pEl) return;

    // Case 1: We stored the original text before modifying
    var origText = pEl.getAttribute('data-ce-orig-text');
    if (origText) {
      pEl.textContent = origText;
      pEl.removeAttribute('data-ce-orig-text');
      pEl.removeAttribute('data-ce-discount-pct');
      pEl.removeAttribute('data-ce-discount-val');
      return;
    }

    // Case 2: Theme re-rendered cart DOM so data-ce-orig-text is gone, but
    // we injected a .ce-price-block inside pEl — remove it and restore the
    // original price text that is inside .ce-old-price (the strikethrough).
    var priceBlock = pEl.querySelector('.ce-price-block');
    if (priceBlock) {
      var oldPriceEl = priceBlock.querySelector('.ce-old-price');
      var restoredText = oldPriceEl ? oldPriceEl.textContent.trim() : '';
      if (restoredText) {
        pEl.textContent = restoredText;
      } else {
        pEl.innerHTML = '';
      }
      pEl.removeAttribute('data-ce-discount-pct');
      pEl.removeAttribute('data-ce-discount-val');
    }
  }

  /**
   * Render discount badges under eligible cart items across all active bundles
   */
  function renderItemBadges(evaluations) {
    var lineEls = getCartLineElements();
    if (lineEls.length === 0) return;

    var hasAnyActiveTier = Array.isArray(evaluations) && evaluations.some(function (ev) {
      return !!(ev && ev.activeTier);
    });

    if (!hasAnyActiveTier) {
      var oldBadges = document.querySelectorAll('.ce-bundle-badge-wrapper, .ce-bundle-badge');
      if (oldBadges.length > 0) {
        oldBadges.forEach(function (b) {
          b.remove();
        });
      }
      lineEls.forEach(function (el) {
        revertItemPriceDisplay(el);
      });
      var staleDiscounts = document.querySelectorAll('.discounts__discount, [data-cart-item-discount], .line-item__discount, .cart-item__discount');
      staleDiscounts.forEach(function (node) {
        if ((node.textContent || '').toLowerCase().indexOf('volume discount') !== -1) {
          node.style.display = 'none';
        }
      });
      return;
    }

    lineEls.forEach(function (el) {
      var maxDiscountPct = 0;

      if (Array.isArray(evaluations)) {
        for (var i = 0; i < evaluations.length; i++) {
          var ev = evaluations[i];
          if (ev && ev.activeTier && isLineElementEligible(el, ev)) {
            var pct = Number(ev.activeTier.discountPercent) || 0;
            if (pct > maxDiscountPct) {
              maxDiscountPct = pct;
            }
          }
        }
      }

      var detailsContainer = findBadgeContainer(el);
      var matchingItem = findCartItemForElement(el, lastCart);
      var otherCompPct = getOtherCompetingDiscountPct(matchingItem);

      // Maximum Discount Rule: Apply bundle badge and discounted price display ONLY if
      // the bundle discount is strictly higher than any competing discount (e.g. Post-Purchase).
      if (maxDiscountPct > 0 && maxDiscountPct > otherCompPct) {
        var badgeText = maxDiscountPct + '%';
        if (detailsContainer) {
          var currentBadge = detailsContainer.querySelector('.ce-bundle-badge');
          var ac = getBrandingAccentColor();
          if (!currentBadge) {
            var wrapper = document.createElement('div');
            wrapper.className = 'ce-bundle-badge-wrapper';
            wrapper.style.setProperty('--ce-accent-color', ac);
            wrapper.style.setProperty('--ce-bundle-accent', ac);
            wrapper.innerHTML =
              '<span class="ce-bundle-badge">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>' +
              '<span>' + escapeHtml(badgeText) + '</span>' +
              '</span>';

            var titleEl = detailsContainer.querySelector('.cart-items__title, .cart-item__name, a[href*="/products/"]');
            if (titleEl && titleEl.nextSibling) {
              detailsContainer.insertBefore(wrapper, titleEl.nextSibling);
            } else {
              detailsContainer.appendChild(wrapper);
            }
          } else {
            if (currentBadge.parentElement) {
              currentBadge.parentElement.style.setProperty('--ce-accent-color', ac);
              currentBadge.parentElement.style.setProperty('--ce-bundle-accent', ac);
            }
            var spanText = currentBadge.querySelector('span');
            if (spanText && spanText.textContent !== badgeText) {
              spanText.textContent = badgeText;
            }
          }
        }
        updateItemPriceDisplay(el, maxDiscountPct, matchingItem);
      } else {
        if (detailsContainer) {
          var unneededBadge = detailsContainer.querySelector('.ce-bundle-badge-wrapper, .ce-bundle-badge');
          if (unneededBadge) unneededBadge.remove();
        }
        revertItemPriceDisplay(el);
      }
    });
  }

  /**
   * Render cart savings breakdown card in cart footer across all active bundles
   */
  function renderCartSavingsSummary(evaluations, cart) {
    var existing = document.getElementById(SAVINGS_SUMMARY_ID);

    if (!Array.isArray(evaluations) || evaluations.length === 0 || !cart || !Array.isArray(cart.items)) {
      if (existing) existing.remove();
      return;
    }

    var totalSavings = 0;
    var sym = window.CartElevateCurrencySymbol || '$';
    var items = cart.items || [];

    // Calculate savings across all qualifying line items where bundle is the strictly winning discount
    items.forEach(function (it) {
      var itemDiscountPct = 0;
      var otherCompPct = getOtherCompetingDiscountPct(it);
      for (var i = 0; i < evaluations.length; i++) {
        var ev = evaluations[i];
        if (ev && ev.activeTier && isItemEligible(it, ev.bundle)) {
          var pct = Number(ev.activeTier.discountPercent) || 0;
          if (pct > itemDiscountPct) {
            itemDiscountPct = pct;
          }
        }
      }

      if (itemDiscountPct > 0 && itemDiscountPct > otherCompPct) {
        var lineVal = (typeof it.original_line_price === 'number' ? it.original_line_price : (it.final_line_price || (it.price * it.quantity))) / 100;
        totalSavings += lineVal * (itemDiscountPct / 100);
      }
    });

    if (totalSavings <= 0) {
      if (existing) existing.remove();
      return;
    }

    var targetHtml =
      '<div class="ce-savings-left">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>' +
      '<span>Bundle & Volume Savings</span>' +
      '</div>' +
      '<span class="ce-savings-val">-' + sym + totalSavings.toFixed(2) + '</span>';

    if (existing && document.body.contains(existing)) {
      if (existing.innerHTML !== targetHtml) {
        existing.innerHTML = targetHtml;
      }
      return;
    }

    if (!existing) {
      existing = document.createElement('div');
      existing.id = SAVINGS_SUMMARY_ID;
      existing.className = 'ce-bundle-savings-summary';
    }

    existing.innerHTML = targetHtml;

    // Find mount point in cart footer / subtotal
    var checkoutBtn = document.querySelector(
      'button[name="checkout"], .cart__checkout-button, [name="checkout"], [data-checkout-button], form[action*="/cart"] button[type="submit"]'
    );

    if (checkoutBtn && checkoutBtn.parentElement) {
      checkoutBtn.parentElement.insertBefore(existing, checkoutBtn);
    } else {
      var footer = document.querySelector(
        '.cart-drawer__footer, .drawer__footer, .cart__footer, [data-cart-drawer-footer], #CartDrawer-Footer'
      );
      if (footer) {
        if (footer.firstChild) {
          footer.insertBefore(existing, footer.firstChild);
        } else {
          footer.appendChild(existing);
        }
      }
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scheduleUpdate(delay) {
    var ms = typeof delay === 'number' ? delay : 100;
    if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
    updateDebounceTimer = setTimeout(function () {
      update();
    }, ms);
  }

  /**
   * Fetch a fresh copy of /cart.js, update lastCart, then run update().
   * Debounced so rapid DOM mutations don't spam /cart.js.
   * Used when quantity changes are detected so we always evaluate against
   * the real, up-to-date cart quantities.
   */
  function fetchAndUpdate(delay) {
    var ms = typeof delay === 'number' ? delay : 200;
    if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer);
    if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
    fetchDebounceTimer = setTimeout(function () {
      fetch('/cart.js?ce_bundles_qty=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          lastCart = cart;
          update();
        })
        .catch(function () {
          // Fallback to last known cart if fetch fails
          update();
        });
    }, ms);
  }

  function update() {
    if (isUpdating) return;
    isUpdating = true;
    try {
      var bundles = getActiveBundles();
      var items = (lastCart && Array.isArray(lastCart.items)) ? lastCart.items : [];
      var itemCount = (lastCart && typeof lastCart.item_count === 'number') ? lastCart.item_count : items.length;

      // If no published bundles or cart has no products, clean up all bundle elements and return
      if (bundles.length === 0 || items.length === 0 || itemCount === 0) {
        renderProgressBanners([], lastCart);
        renderItemBadges([]);
        renderCartSavingsSummary([], null);
        var staleDiscounts = document.querySelectorAll('.discounts__discount, [data-cart-item-discount], .line-item__discount, .cart-item__discount');
        staleDiscounts.forEach(function (node) {
          if ((node.textContent || '').toLowerCase().indexOf('volume discount') !== -1) {
            node.style.display = 'none';
          }
        });
        return;
      }

      var evaluations = [];
      for (var i = 0; i < bundles.length; i++) {
        var ev = evaluateBundle(bundles[i], lastCart);
        if (ev) {
          evaluations.push(ev);
        }
      }

      renderProgressBanners(evaluations, lastCart);
      renderItemBadges(evaluations);
      renderCartSavingsSummary(evaluations, lastCart);
    } catch (err) {
      console.warn('[CE-Bundles] Update error:', err);
    } finally {
      isUpdating = false;
    }
  }

  // Listen to CartElevate core cart update event — always use fresh cart data
  document.addEventListener('cartelevate:cart-updated', function (e) {
    if (e.detail && e.detail.cart) {
      lastCart = e.detail.cart;
      scheduleUpdate(30);
    }
  });

  // Listen to standard theme cart events — force a fresh fetch so quantity
  // decreases are reflected immediately in tier evaluation.
  ['cart:updated', 'cart:refresh', 'sections:rendered', 'cart:change'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      fetchAndUpdate();
    });
  });

  // Intercept quantity stepper clicks & cart remove buttons at capture phase.
  // Call fetchAndUpdate with a delay so the theme AJAX request has time to complete.
  document.addEventListener('click', function (e) {
    var isQtyOrRemove = e.target && e.target.closest(
      'button[name="plus"], button[name="minus"], .quantity__button, ' +
      '[name="update"], cart-remove-button, .cart-remove-button, ' +
      '[data-cart-remove], .cart__remove-btn, [data-remove-item], ' +
      '.cart-remove, [data-cart-item-delete], [data-cart-remove-id], ' +
      '.cart-item__remove, a[href*="/cart/change"], .cart__remove'
    );
    if (isQtyOrRemove) {
      // Fetch fresh cart 500ms after click to let the AJAX complete
      fetchAndUpdate(500);
    }
  }, true);

  // Intercept quantity input changes
  document.addEventListener('change', function (e) {
    var isQtyInput = e.target && e.target.closest(
      'input[name="updates[]"], .quantity__input, input.cart-item__quantity, [data-quantity-input]'
    );
    if (isQtyInput) {
      fetchAndUpdate(600);
    }
  }, true);

  // Safe observer for dynamic cart drawers opening/closing
  var bundleObserver = new MutationObserver(function (mutations) {
    if (!lastCart) return;

    var touchesCart = false;
    for (var i = 0; i < mutations.length; i++) {
      var t = mutations[i].target;
      if (!t) continue;

      // Ignore all mutations inside CartElevate components
      if (
        t.id === BANNER_MOUNT_ID ||
        t.id === SAVINGS_SUMMARY_ID ||
        t.id === 'cart-elevate-root' ||
        t.id === 'ce-recommendations-root' ||
        (t.closest && t.closest('#' + BANNER_MOUNT_ID + ', #' + SAVINGS_SUMMARY_ID + ', .ce-bundle-banner-wrapper, .ce-bundle-badge-wrapper, .ce-bundle-badge, .ce-bundle-savings-summary, #cart-elevate-root, #ce-recommendations-root, .ce-recommendations-wrapper, .ce-branded-header'))
      ) {
        continue;
      }

      // Check if target touches cart drawer or items
      if (t.closest && t.closest('cart-drawer, .cart-drawer, #CartDrawer, [data-cart-drawer], cart-notification, .cart-item, form[action*="/cart"], cart-drawer-items')) {
        touchesCart = true;
        break;
      }
    }

    if (touchesCart) {
      // Use fetchAndUpdate so we always re-evaluate against the latest cart
      // quantities — prevents stale lastCart from keeping badges/prices active
      // after quantity is reduced below the tier threshold.
      fetchAndUpdate();
    }
  });

  bundleObserver.observe(document.body, { childList: true, subtree: true });

  // Initial cart fetch if not yet initialized
  function init() {
    if (typeof window.CartElevateItemCount === 'number' && window.CartElevateItemCount === 0) {
      lastCart = { items: [], item_count: 0 };
      scheduleUpdate(0);
      return;
    }

    if (window.CartElevate && typeof window.CartElevate.getCartData === 'function') {
      var cd = window.CartElevate.getCartData();
      if (cd && cd.cart) {
        lastCart = cd.cart;
        scheduleUpdate(0);
        return;
      }
    }
    fetch('/cart.js?ce_bundles_init=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        lastCart = cart;
        scheduleUpdate(0);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
