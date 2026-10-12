import React, { useState, useMemo } from "react";
import { useLoaderData, useNavigate, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncFreeShippingAutomaticDiscount } from "../services/discount.server";

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

  // 1. Fetch saved progress bar settings
  let settings = null;
  try {
    if (prisma.shippingProgressBar) {
      settings = await prisma.shippingProgressBar.findUnique({
        where: { shop },
      });
    } else {
      const rows = await prisma.$queryRaw`
        SELECT "goal_type", "shipping_threshold", "gift_threshold", "message_before_goal", "discount_id"
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
        };
      }
    }
  } catch (err) {
    console.warn("[CartElevate] Query shipping_progress_bar fallback:", err.message);
  }

  // 2. Fetch saved branding for drawer accent color and logo
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

  // 3. Fetch merchant currency from Settings or Shopify Admin GraphQL
  let currency = "USD";
  try {
    let settingsRow = null;
    if (prisma.settings) {
      settingsRow = await prisma.settings.findUnique({ where: { shop } });
    }
    if (settingsRow && settingsRow.currency) {
      currency = settingsRow.currency;
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
        if (prisma.settings) {
          await prisma.settings.upsert({
            where: { shop },
            create: { shop, isOnboarded: true, currency: fetchedCode },
            update: { currency: fetchedCode },
          });
        }
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
    settings: settings || {
      goalType: "free_shipping",
      shippingThreshold: 75.0,
      giftThreshold: 120.0,
      messageBeforeGoal: "Add {amount} more for free shipping",
      discountId: null,
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

  try {
    // 0. Fetch existing discount ID from DB
    let existingDiscountId = null;
    try {
      if (prisma.shippingProgressBar) {
        const existingRow = await prisma.shippingProgressBar.findUnique({
          where: { shop },
          select: { discountId: true },
        });
        existingDiscountId = existingRow?.discountId || null;
      }
    } catch (e) {
      console.warn("[CartElevate] Could not fetch existing discount ID:", e.message);
    }

    // 1. Synchronize Shopify Automatic Free Shipping Discount at checkout
    let syncedDiscountId = null;
    try {
      syncedDiscountId = await syncFreeShippingAutomaticDiscount({
        admin,
        goalType,
        shippingThreshold,
        currencySymbol,
        existingDiscountId,
      });
      console.log("[CartElevate] Free shipping discount synchronized. ID:", syncedDiscountId);
    } catch (discErr) {
      console.error("[CartElevate] Free shipping discount sync failed:", discErr);
      syncedDiscountId = existingDiscountId; // preserve if transient network issue
    }

    // 2. Save or update DB record
    try {
      if (prisma.shippingProgressBar) {
        await prisma.shippingProgressBar.upsert({
          where: { shop },
          create: {
            shop,
            goalType,
            shippingThreshold,
            giftThreshold,
            messageBeforeGoal,
            discountId: syncedDiscountId,
          },
          update: {
            goalType,
            shippingThreshold,
            giftThreshold,
            messageBeforeGoal,
            discountId: syncedDiscountId,
          },
        });
      } else {
        await prisma.$executeRaw`
          INSERT INTO "shipping_progress_bar" ("id", "shop", "goal_type", "shipping_threshold", "gift_threshold", "message_before_goal", "discount_id", "created_at", "updated_at")
          VALUES (CONCAT('spb_', floor(random()*10000000)::text), ${shop}, ${goalType}, ${shippingThreshold}, ${giftThreshold}, ${messageBeforeGoal}, ${syncedDiscountId}, NOW(), NOW())
          ON CONFLICT ("shop") DO UPDATE
          SET "goal_type" = ${goalType},
              "shipping_threshold" = ${shippingThreshold},
              "gift_threshold" = ${giftThreshold},
              "message_before_goal" = ${messageBeforeGoal},
              "discount_id" = ${syncedDiscountId},
              "updated_at" = NOW()
        `;
      }
    } catch (dbErr) {
      console.warn("[CartElevate] DB upsert fallback query:", dbErr.message);
      await prisma.$executeRaw`
        INSERT INTO "shipping_progress_bar" ("id", "shop", "goal_type", "shipping_threshold", "gift_threshold", "message_before_goal", "discount_id", "created_at", "updated_at")
        VALUES (CONCAT('spb_', floor(random()*10000000)::text), ${shop}, ${goalType}, ${shippingThreshold}, ${giftThreshold}, ${messageBeforeGoal}, ${syncedDiscountId}, NOW(), NOW())
        ON CONFLICT ("shop") DO UPDATE
        SET "goal_type" = ${goalType},
            "shipping_threshold" = ${shippingThreshold},
            "gift_threshold" = ${giftThreshold},
            "message_before_goal" = ${messageBeforeGoal},
            "discount_id" = ${syncedDiscountId},
            "updated_at" = NOW()
      `;
    }

    // 3. Sync to Shopify Shop Metafield so storefront theme extension has instant access
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
        const metaRes = await admin.graphql(`
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
        `, {
          variables: {
            metafields: [
              {
                ownerId: shopId,
                namespace: "cart_elevate",
                key: "shipping_bar",
                type: "json",
                value: JSON.stringify({
                  goalType,
                  shippingThreshold,
                  giftThreshold,
                  messageBeforeGoal,
                  currency,
                  currencySymbol,
                  discountId: syncedDiscountId,
                  updatedAt: new Date().toISOString(),
                }),
              },
            ],
          },
        });
        const metaJson = await metaRes.json();
        const userErrors = metaJson?.data?.metafieldsSet?.userErrors;
        if (userErrors && userErrors.length > 0) {
          console.error("[CartElevate] Shipping bar metafield save error:", JSON.stringify(userErrors));
        } else {
          console.log("[CartElevate] Synced shipping progress bar to shop metafield successfully.");
        }
      }
    } catch (metaErr) {
      console.warn("[CartElevate] Shipping bar metafield sync skipped or failed:", metaErr.message);
    }

    // Save and return to dashboard
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
        title="Shopify Checkout Sync info"
        aria-label="Shopify Checkout Sync info"
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
          {/* Desktop arrow (points left to icon) */}
          <div className="hidden sm:block absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-l border-b border-slate-200/90 rotate-45"></div>
          {/* Mobile arrow (points up to icon) */}
          <div className="sm:hidden absolute left-3 -top-1.5 w-3 h-3 bg-white border-l border-t border-slate-200/90 rotate-45"></div>
        </div>
      )}
    </div>
  );
}

export default function ShippingAndFreeGiftProgressBarPage() {
  const { settings, branding, currency, currencySymbol } = useLoaderData();
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
  const { remainingText, progressPercent, primaryGoalAmount, isGoalAchieved } = useMemo(() => {
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
        primaryGoalAmount: numShipping,
        isGoalAchieved: achieved,
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
        primaryGoalAmount: numGift,
        isGoalAchieved: achieved,
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
          primaryGoalAmount: maxThreshold,
          isGoalAchieved: true,
        };
      } else if (subtotal >= numShipping) {
        const remaining = Math.max(0, numGift - subtotal);
        return {
          remainingText: `Free shipping unlocked! Add ${currencySymbol}${remaining.toFixed(0)} more for free gift`,
          progressPercent: percent,
          primaryGoalAmount: maxThreshold,
          isGoalAchieved: false,
        };
      } else {
        const remaining = Math.max(0, numShipping - subtotal);
        return {
          remainingText: messageBeforeGoal.replace("{amount}", `${currencySymbol}${remaining.toFixed(0)}`),
          progressPercent: percent,
          primaryGoalAmount: maxThreshold,
          isGoalAchieved: false,
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
    <div className="min-h-screen bg-[#FDFCFB] text-slate-900 pb-16">
      {/* Container */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
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

          {/* 2-Column Grid matching the user's mockup */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* ================= LEFT COLUMN: CONFIGURATION FORM (col-span-6) ================= */}
            <div className="lg:col-span-6 space-y-6">
              <Form method="post" className="space-y-6">
                {/* Hidden input to pass active goal type and currency */}
                <input type="hidden" name="goalType" value={goalType} />
                <input type="hidden" name="currency" value={currency} />
                <input type="hidden" name="currencySymbol" value={currencySymbol} />

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
                  <>
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
                  </>
                )}

                {/* Condition C: Both Free Shipping AND Free Gift */}
                {goalType === "both" && (
                  <div className="space-y-4">
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
                      Your cart ({totalQuantity})
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
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-white transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* 2. Drawer Body */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Progress Bar Card matching user screenshot */}
                  <div className="bg-[#FFF5F2] border border-[#FDE2D9] rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center gap-3">
                      {/* Left icon in circle */}
                      <div className="w-9 h-9 rounded-full bg-[#FEE9E2] text-[#F95738] flex items-center justify-center shrink-0">
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
                        <p className="text-xs sm:text-[13px] font-bold text-[#E04828] leading-tight">
                          {remainingText}
                        </p>
                      </div>
                    </div>

                    {/* The animated track */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-white border border-[#FCD6CA] overflow-hidden relative">
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
                            <span className={subtotal >= numShipping ? "text-[#E04828] font-bold" : ""}>
                              {currencySymbol}{numShipping}
                            </span>
                            <span className={subtotal >= numGift ? "text-[#E04828] font-bold" : ""}>
                              {currencySymbol}{numGift}
                            </span>
                          </div>
                        ) : goalType === "free_gift" ? (
                          <span className={subtotal >= numGift ? "text-[#E04828] font-bold" : ""}>
                            {currencySymbol}{numGift}
                          </span>
                        ) : (
                          <span className={subtotal >= numShipping ? "text-[#E04828] font-bold" : ""}>
                            {currencySymbol}{numShipping}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-3 pt-1">
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

                    {/* Free shipping unlocked checkout reminder */}
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
    </div>
  );
}
