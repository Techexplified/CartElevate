/* global process */
import React, { useState, useMemo } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { syncPostPurchaseAutomaticDiscount } from "../services/discount.server";

const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  INR: "₹",
  JPY: "¥",
  CNY: "¥",
  AED: "AED ",
  BRL: "R$",
  CHF: "CHF ",
  DKK: "kr ",
  HKD: "HK$",
  MXN: "MX$",
  NOK: "kr ",
  NZD: "NZ$",
  PLN: "zł ",
  SEK: "kr ",
  SGD: "S$",
  THB: "฿",
  TRY: "₺",
  ZAR: "R ",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let existingOffer = null;
  let products = [];
  let currencySymbol = "$";
  let accentColor = "#F95738";

  try {
    // 1. Fetch currency and shop information
    const shopQuery = await admin.graphql(`
      query GetShopInfo {
        shop {
          id
          currencyCode
          currencyFormats {
            moneyFormat
          }
          metafield(namespace: "cartelevate", key: "post_purchase") {
            value
          }
          brandingMetafield: metafield(namespace: "cartelevate", key: "branding") {
            value
          }
        }
      }
    `);
    const shopJson = await shopQuery.json();
    const shopData = shopJson?.data?.shop;

    const rawBranding = shopData?.brandingMetafield?.value;
    if (rawBranding) {
      try {
        let bParsed = typeof rawBranding === "string" ? JSON.parse(rawBranding) : rawBranding;
        if (typeof bParsed === "string") bParsed = JSON.parse(bParsed);
        if (bParsed?.accentColor) accentColor = bParsed.accentColor;
      } catch (e) {
        /* ignore */
      }
    }

    const currencyCode = shopData?.currencyCode || "USD";
    if (CURRENCY_SYMBOLS[currencyCode.toUpperCase()]) {
      currencySymbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()];
    } else if (shopData?.currencyFormats?.moneyFormat) {
      const clean = shopData.currencyFormats.moneyFormat
        .replace(/<[^>]*>/g, "")
        .replace(/\{\{.*?\}\}/g, "")
        .replace(/\{.*?\}/g, "")
        .trim();
      if (clean) currencySymbol = clean;
    }

    const url = new URL(request.url);
    const editId = url.searchParams.get("id");

    const rawVal = shopData?.metafield?.value;
    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      const offers = Array.isArray(parsed?.offers) ? parsed.offers : [];
      if (editId) {
        existingOffer = offers.find((o) => o.id === editId) || null;
      }
    }

    // 2. Fetch available store products for selection
    const prodRes = await admin.graphql(`
      query GetProducts {
        products(first: 100, sortKey: TITLE) {
          nodes {
            id
            title
            featuredImage {
              url
            }
            variants(first: 1) {
              nodes {
                id
                price
              }
            }
          }
        }
      }
    `);
    const prodJson = await prodRes.json();
    products = (prodJson?.data?.products?.nodes || []).map((p) => ({
      id: p.id,
      title: p.title,
      image: p.featuredImage?.url || "",
      price: parseFloat(p.variants?.nodes?.[0]?.price) || 16.0,
      variantId: p.variants?.nodes?.[0]?.id || "",
    }));
  } catch (err) {
    console.warn("[CartElevate] Error loading post purchase offer data:", err);
  }

  // Provide high quality mock sample product if store has 0 products
  if (products.length === 0) {
    products = [
      {
        id: "gid://shopify/Product/sample_coaster",
        title: "Cork coaster set",
        image: "https://cdn.shopify.com/s/files/1/0533/2089/files/cork-coasters.png?v=1600000000",
        price: 16.0,
        variantId: "gid://shopify/ProductVariant/sample_coaster_v1",
      },
    ];
  }

  return {
    shop,
    existingOffer,
    products,
    currencySymbol,
    accentColor,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const id = formData.get("id") || `ppo_${Date.now()}`;
  const name = formData.get("name") || "Post purchase offer";
  const status = formData.get("status") || "PUBLISHED";
  const productId = formData.get("productId") || "";
  const productTitle = formData.get("productTitle") || "";
  const productImage = formData.get("productImage") || "";
  const productPrice = parseFloat(formData.get("productPrice")) || 0;
  const discountPercentage = parseFloat(formData.get("discountPercentage")) || 20;
  const headline = formData.get("headline") || "Wait! Add this before you go";
  const showTimer = formData.get("showTimer") === "true";

  const savedOffer = {
    id,
    name,
    status,
    productId,
    productTitle,
    productImage,
    productPrice,
    discountPercentage,
    headline,
    showTimer,
    updatedAt: new Date().toISOString(),
  };

  try {
    const metaQuery = await admin.graphql(`
      query GetPostPurchaseMetafield {
        shop {
          id
          metafield(namespace: "cartelevate", key: "post_purchase") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const shopId = metaRes?.data?.shop?.id;
    const rawVal = metaRes?.data?.shop?.metafield?.value;

    let offers = [];
    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      offers = Array.isArray(parsed?.offers) ? parsed.offers : [];
    }

    const existingIndex = offers.findIndex((o) => o.id === id);
    const existingDiscountId = existingIndex >= 0 ? offers[existingIndex]?.discountId : null;

    if (savedOffer.status === "PUBLISHED") {
      const discountId = await syncPostPurchaseAutomaticDiscount({
        admin,
        offer: savedOffer,
        previousDiscountId: existingDiscountId,
      });
      savedOffer.discountId = discountId;
    } else if (existingDiscountId) {
      await syncPostPurchaseAutomaticDiscount({
        admin,
        offer: null,
        previousDiscountId: existingDiscountId,
      });
      savedOffer.discountId = null;
    }

    if (existingIndex >= 0) {
      offers[existingIndex] = savedOffer;
    } else {
      offers.unshift(savedOffer);
    }

    // "Only one offer can be published at a time"
    if (savedOffer.status === "PUBLISHED") {
      offers = offers.map((o) =>
        o.id === savedOffer.id ? o : { ...o, status: "DRAFT" }
      );
    }

    if (shopId) {
      await admin.graphql(
        `#graphql
        mutation SetPostPurchaseMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
            }
          }
        }
      `,
        {
          variables: {
            metafields: [
              {
                ownerId: shopId,
                namespace: "cartelevate",
                key: "post_purchase",
                type: "json",
                value: JSON.stringify({
                  offers,
                  appUrl: process.env.SHOPIFY_APP_URL || "https://cart-elevate.vercel.app",
                  updatedAt: new Date().toISOString(),
                }),
              },
              {
                ownerId: shopId,
                namespace: "cartelevate",
                key: "app_url",
                type: "single_line_text_field",
                value: process.env.SHOPIFY_APP_URL || "https://cart-elevate.vercel.app",
              },
            ],
          },
        }
      );
    }

    return { success: true, savedOffer };
  } catch (err) {
    console.error("[CartElevate] Error saving post purchase offer:", err);
    return { success: false, error: err.message };
  }
};

export default function CreateNewPostPurchaseOfferPage() {
  const { existingOffer, products = [], currencySymbol = "$", accentColor = "#F95738" } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // State initialization matching screenshot defaults
  const [selectedProduct, setSelectedProduct] = useState(() => {
    if (existingOffer?.productId) {
      const match = products.find((p) => p.id === existingOffer.productId);
      if (match) return match;
    }
    return products[0] || {
      id: "sample_coaster",
      title: "Cork coaster set",
      image: "",
      price: 16.0,
    };
  });

  const [discountPercentage, setDiscountPercentage] = useState(
    existingOffer?.discountPercentage ?? 20
  );
  const [headline, setHeadline] = useState(
    existingOffer?.headline ?? "Wait! Add this before you go"
  );
  const [showTimer, setShowTimer] = useState(
    existingOffer?.showTimer !== undefined ? Boolean(existingOffer.showTimer) : true
  );

  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedSuccessBanner, setSavedSuccessBanner] = useState(false);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

  // Filter products in modal picker
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, searchQuery]);

  // Pricing calculations
  const originalPrice = selectedProduct?.price || 16.0;
  const discountedPrice = Math.max(
    0,
    originalPrice * (1 - (Number(discountPercentage) || 0) / 100)
  ).toFixed(2);

  // On successful save, automatically redirect to /app/postPurchase
  React.useEffect(() => {
    if (fetcher.data?.success) {
      navigate("/app/postPurchase");
    }
  }, [fetcher.data, navigate]);
 


  const handleSave = () => {
    const fd = new FormData();
    if (existingOffer?.id) fd.append("id", existingOffer.id);
    fd.append("name", "Post purchase offer");
    fd.append("status", "PUBLISHED");
    fd.append("productId", selectedProduct.id);
    fd.append("productTitle", selectedProduct.title);
    fd.append("productImage", selectedProduct.image);
    fd.append("productPrice", String(selectedProduct.price));
    fd.append("discountPercentage", String(discountPercentage));
    fd.append("headline", headline);
    fd.append("showTimer", String(showTimer));

    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-24 font-sans">
      <main className="max-w-[1140px] mx-auto px-4 sm:px-8 pt-8">
        {/* Top Header */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/app/postPurchase")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-950 transition group cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-50 transition">
              ←
            </span>
            <span>Back to Post Purchase</span>
          </button>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">
            Post purchase offer
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
            Show a special offer to customers after they place an order.
          </p>
        </div>

        {/* Success Banner */}
        {savedSuccessBanner && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-2xs animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                ✓
              </span>
              <span>Settings saved successfully! Post purchase offer updated.</span>
            </div>
            <button
              type="button"
              onClick={() => setSavedSuccessBanner(false)}
              className="text-emerald-700 hover:text-emerald-950 font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ================= LEFT COLUMN: SETTINGS FORM (col-span-7) ================= */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 space-y-6 shadow-2xs">
            {/* 1. Offer Product */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-semibold text-slate-900">
                Offer product
              </label>

              <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedProduct.image ? (
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.title}
                      className="w-12 h-12 rounded-lg object-cover bg-slate-50 border border-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#FAF5F2] border border-[#FDDCD3] flex items-center justify-center text-[#F95738] shrink-0">
                      <SampleCoasterIcon className="w-8 h-8" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                      {selectedProduct.title}
                    </p>
                    <p className="text-xs text-slate-400 font-normal">
                      {currencySymbol}{originalPrice.toFixed(2)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsProductPickerOpen(true)}
                  className="text-xs sm:text-sm font-semibold text-[#F95738] hover:text-[#EA3E1E] transition cursor-pointer px-2 py-1 shrink-0"
                >
                  Change
                </button>
              </div>
            </div>

            {/* 2. Offer Discount */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-semibold text-slate-900">
                Offer discount
              </label>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercentage}
                  onChange={(e) => setDiscountPercentage(e.target.value)}
                  className="w-20 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 text-center focus:outline-none focus:border-[#F95738] focus:ring-1 focus:ring-[#F95738] bg-white shadow-2xs"
                />
                <span className="text-xs sm:text-sm text-slate-500 font-normal">
                  % off, one click add, no re-entering payment
                </span>
              </div>
            </div>

            {/* 3. Headline */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-semibold text-slate-900">
                Headline
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-1 focus:ring-[#F95738] bg-white shadow-2xs"
                placeholder="Wait! Add this before you go"
              />
            </div>

            {/* 4. Timer Checkbox */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-semibold text-slate-900 block">
                Timer
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTimer}
                  onChange={(e) => setShowTimer(e.target.checked)}
                  className="w-4 h-4 rounded text-[#0066FF] border-slate-300 focus:ring-[#0066FF] cursor-pointer"
                />
                <span className="text-xs sm:text-sm text-slate-800 font-normal">
                  Show countdown to create urgency
                </span>
              </label>
            </div>

            {/* 5. Info Note Box */}
            <div className="bg-[#F8F9FA] rounded-xl p-4 border border-slate-200/70 flex items-start gap-3 text-xs sm:text-sm text-slate-500 leading-relaxed">
              <span className="text-slate-400 text-base leading-none shrink-0 mt-0.5">
                ⓘ
              </span>
              <p>
                This appears after checkout, before the order status page. Requires post purchase access approval from Shopify, currently in beta.
              </p>
            </div>

            {/* 6. Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-1.5 bg-[#F95738] hover:bg-[#EA3E1E] active:scale-[0.98] disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold px-6 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
              >
                <span>{isSaving ? "Saving..." : "Save changes"}</span>
                <span>→</span>
              </button>

              <button
                type="button"
                onClick={() => navigate("/app/postPurchase")}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-xl transition cursor-pointer shadow-2xs"
              >
                Back
              </button>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: LIVE PREVIEW (col-span-5) ================= */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Live preview
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                See how your post purchase offer will look for customers.
              </p>
            </div>

            {/* Preview Card matching user screenshot */}
            <div
              className="bg-white rounded-2xl border p-6 sm:p-7 shadow-sm max-w-[340px] mx-auto text-center relative overflow-hidden"
              style={{
                borderColor: `color-mix(in srgb, ${accentColor} 30%, #e2e8f0)`,
                boxShadow: `0 4px 20px color-mix(in srgb, ${accentColor} 12%, transparent)`,
              }}
            >
              {/* Top accent highlight bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{
                  background: `linear-gradient(90deg, color-mix(in srgb, ${accentColor} 75%, #ffffff) 0%, ${accentColor} 50%, color-mix(in srgb, ${accentColor} 80%, #000000) 100%)`,
                }}
              />

              {/* Countdown Timer */}
              {showTimer && (
                <div
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold mb-2.5"
                  style={{ color: accentColor }}
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                  <span>0:47 left</span>
                </div>
              )}

              {/* Headline */}
              <h3 className="text-base sm:text-lg font-bold text-slate-950 mb-4 leading-snug">
                {headline || "Wait! Add this before you go"}
              </h3>

              {/* Product Visual Container */}
              <div
                className="rounded-2xl p-6 flex items-center justify-center mb-3 min-h-[160px]"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accentColor} 4%, #FAF5F2)`,
                  border: `1px solid color-mix(in srgb, ${accentColor} 12%, #ffffff)`,
                }}
              >
                {selectedProduct.image ? (
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.title}
                    className="w-28 h-28 object-contain drop-shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-24 flex items-center justify-center" style={{ color: accentColor }}>
                    <SampleCoasterIcon className="w-20 h-20" />
                  </div>
                )}
              </div>

              {/* Product Title */}
              <p className="text-xs sm:text-sm font-semibold text-slate-900 mb-1">
                {selectedProduct.title}
              </p>

              {/* Pricing (Original Strikethrough + Discounted Price) */}
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="text-slate-400 line-through font-normal">
                  {currencySymbol}{originalPrice.toFixed(2)}
                </span>
                <span className="font-bold text-sm" style={{ color: accentColor }}>
                  {currencySymbol}{discountedPrice}
                </span>
              </div>

              {/* Add CTA Button */}
              <button
                type="button"
                className="w-full py-3 rounded-xl text-white font-bold text-xs sm:text-sm transition shadow-xs mt-4 cursor-pointer"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 4px 14px color-mix(in srgb, ${accentColor} 35%, transparent)`,
                }}
              >
                Add for {currencySymbol}{discountedPrice}
              </button>

              {/* No thanks Link */}
              <span className="text-xs text-slate-400 hover:text-slate-600 font-medium mt-3 block cursor-pointer transition">
                No thanks
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ================= PRODUCT PICKER MODAL ================= */}
      {isProductPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-950">Select offer product</h3>
              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Search Input */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by title..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#F95738] bg-white"
              />
            </div>

            {/* Modal Products List */}
            <div className="overflow-y-auto divide-y divide-slate-100 p-2 flex-1">
              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs sm:text-sm">
                  No products found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const isSelected = selectedProduct.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setIsProductPickerOpen(false);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl transition cursor-pointer ${
                        isSelected
                          ? "bg-[#FFF2EE] border border-[#FDDCD3]"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.title}
                            className="w-10 h-10 rounded-lg object-cover bg-slate-50 border border-slate-100 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0">
                            📦
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                            {p.title}
                          </p>
                          <p className="text-xs text-slate-400">
                            {currencySymbol}{p.price.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                          isSelected
                            ? "bg-[#F95738] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Custom SVG Icons ================= */

function ClockIcon({ className = "w-4 h-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SampleCoasterIcon({ className = "w-8 h-8" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <ellipse cx="24" cy="30" rx="16" ry="8" fill="#D39768" />
      <ellipse cx="24" cy="26" rx="16" ry="8" fill="#E2AC7E" />
      <ellipse cx="24" cy="22" rx="16" ry="8" fill="#ECC095" />
      <ellipse cx="24" cy="18" rx="16" ry="8" fill="#F4D3B0" />
    </svg>
  );
}
