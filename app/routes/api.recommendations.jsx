import { unauthenticated } from "../shopify.server";

// Public storefront API endpoint for CartElevate Recommendations settings
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

  const defaultSets = [];

  if (!shop) {
    return Response.json(
      {
        success: false,
        error: "Missing shop parameter",
        sets: [],
      },
      { headers: corsHeaders }
    );
  }

  const action = url.searchParams.get("action");
  const productId = url.searchParams.get("product_id");

  try {
    const { admin } = await unauthenticated.admin(shop);

    // 1. Action: Same collection resolution
    if (action === "same_collection" && productId) {
      const gid = productId.startsWith("gid://")
        ? productId
        : `gid://shopify/Product/${productId.replace(/\D/g, "")}`;
      const targetNumId = productId.replace(/\D/g, "");

      try {
        const prodQuery = await admin.graphql(
          `query GetProductCollections($id: ID!) {
            product(id: $id) {
              id
              title
              handle
              collections(first: 5) {
                nodes {
                  id
                  handle
                  title
                  products(first: 30) {
                    nodes {
                      id
                      title
                      handle
                      productType
                      tags
                      availableForSale
                      featuredImage {
                        url
                      }
                      priceRangeV2 {
                        minVariantPrice {
                          amount
                          currencyCode
                        }
                      }
                      compareAtPriceRange {
                        minVariantPrice {
                          amount
                          currencyCode
                        }
                      }
                      variants(first: 10) {
                        nodes {
                          id
                          title
                          availableForSale
                          price
                          compareAtPrice
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
          { variables: { id: gid } }
        );

        const prodRes = await prodQuery.json();
        const colNodes = prodRes?.data?.product?.collections?.nodes || [];

        // Pick first non-empty collection (preferring non-frontpage)
        let chosenCol = null;
        for (const node of colNodes) {
          if (node && Array.isArray(node.products?.nodes) && node.products.nodes.length > 0) {
            if (!chosenCol || node.handle !== "frontpage") {
              chosenCol = node;
              if (node.handle !== "frontpage") break;
            }
          }
        }

        if (chosenCol) {
          const prods = (chosenCol.products?.nodes || [])
            .filter((p) => {
              const numId = p.id.split("/").pop();
              return numId && numId !== targetNumId;
            })
            .map((p) => {
              const numId = p.id.split("/").pop();
              const vNodes = p.variants?.nodes || [];
              const firstV = vNodes[0] || {};

              return {
                id: Number(numId) || numId,
                title: p.title,
                handle: p.handle,
                product_type: p.productType || "",
                tags: p.tags || [],
                available: p.availableForSale,
                featured_image: p.featuredImage?.url || null,
                price: firstV.price || p.priceRangeV2?.minVariantPrice?.amount || "0.00",
                compare_at_price: firstV.compareAtPrice || p.compareAtPriceRange?.minVariantPrice?.amount || null,
                variants: vNodes.map((v) => ({
                  id: Number(v.id.split("/").pop()) || v.id.split("/").pop(),
                  title: v.title,
                  price: v.price || "0.00",
                  compare_at_price: v.compareAtPrice || null,
                  available: v.availableForSale,
                })),
              };
            });

          return Response.json(
            {
              success: true,
              collection: {
                id: chosenCol.id,
                title: chosenCol.title,
                handle: chosenCol.handle,
              },
              products: prods,
            },
            { headers: corsHeaders }
          );
        }

        return Response.json(
          {
            success: true,
            collection: null,
            products: [],
          },
          { headers: corsHeaders }
        );
      } catch (err) {
        console.warn("[CartElevate] Error resolving product collections:", err.message);
        return Response.json(
          {
            success: false,
            error: err.message,
            products: [],
          },
          { headers: corsHeaders }
        );
      }
    }

    // 2. Default: Recommendations sets configuration
    const metaQuery = await admin.graphql(`
      query GetRecommendationMetafield {
        shop {
          metafield(namespace: "cartelevate", key: "recommendations") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const rawVal = metaRes?.data?.shop?.metafield?.value;

    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      let sets = Array.isArray(parsed.sets)
        ? parsed.sets
        : parsed.logic
        ? [parsed]
        : [];

      const DUMMY_SET_IDS = new Set(["set_kitchenware_1", "set_homedecor_2", "set_highestmargin_3"]);
      sets = sets.filter((s) => s && s.id && !DUMMY_SET_IDS.has(s.id));

      return Response.json(
        {
          success: true,
          sets,
          recommendations: { sets },
        },
        { headers: corsHeaders }
      );
    }
  } catch (err) {
    console.warn("[CartElevate] Storefront API recommendations error:", err.message);
  }

  return Response.json(
    {
      success: true,
      sets: [],
      recommendations: { sets: [] },
    },
    { headers: corsHeaders }
  );
};
