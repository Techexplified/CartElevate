/* eslint-disable react/prop-types, jsx-a11y/label-has-associated-control */
import React, { useState, useMemo } from "react";
import { useLoaderData, useNavigate, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  syncFreeShippingAutomaticDiscount,
  syncFreeGiftAutomaticDiscount,
} from "../services/discount.server";

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

const DEFAULT_STARTER_GIFTS = [
  // {
  //   id: "gift_starter_tote",
  //   title: "Premium Canvas Tote Bag",
  //   imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=80",
  //   retailPrice: 16.0,
  //   description: "Eco-friendly natural cotton canvas tote bag.",
  //   createdAt: new Date().toISOString(),
  // },
  // {
  //   id: "gift_starter_stickers",
  //   title: "Collector Sticker Pack (5-Pack)",
  //   imageUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=300&q=80",
  //   retailPrice: 8.0,
  //   description: "Durable weatherproof vinyl brand stickers.",
  //   createdAt: new Date().toISOString(),
  // },
];

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch saved progress bar settings from DB
  let settings = null;
  try {
    const rows = await prisma.$queryRaw`
      SELECT "goal_type", "shipping_threshold", "gift_threshold", "message_before_goal", "discount_id",
             "gift_product_id", "gift_variant_id", "gift_product_title", "gift_product_image",
             "gift_product_price", "gift_discount_id", "gift_quantity"
      FROM "shipping_progress_bar"
      WHERE "shop" = ${shop}
      LIMIT 1
    `;
    if (rows && rows.length > 0) {
      settings = {
        goalType: rows[0].goal_type || "free_shipping",
        shippingThreshold: Number(rows[0].shipping_threshold) || 75.0,
        giftThreshold: Number(rows[0].gift_threshold) || 120.0,
        messageBeforeGoal: rows[0].message_before_goal || "Add {amount} more for free shipping",
        discountId: rows[0].discount_id || null,
        giftProductId: rows[0].gift_product_id || null,
        giftVariantId: rows[0].gift_variant_id || null,
        giftProductTitle: rows[0].gift_product_title || null,
        giftProductImage: rows[0].gift_product_image || null,
        giftProductPrice: rows[0].gift_product_price !== null ? Number(rows[0].gift_product_price) : null,
        giftDiscountId: rows[0].gift_discount_id || null,
        giftQuantity: rows[0].gift_quantity ? parseInt(rows[0].gift_quantity, 10) : 1,
      };
    }
  } catch (err) {
    console.warn("[CartElevate] Query shipping_progress_bar fallback:", err.message);
  }

  // 2. Fetch saved gift library from Shop Metafield
  let giftLibrary = [];
  try {
    const metaQuery = await admin.graphql(`
      query GetShippingBarMetafield {
        shop {
          metafield(namespace: "cart_elevate", key: "shipping_bar") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const rawVal = metaRes?.data?.shop?.metafield?.value;
    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (Array.isArray(parsed?.giftLibrary)) {
        giftLibrary = parsed.giftLibrary;
      }
    }
  } catch (mErr) {
    console.warn("[CartElevate] Metafield giftLibrary query fallback:", mErr.message);
  }

  // If library is empty, initialize with existing gift or starter gifts
  if (giftLibrary.length === 0) {
    if (settings?.giftProductTitle) {
      giftLibrary.push({
        id: settings.giftProductId || `gift_${Date.now()}`,
        title: settings.giftProductTitle,
        imageUrl: settings.giftProductImage || "",
        retailPrice: settings.giftProductPrice !== null ? settings.giftProductPrice : 15.0,
        description: "Promotional gift for qualifying orders.",
        createdAt: new Date().toISOString(),
      });
    } else {
      giftLibrary = [...DEFAULT_STARTER_GIFTS];
    }
  }

  // 3. Fetch saved branding for drawer accent color
  let branding = null;
  try {
    if (prisma.cartDrawerBranding) {
      branding = await prisma.cartDrawerBranding.findUnique({
        where: { shop },
      });
    } else {
      const bRows = await prisma.$queryRaw`
        SELECT "accent_color", "logo_url", "drawer_position"
        FROM "cart_drawer_branding"
        WHERE "shop" = ${shop}
        LIMIT 1
      `;
      if (bRows && bRows.length > 0) {
        branding = {
          accentColor: bRows[0].accent_color || "#F95738",
          logoUrl: bRows[0].logo_url || "",
          drawerPosition: bRows[0].drawer_position || "right",
        };
      }
    }
  } catch (err) {
    console.warn("[CartElevate] Query branding fallback:", err.message);
  }

  // 4. Fetch merchant currency from Settings or Shopify Admin GraphQL
  let currency = "USD";
  try {
    const sRows = await prisma.$queryRaw`
      SELECT "currency" FROM "settings" WHERE "shop" = ${shop} LIMIT 1
    `;
    if (sRows && sRows.length > 0 && sRows[0].currency) {
      currency = sRows[0].currency;
    } else {
      const shopQuery = await admin.graphql(`
        query GetShopCurrency {
          shop {
            currencyCode
          }
        }
      `);
      const shopRes = await shopQuery.json();
      const fetchedCode = shopRes?.data?.shop?.currencyCode;
      if (fetchedCode) {
        currency = fetchedCode;
      }
    }
  } catch (curErr) {
    console.warn("[CartElevate] Currency fetch fallback:", curErr.message);
  }

  const currencySymbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency || "$";

  return {
    shop,
    currency,
    currencySymbol,
    giftLibrary,
    settings: settings || {
      goalType: "free_shipping",
      shippingThreshold: 75.0,
      giftThreshold: 120.0,
      messageBeforeGoal: "Add {amount} more for free shipping",
      discountId: null,
      giftProductId: giftLibrary[0]?.id || null,
      giftVariantId: null,
      giftProductTitle: giftLibrary[0]?.title || null,
      giftProductImage: giftLibrary[0]?.imageUrl || null,
      giftProductPrice: giftLibrary[0]?.retailPrice || null,
      giftDiscountId: null,
      giftQuantity: 1,
    },
    branding: branding || {
      accentColor: "#F95738",
      logoUrl: "",
      drawerPosition: "right",
    },
  };
};

export const action = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const goalType = formData.get("goalType")?.toString() || "free_shipping";
  const shippingThreshold = parseFloat(formData.get("shippingThreshold")?.toString() || "75") || 75;
  const giftThreshold = parseFloat(formData.get("giftThreshold")?.toString() || "120") || 120;
  const messageBeforeGoal = formData.get("messageBeforeGoal")?.toString() || "Add {amount} more for free shipping";
  const currency = formData.get("currency")?.toString() || "USD";
  const currencySymbol = formData.get("currencySymbol")?.toString() || "$";
  const accentColor = formData.get("accentColor")?.toString() || "#F95738";

  const rawGiftProductId = formData.get("giftProductId")?.toString() || null;
  const rawGiftProductTitle = formData.get("giftProductTitle")?.toString() || null;
  // Image option removed in shipping & gift progress bar
  const rawGiftProductPrice = formData.get("giftProductPrice")?.toString();
  const parsedPrice = rawGiftProductPrice ? parseFloat(rawGiftProductPrice) : null;
  const rawGiftQuantity = formData.get("giftQuantity")?.toString();
  const parsedGiftQuantity = rawGiftQuantity ? parseInt(rawGiftQuantity, 10) : 1;

  const rawGiftLibrary = formData.get("giftLibrary")?.toString();
  let giftLibrary = [];
  if (rawGiftLibrary) {
    try {
      giftLibrary = JSON.parse(rawGiftLibrary);
    } catch (e) {
      console.warn("[CartElevate] Could not parse giftLibrary from form:", e.message);
    }
  }

  // Determine active goal features based on selected goalType
  const isGiftActive = goalType === "free_gift" || goalType === "both";
  const isShippingActive = goalType === "free_shipping" || goalType === "both";

  // Clean values: clear gift fields if goalType is free_shipping only
  const giftProductId = isGiftActive ? rawGiftProductId : null;
  const giftProductTitle = isGiftActive ? rawGiftProductTitle : null;
  const giftProductImage = null;
  const giftProductPrice = isGiftActive ? parsedPrice : null;
  const giftQuantity = isGiftActive ? Math.max(1, parsedGiftQuantity || 1) : 1;

  const finalShippingThreshold = isShippingActive ? shippingThreshold : 75;
  const finalGiftThreshold = isGiftActive ? giftThreshold : 120;

  try {
    // 0. Fetch previous DB record (to retrieve existing discount IDs for cleanup)
    let existingDiscountId = null;
    let existingGiftDiscountId = null;
    try {
      const rows = await prisma.$queryRaw`
        SELECT "discount_id", "gift_discount_id"
        FROM "shipping_progress_bar"
        WHERE "shop" = ${shop}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        existingDiscountId = rows[0].discount_id || null;
        existingGiftDiscountId = rows[0].gift_discount_id || null;
      }
    } catch (e) {
      console.warn("[CartElevate] Could not fetch previous settings from DB:", e.message);
    }

    // 1. Synchronize Shopify Automatic Free Shipping Discount at checkout
    let syncedDiscountId = null;
    try {
      syncedDiscountId = await syncFreeShippingAutomaticDiscount({
        admin,
        goalType,
        shippingThreshold: finalShippingThreshold,
        currencySymbol,
        existingDiscountId,
      });
    } catch (discErr) {
      console.error("[CartElevate] Free shipping discount sync failed:", discErr);
      syncedDiscountId = isShippingActive ? existingDiscountId : null;
    }

    // 2. Clean up any obsolete Shopify BXGY discount for gifts (since custom gifts are managed via Order Attributes)
    try {
      await syncFreeGiftAutomaticDiscount({
        admin,
        existingDiscountId: existingGiftDiscountId,
      });
    } catch (giftErr) {
      console.warn("[CartElevate] Obsolete gift discount cleanup error:", giftErr.message);
    }

    // 3. Save settings in DB
    try {
      await prisma.$executeRaw`
        DELETE FROM "shipping_progress_bar"
        WHERE "shop" = ${shop}
      `;

      await prisma.$executeRaw`
        INSERT INTO "shipping_progress_bar" (
          "id", "shop", "goal_type", "shipping_threshold", "gift_threshold",
          "message_before_goal", "discount_id", "gift_product_id", "gift_variant_id",
          "gift_product_title", "gift_product_image", "gift_product_price", "gift_discount_id",
          "gift_quantity", "created_at", "updated_at"
        )
        VALUES (
          CONCAT('spb_', floor(random()*10000000)::text),
          ${shop}, ${goalType}, ${finalShippingThreshold}, ${finalGiftThreshold},
          ${messageBeforeGoal}, ${syncedDiscountId}, ${giftProductId}, null,
          ${giftProductTitle}, ${giftProductImage}, ${giftProductPrice}, null,
          ${giftQuantity}, NOW(), NOW()
        )
      `;
    } catch (dbErr) {
      console.warn("[CartElevate] DB delete & insert error:", dbErr.message);
    }

    // 4. Sync to Shopify Shop Metafield so storefront theme extension has instant access
    try {
      const shopQuery = await admin.graphql(`
        query GetShopId {
          shop {
            id
          }
        }
      `);
      const shopRes = await shopQuery.json();
      const shopId = shopRes?.data?.shop?.id;

      if (shopId) {
        await admin.graphql(
          `#graphql
          mutation SetProgressBarMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                key
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              metafields: [
                {
                  ownerId: shopId,
                  namespace: "cart_elevate",
                  key: "shipping_bar",
                  type: "json",
                  value: JSON.stringify({
                    goalType,
                    shippingThreshold: finalShippingThreshold,
                    giftThreshold: finalGiftThreshold,
                    messageBeforeGoal,
                    giftProductId,
                    giftProductTitle,
                    giftProductImage,
                    giftProductPrice,
                    giftQuantity,
                    giftLibrary,
                    currency,
                    currencySymbol,
                    accentColor,
                    discountId: syncedDiscountId,
                    giftDiscountId: null,
                    updatedAt: new Date().toISOString(),
                  }),
                },
                {
                  ownerId: shopId,
                  namespace: "cartelevate",
                  key: "shipping_bar",
                  type: "json",
                  value: JSON.stringify({
                    goalType,
                    shippingThreshold: finalShippingThreshold,
                    giftThreshold: finalGiftThreshold,
                    messageBeforeGoal,
                    giftProductId,
                    giftProductTitle,
                    giftProductImage,
                    giftProductPrice,
                    giftQuantity,
                    giftLibrary,
                    currency,
                    currencySymbol,
                    accentColor,
                    discountId: syncedDiscountId,
                    giftDiscountId: null,
                    updatedAt: new Date().toISOString(),
                  }),
                },
              ],
            },
          }
        );
      }
    } catch (metaErr) {
      console.warn("[CartElevate] Shipping bar metafield sync skipped:", metaErr.message);
    }

    return redirect("/app");
  } catch (err) {
    console.error("[CartElevate] Failed to save shipping progress bar:", err);
    return { success: false, error: err.message };
  }
};

function SyncInfoTooltip({ currencySymbol, shippingThreshold, isLive }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer focus:outline-none"
        title="Shopify Checkout Free Shipping info"
        aria-label="Shopify Checkout Free Shipping info"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:left-6 top-full sm:top-1/2 mt-2 sm:mt-0 sm:-translate-y-1/2 z-50 w-72 sm:w-80 p-3.5 bg-white rounded-2xl shadow-xl border border-slate-200/90 text-xs text-slate-700 animate-fadeIn pointer-events-auto">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-slate-900 text-xs">Shopify Checkout Sync Active</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
              {isLive ? "Live in Checkout" : "Syncs on Save"}
            </span>
          </div>
          <p className="text-slate-600 leading-relaxed text-[11.5px]">
            CartElevate automatically provisions a native Shopify <strong className="text-slate-800">Automatic Free Shipping</strong> discount. When customers add at least <strong className="text-slate-800">{currencySymbol}{shippingThreshold}</strong> to their cart, 100% free shipping is instantly granted at checkout without entering any coupon code.
          </p>
          <div className="hidden sm:block absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-l border-b border-slate-200/90 rotate-45"></div>
          <div className="sm:hidden absolute left-3 -top-1.5 w-3 h-3 bg-white border-l border-t border-slate-200/90 rotate-45"></div>
        </div>
      )}
    </div>
  );
}

function MerchantFulfillmentNotice({ currencySymbol, giftThreshold, giftTitle, giftQuantity }) {
  return (
    <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border border-blue-200/80 shadow-2xs space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900">
              Order Integration & Fulfillment Guide
            </h4>
            <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              Automated
            </span>
          </div>
          <p className="text-[11.5px] sm:text-xs text-slate-600 leading-relaxed font-normal">
            When customer cart reaches <strong className="text-slate-800">{currencySymbol}{giftThreshold}</strong>, CartElevate tags the checkout order attributes with <code className="bg-white/80 px-1 py-0.5 rounded border border-blue-200 text-blue-700 font-mono text-[11px]">Free Gift: {giftQuantity}x {giftTitle || "Custom Gift"}</code>.
          </p>
          <ul className="text-[11px] text-slate-500 space-y-1 pt-1 list-disc list-inside">
            <li>
              <strong>Visible in Shopify Admin:</strong> Find the gift under <em>Additional details</em> on every qualified order in <strong>Orders</strong>.
            </li>
            <li>
              <strong>Clean Inventory:</strong> Your live store catalog stays 100% clean without creating dummy zero-dollar products.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function AddEditGiftModal({
  isOpen,
  onClose,
  onSave,
  gift,
  currencySymbol,
}) {
  const isEditing = Boolean(gift?.id);

  const [title, setTitle] = useState(gift?.title || "");
  const [retailPrice, setRetailPrice] = useState(
    gift?.retailPrice !== undefined && gift?.retailPrice !== null ? String(gift.retailPrice) : "15.00"
  );
  const [description, setDescription] = useState(gift?.description || "");

  React.useEffect(() => {
    if (gift) {
      setTitle(gift.title || "");
      setRetailPrice(gift.retailPrice !== undefined && gift.retailPrice !== null ? String(gift.retailPrice) : "15.00");
      setDescription(gift.description || "");
    } else {
      setTitle("");
      setRetailPrice("15.00");
      setDescription("");
    }
  }, [gift, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      id: gift?.id || `gift_${Date.now()}`,
      title: title.trim(),
      imageUrl: "",
      retailPrice: parseFloat(retailPrice) || 0,
      description: description.trim(),
      createdAt: gift?.createdAt || new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? "Edit Free Gift Product" : "Add Custom Free Gift Product"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Set the product name, estimated retail value, and optional packing notes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">
              Gift Product Title <span className="text-[#F95738]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Exclusive Canvas Tote Bag"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition-all"
            />
          </div>

          {/* Retail Value / Price */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">
              Estimated Retail Value ({currencySymbol})
            </label>
            <div className="relative flex items-center rounded-xl border border-slate-200 bg-white max-w-[160px] focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20 transition-all">
              <span className="pl-3 pr-1 text-slate-500 font-semibold text-xs select-none">
                {currencySymbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                placeholder="15.00"
                className="w-full py-2 pr-3 bg-transparent text-slate-900 font-bold text-xs focus:outline-none"
              />
            </div>
            <p className="text-[10.5px] text-slate-400">
              Shown to customers as value (e.g. <em>~~{currencySymbol}{retailPrice || "0"}~~ FREE</em>).
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">
              Packing Note / Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Include 1 tote in outer packaging"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition-all resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#F95738] hover:bg-[#E04828] text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer"
            >
              {isEditing ? "Save Changes" : "Add to Library"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



function GiftLibraryModal({
  isOpen,
  onClose,
  giftLibrary,
  activeGiftId,
  onSelectGift,
  onOpenAddModal,
  onOpenEditModal,
  onDeleteGift,
  currencySymbol,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Free Gift Library
            </h3>
            <p className="text-xs text-slate-500">
              Choose which custom gift is active, or add new gifts to your collection.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">
            {giftLibrary.length} {giftLibrary.length === 1 ? "gift" : "gifts"} available
          </span>
          <button
            type="button"
            onClick={() => {
              onOpenAddModal();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#F95738] hover:bg-[#E04828] text-white text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Add New Gift</span>
          </button>
        </div>

        {/* Gifts List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {giftLibrary.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-3xl">🎁</span>
              <p className="text-xs text-slate-500 font-medium mt-2">
                No gifts in your library yet. Add your first gift product!
              </p>
              <button
                type="button"
                onClick={onOpenAddModal}
                className="mt-3 px-4 py-2 rounded-xl bg-[#F95738] text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                + Add Gift Product
              </button>
            </div>
          ) : (
            giftLibrary.map((g) => {
              const isActive = g.id === activeGiftId;

              return (
                <div
                  key={g.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isActive
                      ? "bg-[#FFF9F7] border-[#F95738]/50 shadow-2xs"
                      : "bg-white border-slate-200/90 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/70 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs text-[#F95738]">
                      <span className="text-lg">🎁</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {g.title}
                        </h4>
                        {isActive && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                            Active Reward
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-semibold">
                          Value: {currencySymbol}{Number(g.retailPrice || 0).toFixed(2)}
                        </span>
                        {g.description && (
                          <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                            • {g.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectGift(g);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        Select
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-[#F95738] px-2 py-1">
                        Selected
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenEditModal(g)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit gift details"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteGift(g.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete from library"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function ShippingAndFreeGiftProgressBarPage() {
  const { settings, branding, currency, currencySymbol, giftLibrary: initialLibrary = [] } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting" || navigation.state === "loading";
  const accentColor = branding?.accentColor || "#F95738";

  // Form State
  const [goalType, setGoalType] = useState(settings?.goalType || "free_shipping"); // 'free_shipping' | 'free_gift' | 'both'
  const [shippingThreshold, setShippingThreshold] = useState(
    settings?.shippingThreshold !== undefined ? settings.shippingThreshold : 75
  );
  const [giftThreshold, setGiftThreshold] = useState(
    settings?.giftThreshold !== undefined ? settings.giftThreshold : 120
  );
  const [messageBeforeGoal, setMessageBeforeGoal] = useState(
    settings?.messageBeforeGoal || "Add {amount} more for free shipping"
  );

  // Gift Library & Active Gift State
  const [giftLibrary, setGiftLibrary] = useState(initialLibrary);

  // Active Gift Product
  const [activeGiftId, setActiveGiftId] = useState(
    settings?.giftProductId || initialLibrary[0]?.id || null
  );
  const [giftProduct, setGiftProduct] = useState({
    id: settings?.giftProductId || initialLibrary[0]?.id || null,
    title: settings?.giftProductTitle || initialLibrary[0]?.title || "",
    image: "",
    price: settings?.giftProductPrice !== null && settings?.giftProductPrice !== undefined
      ? settings.giftProductPrice
      : (initialLibrary[0]?.retailPrice || 15.0),
  });
  const [giftQuantity, setGiftQuantity] = useState(settings?.giftQuantity || 1);

  // Modals
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [modalGiftToEdit, setModalGiftToEdit] = useState(null);

  const handleSelectGift = (gift) => {
    setActiveGiftId(gift.id);
    setGiftProduct({
      id: gift.id,
      title: gift.title,
      image: "",
      price: gift.retailPrice,
    });
  };

  const handleOpenAddModal = () => {
    setModalGiftToEdit(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (gift) => {
    setModalGiftToEdit(gift);
    setIsAddEditModalOpen(true);
  };

  const handleSaveGift = (giftData) => {
    setGiftLibrary((prev) => {
      const idx = prev.findIndex((g) => g.id === giftData.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = giftData;
        return next;
      }
      return [...prev, giftData];
    });

    // If editing the active gift, or if no active gift was set, update active
    if (!activeGiftId || activeGiftId === giftData.id) {
      handleSelectGift(giftData);
    }
  };

  const handleDeleteGift = (giftId) => {
    setGiftLibrary((prev) => {
      const filtered = prev.filter((g) => g.id !== giftId);
      if (activeGiftId === giftId) {
        if (filtered.length > 0) {
          handleSelectGift(filtered[0]);
        } else {
          setActiveGiftId(null);
          setGiftProduct({ id: null, title: "", image: "", price: null });
        }
      }
      return filtered;
    });
  };

  const handleRemoveActiveGift = () => {
    setActiveGiftId(null);
    setGiftProduct({ id: null, title: "", image: "", price: null });
  };

  // Cart items state for interactive preview
  const [cartItems, setCartItems] = useState([
    {
      id: "mug",
      name: "Ceramic mug",
      price: 14.0,
      quantity: 1,
    },
    {
      id: "tote",
      name: "Tote bag",
      price: 22.0,
      quantity: 1,
    },
  ]);

  // Calculations for preview
  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [cartItems]);

  const totalQuantity = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const numShipping = parseFloat(shippingThreshold) || 75;
  const numGift = parseFloat(giftThreshold) || 120;

  // Compute remaining amount and progress bar values based on active goal
  const { remainingText, progressPercent } = useMemo(() => {
    if (goalType === "free_shipping") {
      const remaining = Math.max(0, numShipping - subtotal);
      const percent = Math.min(100, Math.round((subtotal / numShipping) * 100));
      const achieved = subtotal >= numShipping;
      const text = achieved
        ? "🎉 You've unlocked free shipping!"
        : messageBeforeGoal.replace("{amount}", `${currencySymbol}${remaining.toFixed(0)}`);
      return {
        remainingText: text,
        progressPercent: percent,
      };
    } else if (goalType === "free_gift") {
      const remaining = Math.max(0, numGift - subtotal);
      const percent = Math.min(100, Math.round((subtotal / numGift) * 100));
      const achieved = subtotal >= numGift;
      const defaultMsg = messageBeforeGoal.includes("free shipping")
        ? messageBeforeGoal.replace("free shipping", "free gift")
        : messageBeforeGoal;
      const text = achieved
        ? "🎉 You've unlocked a free gift!"
        : defaultMsg.replace("{amount}", `${currencySymbol}${remaining.toFixed(0)}`);
      return {
        remainingText: text,
        progressPercent: percent,
      };
    } else {
      // Both thresholds: Free Shipping & Free Gift
      const maxThreshold = Math.max(numShipping, numGift);
      const percent = Math.min(100, Math.round((subtotal / maxThreshold) * 100));
      const isBothAchieved = subtotal >= numShipping && subtotal >= numGift;

      if (isBothAchieved) {
        return {
          remainingText: "🎉 You've unlocked free shipping and free gift!",
          progressPercent: 100,
        };
      } else if (subtotal >= numShipping) {
        const remaining = Math.max(0, numGift - subtotal);
        return {
          remainingText: `Free shipping unlocked! Add ${currencySymbol}${remaining.toFixed(0)} more for free gift`,
          progressPercent: percent,
        };
      } else {
        const remaining = Math.max(0, numShipping - subtotal);
        return {
          remainingText: messageBeforeGoal.replace("{amount}", `${currencySymbol}${remaining.toFixed(0)}`),
          progressPercent: percent,
        };
      }
    }
  }, [goalType, numShipping, numGift, subtotal, messageBeforeGoal, currencySymbol]);

  const updateQuantity = (id, delta) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeItem = (id) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-slate-900 pb-16 font-sans">
      {/* Container */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Back to dashboard button */}
        <div className="mb-5">
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

        {/* Main Card Wrapper */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 sm:p-10">
          {/* Header */}
                 
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              Shipping and gift progress bar
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Nudge customers to spend more with a threshold bar in the cart drawer.
            </p>
          </div>

          {/* 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* ================= LEFT COLUMN: CONFIGURATION FORM (col-span-6) ================= */}
            <div className="lg:col-span-6 space-y-6">
              <Form method="post" className="space-y-6">
                {/* Hidden input to pass state */}
                <input type="hidden" name="goalType" value={goalType} />
                <input type="hidden" name="currency" value={currency} />
                <input type="hidden" name="currencySymbol" value={currencySymbol} />
                <input type="hidden" name="accentColor" value={accentColor} />
                <input type="hidden" name="giftProductId" value={giftProduct.id || ""} />
                <input type="hidden" name="giftProductTitle" value={giftProduct.title || ""} />
                <input type="hidden" name="giftProductImage" value={giftProduct.image || ""} />
                <input
                  type="hidden"
                  name="giftProductPrice"
                  value={giftProduct.price !== null && giftProduct.price !== undefined ? giftProduct.price : ""}
                />
                <input type="hidden" name="giftQuantity" value={giftQuantity} />
                <input type="hidden" name="giftLibrary" value={JSON.stringify(giftLibrary)} />

                {/* 1. Goal type selector */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-slate-900">
                    Goal type
                  </label>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setGoalType("free_shipping");
                        if (!messageBeforeGoal.includes("free shipping")) {
                          setMessageBeforeGoal("Add {amount} more for free shipping");
                        }
                      }}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        goalType === "free_shipping"
                          ? "bg-[#F95738] text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      Free shipping
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGoalType("free_gift");
                        if (!messageBeforeGoal.includes("free gift")) {
                          setMessageBeforeGoal("Add {amount} more for a free gift");
                        }
                      }}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        goalType === "free_gift"
                          ? "bg-[#F95738] text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      Free gift
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGoalType("both");
                        setMessageBeforeGoal("Add {amount} more for free shipping");
                      }}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        goalType === "both"
                          ? "bg-[#F95738] text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      Both
                    </button>
                  </div>
                </div>

                {/* 2. Threshold inputs based on goalType */}

                {/* Condition A: Free Shipping ONLY */}
                {goalType === "free_shipping" && (
                  <>
                    <input type="hidden" name="giftThreshold" value={giftThreshold} />
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <label className="block text-sm font-medium text-slate-800">
                          Threshold: free shipping
                        </label>
                        <SyncInfoTooltip
                          currencySymbol={currencySymbol}
                          shippingThreshold={shippingThreshold}
                          isLive={Boolean(settings?.discountId)}
                        />
                      </div>
                      <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs max-w-[200px] focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20 transition-all">
                        <span className="pl-3.5 pr-1.5 text-slate-600 font-medium text-sm select-none">
                          {currencySymbol}
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          name="shippingThreshold"
                          value={shippingThreshold}
                          onChange={(e) => setShippingThreshold(e.target.value)}
                          className="w-full py-2.5 pr-3 bg-transparent text-slate-900 font-semibold text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Condition B: Free Gift ONLY */}
                {goalType === "free_gift" && (
                  <div className="space-y-5">
                    <input type="hidden" name="shippingThreshold" value={shippingThreshold} />
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-800">
                        Threshold: free gift
                      </label>
                      <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs max-w-[200px] focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20 transition-all">
                        <span className="pl-3.5 pr-1.5 text-slate-600 font-medium text-sm select-none">
                          {currencySymbol}
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          name="giftThreshold"
                          value={giftThreshold}
                          onChange={(e) => setGiftThreshold(e.target.value)}
                          className="w-full py-2.5 pr-3 bg-transparent text-slate-900 font-semibold text-sm focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Manual Free Gift Product Manager */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-sm font-semibold text-slate-900">
                            Custom Free Gift Product
                          </label>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Manually added reward for qualifying orders over {currencySymbol}{giftThreshold}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLibraryModalOpen(true)}
                          className="text-xs font-bold text-[#F95738] hover:text-[#E04828] hover:underline cursor-pointer"
                        >
                          Browse Library ({giftLibrary.length}) →
                        </button>
                      </div>

                      {giftProduct?.title ? (
                        <div className="space-y-2.5">
                          {/* Active Gift Card */}
                          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 transition-all hover:border-slate-300">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/70 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs text-[#F95738]">
                                <span className="text-lg">🎁</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                                    {giftProduct.title}
                                  </h4>
                                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60 shrink-0">
                                    Active Reward
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {giftProduct.price !== null && (
                                    <span className="text-xs text-slate-400 font-medium line-through">
                                      {currencySymbol}{Number(giftProduct.price).toFixed(2)}
                                    </span>
                                  )}
                                  <span className="text-xs font-bold text-emerald-600">
                                    FREE ($0.00)
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setIsLibraryModalOpen(true)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                              >
                                Switch
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const item = giftLibrary.find((g) => g.id === activeGiftId) || {
                                    id: activeGiftId,
                                    title: giftProduct.title,
                                    imageUrl: giftProduct.image,
                                    retailPrice: giftProduct.price,
                                  };
                                  handleOpenEditModal(item);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit this gift"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={handleRemoveActiveGift}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                title="Remove gift"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Gift Quantity Stepper */}
                          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-[13px] font-bold text-slate-900">
                                  Gift Quantity
                                </span>
                                <span className="text-[10px] font-semibold bg-orange-50 text-[#F95738] px-2 py-0.5 rounded-full border border-orange-200/60">
                                  Per Qualified Order
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Number of free units to award when spending {currencySymbol}{giftThreshold}
                              </p>
                            </div>
                            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden shrink-0 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => setGiftQuantity((prev) => Math.max(1, (Number(prev) || 1) - 1))}
                                className="w-8 sm:w-9 h-8 sm:h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200/70 font-bold text-sm cursor-pointer transition-colors select-none"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={giftQuantity || 1}
                                onChange={(e) => setGiftQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="w-12 sm:w-14 h-8 sm:h-9 text-center font-bold text-xs sm:text-sm text-slate-900 bg-white border-x border-slate-200 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setGiftQuantity((prev) => (Number(prev) || 1) + 1)}
                                className="w-8 sm:w-9 h-8 sm:h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200/70 font-bold text-sm cursor-pointer transition-colors select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Empty State */
                        <div className="p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#F95738]/50 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
                          <div className="flex items-center gap-3 text-center sm:text-left">
                            <div className="w-10 h-10 rounded-full bg-[#FFF5F2] text-[#F95738] flex items-center justify-center shrink-0">
                              <span className="text-xl">🎁</span>
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                                No free gift configured
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Add a custom gift or choose one from your library to award when spending {currencySymbol}{giftThreshold}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleOpenAddModal}
                              className="px-3.5 py-2 rounded-xl bg-[#F95738] hover:bg-[#E04828] text-white text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <span>+</span>
                              <span>Add Custom Gift</span>
                            </button>
                            {giftLibrary.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setIsLibraryModalOpen(true)}
                                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                              >
                                Library
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Merchant Notification & Order Fulfillment Guide */}
                      <MerchantFulfillmentNotice
                        currencySymbol={currencySymbol}
                        giftThreshold={giftThreshold}
                        giftTitle={giftProduct.title}
                        giftQuantity={giftQuantity}
                      />
                    </div>
                  </div>
                )}

                {/* Condition C: Both Free Shipping AND Free Gift */}
                {goalType === "both" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <label className="block text-sm font-medium text-slate-800">
                            Threshold 1: free shipping
                          </label>
                          <SyncInfoTooltip
                            currencySymbol={currencySymbol}
                            shippingThreshold={shippingThreshold}
                            isLive={Boolean(settings?.discountId)}
                          />
                        </div>
                        <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs max-w-[200px] focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20 transition-all">
                          <span className="pl-3.5 pr-1.5 text-slate-600 font-medium text-sm select-none">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            name="shippingThreshold"
                            value={shippingThreshold}
                            onChange={(e) => setShippingThreshold(e.target.value)}
                            className="w-full py-2.5 pr-3 bg-transparent text-slate-900 font-semibold text-sm focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-800">
                          Threshold 2: free gift
                        </label>
                        <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs max-w-[200px] focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20 transition-all">
                          <span className="pl-3.5 pr-1.5 text-slate-600 font-medium text-sm select-none">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            name="giftThreshold"
                            value={giftThreshold}
                            onChange={(e) => setGiftThreshold(e.target.value)}
                            className="w-full py-2.5 pr-3 bg-transparent text-slate-900 font-semibold text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Manual Free Gift Product Manager */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-sm font-semibold text-slate-900">
                            Custom Free Gift Product
                          </label>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Manually added reward for qualifying orders over {currencySymbol}{giftThreshold}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLibraryModalOpen(true)}
                          className="text-xs font-bold text-[#F95738] hover:text-[#E04828] hover:underline cursor-pointer"
                        >
                          Browse Library ({giftLibrary.length}) →
                        </button>
                      </div>

                      {giftProduct?.title ? (
                        <div className="space-y-2.5">
                          {/* Active Gift Card */}
                          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 transition-all hover:border-slate-300">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/70 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs text-[#F95738]">
                                <span className="text-lg">🎁</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                                    {giftProduct.title}
                                  </h4>
                                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60 shrink-0">
                                    Active Reward
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {giftProduct.price !== null && (
                                    <span className="text-xs text-slate-400 font-medium line-through">
                                      {currencySymbol}{Number(giftProduct.price).toFixed(2)}
                                    </span>
                                  )}
                                  <span className="text-xs font-bold text-emerald-600">
                                    FREE ($0.00)
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setIsLibraryModalOpen(true)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                              >
                                Switch
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const item = giftLibrary.find((g) => g.id === activeGiftId) || {
                                    id: activeGiftId,
                                    title: giftProduct.title,
                                    imageUrl: giftProduct.image,
                                    retailPrice: giftProduct.price,
                                  };
                                  handleOpenEditModal(item);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit this gift"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={handleRemoveActiveGift}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                title="Remove gift"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Gift Quantity Stepper */}
                          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-[13px] font-bold text-slate-900">
                                  Gift Quantity
                                </span>
                                <span className="text-[10px] font-semibold bg-orange-50 text-[#F95738] px-2 py-0.5 rounded-full border border-orange-200/60">
                                  Per Qualified Order
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Number of free units to award when spending {currencySymbol}{giftThreshold}
                              </p>
                            </div>
                            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden shrink-0 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => setGiftQuantity((prev) => Math.max(1, (Number(prev) || 1) - 1))}
                                className="w-8 sm:w-9 h-8 sm:h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200/70 font-bold text-sm cursor-pointer transition-colors select-none"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={giftQuantity || 1}
                                onChange={(e) => setGiftQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="w-12 sm:w-14 h-8 sm:h-9 text-center font-bold text-xs sm:text-sm text-slate-900 bg-white border-x border-slate-200 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setGiftQuantity((prev) => (Number(prev) || 1) + 1)}
                                className="w-8 sm:w-9 h-8 sm:h-9 flex items-center justify-center text-slate-600 hover:bg-slate-200/70 font-bold text-sm cursor-pointer transition-colors select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Empty State */
                        <div className="p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#F95738]/50 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
                          <div className="flex items-center gap-3 text-center sm:text-left">
                            <div className="w-10 h-10 rounded-full bg-[#FFF5F2] text-[#F95738] flex items-center justify-center shrink-0">
                              <span className="text-xl">🎁</span>
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                                No free gift configured
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Add a custom gift or choose one from your library to award when spending {currencySymbol}{giftThreshold}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleOpenAddModal}
                              className="px-3.5 py-2 rounded-xl bg-[#F95738] hover:bg-[#E04828] text-white text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <span>+</span>
                              <span>Add Custom Gift</span>
                            </button>
                            {giftLibrary.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setIsLibraryModalOpen(true)}
                                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                              >
                                Library
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Merchant Notification & Order Fulfillment Guide */}
                      <MerchantFulfillmentNotice
                        currencySymbol={currencySymbol}
                        giftThreshold={giftThreshold}
                        giftTitle={giftProduct.title}
                        giftQuantity={giftQuantity}
                      />
                    </div>
                  </div>
                )}

                {/* 4. Message before goal */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-800">
                    Message before goal
                  </label>
                  <input
                    type="text"
                    name="messageBeforeGoal"
                    value={messageBeforeGoal}
                    onChange={(e) => setMessageBeforeGoal(e.target.value)}
                    placeholder="Add {amount} more for free shipping"
                    className="w-full max-w-[420px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-medium shadow-2xs focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 focus:outline-none transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Use <code className="text-[#F95738] font-mono">&#123;amount&#125;</code> to dynamically display the remaining threshold amount (e.g. {currencySymbol}23).
                  </p>
                </div>

                {/* 5. Action Buttons */}
                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl bg-[#F95738] hover:bg-[#E04828] text-white font-semibold text-sm transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60 active:scale-[0.98]"
                  >
                    <span>{isSaving ? "Saving..." : "Save and continue"}</span>
                    <span>→</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/app")}
                    className="px-6 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm transition-all shadow-2xs cursor-pointer active:scale-[0.98]"
                  >
                    Back
                  </button>
                </div>
              </Form>
            </div>

            {/* ================= RIGHT COLUMN: LIVE CART DRAWER PREVIEW (col-span-6) ================= */}
            <div className="lg:col-span-6 flex justify-center lg:justify-end">
              <div className="w-full max-w-[430px] bg-white rounded-3xl border border-slate-200/90 shadow-md overflow-hidden transition-all duration-200">
                {/* 1. Header Banner */}
                <div
                  style={{ backgroundColor: accentColor }}
                  className="px-4 py-3.5 flex items-center justify-between text-white transition-colors duration-200"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-white"
                      >
                        <circle cx="8" cy="21" r="1.5" />
                        <circle cx="19" cy="21" r="1.5" />
                        <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                      </svg>
                    </div>
                    <span className="font-bold text-sm tracking-tight">
                      Your cart ({totalQuantity + ((goalType === "free_gift" || goalType === "both") && subtotal >= numGift && giftProduct.title ? 1 : 0)})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (cartItems.length === 0) {
                        setCartItems([
                          { id: "mug", name: "Ceramic mug", price: 14.0, quantity: 1 },
                          { id: "tote", name: "Tote bag", price: 22.0, quantity: 1 },
                        ]);
                      }
                    }}
                    title={cartItems.length === 0 ? "Reset demo items" : "Close preview"}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-white transition-colors cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* 2. Drawer Body */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Progress Bar Card */}
                  <div
                    className="rounded-2xl p-3.5 space-y-2.5 transition-all"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${accentColor} 5%, #ffffff)`,
                      border: `1px solid color-mix(in srgb, ${accentColor} 20%, #ffffff)`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Left icon in circle */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${accentColor} 14%, transparent)`,
                          color: accentColor,
                        }}
                      >
                        {goalType === "free_gift" || (goalType === "both" && subtotal >= numShipping) ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <rect x="3" y="8" width="18" height="4" rx="1" />
                            <path d="M12 8v13" />
                            <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                            <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
                            <rect x="1" y="3" width="15" height="13" rx="1" />
                            <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                            <circle cx="5.5" cy="18.5" r="2.5" />
                            <circle cx="18.5" cy="18.5" r="2.5" />
                          </svg>
                        )}
                      </div>

                      {/* Header message */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs sm:text-[13px] font-bold leading-tight"
                          style={{ color: accentColor }}
                        >
                          {remainingText}
                        </p>
                      </div>
                    </div>

                    {/* Animated track */}
                    <div className="space-y-1">
                      <div
                        className="w-full h-2 rounded-full bg-white overflow-hidden relative"
                        style={{
                          border: `1px solid color-mix(in srgb, ${accentColor} 24%, #ffffff)`,
                        }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300 ease-out"
                          style={{
                            width: `${progressPercent}%`,
                            backgroundColor: accentColor,
                          }}
                        />
                      </div>

                      {/* Labels under progress bar */}
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-0.5">
                        <span>{currencySymbol}0</span>
                        {goalType === "both" ? (
                          <div className="flex items-center gap-3">
                            <span
                              className="transition-colors"
                              style={{
                                color: subtotal >= numShipping ? accentColor : undefined,
                                fontWeight: subtotal >= numShipping ? 700 : 500,
                              }}
                            >
                              {currencySymbol}{numShipping}
                            </span>
                            <span
                              className="transition-colors"
                              style={{
                                color: subtotal >= numGift ? accentColor : undefined,
                                fontWeight: subtotal >= numGift ? 700 : 500,
                              }}
                            >
                              {currencySymbol}{numGift}
                            </span>
                          </div>
                        ) : goalType === "free_gift" ? (
                          <span
                            className="transition-colors"
                            style={{
                              color: subtotal >= numGift ? accentColor : undefined,
                              fontWeight: subtotal >= numGift ? 700 : 500,
                            }}
                          >
                            {currencySymbol}{numGift}
                          </span>
                        ) : (
                          <span
                            className="transition-colors"
                            style={{
                              color: subtotal >= numShipping ? accentColor : undefined,
                              fontWeight: subtotal >= numShipping ? 700 : 500,
                            }}
                          >
                            {currencySymbol}{numShipping}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unlocked gift celebratory pill */}
                    {(goalType === "free_gift" || goalType === "both") && subtotal >= numGift && giftProduct.title && (
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-all"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${accentColor} 8%, #ffffff)`,
                          border: `1px solid color-mix(in srgb, ${accentColor} 25%, #ffffff)`,
                          color: `color-mix(in srgb, ${accentColor} 85%, #000000)`,
                        }}
                      >
                        <span>🎁</span>
                        <span className="truncate">
                          Free Gift:{" "}
                          <strong
                            className="font-bold"
                            style={{ color: `color-mix(in srgb, ${accentColor} 95%, #000000)` }}
                          >
                            {giftQuantity > 1 ? `${giftQuantity}x ` : ""}{giftProduct.title}
                          </strong>{" "}
                          included with order
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-3 pt-1">
                    {/* Free gift promo row in preview drawer */}
                    {(goalType === "free_gift" || goalType === "both") && subtotal >= numGift && giftProduct.title && (
                      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/90 transition-all animate-fadeIn">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/90 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs text-emerald-700">
                            <span className="text-lg">🎁</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                                {giftProduct.title}
                              </h4>
                              <span className="text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full uppercase tracking-wider shrink-0">
                                GIFT
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {giftProduct.price !== null && (
                                <span className="text-xs text-slate-400 line-through">
                                  {currencySymbol}{Number(giftProduct.price).toFixed(2)}
                                </span>
                              )}
                              <span className="text-xs font-bold text-emerald-700">
                                FREE ($0.00)
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[11px] font-bold text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded-md shadow-2xs">
                            Qty {giftQuantity}
                          </span>
                        </div>
                      </div>
                    )}

                    {cartItems.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-slate-400 font-medium">Your preview cart is empty.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setCartItems([
                              { id: "mug", name: "Ceramic mug", price: 14.0, quantity: 1 },
                              { id: "tote", name: "Tote bag", price: 22.0, quantity: 1 },
                            ]);
                          }}
                          className="text-xs font-semibold text-[#F95738] hover:underline mt-1 cursor-pointer"
                        >
                          Restore sample items
                        </button>
                      </div>
                    ) : (
                      cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                          {/* Product Image Thumbnail & Title */}
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/60 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.id === "mug" ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.6" className="w-6 h-6">
                                  <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
                                  <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                                  <line x1="6" y1="2" x2="6" y2="4" />
                                  <line x1="10" y1="2" x2="10" y2="4" />
                                  <line x1="14" y1="2" x2="14" y2="4" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.6" className="w-6 h-6">
                                  <path d="M6 8a6 6 0 0 1 12 0v2H6Z" />
                                  <rect x="4" y="10" width="16" height="11" rx="2" />
                                </svg>
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 leading-snug">
                                {item.name}
                              </h4>
                              <p className="text-xs text-slate-500 font-medium">
                                {currencySymbol}{item.price.toFixed(2)}
                              </p>
                            </div>
                          </div>

                          {/* Stepper & Trash */}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -1)}
                                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-xs font-bold text-slate-900">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, 1)}
                                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Drawer Footer */}
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Subtotal</span>
                      <span className="text-slate-900 font-bold text-sm">
                        {currencySymbol}{subtotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Free shipping checkout tag */}
                    {(goalType === "free_shipping" || goalType === "both") && subtotal >= numShipping && (
                      <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 font-medium animate-fadeIn">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Free Shipping
                        </span>
                        <span className="font-bold text-emerald-800 tracking-wide text-[11px] bg-emerald-100/80 px-1.5 py-0.5 rounded">AUTO-APPLIED</span>
                      </div>
                    )}

                    {/* Free Gift checkout tag */}
                    {(goalType === "free_gift" || goalType === "both") && subtotal >= numGift && giftProduct.title && (
                      <div
                        className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg font-medium animate-fadeIn"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${accentColor} 8%, #ffffff)`,
                          border: `1px solid color-mix(in srgb, ${accentColor} 22%, #ffffff)`,
                          color: `color-mix(in srgb, ${accentColor} 85%, #000000)`,
                        }}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span>🎁</span>
                          <span className="truncate">Free Gift: <strong>{giftQuantity > 1 ? `${giftQuantity}x ` : ""}{giftProduct.title}</strong></span>
                        </span>
                        <span
                          className="font-bold tracking-wide text-[10px] px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${accentColor} 18%, #ffffff)`,
                            color: `color-mix(in srgb, ${accentColor} 90%, #000000)`,
                          }}
                        >
                          ORDER ATTRIBUTE
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled
                      className="w-full py-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center font-bold text-slate-400 text-sm cursor-not-allowed select-none"
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

      {/* Gift Library Modal */}
      <GiftLibraryModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        giftLibrary={giftLibrary}
        activeGiftId={activeGiftId}
        onSelectGift={handleSelectGift}
        onOpenAddModal={handleOpenAddModal}
        onOpenEditModal={handleOpenEditModal}
        onDeleteGift={handleDeleteGift}
        currencySymbol={currencySymbol}
      />

      {/* Add / Edit Gift Product Modal */}
      <AddEditGiftModal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        onSave={handleSaveGift}
        gift={modalGiftToEdit}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}
