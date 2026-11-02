import React, { useState, useMemo } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getProtectionWrappingConfig,
  saveProtectionWrappingConfig,
} from "../services/protection-wrapping.server";

const DEFAULT_CONFIG = {
  protection: {
    enabled: true,
    
    priceType: "percentage",
    percentage: 2,
    flatFee: 1.99,
    description: "Protect your order from loss or damage",
  },
  giftWrapping: {
    enabled: true,
    applies: "per_order",
    price: 4.0,
    allowGiftNote: true,
    description: "Add gift wrapping",
  },
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const config = await getProtectionWrappingConfig(admin);

  return {
    shop,
    config,
    currencySymbol: config.currency === "EUR" ? "€" : config.currency === "GBP" ? "£" : "$",
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const protectionEnabled = formData.get("protectionEnabled") === "true";
  const protectionPriceType = formData.get("protectionPriceType") === "flat" ? "flat" : "percentage";
  const protectionPercentage = parseFloat(formData.get("protectionPercentage")) || 2;
  const protectionFlatFee = parseFloat(formData.get("protectionFlatFee")) || 1.99;
  const protectionDescription =
    formData.get("protectionDescription") || "Protect your order from loss or damage";

  const giftWrappingEnabled = formData.get("giftWrappingEnabled") === "true";
  const giftWrappingApplies = formData.get("giftWrappingApplies") === "per_item" ? "per_item" : "per_order";
  const giftWrappingPrice = parseFloat(formData.get("giftWrappingPrice")) || 4.0;
  const giftWrappingAllowNote = formData.get("giftWrappingAllowNote") === "true";

  const configToSave = {
    protection: {
      enabled: protectionEnabled,
      priceType: protectionPriceType,
      percentage: protectionPercentage,
      flatFee: protectionFlatFee,
      description: protectionDescription,
    },
    giftWrapping: {
      enabled: giftWrappingEnabled,
      applies: giftWrappingApplies,
      price: giftWrappingPrice,
      allowGiftNote: giftWrappingAllowNote,
      description: "Add gift wrapping",
    },
  };

  const result = await saveProtectionWrappingConfig({ admin, session, config: configToSave });

  return Response.json(result);
};

export default function ProtectionAndWrappingPage() {
  const { config, currencySymbol } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Package Protection state
  const [protectionEnabled, setProtectionEnabled] = useState(
    config.protection?.enabled ?? DEFAULT_CONFIG.protection.enabled
  );
  const [protectionPriceType, setProtectionPriceType] = useState(
    config.protection?.priceType ?? DEFAULT_CONFIG.protection.priceType
  );
  const [protectionPercentage, setProtectionPercentage] = useState(
    config.protection?.percentage ?? DEFAULT_CONFIG.protection.percentage
  );
  const [protectionFlatFee, setProtectionFlatFee] = useState(
    config.protection?.flatFee ?? DEFAULT_CONFIG.protection.flatFee
  );
  const [protectionDescription, setProtectionDescription] = useState(
    config.protection?.description ?? DEFAULT_CONFIG.protection.description
  );

  // Gift Wrapping state
  const [giftWrappingEnabled, setGiftWrappingEnabled] = useState(
    config.giftWrapping?.enabled ?? DEFAULT_CONFIG.giftWrapping.enabled
  );
  const [giftWrappingApplies, setGiftWrappingApplies] = useState(
    config.giftWrapping?.applies ?? DEFAULT_CONFIG.giftWrapping.applies
  );
  const [giftWrappingPrice, setGiftWrappingPrice] = useState(
    config.giftWrapping?.price ?? DEFAULT_CONFIG.giftWrapping.price
  );
  const [giftWrappingAllowNote, setGiftWrappingAllowNote] = useState(
    config.giftWrapping?.allowGiftNote ?? DEFAULT_CONFIG.giftWrapping.allowGiftNote
  );

  // Interactive Live Preview State
  const [previewProtectionChecked, setPreviewProtectionChecked] = useState(true);
  const [previewGiftWrappingChecked, setPreviewGiftWrappingChecked] = useState(false);
  const [previewGiftNote, setPreviewGiftNote] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";
  const saveSuccess = fetcher.data?.success;

  // Mock product in preview ($14.00 Ceramic mug matching screenshot)
  const previewProductPrice = 14.0;

  // Dynamic calculated protection price
  const calculatedProtectionPrice = useMemo(() => {
    if (protectionPriceType === "flat") {
      return Number(protectionFlatFee || 0).toFixed(2);
    }
    const pct = Number(protectionPercentage || 0);
    return ((previewProductPrice * pct) / 100).toFixed(2);
  }, [protectionPriceType, protectionFlatFee, protectionPercentage, previewProductPrice]);

  const handleSave = () => {
    const fd = new FormData();
    fd.append("protectionEnabled", String(protectionEnabled));
    fd.append("protectionPriceType", protectionPriceType);
    fd.append("protectionPercentage", String(protectionPercentage));
    fd.append("protectionFlatFee", String(protectionFlatFee));
    fd.append("protectionDescription", protectionDescription);

    fd.append("giftWrappingEnabled", String(giftWrappingEnabled));
    fd.append("giftWrappingApplies", giftWrappingApplies);
    fd.append("giftWrappingPrice", String(giftWrappingPrice));
    fd.append("giftWrappingAllowNote", String(giftWrappingAllowNote));

    fetcher.submit(fd, { method: "post" });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 pb-16">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-8 pt-8">
       <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-950 transition group cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-50 transition">
              ←
            </span>
            <span>Back to dashboard</span>
          </button>
        </div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">
            Protection and wrapping
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Offer package protection and gift wrapping options in your cart drawer.
          </p>
        </div>

        {/* Success Toast / Notification */}
        {saveSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between text-emerald-800 text-sm font-medium animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                ✓
              </span>
              <span>Settings saved successfully! Cart drawer add-ons updated.</span>
            </div>
            <button
              type="button"
              onClick={() => fetcher.data = null}
              className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ================= LEFT COLUMN: SETTINGS (col-span-7) ================= */}
          <div className="lg:col-span-7 space-y-6">
            {/* CARD 1: PACKAGE PROTECTION */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-5">
              {/* Card Header & Switch */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShieldIcon className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-bold text-slate-950">Package protection</h2>
                </div>

                {/* Coral Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={protectionEnabled}
                  onClick={() => setProtectionEnabled(!protectionEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    protectionEnabled ? "bg-[#F95738]" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      protectionEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Price Type Segmented Tabs */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Price</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setProtectionPriceType("percentage")}
                    className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                      protectionPriceType === "percentage"
                        ? "bg-[#FFF1ED] text-[#F95738] border-[#FDDCD3] shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    % of order
                  </button>
                  <button
                    type="button"
                    onClick={() => setProtectionPriceType("flat")}
                    className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                      protectionPriceType === "flat"
                        ? "bg-[#FFF1ED] text-[#F95738] border-[#FDDCD3] shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Flat fee
                  </button>
                </div>
              </div>

              {/* Price Value Input */}
              <div>
                {protectionPriceType === "percentage" ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={protectionPercentage}
                      onChange={(e) => setProtectionPercentage(e.target.value)}
                      className="w-24 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-1 focus:ring-[#F95738]"
                    />
                    <span className="text-xs sm:text-sm text-slate-600 font-normal">
                      % of cart subtotal
                    </span>
                  </div>
                ) : (
                  <div className="relative w-36">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={protectionFlatFee}
                      onChange={(e) => setProtectionFlatFee(e.target.value)}
                      className="w-full pl-8 pr-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-1 focus:ring-[#F95738]"
                    />
                  </div>
                )}
              </div>

              {/* Customer Facing Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Description shown to customer
                </label>
                <input
                  type="text"
                  value={protectionDescription}
                  onChange={(e) => setProtectionDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-1 focus:ring-[#F95738]"
                  placeholder="Protect your order from loss or damage"
                />
              </div>
            </div>

            {/* CARD 2: GIFT WRAPPING */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-5">
              {/* Card Header & Switch */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <GiftBoxIcon className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-bold text-slate-950">Gift wrapping</h2>
                </div>

                {/* Coral Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={giftWrappingEnabled}
                  onClick={() => setGiftWrappingEnabled(!giftWrappingEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    giftWrappingEnabled ? "bg-[#F95738]" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      giftWrappingEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Applies Selector Segmented Tabs */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Applies</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGiftWrappingApplies("per_order")}
                    className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                      giftWrappingApplies === "per_order"
                        ? "bg-[#FFF1ED] text-[#F95738] border-[#FDDCD3] shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Per order
                  </button>
                  <button
                    type="button"
                    onClick={() => setGiftWrappingApplies("per_item")}
                    className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                      giftWrappingApplies === "per_item"
                        ? "bg-[#FFF1ED] text-[#F95738] border-[#FDDCD3] shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Per item
                  </button>
                </div>
              </div>

              {/* Price Input */}
              <div className="relative w-36">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={giftWrappingPrice}
                  onChange={(e) => setGiftWrappingPrice(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-1 focus:ring-[#F95738]"
                />
              </div>

              {/* Gift Note Field Checkbox */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-medium text-slate-600">Gift note field</label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={giftWrappingAllowNote}
                    onChange={(e) => setGiftWrappingAllowNote(e.target.checked)}
                    className="w-4 h-4 rounded text-[#F95738] focus:ring-[#F95738] border-slate-300"
                  />
                  <span className="text-xs sm:text-sm text-slate-700 font-medium">
                    Let customer add a note
                  </span>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 bg-[#F95738] hover:bg-[#EA3E1E] disabled:bg-slate-300 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition shadow-sm hover:shadow active:scale-98"
              >
                <span>{isSaving ? "Saving..." : "Save changes"}</span>
                <span className="text-base font-bold leading-none">→</span>
              </button>

              <button
                type="button"
                onClick={() => navigate("/app")}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm transition shadow-2xs"
              >
                Back
              </button>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: LIVE CART PREVIEW (col-span-5) ================= */}
          <div className="lg:col-span-5 sticky top-6">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              {/* Top Hint Bar */}
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                <span>Interactive cart drawer preview</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live update
                </span>
              </div>

              {/* Mock Cart Drawer */}
              <div className="rounded-2xl border border-slate-200/90 overflow-hidden shadow-md bg-white">
                {/* Red/Coral Cart Drawer Header */}
                <div className="bg-[#F95738] px-4 py-3.5 flex items-center justify-between text-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white text-[#F95738] flex items-center justify-center shadow-xs">
                      <CartMiniIcon className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm sm:text-base tracking-tight">Your cart (1)</span>
                  </div>
                  <button
                    type="button"
                    className="text-white/80 hover:text-white transition p-1"
                    title="Close"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Cart Body */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Product Item Row */}
                  <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
                    <div className="w-16 h-16 rounded-xl bg-[#F8FAFC] border border-slate-100 flex items-center justify-center p-2 shrink-0">
                      <CeramicMugIllustration className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 truncate">Ceramic mug</h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {currencySymbol}14.00
                      </p>
                    </div>
                  </div>

                  {/* Add-ons Section */}
                  <div className="space-y-2.5">
                    {/* Checkbox 1: Protection */}
                    {protectionEnabled && (
                      <div className="flex items-start justify-between gap-2 p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={previewProtectionChecked}
                            onChange={(e) => setPreviewProtectionChecked(e.target.checked)}
                            className="w-4 h-4 rounded text-[#0066FF] focus:ring-[#0066FF] border-slate-300"
                          />
                          <ShieldIcon className="w-4 h-4 text-slate-700 shrink-0" />
                          <span className="text-xs sm:text-sm font-medium text-slate-800 truncate">
                            Protect your order ({currencySymbol}{calculatedProtectionPrice})
                          </span>
                        </label>

                        {/* Info icon with tooltip */}
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowTooltip(!showTooltip)}
                            onMouseEnter={() => setShowTooltip(true)}
                            onMouseLeave={() => setShowTooltip(false)}
                            className="text-slate-400 hover:text-slate-700 text-xs px-1"
                            title="Information"
                          >
                            ⓘ
                          </button>
                          {showTooltip && (
                            <div className="absolute right-0 bottom-full mb-1.5 w-48 p-2 rounded-lg bg-slate-900 text-white text-[11px] leading-tight shadow-lg z-20 pointer-events-none animate-fadeIn">
                              {protectionDescription || "Protect your order from loss or damage"}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Checkbox 2: Gift wrapping */}
                    {giftWrappingEnabled && (
                      <div className="space-y-2 p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={previewGiftWrappingChecked}
                            onChange={(e) => setPreviewGiftWrappingChecked(e.target.checked)}
                            className="w-4 h-4 rounded text-[#0066FF] focus:ring-[#0066FF] border-slate-300"
                          />
                          <GiftBoxIcon className="w-4 h-4 text-slate-700 shrink-0" />
                          <span className="text-xs sm:text-sm font-medium text-slate-800">
                            Add gift wrapping ({currencySymbol}{Number(giftWrappingPrice || 0).toFixed(2)}{giftWrappingApplies === "per_item" ? "/item" : ""})
                          </span>
                        </label>

                        {/* Gift Note Textarea (if checked and enabled) */}
                        {giftWrappingAllowNote && previewGiftWrappingChecked && (
                          <div className="pt-1.5 pl-6">
                            <textarea
                              rows={2}
                              value={previewGiftNote}
                              onChange={(e) => setPreviewGiftNote(e.target.value)}
                              placeholder="Add a gift note for the recipient..."
                              className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-[#F95738] bg-white"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Drawer Footer / Checkout Button */}
                  <div className="pt-3">
                    <button
                      type="button"
                      className="w-full py-3 rounded-xl bg-[#FFF1ED] hover:bg-[#FDDCD3] text-[#F95738] font-bold text-xs sm:text-sm transition shadow-2xs"
                    >
                      Checkout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Custom SVG Icons matching user screenshot ================= */

function ShieldIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function GiftBoxIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function CartMiniIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="21" r="1.5" />
      <circle cx="19" cy="21" r="1.5" />
      <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
    </svg>
  );
}

function CloseIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CeramicMugIllustration({ className = "w-8 h-8" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="mugGradient" x1="12" y1="14" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.65" stopColor="#F3F4F6" />
          <stop offset="1" stopColor="#E5E7EB" />
        </linearGradient>
      </defs>
      {/* Mug Body */}
      <rect x="12" y="14" width="20" height="22" rx="4" fill="url(#mugGradient)" stroke="#CBD5E1" strokeWidth="1.5" />
      {/* Handle */}
      <path
        d="M32 18 C38 18 38 30 32 30"
        fill="none"
        stroke="#CBD5E1"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Inner mug rim */}
      <ellipse cx="22" cy="15" rx="8" ry="2" fill="#E2E8F0" />
      <ellipse cx="22" cy="15" rx="6.5" ry="1.2" fill="#92400E" />
    </svg>
  );
}
