import prisma from "../db.server";

// Public storefront API endpoint for Shipping and Free Gift Progress Bar settings
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
    goalType: "free_shipping",
    shippingThreshold: 75.0,
    giftThreshold: 120.0,
    messageBeforeGoal: "Add {amount} more for free shipping",
  };

  if (!shop) {
    return Response.json(
      {
        success: false,
        error: "Missing shop parameter",
        settings: defaultSettings,
      },
      { headers: corsHeaders }
    );
  }

  try {
    let settings = null;

    if (prisma.shippingProgressBar) {
      settings = await prisma.shippingProgressBar.findUnique({
        where: { shop },
      });
    } else {
      const rows = await prisma.$queryRaw`
        SELECT "goal_type", "shipping_threshold", "gift_threshold", "message_before_goal"
        FROM "shipping_progress_bar"
        WHERE "shop" = ${shop}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        settings = {
          goalType: rows[0].goal_type,
          shippingThreshold: Number(rows[0].shipping_threshold),
          giftThreshold: Number(rows[0].gift_threshold),
          messageBeforeGoal: rows[0].message_before_goal,
        };
      }
    }

    let currency = "USD";
    try {
      if (prisma.settings) {
        const setRow = await prisma.settings.findUnique({ where: { shop } });
        if (setRow && setRow.currency) currency = setRow.currency;
      }
    } catch {
      // Currency fetch skipped
    }

    const CURRENCY_SYMBOLS = {
      USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", INR: "₹", JPY: "¥", CNY: "¥", AED: "AED ", BRL: "R$",
      CHF: "CHF ", DKK: "kr ", HKD: "HK$", MXN: "MX$", NOK: "kr ", NZD: "NZ$", PLN: "zł ", SEK: "kr ", SGD: "S$",
      THB: "฿", TRY: "₺", ZAR: "R "
    };
    const currencySymbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency || "$";

    const safeSettings = {
      goalType: settings?.goalType || defaultSettings.goalType,
      shippingThreshold:
        typeof settings?.shippingThreshold === "number"
          ? settings.shippingThreshold
          : defaultSettings.shippingThreshold,
      giftThreshold:
        typeof settings?.giftThreshold === "number"
          ? settings.giftThreshold
          : defaultSettings.giftThreshold,
      messageBeforeGoal:
        settings?.messageBeforeGoal || defaultSettings.messageBeforeGoal,
      currency,
      currencySymbol,
    };

    return Response.json(
      {
        success: true,
        settings: safeSettings,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[CartElevate] Storefront API shipping bar fetch error:", err);
    return Response.json(
      {
        success: false,
        error: err.message,
        settings: defaultSettings,
      },
      { headers: corsHeaders }
    );
  }
};
