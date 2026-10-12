import prisma from "../app/db.server.js";

async function run() {
  const s = await prisma.session.findFirst({
    where: { shop: "announcement-generator-2.myshopify.com" },
  });

  if (!s) {
    console.log("No session found");
    process.exit(1);
  }

  // Get current branding from DB
  const branding = await prisma.cartDrawerBranding.findUnique({
    where: { shop: s.shop },
  });
  console.log("Branding in DB:", branding?.accentColor, "Logo length:", branding?.logoUrl?.length);

  // Check shop ID and current metafield
  const checkRes = await fetch(`https://${s.shop}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": s.accessToken,
    },
    body: JSON.stringify({
      query: `
        query {
          shop {
            id
            metafield(namespace: "cart_elevate", key: "branding") {
              id
              value
            }
          }
        }
      `,
    }),
  });

  const checkJson = await checkRes.json();
  console.log("Shop query response:", JSON.stringify(checkJson, null, 2));

  const shopId = checkJson?.data?.shop?.id;
  if (!shopId) {
    console.error("Could not find shopId");
    process.exit(1);
  }

  // Sync DB branding to Shopify Metafield right now
  if (branding) {
    const syncRes = await fetch(`https://${s.shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": s.accessToken,
      },
      body: JSON.stringify({
        query: `
          mutation SetBrandingMetafield($metafields: [MetafieldsSetInput!]!) {
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
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: "cart_elevate",
              key: "branding",
              type: "json",
              value: JSON.stringify({
                accentColor: branding.accentColor,
                logoUrl: branding.logoUrl,
                drawerPosition: branding.drawerPosition,
                updatedAt: new Date().toISOString(),
              }),
            },
          ],
        },
      }),
    });
    const syncJson = await syncRes.json();
    console.log("Sync response:", JSON.stringify(syncJson, null, 2));
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
