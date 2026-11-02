/* global process */
import { unauthenticated } from "../shopify.server";
import {
  syncPostPurchaseAutomaticDiscount,
  activatePostPurchaseDiscount,
  deactivatePostPurchaseDiscount,
  deleteVolumeDiscounts,
  POST_PURCHASE_DISCOUNT_TTL_MS,
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

// Storefront public API endpoint for Post-Purchase / Pre-Checkout offers
export const loader = async ({ request }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const action = url.searchParams.get("action");

  if (!shop) {
    return Response.json(
      { success: false, error: "Missing shop parameter", offer: null },
      { headers: corsHeaders }
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    const query = await admin.graphql(`
      query GetPostPurchaseOffer {
        shop {
          id
          currencyCode
          currencyFormats {
            moneyFormat
          }
          metafield(namespace: "cartelevate", key: "post_purchase") {
            value
          }
          bundlesMetafield: metafield(namespace: "cartelevate", key: "bundles") {
            value
          }
        }
      }
    `);
    const json = await query.json();
    const shopData = json?.data?.shop;

    // If Volume Discounts feature is OFF or has no published bundles, purge any dead volume discounts
    const rawBundlesVal = shopData?.bundlesMetafield?.value;
    let isBundlesActive = false;
    if (rawBundlesVal) {
      try {
        const parsedB = typeof rawBundlesVal === "string" ? JSON.parse(rawBundlesVal) : rawBundlesVal;
        const bList = Array.isArray(parsedB?.bundles) ? parsedB.bundles : (Array.isArray(parsedB) ? parsedB : []);
        isBundlesActive = bList.some((b) => b && b.status === "PUBLISHED");
      } catch (e) {
        console.warn("[CartElevate] Error parsing bundles in post-purchase API:", e?.message);
      }
    }
    if (!isBundlesActive) {
      deleteVolumeDiscounts({ admin }).catch(() => {});
    }

    let currencySymbol = "$";
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

    let activeOffer = null;
    let allOffers = [];
    const rawVal = shopData?.metafield?.value;
    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      allOffers = Array.isArray(parsed?.offers) ? parsed.offers : [];
      activeOffer = allOffers.find((o) => o.status === "PUBLISHED") || null;
    }

    // Resolve available variant for the offer product
    if (activeOffer && activeOffer.productId) {
      try {
        const prodGid = activeOffer.productId.startsWith("gid://")
          ? activeOffer.productId
          : `gid://shopify/Product/${activeOffer.productId}`;
        const prodRes = await admin.graphql(`
          query GetVariant($id: ID!) {
            product(id: $id) {
              variants(first: 20) {
                nodes {
                  id
                  price
                  availableForSale
                }
              }
            }
          }
        `, { variables: { id: prodGid } });
        const prodJson = await prodRes.json();
        const vNodes = prodJson?.data?.product?.variants?.nodes || [];
        const availVariant = vNodes.find((v) => v.availableForSale) || vNodes[0];
        if (availVariant?.id) {
          activeOffer.variantId = availVariant.id;
          if (availVariant.price && !activeOffer.productPrice) {
            activeOffer.productPrice = parseFloat(availVariant.price);
          }
        }
      } catch (e) {
        console.warn("[CartElevate] Variant fetch fallback error in post-purchase API:", e.message);
      }
    }

    // Ensure Shopify Basic automatic discount exists and is ACTIVE for published offer
    if (activeOffer && activeOffer.status === "PUBLISHED") {
      try {
        if (!activeOffer.discountId || activeOffer.discountType !== "BASIC") {
          const discountId = await syncPostPurchaseAutomaticDiscount({
            admin,
            offer: activeOffer,
            previousDiscountId: activeOffer.discountId || null,
            initialActive: true,
          });
          if (discountId) {
            activeOffer.discountId = discountId;
            activeOffer.discountType = "BASIC";
            const idx = allOffers.findIndex((o) => o.id === activeOffer.id);
            if (idx >= 0 && shopData?.id) {
              allOffers[idx].discountId = discountId;
              allOffers[idx].discountType = "BASIC";
              await admin.graphql(
                `#graphql
                mutation UpdatePostPurchaseMetafield($metafields: [MetafieldsSetInput!]!) {
                  metafieldsSet(metafields: $metafields) {
                    metafields { id }
                  }
                }`,
                {
                  variables: {
                    metafields: [
                      {
                        ownerId: shopData.id,
                        namespace: "cartelevate",
                        key: "post_purchase",
                        type: "json",
                        value: JSON.stringify({ offers: allOffers, appUrl: process.env.SHOPIFY_APP_URL || "https://cart-elevate.vercel.app", updatedAt: new Date().toISOString() }),
                      },
                      {
                        ownerId: shopData.id,
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
          }
        } else {
          // If discount already exists, ensure it is active and fresh in Shopify
          await activatePostPurchaseDiscount({
            admin,
            discountId: activeOffer.discountId,
            offer: activeOffer,
          });
        }
      } catch (discErr) {
        console.warn("[CartElevate] Failed to auto-sync discount in API loader:", discErr.message);
      }
    }

    // Explicit Action: Activate discount ONLY when customer accepts offer by clicking Add
    if (action === "activate") {
      const ttlMs = POST_PURCHASE_DISCOUNT_TTL_MS; // 30 minutes
      let activated = false;

      if (activeOffer && activeOffer.discountId) {
        activated = await activatePostPurchaseDiscount({
          admin,
          discountId: activeOffer.discountId,
          offer: activeOffer,
          ttlMs,
        });
      }

      // Fallback: if discount node was deleted or expired in Shopify, recreate it active with 30-min expiry
      if (!activated && activeOffer && activeOffer.status === "PUBLISHED") {
        const newDiscountId = await syncPostPurchaseAutomaticDiscount({
          admin,
          offer: activeOffer,
          previousDiscountId: activeOffer.discountId || null,
          initialActive: true,
          ttlMs,
        });
        if (newDiscountId) {
          activeOffer.discountId = newDiscountId;
          activeOffer.discountType = "BASIC";
          activated = true;

          const idx = allOffers.findIndex((o) => o.id === activeOffer.id);
          if (idx >= 0 && shopData?.id) {
            allOffers[idx].discountId = newDiscountId;
            allOffers[idx].discountType = "BASIC";
            await admin.graphql(
              `#graphql
              mutation UpdatePostPurchaseMetafield($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                  metafields { id }
                }
              }`,
              {
                variables: {
                  metafields: [
                    {
                      ownerId: shopData.id,
                      namespace: "cartelevate",
                      key: "post_purchase",
                      type: "json",
                      value: JSON.stringify({ offers: allOffers, updatedAt: new Date().toISOString() }),
                    },
                  ],
                },
              }
            ).catch(() => {});
          }
        }
      }

      return Response.json(
        {
          success: true,
          action: "activate",
          activated,
          expiresAt: Date.now() + ttlMs,
          offer: activeOffer,
          currencyCode,
          currencySymbol,
        },
        { headers: corsHeaders }
      );
    }

    // Explicit Action: Deactivate discount when offer is explicitly removed or session expires
    if (action === "deactivate") {
      if (activeOffer?.discountId) {
        await deactivatePostPurchaseDiscount({ admin, discountId: activeOffer.discountId });
      }
      return Response.json(
        {
          success: true,
          action: "deactivate",
          deactivated: true,
          offer: activeOffer,
          currencyCode,
          currencySymbol,
        },
        { headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        offer: activeOffer,
        currencyCode,
        currencySymbol,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[CartElevate] Post-Purchase Storefront API error:", err);
    return Response.json(
      { success: false, error: err.message, offer: null },
      { headers: corsHeaders }
    );
  }
};

