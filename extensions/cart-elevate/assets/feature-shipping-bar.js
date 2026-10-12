/* CartElevate — Feature: Shipping & Free Gift Progress Bar */
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

function getBranding(){
  return parse(window.CartElevateBranding) || { accentColor: '#F95738' };
}

function getSymbol(pb, currency){
  if(pb && pb.currencySymbol) return pb.currencySymbol;
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
  var goalType = pb.goalType || 'free_shipping';
  var sThreshold = Number(pb.shippingThreshold) || 75;
  var gThreshold = Number(pb.giftThreshold) || 120;
  var msgTemplate = pb.messageBeforeGoal || 'Add {amount} more for free shipping';

  var currentTotal = (detail && typeof detail.cartTotal === 'number') ? detail.cartTotal : 0;
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

  if(goalType === 'free_shipping'){
    var rem = Math.max(0, sThreshold - currentTotal);
    pct = Math.min(100, Math.round((currentTotal / sThreshold) * 100));
    primaryMax = sThreshold;
    remainingText = currentTotal >= sThreshold
      ? "🎉 You've unlocked free shipping!"
      : msgTemplate.replace('{amount}', sym + rem.toFixed(0));
  } else if(goalType === 'free_gift'){
    var rem = Math.max(0, gThreshold - currentTotal);
    pct = Math.min(100, Math.round((currentTotal / gThreshold) * 100));
    primaryMax = gThreshold;
    var defMsg = msgTemplate.indexOf('free shipping') !== -1 ? msgTemplate.replace('free shipping', 'free gift') : msgTemplate;
    remainingText = currentTotal >= gThreshold
      ? "🎉 You've unlocked a free gift!"
      : defMsg.replace('{amount}', sym + rem.toFixed(0));
  } else {
    // Both goals
    var maxT = Math.max(sThreshold, gThreshold);
    var isBoth = currentTotal >= sThreshold && currentTotal >= gThreshold;
    pct = isBoth ? 100 : Math.min(100, Math.round((currentTotal / maxT) * 100));
    primaryMax = maxT;
    if(isBoth){
      remainingText = "🎉 You've unlocked free shipping and free gift!";
    } else if(currentTotal >= sThreshold){
      var rem = Math.max(0, gThreshold - currentTotal);
      remainingText = 'Free shipping unlocked! Add ' + sym + rem.toFixed(0) + ' more for free gift';
    } else {
      var rem = Math.max(0, sThreshold - currentTotal);
      remainingText = msgTemplate.replace('{amount}', sym + rem.toFixed(0));
    }
  }

  var isGift = goalType === 'free_gift' || (goalType === 'both' && currentTotal >= sThreshold);
  var pbIcon = isGift
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

  var markersHtml = '';
  if(goalType === 'both'){
    var sCls = currentTotal >= sThreshold ? ' style="color:#E04828; font-weight:700;"' : '';
    var gCls = currentTotal >= gThreshold ? ' style="color:#E04828; font-weight:700;"' : '';
    markersHtml = '<span>' + sym + '0</span><div style="display:flex;gap:14px;"><span' + sCls + '>' + sym + sThreshold + '</span><span' + gCls + '>' + sym + gThreshold + '</span></div>';
  } else {
    var pCls = currentTotal >= primaryMax ? ' style="color:#E04828; font-weight:700;"' : '';
    markersHtml = '<span>' + sym + '0</span><span' + pCls + '>' + sym + primaryMax + '</span>';
  }

  // Update in place smoothly if card already exists
  var existingText = mount.querySelector('.ce-pb-text');
  var existingFill = mount.querySelector('.ce-pb-fill');
  var existingMarkers = mount.querySelector('.ce-pb-markers');
  var existingIcon = mount.querySelector('.ce-pb-icon');

  if(existingText && existingFill){
    if(existingText.textContent !== remainingText){
      existingText.textContent = remainingText;
    }
    if(existingFill.style.width !== pct + '%'){
      existingFill.style.width = pct + '%';
    }
    existingFill.style.backgroundColor = ac;
    if(existingMarkers) existingMarkers.innerHTML = markersHtml;
    if(existingIcon) existingIcon.innerHTML = pbIcon;
    return;
  }

  // Initial card mount
  mount.innerHTML = '<div class="ce-progress-bar-card">' +
    '<div class="ce-pb-header">' +
      '<div class="ce-pb-icon">' + pbIcon + '</div>' +
      '<div class="ce-pb-text">' + remainingText + '</div>' +
    '</div>' +
    '<div class="ce-pb-track">' +
      '<div class="ce-pb-fill" style="width:' + pct + '%; background-color:' + ac + ';"></div>' +
    '</div>' +
    '<div class="ce-pb-markers">' + markersHtml + '</div>' +
  '</div>';
}

// Initial render
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){ renderProgressBar(); });
} else {
  renderProgressBar();
}

// Listen to shared cart update events
document.addEventListener('cartelevate:cart-updated', function(e){
  renderProgressBar(e.detail);
});

// Export helper to global CartElevate namespace
window.CartElevateProgressBarFeature = {
  render: renderProgressBar,
  getProgressBar: getProgressBar
};

})();
