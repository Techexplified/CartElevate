/* CartElevate — Core Cart Hub */
(function(){
'use strict';

var count = typeof window.CartElevateItemCount === 'number' ? window.CartElevateItemCount : 0;
var cartTotal = 0;
var cartCurrency = 'USD';
var isFetching = false;
var debounceTimer = null;

function emitCartUpdate(){
  var detail = {
    count: count,
    cartTotal: cartTotal,
    cartCurrency: cartCurrency,
    timestamp: Date.now()
  };
  try{
    document.dispatchEvent(new CustomEvent('cartelevate:cart-updated', { detail: detail }));
  }catch(e){
    console.error('[CE-Core] Event dispatch error:', e);
  }
}

function fetchCount(cb){
  if(isFetching) return;
  isFetching = true;
  fetch('/cart.js?ce_sync=' + Date.now(), { cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(c){
      isFetching = false;
      if(c && typeof c.item_count === 'number'){
        count = c.item_count;
        cartTotal = typeof c.total_price === 'number' ? c.total_price / 100 : 0;
        if(c.currency) cartCurrency = c.currency;
        emitCartUpdate();
        if(cb) cb(c);
      }
    })
    .catch(function(){
      isFetching = false;
      if(cb) cb();
    });
}

function triggerSync(delay){
  var ms = typeof delay === 'number' ? delay : 120;
  if(debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function(){
    fetchCount();
  }, ms);
}

// 1. Intercept window.fetch for any cart modifications by the active theme
if(typeof window.fetch === 'function'){
  var origFetch = window.fetch;
  window.fetch = function(){
    var args = arguments;
    var url = '';
    try{
      url = (args && args[0]) ? (typeof args[0] === 'string' ? args[0] : (args[0].url || '')) : '';
    }catch(e){}
    var isCartReq = url && /\/cart(\/|\.js|$|\?)/i.test(url) && url.indexOf('ce_sync') === -1;
    return origFetch.apply(this, args).then(function(res){
      if(isCartReq){
        triggerSync(80);
        setTimeout(function(){ fetchCount(); }, 350);
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
    if(this._ceCartUrl && /\/cart(\/|\.js|$|\?)/i.test(this._ceCartUrl) && String(this._ceCartUrl).indexOf('ce_sync') === -1){
      this.addEventListener('load', function(){
        triggerSync(80);
        setTimeout(function(){ fetchCount(); }, 350);
      });
    }
    return origSend.apply(this, arguments);
  };
}

// 3. Debounced MutationObserver for dynamic drawers
var obs = new MutationObserver(function(mutations){
  var isInternal = mutations.every(function(m){
    return m.target && (m.target.id === 'cart-elevate-root' || (m.target.closest && m.target.closest('#cart-elevate-root, .ce-branded-header')));
  });
  if(isInternal) return;

  triggerSync(120);
});
obs.observe(document.body, { childList: true, subtree: true });

// 4. Click listener on quantity steppers & removal buttons
document.addEventListener('click', function(e){
  var isQtyBtn = e.target && e.target.closest('button[name="plus"], button[name="minus"], .quantity__button, [name="update"], .cart-item__quantity, [data-quantity-selector], cart-remove-button, .cart-remove-button, a[href*="/cart/change"], .cart__remove, .cart-drawer__close-button, a[href*="/cart"], button[aria-controls*="CartDrawer"]');
  if(isQtyBtn){
    triggerSync(100);
    setTimeout(function(){ fetchCount(); }, 400);
  }
}, true);

// 5. Change listener on quantity inputs
document.addEventListener('change', function(e){
  var isQtyInput = e.target && e.target.closest('input[name="updates[]"], .quantity__input, input.cart-item__quantity, [data-quantity-input]');
  if(isQtyInput){
    triggerSync(100);
    setTimeout(function(){ fetchCount(); }, 400);
  }
}, true);

// 6. Shopify standard cart events
['cart:updated', 'cart:refresh', 'sections:rendered', 'cart:change'].forEach(function(ev){
  document.addEventListener(ev, function(){
    triggerSync(60);
  });
});

// 7. Initial boot
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){ fetchCount(); });
} else {
  fetchCount();
}

// Global namespace
window.CartElevate = {
  fetchCount: fetchCount,
  getCartData: function(){
    return { count: count, cartTotal: cartTotal, cartCurrency: cartCurrency };
  },
  refresh: function(){ triggerSync(50); }
};

})();
