/* global process */
import { unauthenticated } from "../shopify.server";

// Public storefront API endpoint for Protection and Gift Wrapping settings
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

  const defaultSettings = {
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
    serviceProductIds: {},
  };

  if (!shop) {
    return Response.json(
      { success: false, error: "Missing shop parameter", settings: defaultSettings },
      { headers: corsHeaders }
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const metaRes = await admin.graphql(`
      query GetProtectionWrappingMetafield {
        shop {
          metafield(namespace: "cartelevate", key: "protection_wrapping") {
            value
          }
        }
      }
    `);
    const metaJson = await metaRes.json();
    const rawVal = metaJson?.data?.shop?.metafield?.value;

    let settings = defaultSettings;
    if (rawVal) {
      try {
        settings = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      } catch (_e) { /* ignore */ }
    }

    // Auto-provision service products if missing on this store
    const hasProt = Boolean(settings?.serviceProductIds?.protectionVariantId);
    const hasGift = Boolean(settings?.serviceProductIds?.giftWrappingVariantId);

    if (!hasProt || !hasGift) {
      try {
        const prismaModule = await import("../db.server.js");
        const prisma = prismaModule.default || prismaModule;
        const session = await prisma.session.findFirst({
          where: shop ? { shop } : undefined,
        });

        const { ensureServiceProducts, saveProtectionWrappingConfig } = await import("../services/protection-wrapping.server.js");
        const serviceProductIds = await ensureServiceProducts(admin, settings.serviceProductIds || {}, session);

        if (serviceProductIds.protectionVariantId || serviceProductIds.giftWrappingVariantId) {
          settings.serviceProductIds = serviceProductIds;
          settings.appUrl = process.env.SHOPIFY_APP_URL || "https://cart-elevate.vercel.app";
          await saveProtectionWrappingConfig({ admin, session, config: settings });
          console.log(`[CartElevate API] Auto-provisioned service products for ${shop}:`, JSON.stringify(serviceProductIds));
        }
      } catch (provErr) {
        console.warn(`[CartElevate API] Auto-provisioning skipped:`, provErr.message);
      }
    }

    return Response.json({ success: true, settings }, { headers: corsHeaders });
  } catch (err) {
    console.error("[CartElevate] Storefront API protection-wrapping error:", err);
    return Response.json(
      { success: false, error: err.message, settings: defaultSettings },
      { headers: corsHeaders }
    );
  }
};

export const action = async ({ request }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { shop, action: actionType, variantId, price } = body || {};

    if (actionType === "update-price" && variantId && price !== undefined) {
      const prismaModule = await import("../db.server.js");
      const prisma = prismaModule.default || prismaModule;
      const session = await prisma.session.findFirst({
        where: shop ? { shop } : undefined,
      });

      if (!session || !session.accessToken) {
        return Response.json({ success: false, error: "No session found" }, { headers: corsHeaders });
      }

      const numVarId = String(variantId).replace(/\D+/g, "");
      const formattedPrice = Math.max(0, Number(price) || 0).toFixed(2);

      const restRes = await fetch(`https://${session.shop}/admin/api/2025-01/variants/${numVarId}.json`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ variant: { id: numVarId, price: formattedPrice } }),
      });

      const restJson = await restRes.json();
      const updatedPrice = restJson?.variant?.price || formattedPrice;
      console.log(`[CartElevate API] Updated variant ${numVarId} price to $${updatedPrice}`);
      return Response.json({ success: true, price: updatedPrice }, { headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Invalid action" }, { headers: corsHeaders });
  } catch (err) {
    console.error("[CartElevate API] Price update error:", err);
    return Response.json({ success: false, error: err.message }, { headers: corsHeaders });
  }
};
