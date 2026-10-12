import prisma from "../db.server";

// Public storefront API endpoint for Cart Drawer Branding
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

  if (!shop) {
    return Response.json(
      {
        success: false,
        error: "Missing shop parameter",
        branding: {
          logoUrl: "",
          accentColor: "#F95738",
          cartTitle: "Your Cart",
          drawerPosition: "right",
        },
      },
      { headers: corsHeaders }
    );
  }

  try {
    let branding = null;

    if (prisma.cartDrawerBranding) {
      branding = await prisma.cartDrawerBranding.findUnique({
        where: { shop },
      });
    } else {
      const rows = await prisma.$queryRaw`
        SELECT "logo_url", "accent_color", "drawer_position"
        FROM "cart_drawer_branding"
        WHERE "shop" = ${shop}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        branding = {
          logoUrl: rows[0].logo_url,
          accentColor: rows[0].accent_color,
          drawerPosition: rows[0].drawer_position,
        };
      }
    }

    const rawPos = String(branding?.drawerPosition || "right").toLowerCase().trim();
    const safeBranding = {
      logoUrl: branding?.logoUrl || "",
      accentColor: branding?.accentColor || "#F95738",
      cartTitle: branding?.cartTitle || "Your Cart",
      drawerPosition: rawPos === "left" ? "left" : "right",
    };

    return Response.json(
      {
        success: true,
        branding: safeBranding,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[CartElevate] Storefront API branding fetch error:", err);
    return Response.json(
      {
        success: false,
        error: err.message,
        branding: {
          logoUrl: "",
          accentColor: "#F95738",
          cartTitle: "Your Cart",
          drawerPosition: "right",
        },
      },
      { headers: corsHeaders }
    );
  }
};
