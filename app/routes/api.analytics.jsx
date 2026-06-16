import db from "../db.server";

// CORS Headers helper
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const loader = () => {
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const action = async ({ request }) => {
  // 1. Handle pre-flight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();
    const { shop, cartToken, eventType, targetVariantId, value } = body;

    if (!shop || !cartToken || !eventType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: shop, cartToken, eventType" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[CartElevate] Storefront logging event: ${eventType} for shop ${shop}`);

    // 2. Insert event log into Neon DB
    await db.analyticsEvent.create({
      data: {
        shop,
        cartToken: String(cartToken),
        eventType: String(eventType),
        targetVariantId: targetVariantId ? String(targetVariantId) : null,
        value: value ? parseFloat(value) : 0.00,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("[CartElevate] Storefront logging error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};
