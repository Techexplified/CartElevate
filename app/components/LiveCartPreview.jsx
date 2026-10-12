import React, { useState, useMemo } from "react";

export default function LiveCartPreview({ branding }) {
  const accentColor = branding?.accentColor || "#F95738";
  const logoUrl = branding?.logoUrl || "";
  const drawerPosition = branding?.drawerPosition || "right";

  const [viewMode, setViewMode] = useState("desktop"); // "desktop" | "mobile"
  const [isOpen, setIsOpen] = useState(true);

  // Cart items state
  const [cartItems, setCartItems] = useState([
    {
      id: "mug",
      name: "Ceramic mug",
      price: 14.0,
      quantity: 1,
      imageType: "mug",
    },
    {
      id: "tote",
      name: "Tote bag",
      price: 22.0,
      quantity: 1,
      discountText: "Buy 1 more, save 15%",
      discountAmount: 3.28, // Matches the exact $36.72 subtotal in screenshot
      imageType: "tote",
    },
  ]);

  // Upsell recommendations
  const [upsells, setUpsells] = useState([
    { id: "coaster", name: "Cork coaster", price: 8.0, imageType: "coaster" },
    { id: "towel", name: "Tea towel", price: 11.0, imageType: "towel" },
    { id: "trivet", name: "Trivet", price: 16.0, imageType: "trivet" },
  ]);

  // Add-ons
  const [protectOrder, setProtectOrder] = useState(false);
  const [giftWrapping, setGiftWrapping] = useState(true);

  const shippingThreshold = 60.0;

  // Calculate Subtotal dynamically
  const subtotal = useMemo(() => {
    let itemsTotal = cartItems.reduce((acc, item) => {
      const discount = item.discountAmount || 0;
      return acc + item.price * item.quantity - discount;
    }, 0);

    if (protectOrder) itemsTotal += 0.72;
    if (giftWrapping) itemsTotal += 4.0;

    return Math.max(0, itemsTotal);
  }, [cartItems, protectOrder, giftWrapping]);

  const totalQuantity = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const amountRemainingForFreeShipping = Math.max(0, shippingThreshold - subtotal);
  const shippingProgressPct = Math.min(100, Math.round((subtotal / shippingThreshold) * 100));

  const updateQuantity = (id, delta) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean),
    );
  };

  const addUpsell = (product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with View Switcher */}
      <div className="flex items-center justify-between gap-2 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Live preview</h2>
          <p className="text-xs text-slate-500">See how your cart looks to your customers.</p>
        </div>

        {/* Device Switcher Toggle */}
        <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setViewMode("desktop")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "desktop"
                ? "bg-[#18181B] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("mobile")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "mobile"
                ? "bg-[#18181B] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
            </svg>
            <span>Mobile</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container Canvas */}
      <div className="relative flex-1 min-h-[580px] bg-gradient-to-b from-slate-200 to-slate-300 rounded-3xl p-3 sm:p-4 overflow-hidden border border-slate-300/80 flex items-center justify-center shadow-inner">
        {/* Mock Store Background Backdrop */}
        <div className="absolute inset-0 bg-[#E2E8F0]/40 backdrop-blur-[1px] pointer-events-none" />

        {/* Ambient store background graphics */}
        <div className="absolute inset-0 p-6 opacity-35 pointer-events-none select-none">
          <div className="w-full h-10 border-b border-slate-400 flex items-center justify-between pb-2">
            <div className="w-5 h-4 flex flex-col justify-between">
              <div className="w-full h-0.5 bg-slate-500 rounded" />
              <div className="w-full h-0.5 bg-slate-500 rounded" />
              <div className="w-full h-0.5 bg-slate-500 rounded" />
            </div>
            <div className="w-20 h-4 bg-slate-400/60 rounded" />
            <div className="w-6 h-6 rounded-full bg-slate-400/60" />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="h-44 bg-slate-400/30 rounded-xl" />
            <div className="h-44 bg-slate-400/30 rounded-xl" />
          </div>
        </div>

        {/* Cart Drawer Wrapper - Desktop or Mobile Frame */}
        <div
          className={`relative z-10 transition-all duration-300 ease-out flex ${
            viewMode === "mobile"
              ? "w-[340px] max-w-full rounded-[38px] p-2 bg-[#18181B] shadow-2xl border-4 border-slate-800"
              : drawerPosition === "left"
              ? "w-full max-w-[390px] mr-auto"
              : "w-full max-w-[390px] ml-auto"
          }`}
        >
          {/* Mobile Speaker Notch */}
          {viewMode === "mobile" && (
            <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-30" />
          )}

          {/* Drawer Paper Body */}
          <div className="w-full bg-white rounded-2xl sm:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-slate-200/90 flex flex-col max-h-[640px] overflow-hidden">
            {/* 1. Drawer Header */}
            <div
              style={{ backgroundColor: accentColor }}
              className="flex items-center justify-between px-4 py-3.5 text-white transition-colors duration-200"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Left side of 'Your cart': By default shows cart icon (not logo); when logo provided, shows logo directly without background */}
                {logoUrl ? (
                  <div className="h-7 max-w-[100px] flex items-center justify-center shrink-0">
                    <img
                      src={logoUrl}
                      alt="Store logo"
                      className="h-auto max-h-7 w-auto max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-xs shrink-0">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={accentColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <circle cx="8" cy="21" r="1.5" />
                      <circle cx="19" cy="21" r="1.5" />
                      <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                    </svg>
                  </div>
                )}
                <h3 className="text-sm font-extrabold text-white tracking-tight truncate">
                  Your Cart ({totalQuantity})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-6 h-6 rounded-full text-white/90 hover:text-white flex items-center justify-center text-sm font-bold transition hover:bg-white/10 cursor-pointer shrink-0 ml-2"
                aria-label="Close cart"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Drawer Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-thin">
              {/* 2. Free Shipping Progress Bar */}
              <div className="bg-[#FFF4F0] border border-[#FDDCD3]/70 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: accentColor }}>
                  <span className="text-sm">🚚</span>
                  <span>
                    {amountRemainingForFreeShipping > 0
                      ? `Add $${amountRemainingForFreeShipping.toFixed(2)} more for free shipping`
                      : "🎉 You've unlocked Free Shipping!"}
                  </span>
                </div>
                {/* Progress bar track */}
                <div className="w-full h-1.5 bg-white/90 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${shippingProgressPct}%`, backgroundColor: accentColor }}
                  />
                </div>
              </div>

              {/* 3. Cart Items List */}
              <div className="space-y-2.5">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-xl bg-slate-50/70 border border-slate-100/90"
                  >
                    {/* Item Thumbnail */}
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                      {item.imageType === "mug" && <MugIllustration />}
                      {item.imageType === "tote" && <ToteIllustration />}
                      {item.imageType === "coaster" && <CoasterIllustration />}
                      {item.imageType === "towel" && <TowelIllustration />}
                      {item.imageType === "trivet" && <TrivetIllustration />}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                      <p className="text-xs font-semibold text-slate-700 mt-0.5">
                        ${item.price.toFixed(2)}
                      </p>
                      {item.discountText && (
                        <span className="text-[10px] font-bold text-[#F95738] block leading-none mt-0.5">
                          {item.discountText}
                        </span>
                      )}
                    </div>

                    {/* Quantity & Delete Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center border border-slate-200 bg-white rounded-lg px-1.5 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, -1)}
                          className="px-1 text-slate-400 hover:text-slate-900"
                        >
                          -
                        </button>
                        <span className="px-1.5 text-[11px] font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 1)}
                          className="px-1 text-slate-400 hover:text-slate-900"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -item.quantity)}
                        className="text-slate-300 hover:text-rose-500 transition p-1"
                        title="Remove item"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-3.5 h-3.5"
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 4. "You might also like" Recommendations */}
              <div className="pt-1">
                <h4 className="text-xs font-bold text-slate-900 mb-2">You might also like</h4>
                <div className="grid grid-cols-3 gap-2">
                  {upsells.map((upsell) => (
                    <div
                      key={upsell.id}
                      className="flex flex-col items-center text-center p-2 rounded-xl bg-slate-50 border border-slate-100/80 hover:border-slate-200 transition"
                    >
                      {/* Upsell Mini Thumbnail */}
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200/70 flex items-center justify-center mb-1.5 shadow-2xs overflow-hidden">
                        {upsell.imageType === "coaster" && <CoasterIllustration />}
                        {upsell.imageType === "towel" && <TowelIllustration />}
                        {upsell.imageType === "trivet" && <TrivetIllustration />}
                      </div>

                      <div className="text-[10px] font-bold text-slate-800 truncate w-full">
                        {upsell.name}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        ${upsell.price.toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => addUpsell(upsell)}
                        className="mt-1.5 w-full py-0.5 rounded-md bg-white hover:bg-[#18181B] text-slate-800 hover:text-white border border-slate-200 hover:border-[#18181B] text-[10px] font-bold transition shadow-2xs"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Add-on Services Checkboxes */}
              <div className="space-y-1.5 pt-1">
                {/* Protection toggle */}
                <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 cursor-pointer transition select-none">
                  <input
                    type="checkbox"
                    checked={protectOrder}
                    onChange={(e) => setProtectOrder(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-[#F95738] focus:ring-[#F95738] border-slate-300"
                  />
                  <span className="text-xs text-slate-500">🛡</span>
                  <span className="text-[11px] font-medium text-slate-700">
                    Protect your order ($0.72)
                  </span>
                </label>

                {/* Gift wrapping toggle */}
                <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 cursor-pointer transition select-none">
                  <input
                    type="checkbox"
                    checked={giftWrapping}
                    onChange={(e) => setGiftWrapping(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-[#F95738] focus:ring-[#F95738] border-slate-300"
                  />
                  <span className="text-xs text-slate-500">🎁</span>
                  <span className="text-[11px] font-medium text-slate-700">
                    Add gift wrapping ($4.00)
                  </span>
                </label>
              </div>
            </div>

            {/* 6. Drawer Footer (Subtotal & Checkout CTA) */}
            <div className="p-3.5 bg-white border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">Subtotal</span>
                <span className="text-sm font-extrabold text-slate-900">${subtotal.toFixed(2)}</span>
              </div>

              <button
                type="button"
                className="w-full bg-[#18181B] hover:bg-black text-white text-xs font-bold py-2.5 rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5"
              >
                <span>Continue to checkout</span>
                <span>→</span>
              </button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition"
                >
                  Save cart for later
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Custom Realistic SVG Illustrations ================= */

function MugIllustration() {
  return (
    <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mugGrad" x1="10" y1="12" x2="28" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#F1F5F9" />
          <stop offset="1" stopColor="#CBD5E1" />
        </linearGradient>
      </defs>
      {/* Mug Body */}
      <rect x="11" y="13" width="16" height="18" rx="4" fill="url(#mugGrad)" stroke="#94A3B8" strokeWidth="1" />
      {/* Handle */}
      <path
        d="M27 16 C32 16 32 26 27 26"
        fill="none"
        stroke="#94A3B8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Coffee inside */}
      <ellipse cx="19" cy="14" rx="6.5" ry="1.5" fill="#78350F" />
    </svg>
  );
}

function ToteIllustration() {
  return (
    <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="toteGrad" x1="10" y1="16" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE68A" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
      </defs>
      {/* Straps */}
      <path d="M15 17 V9 C15 7 25 7 25 9 V17" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" />
      {/* Bag Body */}
      <path
        d="M11 17 H29 L27 34 H13 L11 17 Z"
        fill="url(#toteGrad)"
        stroke="#B45309"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoasterIllustration() {
  return (
    <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="corkGrad" cx="35%" cy="35%" r="65%">
          <stop stopColor="#E2B170" />
          <stop offset="1" stopColor="#B47836" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="14" fill="url(#corkGrad)" stroke="#9A6126" strokeWidth="1" />
      <circle cx="16" cy="17" r="1" fill="#884C1C" opacity="0.6" />
      <circle cx="24" cy="22" r="1.2" fill="#884C1C" opacity="0.6" />
      <circle cx="18" cy="25" r="0.8" fill="#884C1C" opacity="0.5" />
    </svg>
  );
}

function TowelIllustration() {
  return (
    <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="13" y="10" width="14" height="20" rx="2" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.2" />
      <line x1="16" y1="10" x2="16" y2="30" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="24" y1="10" x2="24" y2="30" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

function TrivetIllustration() {
  return (
    <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="11" y="11" width="18" height="18" rx="2" fill="#FBBF24" opacity="0.2" />
      <rect x="11" y="11" width="18" height="18" rx="2" stroke="#D97706" strokeWidth="1.5" />
      <line x1="17" y1="11" x2="17" y2="29" stroke="#D97706" strokeWidth="1.2" />
      <line x1="23" y1="11" x2="23" y2="29" stroke="#D97706" strokeWidth="1.2" />
      <line x1="11" y1="17" x2="29" y2="17" stroke="#D97706" strokeWidth="1.2" />
      <line x1="11" y1="23" x2="29" y2="23" stroke="#D97706" strokeWidth="1.2" />
    </svg>
  );
}
