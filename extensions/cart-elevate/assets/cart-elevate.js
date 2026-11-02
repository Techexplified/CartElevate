/* CartElevate — Core Cart Hub */
(function(){
'use strict';

var count = typeof window.CartElevateItemCount === 'number' ? window.CartElevateItemCount : 0;
var cartTotal = 0;
var cartCurrency = window.CartElevateCurrency || 'USD';
var rawCart = null;
var isFetching = false;
var debounceTimer = null;
var needsSyncAgain = false;
var syncCallbacks = [];

function emitCartUpdate(){
  try{
    document.dispatchEvent(new CustomEvent('cartelevate:cart-updated', {
      detail: { count: count, cartTotal: cartTotal, cartCurrency: cartCurrency, cart: rawCart, timestamp: Date.now() }
    }));
  }catch(e){
    console.error('[CE-Core] Event dispatch error:', e);
  }
}

function updateCartData(c){
  if(c && typeof c.item_count === 'number'){
    count = c.item_count;
    cartTotal = typeof c.total_price === 'number' ? c.total_price / 100 : 0;
    if(c.currency) cartCurrency = c.currency;
    rawCart = c;
    emitCartUpdate();
  }
}

function flushCallbacks(data){
  var cbs = syncCallbacks.slice();
  syncCallbacks = [];
  cbs.forEach(function(fn){ try{ fn(data); }catch(e){ /* no-op */ } });
}

function fetchCount(cb){
  if(typeof cb === 'function') syncCallbacks.push(cb);
  if(isFetching){
    needsSyncAgain = true;
    return;
  }
  isFetching = true;
  fetch('/cart.js?ce_sync=' + Date.now(), { cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(c){
      isFetching = false;
      updateCartData(c);
      flushCallbacks(c);
      if(needsSyncAgain){
        needsSyncAgain = false;
        fetchCount();
      }
    })
    .catch(function(){
      isFetching = false;
      flushCallbacks();
      if(needsSyncAgain){
        needsSyncAgain = false;
        fetchCount();
      }
    });
}

function triggerSync(delay){
  var ms = typeof delay === 'number' ? delay : 100;
  if(debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function(){ fetchCount(); }, ms);
}

// 1. Intercept window.fetch for cart calls
if(typeof window.fetch === 'function'){
  var origFetch = window.fetch;
  window.fetch = function(){
    var args = arguments;
    var url = '';
    try{
      url = (args && args[0]) ? (typeof args[0] === 'string' ? args[0] : (args[0].url || '')) : '';
    }catch(e){ /* ignore url error */ }
    var isInternal = url && (url.indexOf('ce_sync') !== -1 || url.indexOf('ce_internal') !== -1);
    var isCartReq = url && /\/cart(\/|\.js|$|\?)/i.test(url) && !isInternal;
    return origFetch.apply(this, args).then(function(res){
      if(isCartReq){
        try{
          res.clone().json().then(function(data){
            if(data && typeof data === 'object') updateCartData(data);
          }).catch(function(){ /* ignore json error */ });
        }catch(err){ /* ignore clone error */ }
        triggerSync(50);
        setTimeout(function(){ fetchCount(); }, 300);
      }
      return res;
    });
  };
}

// 2. Intercept XMLHttpRequest for AJAX-based themes
if(typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype){
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url){
    this._ceCartUrl = url;
    return origOpen.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(){
    var isInternal = this._ceCartUrl && (String(this._ceCartUrl).indexOf('ce_sync') !== -1 || String(this._ceCartUrl).indexOf('ce_internal') !== -1);
    if(this._ceCartUrl && /\/cart(\/|\.js|$|\?)/i.test(this._ceCartUrl) && !isInternal){
      this.addEventListener('load', function(){
        try{
          var text = this.responseText;
          if(text) updateCartData(JSON.parse(text));
        }catch(err){ /* ignore parse error */ }
        triggerSync(50);
        setTimeout(function(){ fetchCount(); }, 300);
      });
    }
    return origSend.apply(this, arguments);
  };
}

// 3. Debounced MutationObserver for dynamic drawers
var CE_IGNORE = '#cart-elevate-root, #ce-recommendations-root, .ce-recommendations-wrapper, .ce-branded-header, #ce-bundle-progress-banner, .ce-bundle-banner-wrapper, .ce-bundle-badge, #ce-bundle-savings-summary, .ce-bundle-savings-summary, #ce-protection-wrapping-root, .ce-pw-container';
var obs = new MutationObserver(function(mutations){
  var touchesCart = false;
  for(var i = 0; i < mutations.length; i++){
    var t = mutations[i].target;
    if(!t) continue;
    if(t.closest && t.closest(CE_IGNORE)) continue;
    if(t.closest && t.closest('cart-drawer, .cart-drawer, #CartDrawer, [data-cart-drawer], cart-notification, .cart-item, form[action*="/cart"]')){
      touchesCart = true;
      break;
    }
  }
  if(touchesCart) triggerSync(120);
});
obs.observe(document.body, { childList: true, subtree: true });

// 4. Click listener on quantity steppers & removal buttons
var QTY_BTN_SEL = 'button[name="plus"], button[name="minus"], .quantity__button, [name="update"], .cart-item__quantity, [data-quantity-selector], cart-remove-button, .cart-remove-button, a[href*="/cart/change"], .cart__remove, .cart-drawer__close-button, a[href*="/cart"], button[aria-controls*="CartDrawer"], [data-cart-remove], .cart__remove-btn, [data-remove-item], .item-remove, .cart-remove, [data-cart-item-delete], [data-cart-remove-id], .cart-item__remove';
document.addEventListener('click', function(e){
  if(e.target && e.target.closest(QTY_BTN_SEL)){
    triggerSync(60);
    setTimeout(function(){ fetchCount(); }, 300);
  }
}, true);

// 5. Change listener on quantity inputs
var QTY_INP_SEL = 'input[name="updates[]"], .quantity__input, input.cart-item__quantity, [data-quantity-input]';
document.addEventListener('change', function(e){
  if(e.target && e.target.closest(QTY_INP_SEL)){
    triggerSync(60);
    setTimeout(function(){ fetchCount(); }, 300);
  }
}, true);

// 6. Shopify standard cart events
['cart:updated', 'cart:refresh', 'sections:rendered', 'cart:change'].forEach(function(ev){
  document.addEventListener(ev, function(){ triggerSync(50); });
});

// 7. Initial boot
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){ fetchCount(); });
} else {
  fetchCount();
}

/**
 * Dynamically re-renders the merchant theme's Cart Drawer & Header Count bubble
 * without requiring a full page reload or triggering recursive fetch loops.
 */
var isRefreshingDrawer = false;

function refreshCartDrawer(addedItemData) {
  if (isRefreshingDrawer) return;
  isRefreshingDrawer = true;

  var parser = new DOMParser();

  function swapDrawerNodesFromDoc(doc) {
    if (!doc) return false;
    var swapped = false;

    var liveDrawers = document.querySelectorAll('cart-drawer, .cart-drawer, .drawer, #CartDrawer, cart-drawer-items, cart-drawer-component');
    liveDrawers.forEach(function (el) {
      el.classList.remove('is-empty');
      var emptyInner = el.querySelector && el.querySelector('.drawer__inner-empty, .cart-drawer__empty-content');
      if (emptyInner) emptyInner.style.display = 'none';
    });

    var swapSelectors = [
      'cart-items-component',
      'cart-drawer-items',
      '#CartDrawer-CartItems',
      '#CartDrawer .drawer__inner',
      '.cart-drawer__items',
      '.drawer__items',
      '.CartDrawer__Content',
      '.cart-drawer__footer',
      '#CartDrawer .drawer__footer',
      '.drawer__footer',
      '#cart-icon-bubble',
      '.cart-count-bubble',
      '[data-cart-count]'
    ];

    swapSelectors.forEach(function (sel) {
      var currentEl = document.querySelector(sel);
      var updatedEl = doc.querySelector(sel);
      if (currentEl && updatedEl && updatedEl.innerHTML.trim()) {
        if (sel === '#CartDrawer .drawer__inner' && swapped) return;
        currentEl.innerHTML = updatedEl.innerHTML;
        currentEl.classList.remove('is-empty');
        swapped = true;
      }
    });

    return swapped;
  }

  // Step 1: Check if /cart/add.js returned rendered sections HTML
  if (addedItemData && addedItemData.sections && typeof addedItemData.sections === 'object') {
    var combinedHtml = '';
    Object.keys(addedItemData.sections).forEach(function (k) {
      if (typeof addedItemData.sections[k] === 'string') {
        combinedHtml += addedItemData.sections[k] + '\n';
      }
    });
    if (combinedHtml) {
      var secDoc = parser.parseFromString(combinedHtml, 'text/html');
      if (swapDrawerNodesFromDoc(secDoc)) {
        isRefreshingDrawer = false;
        fetchCount();
        return;
      }
    }
  }

  // Step 2: Fallback — fetch current page with ce_internal=1 to bypass interceptor
  var sep = window.location.search ? '&' : '?';
  var fetchUrl = window.location.pathname + window.location.search + sep + 'ce_internal=1&_t=' + Date.now();

  fetch(fetchUrl, { cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      isRefreshingDrawer = false;
      var doc = parser.parseFromString(html, 'text/html');
      swapDrawerNodesFromDoc(doc);
      fetchCount();
    })
    .catch(function (err) {
      isRefreshingDrawer = false;
      console.warn('[CE-Core] DOM drawer refresh error:', err);
      fetchCount();
    });
}

// Global namespace
window.CartElevate = {
  fetchCount: fetchCount,
  refreshCartDrawer: refreshCartDrawer,
  getCartData: function(){
    return { count: count, cartTotal: cartTotal, cartCurrency: cartCurrency, cart: rawCart };
  },
  refresh: function(){ triggerSync(50); }
};

})();
