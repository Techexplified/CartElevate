/* eslint-disable no-empty, no-unused-vars */
/* CartElevate — Feature: Shipping & Free Gift Progress Bar
 * Free gift behaviour: the gift is NEVER kept in the cart while browsing.
 * It is appended to the cart only when the customer clicks "Check out",
 * so Shopify's BXGY discount applies at checkout and the cart drawer / cart page
 * show a single unified row per product with the correct item count.
 */
(function(){
'use strict';

var CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', INR: '₹', JPY: '¥', CNY: '¥', AED: 'AED ', BRL: 'R$',
  CHF: 'CHF ', DKK: 'kr ', HKD: 'HK$', MXN: 'MX$', NOK: 'kr ', NZD: 'NZ$', PLN: 'zł ', SEK: 'kr ', SGD: 'S$',
  THB: '฿', TRY: '₺', ZAR: 'R '
};

function parse(r){
  if(!r) return null;
  if(typeof r === 'string'){ try{ r = JSON.parse(r); }catch(e){} }
  if(typeof r === 'string'){ try{ r = JSON.parse(r); }catch(e){} }
  return (r && typeof r === 'object') ? r : null;
}

function getProgressBar(){
  return parse(window.CartElevateProgressBar);
}

function isGiftLine(it){
  if(!it) return false;
  // 1. Matches items added with promotional free gift properties
  var hasProp = Boolean(it.properties && (it.properties._is_free_gift === 'true' || it.properties._is_free_gift === true));
  if(hasProp) return true;

  // 2. Matches Shopify BXGY split $0.00 lines
  var isZero = (typeof it.final_line_price === 'number' && it.final_line_price === 0);
  var hasGiftDiscount = false;
  if(Array.isArray(it.discounts)){
    hasGiftDiscount = it.discounts.some(function(d){
      return d.title && (d.title.indexOf('Free Gift') !== -1 || d.title.indexOf('CartElevate') !== -1);
    });
  }
  if(Array.isArray(it.line_level_discount_allocations)){
    hasGiftDiscount = hasGiftDiscount || it.line_level_discount_allocations.some(function(a){
      var t = (a.discount_application && a.discount_application.title) || '';
      return t.indexOf('Free Gift') !== -1 || t.indexOf('CartElevate') !== -1;
    });
  }
  return isZero && hasGiftDiscount;
}


// Fallback fetch if metafield wasn't rendered on initial page load
(function fetchSettingsFallback(){
  var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop);
  if(!shop) return;
  var hasPB = window.CartElevateProgressBar && typeof window.CartElevateProgressBar === 'object';
  var hasBranding = window.CartElevateBranding && typeof window.CartElevateBranding === 'object' && window.CartElevateBranding.accentColor;
  if(hasPB && hasBranding) return;

  fetch('/api/shipping-bar?shop=' + encodeURIComponent(shop))
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d){
        if(d.settings){
          window.CartElevateProgressBar = d.settings;
        }
        var foundColor = (d.branding && d.branding.accentColor) || (d.settings && d.settings.accentColor);
        if(foundColor){
          window.CartElevateBranding = window.CartElevateBranding || {};
          window.CartElevateBranding.accentColor = foundColor;
          try {
            document.documentElement.style.setProperty('--ce-accent-color', foundColor);
          } catch(e){}
        }
        if(window.CartElevate && typeof window.CartElevate.getCartData === 'function'){
          renderProgressBar(window.CartElevate.getCartData());
        }
      }
    })
    .catch(function(){});
})();

function getBranding(){
  var b = parse(window.CartElevateBranding);
  if(b && b.accentColor) return b;
  var pb = parse(window.CartElevateProgressBar);
  if(pb && pb.accentColor) return { accentColor: pb.accentColor };
  try {
    var v = document.documentElement.style.getPropertyValue('--ce-accent-color');
    if(v && v.trim()) return { accentColor: v.trim() };
  } catch(e){}
  return { accentColor: '#F95738' };
}

function getSymbol(pb, currency){
  if(pb && pb.currencySymbol) return pb.currencySymbol;
  if(window.CartElevateCurrencySymbol) return window.CartElevateCurrencySymbol;
  if(pb && pb.currency && CURRENCY_SYMBOLS[pb.currency.toUpperCase()]) return CURRENCY_SYMBOLS[pb.currency.toUpperCase()];
  if(currency && CURRENCY_SYMBOLS[currency.toUpperCase()]) return CURRENCY_SYMBOLS[currency.toUpperCase()];
  if(window.Shopify && window.Shopify.currency && window.Shopify.currency.active && CURRENCY_SYMBOLS[window.Shopify.currency.active.toUpperCase()]){
    return CURRENCY_SYMBOLS[window.Shopify.currency.active.toUpperCase()];
  }
  return '$';
}

function renderProgressBar(detail){
  var pb = getProgressBar();
  if(!pb) return;

  var br = getBranding();
  var ac = (br && br.accentColor) || '#F95738';
  try {
    document.documentElement.style.setProperty('--ce-accent-color', ac);
  } catch(e){}
  var goalType = pb.goalType || 'free_shipping';
  var sThreshold = Number(pb.shippingThreshold) || 75;
  var gThreshold = Number(pb.giftThreshold) || 120;
  var msgTemplate = pb.messageBeforeGoal || 'Add {amount} more for free shipping';

  var currentTotal = (detail && typeof detail.cartTotal === 'number') ? detail.cartTotal : 0;
  var effectiveTotal = currentTotal;
  var cart = detail && detail.cart;
  if(cart && Array.isArray(cart.items)){
    var calcEff = 0;
    for(var k = 0; k < cart.items.length; k++){
      var it = cart.items[k];
      var props = it.properties || {};
      var isSvc = props._cartelevate_service === 'true' || props._cartelevate_service === true ||
                  (it.title && it.title.indexOf('[CartElevate]') !== -1);
      if(!isGiftLine(it) && !isSvc){
        var lv = (typeof it.final_line_price === 'number') ? it.final_line_price : ((it.price || 0) * (it.quantity || 1));
        calcEff += lv / 100;
      }
    }
    effectiveTotal = calcEff;
  }
  var currency = (detail && detail.cartCurrency) ? detail.cartCurrency : 'USD';
  var sym = getSymbol(pb, currency);

  var mount = document.getElementById('cart-elevate-root');
  if(!mount){
    var header = document.querySelector('.ce-branded-header');
    if(header && header.parentNode){
      mount = document.getElementById('cart-elevate-root');
      if(!mount){
        mount = document.createElement('div');
        mount.id = 'cart-elevate-root';
        header.parentNode.insertBefore(mount, header.nextSibling);
      }
    }
  }
  if(!mount) return;

  var remainingText = '';
  var pct = 0;
  var primaryMax = sThreshold;
  var rem;

  if(goalType === 'free_shipping'){
    rem = Math.max(0, sThreshold - effectiveTotal);
    pct = Math.min(100, Math.round((effectiveTotal / sThreshold) * 100));
    primaryMax = sThreshold;
    remainingText = effectiveTotal >= sThreshold
      ? "🎉 You've unlocked free shipping!"
      : msgTemplate.replace('{amount}', sym + rem.toFixed(0));
  } else if(goalType === 'free_gift'){
    rem = Math.max(0, gThreshold - effectiveTotal);
    pct = Math.min(100, Math.round((effectiveTotal / gThreshold) * 100));
    primaryMax = gThreshold;
    var defMsg = msgTemplate.indexOf('free shipping') !== -1 ? msgTemplate.replace('free shipping', 'free gift') : msgTemplate;
    remainingText = effectiveTotal >= gThreshold
      ? "🎉 You've unlocked a free gift! (Applied at checkout)"
      : defMsg.replace('{amount}', sym + rem.toFixed(0));
  } else {
    // Both goals
    var maxT = Math.max(sThreshold, gThreshold);
    var isBoth = effectiveTotal >= sThreshold && effectiveTotal >= gThreshold;
    pct = isBoth ? 100 : Math.min(100, Math.round((effectiveTotal / maxT) * 100));
    primaryMax = maxT;
    if(isBoth){
      remainingText = "🎉 You've unlocked free shipping and a free gift! (Gift applied at checkout)";
    } else if(effectiveTotal >= sThreshold){
      rem = Math.max(0, gThreshold - effectiveTotal);
      remainingText = 'Free shipping unlocked! Add ' + sym + rem.toFixed(0) + ' more for free gift';
    } else {
      rem = Math.max(0, sThreshold - effectiveTotal);
      remainingText = msgTemplate.replace('{amount}', sym + rem.toFixed(0));
    }
  }

  var isGift = goalType === 'free_gift' || (goalType === 'both' && effectiveTotal >= sThreshold);
  var pbIcon = isGift
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

  var firstThreshold = Math.min(sThreshold, gThreshold);
  var finalThreshold = Math.max(sThreshold, gThreshold);
  var hasStep = (goalType === 'both' && finalThreshold > 0 && firstThreshold < finalThreshold);
  var pointPct = 0;
  if(hasStep){
    pointPct = Math.max(5, Math.min(95, Math.round((firstThreshold / finalThreshold) * 1000) / 10));
  }
  var isFirstReached = effectiveTotal >= firstThreshold;
  var isFinalReached = effectiveTotal >= finalThreshold;

  var markersHtml = '';
  if(hasStep){
    var firstStyle = 'left:' + pointPct + '%; transform:translateX(-50%);' + (isFirstReached ? ' color:' + ac + '; font-weight:700;' : '');
    var finalCls = isFinalReached ? ' style="color:' + ac + '; font-weight:700;"' : '';
    markersHtml = '<span>' + sym + '0</span>' +
      '<span class="ce-pb-marker-step" style="' + firstStyle + '">' + sym + firstThreshold + '</span>' +
      '<span' + finalCls + '>' + sym + finalThreshold + '</span>';
  } else {
    var pCls = effectiveTotal >= primaryMax ? ' style="color:' + ac + '; font-weight:700;"' : '';
    markersHtml = '<span>' + sym + '0</span><span' + pCls + '>' + sym + primaryMax + '</span>';
  }

  // Gift unlocked badge (informational only — the gift is added as an order attribute for fulfillment)
  var isGiftUnlocked = (goalType === 'free_gift' || goalType === 'both') && effectiveTotal >= gThreshold && Boolean(pb.giftProductTitle || pb.giftProductId);
  var giftQty = Number(pb.giftQuantity) || 1;
  var giftLabel = (giftQty > 1 ? giftQty + 'x ' : '') + (pb.giftProductTitle || 'Special Store Gift');
  var giftBadgeInner = '🎁 <span>Free Gift: <strong>' + giftLabel + '</strong> included with your order</span>';
  var giftBadgeHtml = isGiftUnlocked ? '<div class="ce-pb-gift-pill" style="--ce-accent-color:' + ac + ';">' + giftBadgeInner + '</div>' : '';

  // Update in place smoothly if card already exists
  var existingText = mount.querySelector('.ce-pb-text');
  var existingFill = mount.querySelector('.ce-pb-fill');
  var existingMarkers = mount.querySelector('.ce-pb-markers');
  var existingIcon = mount.querySelector('.ce-pb-icon');
  var existingBadge = mount.querySelector('.ce-pb-gift-pill');
  var existingTrack = mount.querySelector('.ce-pb-track');

  if(existingText && existingFill){
    if(existingText.textContent !== remainingText){
      existingText.textContent = remainingText;
    }
    existingText.style.setProperty('color', ac, 'important');
    if(existingFill.style.width !== pct + '%'){
      existingFill.style.width = pct + '%';
    }
    existingFill.style.setProperty('background-color', ac, 'important');
    if(existingMarkers) existingMarkers.innerHTML = markersHtml;
    if(existingIcon){
      existingIcon.innerHTML = pbIcon;
      existingIcon.style.setProperty('color', ac, 'important');
    }

    var existingPoint = existingTrack ? existingTrack.querySelector('.ce-pb-point') : null;
    if(hasStep){
      if(!existingPoint && existingTrack){
        existingPoint = document.createElement('div');
        existingTrack.appendChild(existingPoint);
      }
      if(existingPoint){
        existingPoint.className = 'ce-pb-point' + (isFirstReached ? ' ce-pb-point-active' : '');
        existingPoint.style.left = pointPct + '%';
      }
    } else if(existingPoint){
      existingPoint.remove();
    }

    var existingCard = mount.querySelector('.ce-progress-bar-card');
    if(existingCard){
      existingCard.style.setProperty('--ce-accent-color', ac);
    }

    if(isGiftUnlocked && !existingBadge){
      var badgeEl = document.createElement('div');
      badgeEl.className = 'ce-pb-gift-pill';
      badgeEl.style.setProperty('--ce-accent-color', ac);
      badgeEl.innerHTML = giftBadgeInner;
      var card = mount.querySelector('.ce-progress-bar-card');
      if(card) card.appendChild(badgeEl);
    } else if(!isGiftUnlocked && existingBadge){
      existingBadge.remove();
    } else if(isGiftUnlocked && existingBadge){
      if(existingBadge.innerHTML !== giftBadgeInner){
        existingBadge.innerHTML = giftBadgeInner;
      }
      existingBadge.style.setProperty('--ce-accent-color', ac);
    }
    return;
  }

  // Initial card mount
  var pointHtml = hasStep
    ? '<div class="ce-pb-point' + (isFirstReached ? ' ce-pb-point-active' : '') + '" style="left:' + pointPct + '%;"></div>'
    : '';

  mount.innerHTML = '<div class="ce-progress-bar-card" style="--ce-accent-color:' + ac + ';">' +
    '<div class="ce-pb-header">' +
      '<div class="ce-pb-icon" style="color:' + ac + ';">' + pbIcon + '</div>' +
      '<div class="ce-pb-text" style="color:' + ac + ';">' + remainingText + '</div>' +
    '</div>' +
    '<div class="ce-pb-track">' +
      '<div class="ce-pb-fill" style="width:' + pct + '%; background-color:' + ac + ' !important;"></div>' +
      pointHtml +
    '</div>' +
    '<div class="ce-pb-markers">' + markersHtml + '</div>' +
    giftBadgeHtml +
  '</div>';
}

function getNumericVariantId(gidOrNum){
  if(!gidOrNum) return null;
  var str = String(gidOrNum);
  var match = str.match(/ProductVariant\/(\d+)/);
  if(match && match[1]) return Number(match[1]);
  if(/^\d+$/.test(str)) return Number(str);
  return null;
}

/* ───────────────────────── Free gift: Cart attribute order integration ───────────────────────── */

var isGiftSyncRunning = false;
var lastGiftSyncTimestamp = 0;

function giftFeatureActive(){
  var pb = getProgressBar();
  if(!pb) return false;
  var goalType = pb.goalType || 'free_shipping';
  if(goalType !== 'free_gift' && goalType !== 'both') return false;
  return !!(pb.giftProductTitle || pb.giftProductId);
}

function postJSON(url, body){
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body)
  }).then(function(res){
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

/**
 * Sync Free Gift as a Shopify Cart Attribute so it flows directly into the
 * Shopify Order ("Additional Details") for the merchant to pack and fulfill.
 */
function syncFreeGiftInCart(detail){
  if(!giftFeatureActive()) return;
  if(isGiftSyncRunning) return;
  if(Date.now() - lastGiftSyncTimestamp < 1000) return;

  var pb = getProgressBar();
  if(!pb) return;

  var gThreshold = Number(pb.giftThreshold) || 120;
  var giftQty = Number(pb.giftQuantity) || 1;
  var giftTitle = pb.giftProductTitle || 'Special Store Gift';
  var giftLabel = (giftQty > 1 ? giftQty + 'x ' : '') + giftTitle;

  var cart = detail && detail.cart;
  if(!cart) return;

  var cartTotal = 0;
  if(Array.isArray(cart.items)){
    for(var k = 0; k < cart.items.length; k++){
      var it = cart.items[k];
      var props = it.properties || {};
      var isSvc = props._cartelevate_service === 'true' || props._cartelevate_service === true ||
                  (it.title && it.title.indexOf('[CartElevate]') !== -1);
      if(!isGiftLine(it) && !isSvc){
        var lv = (typeof it.final_line_price === 'number') ? it.final_line_price : ((it.price || 0) * (it.quantity || 1));
        cartTotal += lv / 100;
      }
    }
  }

  var qualifies = cartTotal >= gThreshold;
  var existingAttr = (cart.attributes && (cart.attributes['Free Gift'] || cart.attributes['_cartelevate_gift'])) || '';

  if(qualifies && existingAttr !== giftLabel){
    isGiftSyncRunning = true;
    lastGiftSyncTimestamp = Date.now();
    postJSON('/cart/update.js?ce_internal=1', {
      attributes: {
        'Free Gift': giftLabel,
        '_cartelevate_gift': giftLabel,
        '_cartelevate_gift_qty': String(giftQty)
      }
    }).then(function(){
      isGiftSyncRunning = false;
    }).catch(function(){
      isGiftSyncRunning = false;
    });
  } else if(!qualifies && existingAttr){
    isGiftSyncRunning = true;
    lastGiftSyncTimestamp = Date.now();
    postJSON('/cart/update.js?ce_internal=1', {
      attributes: {
        'Free Gift': '',
        '_cartelevate_gift': '',
        '_cartelevate_gift_qty': ''
      }
    }).then(function(){
      isGiftSyncRunning = false;
    }).catch(function(){
      isGiftSyncRunning = false;
    });
  }
}

// Initial render
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){
    renderProgressBar();
  });
} else {
  renderProgressBar();
}

// Listen to shared cart update events
document.addEventListener('cartelevate:cart-updated', function(e){
  renderProgressBar(e.detail);
  syncFreeGiftInCart(e.detail);
});

// Export helper to global CartElevate namespace
window.CartElevateProgressBarFeature = {
  render: renderProgressBar,
  getProgressBar: getProgressBar,
  syncFreeGift: syncFreeGiftInCart
};

})();