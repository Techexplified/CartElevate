import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[CartElevate] Received ${topic} webhook for ${shop}`);

  if (topic !== "orders/create") {
    return new Response("Invalid topic", { status: 400 });
  }

  try {
    // 1. Fetch the merchant's settings for this shop from Neon DB
    const settings = await db.settings.findUnique({
      where: { shop },
    });

    if (!settings) {
      console.log(`[CartElevate] Settings not found for shop ${shop}. Skipping webhook processing.`);
      return new Response("Settings not found", { status: 200 });
    }

    const lineItems = payload.line_items || [];
    const totalOrderValue = parseFloat(payload.total_price) || 0.00;

    let elevatedRevenue = 0.00;
    let hasUpsell = false;
    let hasProtection = false;
    let hasGiftWrap = false;

    // Parse list of recommended upsell variant IDs from settings
    let configuredUpsells = [];
    try {
      configuredUpsells = typeof settings.upsellProducts === "string" 
        ? JSON.parse(settings.upsellProducts) 
        : (settings.upsellProducts || []);
    } catch (e) {
      configuredUpsells = settings.upsellProducts || [];
    }

    // Normalized list of variant GIDs (just numeric values)
    const upsellVariantIds = configuredUpsells.map((id) => String(id).split("/").pop());

    // 2. Identify and calculate revenue from CartElevate products
    lineItems.forEach((item) => {
      const titleLower = (item.title || "").toLowerCase();
      
      // Match addons by flexible text queries or custom line item properties
      const isProtection = titleLower.includes("package protection") || 
                           item.properties?.some(p => p.name === "_cart_elevate_protection");
      const isGiftWrap = titleLower.includes("gift wrapping") || 
                         titleLower.includes("gift wrap") || 
                         item.properties?.some(p => p.name === "_cart_elevate_gift_wrap");

      // Match recommended upsell products by variant ID
      const itemVariantId = String(item.variant_id || "").split("/").pop();
      const isUpsell = upsellVariantIds.includes(itemVariantId);

      if (isProtection || isGiftWrap || isUpsell) {
        const itemPrice = parseFloat(item.price) || 0.00;
        const itemQty = parseInt(item.quantity) || 1;
        elevatedRevenue += itemPrice * itemQty;
        
        if (isUpsell) hasUpsell = true;
        if (isProtection) hasProtection = true;
        if (isGiftWrap) hasGiftWrap = true;
      }
    });

    // 3. If the order has CartElevate revenue, record it in the database
    if (elevatedRevenue > 0) {
      console.log(`[CartElevate] Logging converted order ${payload.id} for shop ${shop}. Elevated Revenue: $${elevatedRevenue}`);
      await db.convertedOrder.upsert({
        where: { orderId: String(payload.id) },
        create: {
          orderId: String(payload.id),
          shop,
          cartToken: payload.cart_token || null,
          totalOrderValue,
          elevatedRevenue,
          hasUpsell,
          hasProtection,
          hasGiftWrap,
          createdAt: new Date(payload.created_at || Date.now()),
        },
        update: {
          totalOrderValue,
          elevatedRevenue,
          hasUpsell,
          hasProtection,
          hasGiftWrap,
        },
      });
    }

    return new Response("Success", { status: 200 });
  } catch (error) {
    console.error("[CartElevate] Failed to process order webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
