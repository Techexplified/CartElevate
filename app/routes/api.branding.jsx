import prisma from "../db.server";

// Public storefront API endpoint for Cart Drawer Branding
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
  };

  if (!shop) {
    return Response.json(
      {
        success: false,
        error: "Missing shop parameter",
        branding: {
          logoUrl: "",
          accentColor: "#F95738",
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

    return Response.json(
      {
        success: true,
        branding: branding || {
          logoUrl: "",
          accentColor: "#F95738",
          drawerPosition: "right",
        },
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
          drawerPosition: "right",
        },
      },
      { headers: corsHeaders }
    );
  }
};
