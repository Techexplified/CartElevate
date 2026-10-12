/* CartElevate — Storefront Cart Drawer Branding v3 */
(function(){
'use strict';
var count=typeof window.CartElevateItemCount==='number'?window.CartElevateItemCount:0;
var applying=false;
var HS=['cart-drawer .drawer__header','.drawer__header','.cart-drawer__header','.CartDrawer__Header','[data-cart-drawer-header]','.drawer-header','.js-drawer-header'];
var IS=['cart-drawer-items','.drawer__contents','.cart-drawer__content','.drawer__cart-items-wrapper','#CartDrawer-CartItems','.cart-items'];

function parse(r){
  if(!r)return null;
  if(typeof r==='string'){try{r=JSON.parse(r);}catch(e){}}
  if(typeof r==='string'){try{r=JSON.parse(r);}catch(e){}}
  return(r&&typeof r==='object')?r:null;
}
function getBranding(){
  return parse(window.CartElevateBranding)||{accentColor:'#F95738',logoUrl:'',cartTitle:'Your Cart',drawerPosition:'right'};
}

function iconSvg(c){
  return'<svg viewBox="0 0 24 24" fill="none" stroke="'+c+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5"/></svg>';
}

function fetchCount(cb){
  fetch('/cart.js').then(function(r){return r.json();}).then(function(c){
    if(c&&typeof c.item_count==='number'){count=c.item_count;if(cb)cb();}
  }).catch(function(){if(cb)cb();});
}

function styleHeaders(br){
  if(applying)return;
  applying=true;
  try{
    var ac=(br&&br.accentColor)||'#F95738';
    var logo=(br&&br.logoUrl)||'';
    var titleBase=(br&&br.cartTitle)||'Your Cart';
    var tx=titleBase+' ('+count+')';
    var bt=logo?'logo':'cart';

    HS.forEach(function(hs){
      document.querySelectorAll(hs).forEach(function(h){
        if(!h.classList.contains('ce-branded-header'))h.classList.add('ce-branded-header');
        h.style.setProperty('background-color',ac,'important');
        h.style.setProperty('margin-bottom','18px','important');
        h.style.setProperty('position','relative','important');
        h.style.setProperty('z-index','10','important');

        var dp=h.closest('cart-drawer, .drawer__inner, .cart-drawer');
        if(dp){IS.forEach(function(s){var el=dp.querySelector(s);if(el){el.style.setProperty('margin-top','10px','important');el.style.setProperty('padding-top','6px','important');el.style.setProperty('position','relative','important');el.style.setProperty('z-index','1','important');}});}

        var t=h.querySelector('.drawer__heading, [class*="heading"], [class*="title"], h1, h2, h3, h4');
        if(!t)return;

        var ew=t.querySelector('#ce-title-wrapper');
        var et=t.querySelector('.ce-heading-text');
        var eb=t.querySelector('#ce-header-badge');

        if(ew&&eb&&eb.getAttribute('data-type')===bt&&et&&et.textContent===tx)return;

        t.innerHTML='';
        t.style.setProperty('display','inline-flex','important');
        t.style.setProperty('align-items','center','important');

        var w=document.createElement('div');
        w.id='ce-title-wrapper';
        w.style.display='inline-flex';
        w.style.alignItems='center';

        var b=document.createElement('div');
        b.id='ce-header-badge';
        b.setAttribute('data-type',bt);

        if(logo){
          b.className='ce-header-badge ce-logo-badge';
          var img=document.createElement('img');
          img.src=logo;img.alt='Logo';
          img.onerror=function(){
            b.className='ce-header-badge ce-cart-icon-badge';
            b.innerHTML=iconSvg(ac);
          };
          b.appendChild(img);
        }else{
          b.className='ce-header-badge ce-cart-icon-badge';
          b.innerHTML=iconSvg(ac);
        }
        w.appendChild(b);

        var sp=document.createElement('span');
        sp.className='ce-heading-text';
        sp.textContent=tx;
        w.appendChild(sp);
        t.appendChild(w);
      });
    });
  }catch(e){console.error('[CE]',e);}finally{applying=false;}
}

function applyBranding(br){
  if(!br)return;
  var ac=br.accentColor||'#F95738';
  var pos=br.drawerPosition||'right';
  document.documentElement.style.setProperty('--ce-accent-color',ac);
  if(pos==='left'){document.body.classList.add('ce-drawer-left');}else{document.body.classList.remove('ce-drawer-left');}
  styleHeaders(br);
}

function run(){
  var br=getBranding();
  applyBranding(br);
  fetchCount(function(){applyBranding(getBranding());});
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run);}else{run();}

var obs=new MutationObserver(function(){
  applyBranding(getBranding());
});
obs.observe(document.body,{childList:true,subtree:true});

['cart:updated','cart:refresh','sections:rendered'].forEach(function(ev){
  document.addEventListener(ev,function(){
    fetchCount(function(){applyBranding(getBranding());});
  });
});

// Extra triggers when user clicks any cart button
document.addEventListener('click',function(e){
  var btn=e.target&&e.target.closest('a[href*="/cart"], button[aria-controls*="CartDrawer"], [data-cart-drawer-trigger], .header__icon--cart');
  if(btn){
    setTimeout(run,60);
    setTimeout(run,250);
  }
},true);
})();
