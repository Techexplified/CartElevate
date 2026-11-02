/* CartElevate — Dynamic Multi-Set Recommendations Engine */
(function(){
'use strict';

var CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', INR: '₹', JPY: '¥', CNY: '¥', AED: 'AED ', BRL: 'R$',
  CHF: 'CHF ', DKK: 'kr ', HKD: 'HK$', MXN: 'MX$', NOK: 'kr ', NZD: 'NZ$', PLN: 'zł ', SEK: 'kr ', SGD: 'S$',
  THB: '฿', TRY: '₺', ZAR: 'R '
};

var MOUNT_ID = 'ce-recommendations-root';
var isFetchingRecs = false;
var lastRecsKey = null;
var cachedRecommendations = [];
var recObserver = null;
var activeSetId = null;

function parseConfig(raw){
  if(!raw) return null;
  if(typeof raw === 'string'){
    try{ raw = JSON.parse(raw); }catch(e){}
  }
  if(typeof raw === 'string'){
    try{ raw = JSON.parse(raw); }catch(e){}
  }
  return (raw && typeof raw === 'object') ? raw : null;
}

/**
 * Get all sets from window.CartElevateRecommendations
 */
function getAllSets(){
  var raw = parseConfig(window.CartElevateRecommendations);
  if(!raw) return [];

  var sets = [];
  if(Array.isArray(raw.sets)) {
    sets = raw.sets;
  } else if(raw.recommendations && Array.isArray(raw.recommendations.sets)) {
    sets = raw.recommendations.sets;
  } else if(raw.logic) {
    sets = [{
      id: "set_default",
      name: "Default set",
      status: "PUBLISHED",
      logic: raw.logic,
      numberShown: Number(raw.numberShown) || 3,
      sectionTitle: raw.sectionTitle || "You might also like",
      excludeCollections: raw.excludeCollections || ["Sale items", "Gift cards"]
    }];
  }

  var DUMMY_IDS = { set_kitchenware_1: true, set_homedecor_2: true, set_highestmargin_3: true };
  return sets.filter(function(s){ return s && s.id && !DUMMY_IDS[s.id]; });
}

/**
 * Fallback fetch if metafield wasn't rendered on initial page load
 */
(function fetchRecommendationsFallback(){
  if(window.CartElevateRecommendations && typeof window.CartElevateRecommendations === 'object') return;
  var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop);
  if(!shop) return;
  fetch('/api/recommendations?shop=' + encodeURIComponent(shop))
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d && (d.sets || d.recommendations)){
        window.CartElevateRecommendations = d;
        if(window.CartElevate && typeof window.CartElevate.getCartData === 'function'){
          var cartData = window.CartElevate.getCartData();
          if(cartData && cartData.cart) handleCartUpdate({ cart: cartData.cart });
        }
      }
    })
    .catch(function(){});
})();

/**
 * Check if a cart item matches any excluded collection keywords or tags
 */
var loadedExcludedProductIds = {};
var fetchingCollectionHandles = {};

/**
 * Dynamically fetch products from excluded collections via Shopify's standard endpoint:
 * /collections/{handle}/products.json?limit=250
 */
function loadExcludedCollectionProducts(collections, callback){
  if(!Array.isArray(collections) || collections.length === 0){
    if(callback) callback();
    return;
  }

  var handles = [];
  for(var i = 0; i < collections.length; i++){
    var col = collections[i];
    var handle = (typeof col === 'object' && col.handle ? col.handle : String(col)).trim().toLowerCase();
    if(handle && handles.indexOf(handle) === -1){
      handles.push(handle);
    }
  }

  var toFetch = handles.filter(function(h){ return !fetchingCollectionHandles[h]; });
  if(toFetch.length === 0){
    if(callback) callback();
    return;
  }

  var remaining = toFetch.length;
  toFetch.forEach(function(handle){
    fetchingCollectionHandles[handle] = true;
    fetch('/collections/' + encodeURIComponent(handle) + '/products.json?limit=250')
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if(data && Array.isArray(data.products)){
          data.products.forEach(function(prod){
            if(prod && prod.id){
              var idStr = String(prod.id).replace(/\D/g, '');
              loadedExcludedProductIds[idStr] = true;
            }
          });
        }
      })
      .catch(function(){})
      .finally(function(){
        remaining--;
        if(remaining <= 0 && callback){
          callback();
        }
      });
  });
}

/**
 * Check if a cart item matches any excluded collection keywords, IDs, or tags
 */
function isCartItemExcluded(item, excludeCollections, excludedProductIds){
  if(!item) return false;

  var pId = String(item.product_id || item.id || '').replace(/\D/g, '');

  // 1. Check pre-computed excluded product IDs
  if(Array.isArray(excludedProductIds) && excludedProductIds.length > 0){
    for(var k = 0; k < excludedProductIds.length; k++){
      if(String(excludedProductIds[k]).replace(/\D/g, '') === pId) return true;
    }
  }

  // 2. Check dynamically loaded collection products
  if(loadedExcludedProductIds[pId]) return true;

  if(!Array.isArray(excludeCollections) || excludeCollections.length === 0) return false;
  var itemType = (item.product_type || '').toLowerCase().trim();
  var itemTitle = (item.title || item.product_title || '').toLowerCase();
  var itemHandle = (item.handle || '').toLowerCase();

  for(var i = 0; i < excludeCollections.length; i++){
    var col = excludeCollections[i];
    if(!col) continue;

    var colHandle = (typeof col === 'object' && col.handle ? col.handle : String(col)).trim().toLowerCase();
    var colTitle = (typeof col === 'object' && col.title ? col.title : String(col)).trim().toLowerCase();

    if(colHandle && (itemHandle === colHandle || itemTitle.indexOf(colHandle) !== -1)) return true;
    if(colTitle && (itemType === colTitle || itemTitle.indexOf(colTitle) !== -1)) return true;
  }
  return false;
}

/**
 * Normalize recommendation logic name across versions
 */
function normalizeLogic(logic){
  var l = String(logic || '').trim().toLowerCase();
  if(l.indexOf('frequently') !== -1) return 'Frequently bought together';
  if(l.indexOf('collection') !== -1) return 'Same collection';
  if(l.indexOf('curated') !== -1 || l.indexOf('manually') !== -1) return 'Curated Recommendations';
  if(l.indexOf('margin') !== -1 || l.indexOf('highest') !== -1) return 'Highest margin products';
  return logic || 'Frequently bought together';
}

/**
 * Strict priority ranking:
 * 1. Frequently Bought Together
 * 2. Same Collection
 * 3. Curated Recommendations
 * 4. Highest Margin Products
 */
function getLogicRank(logic){
  var norm = normalizeLogic(logic);
  if(norm === 'Frequently bought together') return 1;
  if(norm === 'Same collection') return 2;
  if(norm === 'Curated Recommendations') return 3;
  if(norm === 'Highest margin products') return 4;
  return 999;
}

/**
 * Resolve all enabled recommendation sets sorted strictly in priority order:
 * 1. Frequently Bought Together
 * 2. Same Collection
 * 3. Curated Recommendations
 * 4. Highest Margin Products
 *
 * Rules:
 * - Only 1 set per recommendation logic can be enabled at once (max 4).
 * - Only published sets.
 * - Filter out any set whose exclusion rules match the customer's cart items.
 */
function getActiveOrderedSets(cart){
  var allSets = getAllSets();
  var publishedSets = allSets.filter(function(s){ return s && s.status === 'PUBLISHED'; });
  if(!publishedSets || publishedSets.length === 0) return [];

  // Deduplicate by logic: at most 1 enabled set per logic
  var seenLogics = {};
  var uniqueSets = [];
  for(var i = 0; i < publishedSets.length; i++){
    var s = publishedSets[i];
    var norm = normalizeLogic(s.logic);
    if(!seenLogics[norm]){
      seenLogics[norm] = true;
      uniqueSets.push(s);
    }
  }

  // Filter out any set whose exclusion rules match the customer's cart item(s)
  var active = [];
  var latestItem = (cart && Array.isArray(cart.items) && cart.items.length > 0) ? cart.items[0] : null;

  for(var j = 0; j < uniqueSets.length; j++){
    var set = uniqueSets[j];
    if(latestItem){
      var excludeList = set.excludeCollections || [];
      var excludedIds = set.excludedProductIds || [];
      if(isCartItemExcluded(latestItem, excludeList, excludedIds)){
        continue;
      }
    }
    active.push(set);
  }

  // Mandated vertical order:
  // 1. Frequently Bought Together
  // 2. Same Collection
  // 3. Curated Recommendations
  // 4. Highest Margin Products
  active.sort(function(a, b){
    return getLogicRank(a.logic) - getLogicRank(b.logic);
  });

  return active;
}

/**
 * Resolve primary set for backward compatibility
 */
function resolveWinningSet(cart){
  var sets = getActiveOrderedSets(cart);
  return (sets && sets.length > 0) ? sets[0] : null;
}

function getSymbol(currency) {
  if (currency && CURRENCY_SYMBOLS[currency.toUpperCase()]) {
    return CURRENCY_SYMBOLS[currency.toUpperCase()];
  }
  if (window.CartElevateCurrencySymbol) {
    return window.CartElevateCurrencySymbol;
  }
  var activeCurr = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) ||
                   window.CartElevateCurrency;
  if (activeCurr && CURRENCY_SYMBOLS[activeCurr.toUpperCase()]) {
    return CURRENCY_SYMBOLS[activeCurr.toUpperCase()];
  }
  return '$';
}

/**
 * Robust cents parser handling all Shopify formats:
 * - Shopify /recommendations/products.json: integer cents (e.g. 1400, 15000)
 * - Shopify /collections/.../products.json: decimal string (e.g. "14.00", "150.00")
 * - Shopify GraphQL / App Bridge: decimal string (e.g. "14.00", "150.00")
 * - Strings with currency symbols: (e.g. "$14.00", "$150.00", "₹1,499.00")
 * - European comma format: (e.g. "14,99 €", "1.499,00")
 */
function toCents(val) {
  if (val == null || val === '') return 0;

  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    // Fractional numbers (e.g. 14.5 or 14.99) represent decimal dollars
    if (val % 1 !== 0) {
      return Math.round(val * 100);
    }
    // Integer numbers in Shopify APIs (like /recommendations and Liquid) represent cents
    return Math.round(val);
  }

  var s = String(val).trim();
  if (!s) return 0;

  // European format with comma decimal (e.g. "14,99 €" or "1.499,00")
  if (/,\d{2}(?:\D*)$/.test(s)) {
    var euroClean = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    var euroFloat = parseFloat(euroClean);
    return isNaN(euroFloat) ? 0 : Math.round(euroFloat * 100);
  }

  // Decimal string with dot (e.g. "14.00", "150.00", "$150.00", "1,499.00")
  if (s.indexOf('.') !== -1) {
    var clean = s.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    var floatVal = parseFloat(clean);
    return isNaN(floatVal) ? 0 : Math.round(floatVal * 100);
  }

  // String containing currency symbol but no decimal (e.g. "$150" or "€14")
  if (/[^\d\s-]/.test(s)) {
    var symClean = s.replace(/[^0-9.-]/g, '');
    var symFloat = parseFloat(symClean);
    return isNaN(symFloat) ? 0 : Math.round(symFloat * 100);
  }

  // Pure integer string representing cents (e.g. "1400" or "15000")
  var intVal = parseInt(s, 10);
  return isNaN(intVal) ? 0 : intVal;
}

function formatWithDelimiters(number, precision, thousands, decimal) {
  precision = precision == null ? 2 : precision;
  thousands = thousands || ',';
  decimal = decimal || '.';
  if (isNaN(number) || number == null) return '0.00';
  var fixed = (number / 100.0).toFixed(precision);
  var parts = fixed.split('.');
  var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
  var cents = parts[1] ? (decimal + parts[1]) : '';
  return dollars + cents;
}

function formatMoney(amountInCentsOrDecimal, currency) {
  var cents = toCents(amountInCentsOrDecimal);
  var formatString = window.CartElevateMoneyFormat || (window.Shopify && window.Shopify.money_format);

  if (formatString && typeof formatString === 'string') {
    var value = '';
    var placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
    var match = formatString.match(placeholderRegex);

    if (match) {
      switch (match[1]) {
        case 'amount':
          value = formatWithDelimiters(cents, 2, ',', '.');
          break;
        case 'amount_no_decimals':
          value = formatWithDelimiters(cents, 0, ',', '.');
          break;
        case 'amount_with_comma_separator':
          value = formatWithDelimiters(cents, 2, '.', ',');
          break;
        case 'amount_no_decimals_with_comma_separator':
          value = formatWithDelimiters(cents, 0, '.', ',');
          break;
        case 'amount_with_space_separator':
          value = formatWithDelimiters(cents, 2, ' ', ',');
          break;
        case 'amount_no_decimals_with_space_separator':
          value = formatWithDelimiters(cents, 0, ' ', ',');
          break;
        case 'amount_with_apostrophe_separator':
          value = formatWithDelimiters(cents, 2, "'", '.');
          break;
        default:
          value = formatWithDelimiters(cents, 2, ',', '.');
      }
      return formatString.replace(placeholderRegex, value);
    }
  }

  var sym = getSymbol(currency);
  return sym + (cents / 100).toFixed(2);
}

/**
 * Check if a product should be excluded based on cart presence, cross-section deduplication, availability, or merchant exclusion collections
 */
function isProductExcluded(product, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds){
  if(!product || !product.id) return true;

  var pId = String(product.id).replace(/\D/g, '');

  // 1. Exclude if already in cart
  if(cartProductIds && (cartProductIds.indexOf(product.id) !== -1 || cartProductIds.indexOf(Number(pId)) !== -1 || cartProductIds.indexOf(pId) !== -1)){
    return true;
  }

  // 1b. Exclude if already shown in an earlier recommendation section (Cross-section deduplication)
  if(extraExcludedIds && (extraExcludedIds.indexOf(product.id) !== -1 || extraExcludedIds.indexOf(Number(pId)) !== -1 || extraExcludedIds.indexOf(pId) !== -1)){
    return true;
  }

  // 2. Exclude if unavailable
  if(product.available === false) return true;
  if(Array.isArray(product.variants) && product.variants.length > 0){
    var anyAvailable = product.variants.some(function(v){ return v.available !== false; });
    if(!anyAvailable) return true;
  }

  // 3. Exclude if in pre-computed excludedProductIds (from set metafield)
  if(Array.isArray(excludedProductIds) && excludedProductIds.length > 0){
    for(var k = 0; k < excludedProductIds.length; k++){
      var exId = String(excludedProductIds[k]).replace(/\D/g, '');
      if(exId && exId === pId) return true;
    }
  }

  // 4. Exclude if in dynamically loaded collection products
  if(loadedExcludedProductIds[pId]){
    return true;
  }

  // 5. Exclude based on collection handles, titles, tags, and product types
  if(Array.isArray(excludeCollections) && excludeCollections.length > 0){
    var tags = (Array.isArray(product.tags) ? product.tags : (typeof product.tags === 'string' ? product.tags.split(',') : [])).map(function(t){
      return String(t).trim().toLowerCase();
    });
    var prodType = String(product.product_type || product.type || '').trim().toLowerCase();
    var prodTitle = String(product.title || '').toLowerCase();
    var prodHandle = String(product.handle || '').toLowerCase();

    for(var i = 0; i < excludeCollections.length; i++){
      var col = excludeCollections[i];
      if(!col) continue;

      var colHandle = (typeof col === 'object' && col.handle ? col.handle : String(col)).trim().toLowerCase();
      var colTitle = (typeof col === 'object' && col.title ? col.title : String(col)).trim().toLowerCase();
      var colId = (typeof col === 'object' && col.id ? String(col.id).replace(/\D/g, '') : '');

      if(tags.indexOf(colHandle) !== -1 || tags.indexOf(colTitle) !== -1) return true;
      if(prodType && (prodType === colTitle || prodType === colHandle)) return true;
      if(prodHandle === colHandle || prodTitle === colTitle) return true;

      // Check product.collections if populated in theme/response
      if(Array.isArray(product.collections)){
        for(var c = 0; c < product.collections.length; c++){
          var pCol = product.collections[c];
          var pColHandle = (pCol.handle || '').toLowerCase();
          var pColTitle = (pCol.title || '').toLowerCase();
          var pColId = String(pCol.id || '').replace(/\D/g, '');
          if(pColHandle === colHandle || pColTitle === colTitle || (colId && pColId === colId)){
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Fallback to general store products when store is new or has sparse co-purchase history
 */
function fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, callback){
  if(typeof extraExcludedIds === 'function' && !callback){
    callback = extraExcludedIds;
    extraExcludedIds = [];
  }
  if(typeof excludedProductIds === 'function' && !callback){
    callback = excludedProductIds;
    excludedProductIds = [];
    extraExcludedIds = [];
  }
  var endpoint = '/collections/all/products.json?limit=' + Math.max(needed + 6, 24);
  fetch(endpoint)
    .then(function(res){
      if(!res.ok) return fetch('/products.json?limit=' + Math.max(needed + 6, 24));
      return res;
    })
    .then(function(res){ return res.json(); })
    .then(function(data){
      var list = (data && Array.isArray(data.products)) ? data.products : [];
      var valid = list.filter(function(p){
        return !isProductExcluded(p, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds);
      });
      if(callback) callback(valid);
    })
    .catch(function(err){
      console.warn('[CartElevate-Recs] Fallback fetch failed:', err);
      if(callback) callback([]);
    });
}

/**
 * Fetch products based on the set's configured strategy
 */
function fetchStrategyProducts(set, anchorProductIds, limit, cartProductIds, extraExcludedIds, callback){
  if(typeof extraExcludedIds === 'function' && !callback){
    callback = extraExcludedIds;
    extraExcludedIds = [];
  }
  var logic = normalizeLogic(set.logic || 'Frequently bought together');
  var needed = limit + 6;
  var collected = [];
  var seenIds = {};

  var excludeCollections = set.excludeCollections || [];
  var excludedProductIds = set.excludedProductIds || [];

  function addProducts(prods){
    for(var i = 0; i < prods.length; i++){
      var p = prods[i];
      if(!p || seenIds[p.id]) continue;
      if(isProductExcluded(p, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds)) continue;
      seenIds[p.id] = true;
      collected.push(p);
      if(collected.length >= needed) break;
    }
  }

  // STRATEGY 1: "Same collection"
  if(logic === 'Same collection'){
    var primaryAnchorId = anchorProductIds[0];
    if(!primaryAnchorId){
      return fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallback){
        addProducts(fallback);
        callback(collected.slice(0, limit));
      });
    }

    var cartData = window.CartElevate && window.CartElevate.getCartData();
    var cartObj = cartData && cartData.cart;
    var cartItemsList = (cartObj && Array.isArray(cartObj.items)) ? cartObj.items : [];
    var cartItem = null;
    for(var ci = 0; ci < cartItemsList.length; ci++){
      if(String(cartItemsList[ci].product_id) === String(primaryAnchorId)){
        cartItem = cartItemsList[ci];
        break;
      }
    }
    if(!cartItem && cartItemsList.length > 0) cartItem = cartItemsList[0];

    function runFinalFallback(){
      if(collected.length >= limit){
        callback(collected.slice(0, limit));
      } else {
        fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallback){
          addProducts(fallback);
          callback(collected.slice(0, limit));
        });
      }
    }

    function tryShopifyRelated(){
      fetch('/recommendations/products.json?product_id=' + primaryAnchorId + '&limit=' + needed + '&intent=related')
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
          if(d && Array.isArray(d.products)){
            addProducts(d.products);
          }
          runFinalFallback();
        })
        .catch(function(){
          runFinalFallback();
        });
    }

    function tryProductTypeOrRelatedFallback(){
      var prodType = (cartItem && cartItem.product_type ? cartItem.product_type : '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if(prodType && prodType !== 'all'){
        fetch('/collections/' + encodeURIComponent(prodType) + '/products.json?limit=' + Math.max(needed + 6, 24))
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if(d && Array.isArray(d.products)){
              addProducts(d.products);
            }
            if(collected.length >= limit){
              callback(collected.slice(0, limit));
            } else {
              tryShopifyRelated();
            }
          })
          .catch(function(){
            tryShopifyRelated();
          });
      } else {
        tryShopifyRelated();
      }
    }

    function queryBackendSameCollection(){
      var shop = window.CartElevateShop || (window.Shopify && window.Shopify.shop) || '';
      if(!shop){
        tryProductTypeOrRelatedFallback();
        return;
      }
      var appBaseUrl = (window.CartElevateRecommendations && window.CartElevateRecommendations.appUrl) ||
                       (window.CartElevateSettings && window.CartElevateSettings.appUrl) || '';
      var apiUrl = (appBaseUrl ? appBaseUrl.replace(/\/+$/, '') : '') + '/api/recommendations?shop=' + encodeURIComponent(shop) + '&action=same_collection&product_id=' + encodeURIComponent(primaryAnchorId);
      fetch(apiUrl)
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
          if(d && Array.isArray(d.products) && d.products.length > 0){
            addProducts(d.products);
          }
          if(collected.length >= limit){
            callback(collected.slice(0, limit));
          } else {
            tryProductTypeOrRelatedFallback();
          }
        })
        .catch(function(){
          tryProductTypeOrRelatedFallback();
        });
    }

    function tryUrlCollectionMatch(){
      var colUrlMatch = cartItem && cartItem.url && cartItem.url.match(/\/collections\/([^/?#]+)/i);
      var urlColHandle = (colUrlMatch && colUrlMatch[1] && colUrlMatch[1] !== 'all') ? colUrlMatch[1] : null;

      if(urlColHandle){
        fetch('/collections/' + encodeURIComponent(urlColHandle) + '/products.json?limit=' + Math.max(needed + 6, 24))
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if(d && Array.isArray(d.products)){
              addProducts(d.products);
            }
            if(collected.length >= limit){
              callback(collected.slice(0, limit));
            } else {
              queryBackendSameCollection();
            }
          })
          .catch(function(){
            queryBackendSameCollection();
          });
      } else {
        queryBackendSameCollection();
      }
    }

    // Step 0: Check Liquid-injected Cart Collections (instant 0ms, 100% accurate)
    var cartCollectionsMap = window.CartElevateCartCollections || {};
    var pIdKey = String(primaryAnchorId).replace(/\D/g, '');
    var productCollections = cartCollectionsMap[pIdKey] || cartCollectionsMap[primaryAnchorId] || [];

    if(Array.isArray(productCollections) && productCollections.length > 0){
      var chosenLiquidCol = null;
      for(var lc = 0; lc < productCollections.length; lc++){
        var cObj = productCollections[lc];
        if(cObj && cObj.handle && cObj.handle !== 'frontpage' && cObj.handle !== 'all'){
          chosenLiquidCol = cObj.handle;
          break;
        }
      }
      if(!chosenLiquidCol && productCollections[0] && productCollections[0].handle){
        chosenLiquidCol = productCollections[0].handle;
      }

      if(chosenLiquidCol){
        fetch('/collections/' + encodeURIComponent(chosenLiquidCol) + '/products.json?limit=' + Math.max(needed + 6, 24))
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if(d && Array.isArray(d.products)){
              addProducts(d.products);
            }
            if(collected.length >= limit){
              callback(collected.slice(0, limit));
            } else {
              tryUrlCollectionMatch();
            }
          })
          .catch(function(){
            tryUrlCollectionMatch();
          });
        return;
      }
    }

    tryUrlCollectionMatch();
    return;
  }

  // STRATEGY 2: "Highest margin products" (Smart Price & AOV Maximizer)
  if(logic === 'Highest margin products'){
    var primaryAnchorId = anchorProductIds[0];
    var cartData = window.CartElevate && window.CartElevate.getCartData();
    var cartObj = cartData && cartData.cart;
    var cartItemsList = (cartObj && Array.isArray(cartObj.items)) ? cartObj.items : [];
    var cartItem = null;
    for(var ci = 0; ci < cartItemsList.length; ci++){
      if(String(cartItemsList[ci].product_id) === String(primaryAnchorId)){
        cartItem = cartItemsList[ci];
        break;
      }
    }
    if(!cartItem && cartItemsList.length > 0) cartItem = cartItemsList[0];

    // Helper to sort candidate products strictly by price descending
    function sortPriceDescending(prods){
      if(!Array.isArray(prods)) return [];
      return prods.slice().sort(function(a, b){
        var rawA = (a.variants && a.variants[0] && a.variants[0].price != null) ? a.variants[0].price : (a.price != null ? a.price : a.price_min);
        var rawB = (b.variants && b.variants[0] && b.variants[0].price != null) ? b.variants[0].price : (b.price != null ? b.price : b.price_min);
        return toCents(rawB) - toCents(rawA);
      });
    }

    function runGlobalPriceDescending(){
      fetch('/collections/all/products.json?sort_by=price-descending&limit=' + Math.max(needed + 8, 30))
        .then(function(r){
          if(!r.ok) return fetch('/products.json?limit=' + Math.max(needed + 8, 30));
          return r;
        })
        .then(function(r){ return r.json(); })
        .then(function(d){
          var list = (d && Array.isArray(d.products)) ? d.products : [];
          var sorted = sortPriceDescending(list);
          addProducts(sorted);

          if(collected.length < limit){
            fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallback){
              addProducts(sortPriceDescending(fallback));
              callback(collected.slice(0, limit));
            });
          } else {
            callback(collected.slice(0, limit));
          }
        })
        .catch(function(){
          fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallback){
            addProducts(sortPriceDescending(fallback));
            callback(collected.slice(0, limit));
          });
        });
    }

    // Tier 1: Contextual High-Margin (Highest price products from the customer's active collection)
    var cartCollectionsMap = window.CartElevateCartCollections || {};
    var pIdKey = primaryAnchorId ? String(primaryAnchorId).replace(/\D/g, '') : '';
    var productCollections = (pIdKey && cartCollectionsMap[pIdKey]) || [];
    var contextualColHandle = null;

    if(Array.isArray(productCollections) && productCollections.length > 0){
      for(var lc = 0; lc < productCollections.length; lc++){
        var cObj = productCollections[lc];
        if(cObj && cObj.handle && cObj.handle !== 'frontpage' && cObj.handle !== 'all'){
          contextualColHandle = cObj.handle;
          break;
        }
      }
    }

    if(!contextualColHandle && cartItem && cartItem.url){
      var colUrlMatch = cartItem.url.match(/\/collections\/([^/?#]+)/i);
      if(colUrlMatch && colUrlMatch[1] && colUrlMatch[1] !== 'all' && colUrlMatch[1] !== 'frontpage'){
        contextualColHandle = colUrlMatch[1];
      }
    }

    if(contextualColHandle){
      fetch('/collections/' + encodeURIComponent(contextualColHandle) + '/products.json?sort_by=price-descending&limit=' + Math.max(needed + 6, 24))
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
          if(d && Array.isArray(d.products)){
            addProducts(sortPriceDescending(d.products));
          }
          if(collected.length >= limit){
            callback(collected.slice(0, limit));
          } else {
            runGlobalPriceDescending();
          }
        })
        .catch(function(){
          runGlobalPriceDescending();
        });
      return;
    }

    // Tier 2: Storewide High-Margin (Top price-descending products from store)
    runGlobalPriceDescending();
    return;
  }

  // STRATEGY 3: "Curated Recommendations" (or "Manually curated")
  if(logic === 'Curated Recommendations' || logic === 'Manually curated'){
    var curatedList = Array.isArray(set.curatedProducts) ? set.curatedProducts : [];
    if(curatedList.length > 0){
      // Convert curated product objects to standard storefront recommendation format
      var formattedCurated = curatedList.map(function(item){
        var numId = String(item.numericId || item.id || '').replace(/\D/g, '');
        var firstVId = item.variantId ? String(item.variantId).replace(/\D/g, '') : null;
        var variants = Array.isArray(item.variants) && item.variants.length > 0
          ? item.variants.map(function(v){
              return {
                id: Number(String(v.id || v.numericId).replace(/\D/g, '')) || v.id,
                title: v.title || 'Default Title',
                price: v.price || '0.00',
                compare_at_price: v.compareAtPrice || v.compare_at_price || null,
                available: v.available !== false
              };
            })
          : [{
              id: firstVId ? Number(firstVId) : (Number(numId) || numId),
              title: item.title || 'Default Title',
              price: item.price || '0.00',
              compare_at_price: item.compareAtPrice || item.compare_at_price || null,
              available: true
            }];

        return {
          id: Number(numId) || item.id,
          title: item.title,
          handle: item.handle || '',
          featured_image: item.image || item.featured_image || null,
          price: item.price || (variants[0] && variants[0].price) || '0.00',
          compare_at_price: item.compareAtPrice || item.compare_at_price || null,
          available: true,
          variants: variants
        };
      });

      addProducts(formattedCurated);

      // If merchant curated enough items and we reached 'limit' after filtering:
      if(collected.length >= limit){
        callback(collected.slice(0, limit));
        return;
      }
    }

    // Fallback: If no curated products or some are already in cart/used, backfill via complementary or store
    var compUrl = '/recommendations/products.json?product_id=' + (anchorProductIds[0] || '') + '&limit=' + needed + '&intent=complementary';
    fetch(compUrl)
      .then(function(r){ return r.ok ? r.json() : { products: [] }; })
      .then(function(d){
        if(d && Array.isArray(d.products)){
          addProducts(d.products);
        }
        if(collected.length < limit){
          fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallback){
            addProducts(fallback);
            callback(collected.slice(0, limit));
          });
        } else {
          callback(collected.slice(0, limit));
        }
      })
      .catch(function(){
        fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallback){
          addProducts(fallback);
          callback(collected.slice(0, limit));
        });
      });
    return;
  }

  // STRATEGY 4 (Default): "Frequently bought together" (FBT)
  var primaryId = anchorProductIds[0];
  if(!primaryId){
    return fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallbackItems){
      addProducts(fallbackItems);
      callback(collected.slice(0, limit));
    });
  }

  var relatedUrl = '/recommendations/products.json?product_id=' + primaryId + '&limit=' + needed + '&intent=related';
  fetch(relatedUrl)
    .then(function(res){ return res.ok ? res.json() : { products: [] }; })
    .then(function(data){
      addProducts(data.products || []);

      if(collected.length < limit){
        var compUrl = '/recommendations/products.json?product_id=' + primaryId + '&limit=' + needed + '&intent=complementary';
        return fetch(compUrl)
          .then(function(res){ return res.ok ? res.json() : { products: [] }; })
          .then(function(compData){
            addProducts(compData.products || []);
            return collected;
          })
          .catch(function(){ return collected; });
      }
      return collected;
    })
    .then(function(currCollected){
      if(currCollected.length < limit && anchorProductIds.length > 1){
        var secondId = anchorProductIds[1];
        return fetch('/recommendations/products.json?product_id=' + secondId + '&limit=' + needed + '&intent=related')
          .then(function(res){ return res.ok ? res.json() : { products: [] }; })
          .then(function(secData){
            addProducts(secData.products || []);
            return collected;
          })
          .catch(function(){ return collected; });
      }
      return currCollected;
    })
    .then(function(currCollected){
      if(currCollected.length < limit){
        fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallbackItems){
          addProducts(fallbackItems);
          callback(collected.slice(0, limit));
        });
      } else {
        callback(collected.slice(0, limit));
      }
    })
    .catch(function(){
      fetchStoreFallback(needed, cartProductIds, excludeCollections, excludedProductIds, extraExcludedIds, function(fallbackItems){
        addProducts(fallbackItems);
        callback(collected.slice(0, limit));
      });
    });
}

/**
 * Utility to completely remove any existing recommendation blocks
 */
function removeAllRecommendationWrappers(){
  var wrappers = document.querySelectorAll('#' + MOUNT_ID + ', .ce-recommendations-wrapper, .ce-recommendations-container');
  wrappers.forEach(function(w){
    if(w && w.parentNode) w.parentNode.removeChild(w);
  });
}

/**
 * Find the optimal mount point above the checkout section in theme cart drawer or cart page
 */
function findMountPoint(){
  // Never mount if drawer is marked as empty
  var emptyDrawer = document.querySelector('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty, [data-empty="true"]');
  if(emptyDrawer) return null;

  // PRIORITY 1: Inside the cart items container (Row 2 in Dawn & modern Shopify drawers)
  var itemsContainers = [
    'cart-drawer-items',
    '#CartDrawer-CartItems',
    '.cart-drawer-items',
    '.cart-drawer__items',
    '.drawer__items',
    '.CartDrawer__Content',
    '.ajaxcart__inner',
    '[data-cart-drawer-items]',
    '.cart-drawer__content',
    '.drawer__contents',
    '.cart-items',
    '.cart__items'
  ];

  for(var i = 0; i < itemsContainers.length; i++){
    var itemsEl = document.querySelector(itemsContainers[i]);
    if(itemsEl && itemsEl.offsetParent !== null && !itemsEl.closest('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty')){
      return { element: itemsEl, method: 'append' };
    }
  }

  // PRIORITY 2: Directly before the checkout container / checkout button / drawer footer
  var checkoutContainers = [
    '.cart__ctas',
    'button[name="checkout"]',
    '#CartDrawer-Checkout',
    '.cart__checkout-button',
    '[name="checkout"]',
    'cart-drawer .drawer__footer',
    '.cart-drawer__footer',
    '[data-cart-drawer-footer]',
    '#CartDrawer .drawer__footer',
    '.drawer__inner .drawer__footer',
    '.drawer__footer',
    '.CartDrawer__Footer',
    '.ajaxcart__footer',
    '.Cart__Footer',
    '.mini-cart__footer',
    '#main-cart-footer',
    '.cart__footer',
    '.cart-footer',
    '[data-cart-footer]',
    '.cart-drawer__totals',
    '.drawer__totals',
    '.totals'
  ];

  for(var j = 0; j < checkoutContainers.length; j++){
    var checkoutEl = document.querySelector(checkoutContainers[j]);
    if(checkoutEl && checkoutEl.offsetParent !== null && !checkoutEl.closest('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty')){
      return { element: checkoutEl, method: 'before' };
    }
  }

  // PRIORITY 3: Fallback without visibility check
  for(var k = 0; k < itemsContainers.length; k++){
    var itemsEl2 = document.querySelector(itemsContainers[k]);
    if(itemsEl2 && (!itemsEl2.closest || !itemsEl2.closest('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty'))){
      return { element: itemsEl2, method: 'append' };
    }
  }

  for(var m = 0; m < checkoutContainers.length; m++){
    var checkoutEl2 = document.querySelector(checkoutContainers[m]);
    if(checkoutEl2 && (!checkoutEl2.closest || !checkoutEl2.closest('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty'))){
      return { element: checkoutEl2, method: 'before' };
    }
  }

  return null;
}

/**
 * Build HTML for a single recommendation section
 */
function buildSectionHtml(sectionData){
  var setConfig = sectionData.set;
  var products = sectionData.products;
  var num = products.length;
  var gridClass = 'ce-rec-grid-3';
  if(num === 1) gridClass = 'ce-rec-grid-1';
  else if(num === 2) gridClass = 'ce-rec-grid-2';
  else if(num >= 4) gridClass = 'ce-rec-grid-scroll';

  var cardsHtml = products.map(function(p){
    var variants = Array.isArray(p.variants) ? p.variants : [];
    var availableVariants = variants.filter(function(v){ return v.available !== false; });
    var activeVariant = availableVariants[0] || variants[0] || {};
    var variantId = activeVariant.id;

    var rawPrice = (activeVariant && activeVariant.price != null && activeVariant.price !== '')
      ? activeVariant.price
      : ((p.price != null && p.price !== '') ? p.price : (p.price_min != null ? p.price_min : 0));
    var rawCompare = (activeVariant && activeVariant.compare_at_price != null && activeVariant.compare_at_price !== '')
      ? activeVariant.compare_at_price
      : ((p.compare_at_price != null && p.compare_at_price !== '') ? p.compare_at_price : null);

    var priceCents = toCents(rawPrice);
    var compareCents = rawCompare ? toCents(rawCompare) : 0;

    var formattedPrice = formatMoney(priceCents);
    var compareHtml = '';
    if(compareCents > priceCents){
      compareHtml = '<s class="ce-rec-compare-price">' + formatMoney(compareCents) + '</s>';
    }

    var imgUrl = p.featured_image || (p.images && p.images[0]) || '';
    if(typeof imgUrl === 'object' && imgUrl.src) imgUrl = imgUrl.src;

    var variantSelectorHtml = '';
    if(variants.length > 1 && !(variants.length === 1 && variants[0].title === 'Default Title')){
      var optionsHtml = variants.map(function(v){
        var isAvail = v.available !== false;
        var vPrice = (v.price != null && v.price !== '') ? v.price : rawPrice;
        var vCompare = (v.compare_at_price != null && v.compare_at_price !== '') ? v.compare_at_price : '';
        return '<option value="' + v.id + '" data-price="' + vPrice + '" data-compare-at-price="' + vCompare + '"' + (!isAvail ? ' disabled' : '') + '>' +
          v.title + (!isAvail ? ' (Sold out)' : '') +
        '</option>';
      }).join('');

      variantSelectorHtml = (
        '<select class="ce-rec-variant-select" data-card-product-id="' + p.id + '">' +
          optionsHtml +
        '</select>'
      );
    }

    return (
      '<div class="ce-rec-card" data-product-id="' + p.id + '">' +
        '<div class="ce-rec-img-wrapper">' +
          (imgUrl ? '<img src="' + imgUrl + '" alt="' + (p.title || '') + '" class="ce-rec-img" loading="lazy" />' : '') +
        '</div>' +
        '<div class="ce-rec-info">' +
          '<h5 class="ce-rec-product-title" title="' + (p.title || '') + '">' + (p.title || '') + '</h5>' +
          '<div class="ce-rec-price-row">' +
            '<span class="ce-rec-product-price">' + formattedPrice + '</span>' +
            compareHtml +
          '</div>' +
        '</div>' +
        variantSelectorHtml +
        '<button type="button" class="ce-rec-add-btn" data-variant-id="' + variantId + '">' +
          '+ Add' +
        '</button>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="ce-recommendations-wrapper" data-set-id="' + (setConfig.id || '') + '" data-logic="' + (setConfig.logic || '') + '">' +
      '<div class="ce-rec-header">' +
        '<h4 class="ce-rec-title">' +
          '<span>✨</span>' +
          '<span>' + (setConfig.sectionTitle || 'You might also like') + '</span>' +
        '</h4>' +
      '</div>' +
      '<div class="ce-rec-grid ' + gridClass + '">' +
        cardsHtml +
      '</div>' +
    '</div>'
  );
}

/**
 * Render all enabled recommendation sections stacked vertically from top to bottom
 */
function renderAllRecommendations(sectionsData){
  // 1. Remove if no sections
  if(!sectionsData || sectionsData.length === 0){
    removeAllRecommendationWrappers();
    return;
  }

  // Filter out any section that has 0 products
  var validSections = sectionsData.filter(function(sec){
    return sec && Array.isArray(sec.products) && sec.products.length > 0;
  });

  if(validSections.length === 0){
    removeAllRecommendationWrappers();
    return;
  }

  // 2. Remove if cart is empty or not present
  var cartData = window.CartElevate && window.CartElevate.getCartData();
  var cart = cartData && cartData.cart;
  if(!cart || !Array.isArray(cart.items) || cart.items.length === 0 || (cartData && cartData.count === 0)){
    removeAllRecommendationWrappers();
    return;
  }

  // 3. Remove if drawer indicates empty state
  var emptyDrawer = document.querySelector('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty, [data-empty="true"]');
  if(emptyDrawer){
    removeAllRecommendationWrappers();
    return;
  }

  // 4. Find valid mount point
  var mount = findMountPoint();
  if(!mount || !mount.element){
    removeAllRecommendationWrappers();
    return;
  }

  var root = document.getElementById(MOUNT_ID);
  if(!root){
    root = document.createElement('div');
    root.id = MOUNT_ID;
    root.className = 'ce-recommendations-container';
  }

  if(mount.method === 'before' && mount.element.parentNode){
    if(root.nextSibling !== mount.element){
      mount.element.parentNode.insertBefore(root, mount.element);
    }
  } else {
    if(root.parentNode !== mount.element){
      mount.element.appendChild(root);
    }
  }

  root.style.display = 'flex';
  try {
    var brandAc = null;
    if(window.CartElevateBranding && typeof window.CartElevateBranding === 'object' && window.CartElevateBranding.accentColor){
      brandAc = window.CartElevateBranding.accentColor;
    } else if(window.CartElevateBranding && typeof window.CartElevateBranding === 'string'){
      var bParsed = JSON.parse(window.CartElevateBranding);
      if(bParsed && bParsed.accentColor) brandAc = bParsed.accentColor;
    }
    if(!brandAc){
      var dVal = document.documentElement.style.getPropertyValue('--ce-accent-color');
      if(dVal && dVal.trim()) brandAc = dVal.trim();
    }
    if(brandAc){
      root.style.setProperty('--ce-accent-color', brandAc);
    }
  } catch(err){ /* ignore branding extraction error */ }
  root.innerHTML = validSections.map(buildSectionHtml).join('');

  // Variant selector change delegation
  var selects = root.querySelectorAll('.ce-rec-variant-select');
  selects.forEach(function(sel){
    sel.addEventListener('change', function(){
      var card = sel.closest('.ce-rec-card');
      if(!card) return;
      var selectedOpt = sel.options[sel.selectedIndex];
      var newVid = sel.value;
      var newPrice = selectedOpt.getAttribute('data-price');
      var newCompare = selectedOpt.getAttribute('data-compare-at-price');
      var addBtn = card.querySelector('.ce-rec-add-btn');
      var priceEl = card.querySelector('.ce-rec-product-price');
      var priceRow = card.querySelector('.ce-rec-price-row');

      if(addBtn) addBtn.setAttribute('data-variant-id', newVid);
      if(priceEl && newPrice != null) {
        priceEl.innerHTML = formatMoney(newPrice);
      }
      if(priceRow) {
        var existingCompare = priceRow.querySelector('.ce-rec-compare-price');
        var newPriceCents = toCents(newPrice);
        var newCompareCents = newCompare ? toCents(newCompare) : 0;
        if(newCompareCents > newPriceCents) {
          if(existingCompare) {
            existingCompare.innerHTML = formatMoney(newCompareCents);
          } else {
            var s = document.createElement('s');
            s.className = 'ce-rec-compare-price';
            s.innerHTML = formatMoney(newCompareCents);
            priceRow.appendChild(s);
          }
        } else if(existingCompare) {
          existingCompare.remove();
        }
      }
    });
  });

  // 1-Click + Add handler
  var addBtns = root.querySelectorAll('.ce-rec-add-btn');
  addBtns.forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      var vid = btn.getAttribute('data-variant-id');
      if(!vid || btn.disabled) return;

      btn.disabled = true;
      btn.classList.add('ce-btn-loading');
      var originalText = btn.innerHTML;
      btn.innerHTML = 'Adding...';

      // Check if theme's <cart-drawer> defines sections to render (Dawn / OS 2.0)
      var cartDrawer = document.querySelector('cart-drawer');
      var sectionsToRender = ['cart-drawer', 'cart-icon-bubble'];
      if (cartDrawer && typeof cartDrawer.getSectionsToRender === 'function') {
        try {
          sectionsToRender = cartDrawer.getSectionsToRender().map(function(s) { return s.id || s.section; }).filter(Boolean);
        } catch (err) {}
      }

      var numericVid = Number(String(vid).replace(/\D/g, ''));
      if (!numericVid) {
        btn.disabled = false;
        btn.classList.remove('ce-btn-loading');
        btn.innerHTML = originalText;
        return;
      }

      fetch('/cart/add.js?ce_internal=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          id: numericVid,
          quantity: 1,
          sections: Array.isArray(sectionsToRender) ? sectionsToRender.join(',') : 'cart-drawer,cart-icon-bubble',
          sections_url: window.location.pathname
        })
      })
      .then(function(res){
        if(!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(addedData){
        btn.classList.remove('ce-btn-loading');
        btn.classList.add('ce-btn-added');
        btn.innerHTML = '✓ Added';

        // 1. Trigger live Cart Drawer HTML update and CartElevate state sync
        if(window.CartElevate && typeof window.CartElevate.refreshCartDrawer === 'function'){
          window.CartElevate.refreshCartDrawer(addedData);
        } else if(window.CartElevate && typeof window.CartElevate.fetchCount === 'function'){
          window.CartElevate.fetchCount();
        }

        // 2. Dispatch standard events for third-party/legacy themes
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
        document.dispatchEvent(new CustomEvent('cart:change', { bubbles: true }));

        setTimeout(function(){
          btn.disabled = false;
          btn.classList.remove('ce-btn-added');
          btn.innerHTML = originalText;
        }, 2500);
      })
      .catch(function(err){
        console.error('[CartElevate-Recs] Add to cart failed:', err);
        btn.disabled = false;
        btn.classList.remove('ce-btn-loading');
        btn.innerHTML = originalText;
      });
    });
  });
}

/**
 * Sequentially resolve products for all active recommendation sets, accumulating globalUsedIds for strict cross-section deduplication
 */
function resolveAllSetProducts(activeSets, anchorProductIds, cartProductIds, callback){
  if(!activeSets || activeSets.length === 0){
    callback([]);
    return;
  }

  var sectionsData = [];
  var globalUsedIds = [];
  var index = 0;

  function processNextSet(){
    if(index >= activeSets.length){
      callback(sectionsData);
      return;
    }

    var set = activeSets[index];
    var numberShown = Number(set.numberShown) || 3;

    loadExcludedCollectionProducts(set.excludeCollections, function(){
      fetchStrategyProducts(set, anchorProductIds, numberShown, cartProductIds, globalUsedIds, function(products){
        if(products && products.length > 0){
          for(var p = 0; p < products.length; p++){
            var pId = String(products[p].id).replace(/\D/g, '');
            if(pId && globalUsedIds.indexOf(pId) === -1){
              globalUsedIds.push(pId);
            }
          }
          sectionsData.push({
            set: set,
            products: products
          });
        }
        index++;
        processNextSet();
      });
    });
  }

  processNextSet();
}

var cachedSectionsData = [];
var lastRecsKey = null;
var isFetchingRecs = false;
var pendingCartUpdate = null;

/**
 * Handle cart updates from cartelevate:cart-updated
 */
function handleCartUpdate(detail){
  var cart = detail && detail.cart;

  // 1. If cart is empty or detail has count === 0: Clean up and remove everything immediately
  if(!cart || !Array.isArray(cart.items) || cart.items.length === 0 || (detail && detail.count === 0)){
    removeAllRecommendationWrappers();
    lastRecsKey = null;
    cachedSectionsData = [];
    isFetchingRecs = false;
    pendingCartUpdate = null;
    return;
  }

  // 2. Resolve all active sets sorted strictly in priority order:
  // 1. Frequently Bought Together -> 2. Same Collection -> 3. Curated Recommendations -> 4. Highest Margin Products
  var activeSets = getActiveOrderedSets(cart);
  if(!activeSets || activeSets.length === 0){
    removeAllRecommendationWrappers();
    cachedSectionsData = [];
    return;
  }

  var cartProductIds = cart.items.map(function(item){
    return item.product_id;
  }).filter(Boolean);

  var anchorProductIds = [
    cart.items[0].product_id,
    cart.items[cart.items.length - 1].product_id
  ].filter(Boolean);

  var cacheKey = activeSets.map(function(s){ return s.id; }).join('-') + '_' + anchorProductIds.join('_') + '_' + cart.items.length;

  // If cache is valid, check if any products in cached sections were added to cart
  if(cacheKey === lastRecsKey && cachedSectionsData.length > 0){
    var stillValidSections = [];
    var currentUsedIds = [];
    for(var s = 0; s < cachedSectionsData.length; s++){
      var sec = cachedSectionsData[s];
      var filteredProds = (sec.products || []).filter(function(p){
        return !isProductExcluded(p, cartProductIds, sec.set.excludeCollections, sec.set.excludedProductIds, currentUsedIds);
      });
      if(filteredProds.length > 0){
        for(var fp = 0; fp < filteredProds.length; fp++){
          var numId = String(filteredProds[fp].id).replace(/\D/g, '');
          if(numId && currentUsedIds.indexOf(numId) === -1) currentUsedIds.push(numId);
        }
        stillValidSections.push({
          set: sec.set,
          products: filteredProds
        });
      }
    }
    if(stillValidSections.length > 0){
      renderAllRecommendations(stillValidSections);
      return;
    }
  }

  // If currently fetching recommendations, queue this latest cart update
  if(isFetchingRecs){
    pendingCartUpdate = detail;
    return;
  }
  isFetchingRecs = true;

  resolveAllSetProducts(activeSets, anchorProductIds, cartProductIds, function(sectionsData){
    isFetchingRecs = false;
    lastRecsKey = cacheKey;
    cachedSectionsData = sectionsData;

    // If another cart update arrived during the fetch (e.g. user added another item):
    if(pendingCartUpdate){
      var nextDetail = pendingCartUpdate;
      pendingCartUpdate = null;
      handleCartUpdate(nextDetail);
      return;
    }

    renderAllRecommendations(sectionsData);
  });
}

// 1. Listen to shared cart update event
document.addEventListener('cartelevate:cart-updated', function(e){
  handleCartUpdate(e.detail);
});

// 2. Observe cart drawer DOM to ensure recommendations persist across theme dynamic redraws
function setupDrawerObserver(){
  if(recObserver) return;
  recObserver = new MutationObserver(function(){
    var cartData = window.CartElevate && window.CartElevate.getCartData();
    var cart = cartData && cartData.cart;

    // 1. If cart is empty or missing, remove recommendations and clear cache
    if(!cart || !Array.isArray(cart.items) || cart.items.length === 0 || (cartData && cartData.count === 0)){
      removeAllRecommendationWrappers();
      cachedSectionsData = [];
      return;
    }

    // 2. If drawer has empty state: remove everything and stop
    var emptyDrawer = document.querySelector('cart-drawer.is-empty, .cart-drawer.is-empty, .drawer.is-empty, .drawer__inner-empty, .cart--empty, [data-empty="true"]');
    if(emptyDrawer){
      removeAllRecommendationWrappers();
      return;
    }

    // 3. Only if cart has items, drawer is not empty, and recommendations root was wiped by theme redraw:
    var root = document.getElementById(MOUNT_ID);
    if(!root && cachedSectionsData.length > 0){
      var mount = findMountPoint();
      if(mount && mount.element) {
        renderAllRecommendations(cachedSectionsData);
      }
    }
  });

  recObserver.observe(document.body, { childList: true, subtree: true });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', setupDrawerObserver);
} else {
  setupDrawerObserver();
}

// Global export
window.CartElevateRecommendationsFeature = {
  render: renderAllRecommendations,
  handleCartUpdate: handleCartUpdate,
  getActiveOrderedSets: getActiveOrderedSets,
  resolveWinningSet: resolveWinningSet,
  getAllSets: getAllSets
};

})();
