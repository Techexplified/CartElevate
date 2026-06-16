import { useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import SettingsPage from "../pages/SettingsPage";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const check = url.searchParams.get("check");

  // Helper function to check if the app embed is enabled in settings_data.json
  const checkAppEmbedEnabled = async () => {
    try {
      const response = await admin.graphql(`
        #graphql
        query getThemeSettings {
          themes(roles: MAIN, first: 1) {
            nodes {
              files(filenames: ["config/settings_data.json"]) {
                nodes {
                  body {
                    ... on OnlineStoreThemeFileBodyText {
                      content
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const resJson = await response.json();
      const content = resJson.data?.themes?.nodes?.[0]?.files?.nodes?.[0]?.body?.content;

      if (!content) return false;

      // Strip comments if present (Shopify often adds a /* ... */ comment block at the top)
      const jsonStr = content.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const settings = JSON.parse(jsonStr);
      const blocks = settings.current?.blocks || {};

      return Object.keys(blocks).some((key) => {
        const block = blocks[key];
        const type = block.type || "";
        const isMatch =
          key.includes("cart-elevate") ||
          key.includes("cartelevate") ||
          key.includes("91e88f51d9ec392df7f5a047d343c716") ||
          type.includes("cart-elevate") ||
          type.includes("cartelevate") ||
          type.includes("91e88f51d9ec392df7f5a047d343c716");
        return isMatch && block.disabled !== true;
      });
    } catch (err) {
      console.error("Error checking theme settings:", err);
      return false;
    }
  };

  if (check) {
    const isEnabled = await checkAppEmbedEnabled();
    return { isEnabled };
  }

  // Initial load check
  const isAppEnabled = await checkAppEmbedEnabled();

  // Load saved settings (Neon DB primary, Shopify metafield fallback)
  let savedSettings = null;
  try {
    const dbSettings = await prisma.settings.findUnique({
      where: { shop: session.shop },
    });
    if (dbSettings) {
      savedSettings = {
        goals: typeof dbSettings.goals === "string" ? JSON.parse(dbSettings.goals) : dbSettings.goals,
        selectedTheme: dbSettings.selectedTheme,
        selectedToggle: dbSettings.selectedToggle,
        packageProtectionPrice: parseFloat(dbSettings.packageProtectionPrice) || 2.99,
        giftWrappingPrice: parseFloat(dbSettings.giftWrappingPrice) || 4.99,
        upsellProducts: typeof dbSettings.upsellProducts === "string" ? JSON.parse(dbSettings.upsellProducts) : dbSettings.upsellProducts,
        currencySymbol: dbSettings.currencySymbol,
      };
    }
  } catch (err) {
    console.error("Error fetching settings from database:", err);
  }

  if (!savedSettings) {
    try {
      const settingsResponse = await admin.graphql(`
        #graphql
        query getSettingsMetafield {
          shop {
            metafield(namespace: "cart_elevate", key: "settings") {
              value
            }
          }
        }
      `);
      const settingsJson = await settingsResponse.json();
      const settingsVal = settingsJson.data?.shop?.metafield?.value;
      if (settingsVal) {
        savedSettings = JSON.parse(settingsVal);
      }
    } catch (err) {
      console.error("Error fetching saved settings metafield fallback:", err);
    }
  }

  // Fetch shop products for upsell selection
  let products = [];
  try {
    const productsResponse = await admin.graphql(`
      #graphql
      query getProducts {
        products(first: 10) {
          nodes {
            id
            title
            featuredImage {
              url
            }
            variants(first: 5) {
              nodes {
                id
                price
                compareAtPrice
              }
            }
          }
        }
      }
    `);
    const productsJson = await productsResponse.json();
    products = productsJson.data?.products?.nodes || [];
  } catch (err) {
    console.error("Error fetching products:", err);
  }

  return { shop, isAppEnabled, savedSettings, products };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const goalsStr = formData.get("goals") || "[]";
  const selectedTheme = formData.get("selectedTheme") || "dynamic";
  const upsellProductsStr = formData.get("upsellProducts") || "[]";
  const selectedToggle = formData.get("selectedToggle") || "";

  let goals = [];
  try {
    goals = JSON.parse(goalsStr);
  } catch (e) {
    return { success: false, error: "Invalid goals format" };
  }

  let upsellProducts = [];
  try {
    upsellProducts = JSON.parse(upsellProductsStr);
  } catch (e) {
    upsellProducts = [];
  }

  // Sync Automatic Discounts for Free Product spend goals
  let oldGoals = [];
  try {
    const dbSettings = await prisma.settings.findUnique({
      where: { shop: session.shop },
    });
    if (dbSettings && dbSettings.goals) {
      oldGoals = typeof dbSettings.goals === "string" ? JSON.parse(dbSettings.goals) : dbSettings.goals;
    }
  } catch (err) {
    console.error("Error fetching old settings for discount cleanup:", err);
  }

  const newDiscountIds = new Set(
    goals
      .map((g) => g.rewardAutomaticDiscountId)
      .filter((id) => id && id.trim() !== "")
  );

  const orphanDiscountIds = oldGoals
    .map((g) => g.rewardAutomaticDiscountId)
    .filter((id) => id && id.trim() !== "" && !newDiscountIds.has(id));

  for (const discountId of orphanDiscountIds) {
    try {
      console.log(`[CartElevate] Deleting orphaned automatic discount: ${discountId}`);
      const deleteResponse = await admin.graphql(`
        #graphql
        mutation discountAutomaticDelete($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { id: discountId }
      });
      const deleteJson = await deleteResponse.json();
      const deleteErrors = deleteJson.data?.discountAutomaticDelete?.userErrors || [];
      if (deleteErrors.length > 0) {
        console.error(`[CartElevate] Failed to delete orphaned discount ${discountId}:`, deleteErrors);
      }
    } catch (err) {
      console.error(`[CartElevate] Failed to delete orphaned discount ${discountId}:`, err);
    }
  }

  // Fetch all collections to use in BXGY discount prerequisite
  let collectionGids = [];
  try {
    const collectionsResponse = await admin.graphql(`
      #graphql
      query getCollections {
        collections(first: 250) {
          nodes {
            id
          }
        }
      }
    `);
    const collectionsJson = await collectionsResponse.json();
    collectionGids = (collectionsJson.data?.collections?.nodes || []).map((c) => c.id);
  } catch (err) {
    console.error("[CartElevate] Failed to fetch collections for discount:", err);
  }

  const startsAt = new Date().toISOString();
  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    const cleanGoal = String(goal.spendGoal || "").replace(/[^0-9.]/g, "");
    const spendGoalNum = parseFloat(cleanGoal) || 0;

    if (goal.rewardType === "FREE_PRODUCT" && goal.rewardVariantId) {
      const variantGid = goal.rewardVariantId.startsWith("gid://shopify/")
        ? goal.rewardVariantId
        : `gid://shopify/ProductVariant/${goal.rewardVariantId}`;

      const title = `CartElevate Free Product - Spend $${spendGoalNum} (Tier ${i + 1})`;

      const automaticBxgyDiscount = {
        title,
        startsAt,
        customerBuys: {
          items: {
            collections: {
              add: collectionGids
            }
          },
          value: {
            amount: String(spendGoalNum.toFixed(2))
          }
        },
        customerGets: {
          items: {
            products: {
              productVariantsToAdd: [variantGid]
            }
          },
          value: {
            discountOnQuantity: {
              quantity: "1",
              effect: {
                percentage: 1.0
              }
            }
          }
        },
        combinesWith: {
          productDiscounts: true,
          orderDiscounts: true,
          shippingDiscounts: true
        }
      };

      if (goal.rewardAutomaticDiscountId) {
        try {
          console.log(`[CartElevate] Updating automatic BXGY discount: ${goal.rewardAutomaticDiscountId}`);
          const response = await admin.graphql(`
            #graphql
            mutation discountAutomaticBxgyUpdate($id: ID!, $automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
              discountAutomaticBxgyUpdate(id: $id, automaticBxgyDiscount: $automaticBxgyDiscount) {
                automaticDiscountNode {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: {
              id: goal.rewardAutomaticDiscountId,
              automaticBxgyDiscount
            }
          });

          const resJson = await response.json();
          const errors = resJson.data?.discountAutomaticBxgyUpdate?.userErrors || [];
          if (errors.length > 0) {
            console.error(`[CartElevate] Failed to update BXGY discount ${goal.rewardAutomaticDiscountId}:`, errors);
            console.log("[CartElevate] BXGY discount node update failed. Deleting and recreating...");
            try {
              await admin.graphql(`
                #graphql
                mutation discountAutomaticDelete($id: ID!) {
                  discountAutomaticDelete(id: $id) {
                    deletedAutomaticDiscountId
                  }
                }
              `, { variables: { id: goal.rewardAutomaticDiscountId } });
            } catch (delErr) {
              console.warn("[CartElevate] Delete failed:", delErr);
            }

            const createResponse = await admin.graphql(`
              #graphql
              mutation discountAutomaticBxgyCreate($automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
                discountAutomaticBxgyCreate(automaticBxgyDiscount: $automaticBxgyDiscount) {
                  automaticDiscountNode {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `, {
              variables: { automaticBxgyDiscount }
            });
            const createJson = await createResponse.json();
            const createErrors = createJson.data?.discountAutomaticBxgyCreate?.userErrors || [];
            if (createErrors.length > 0) {
              console.error("[CartElevate] Failed to recreate BXGY discount:", createErrors);
            } else {
              const newId = createJson.data?.discountAutomaticBxgyCreate?.automaticDiscountNode?.id;
              if (newId) {
                goal.rewardAutomaticDiscountId = newId;
                console.log(`[CartElevate] Recreated automatic BXGY discount: ${newId}`);
              }
            }
          } else {
            console.log(`[CartElevate] Updated automatic BXGY discount: ${goal.rewardAutomaticDiscountId}`);
          }
        } catch (err) {
          console.error(`[CartElevate] Error during BXGY discount update:`, err);
        }
      } else {
        try {
          console.log(`[CartElevate] Creating new automatic BXGY discount for variant ${variantGid}`);
          const response = await admin.graphql(`
            #graphql
            mutation discountAutomaticBxgyCreate($automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
              discountAutomaticBxgyCreate(automaticBxgyDiscount: $automaticBxgyDiscount) {
                automaticDiscountNode {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: { automaticBxgyDiscount }
          });

          const resJson = await response.json();
          const errors = resJson.data?.discountAutomaticBxgyCreate?.userErrors || [];
          if (errors.length > 0) {
            console.error("[CartElevate] Failed to create automatic BXGY discount:", errors);
          } else {
            const newId = resJson.data?.discountAutomaticBxgyCreate?.automaticDiscountNode?.id;
            if (newId) {
              goal.rewardAutomaticDiscountId = newId;
              console.log(`[CartElevate] Created automatic BXGY discount: ${newId}`);
            }
          }
        } catch (err) {
          console.error("[CartElevate] Error during BXGY discount creation:", err);
        }
      }
    } else {
      if (goal.rewardAutomaticDiscountId) {
        try {
          console.log(`[CartElevate] Deleting automatic discount because type changed: ${goal.rewardAutomaticDiscountId}`);
          const deleteResponse = await admin.graphql(`
            #graphql
            mutation discountAutomaticDelete($id: ID!) {
              discountAutomaticDelete(id: $id) {
                deletedAutomaticDiscountId
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: { id: goal.rewardAutomaticDiscountId }
          });
          const deleteJson = await deleteResponse.json();
          const deleteErrors = deleteJson.data?.discountAutomaticDelete?.userErrors || [];
          if (deleteErrors.length > 0) {
            console.error(`[CartElevate] Failed to delete discount: ${goal.rewardAutomaticDiscountId}`, deleteErrors);
          }
        } catch (err) {
          console.error(`[CartElevate] Failed to delete discount: ${goal.rewardAutomaticDiscountId}`, err);
        }
        goal.rewardAutomaticDiscountId = "";
      }
    }
  }

  // Get Shop GID
  let shopId = null;
  try {
    const shopIdResponse = await admin.graphql(`
      #graphql
      query getShopId {
        shop {
          id
        }
      }
    `);
    const shopIdJson = await shopIdResponse.json();
    shopId = shopIdJson.data?.shop?.id;
  } catch (err) {
    console.error("Error getting shop GID:", err);
    return { success: false, error: "Failed to get Shop GID" };
  }

  if (!shopId) {
    return { success: false, error: "Shop ID not found" };
  }

  // Get product details for all upsell products
  let upsellProductsDetails = [];
  const realProductIds = upsellProducts.filter((id) => id.startsWith("gid://shopify/Product/"));
  const mockProductIds = upsellProducts.filter((id) => !id.startsWith("gid://shopify/Product/"));

  if (realProductIds.length > 0) {
    try {
      const productDetailResponse = await admin.graphql(`
        #graphql
        query getProductDetails($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredImage {
                url
              }
              variants(first: 1) {
                nodes {
                  id
                  price
                  compareAtPrice
                }
              }
            }
          }
        }
      `, {
        variables: { ids: realProductIds }
      });
      const detailJson = await productDetailResponse.json();
      const nodes = detailJson.data?.nodes || [];
      nodes.forEach((productNode) => {
        if (productNode) {
          upsellProductsDetails.push({
            id: productNode.id,
            title: productNode.title,
            price: parseFloat(productNode.variants?.nodes?.[0]?.price) || 0,
            image: productNode.featuredImage?.url || "",
            compareAtPrice: parseFloat(productNode.variants?.nodes?.[0]?.compareAtPrice) || null,
            available: true,
            variantId: (productNode.variants?.nodes?.[0]?.id || "").split("/").pop(),
          });
        }
      });
    } catch (err) {
      console.error("Error fetching real product details:", err);
    }
  }

  // Resolve mock products
  const mockUpsells = {
    "upsell-1": {
      id: 'upsell-1',
      title: 'Minimalist Leather Wallet',
      price: 19.99,
      image: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=120&h=120&fit=crop',
      compareAtPrice: null,
      available: true,
      variantId: 'gid://shopify/ProductVariant/mock-1',
    },
    "upsell-2": {
      id: 'upsell-2',
      title: 'Ceramic Travel Mug',
      price: 49.99,
      image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=120&h=120&fit=crop',
      compareAtPrice: 69.99,
      available: true,
      variantId: 'gid://shopify/ProductVariant/mock-2',
    },
    "upsell-3": {
      id: 'upsell-3',
      title: 'Wool Knit Phone Case',
      price: 14.99,
      image: 'https://images.unsplash.com/photo-1565992441121-4367c2967103?w=120&h=120&fit=crop',
      compareAtPrice: null,
      available: true,
      variantId: 'gid://shopify/ProductVariant/mock-3',
    },
  };
  mockProductIds.forEach((id) => {
    if (mockUpsells[id]) {
      upsellProductsDetails.push(mockUpsells[id]);
    }
  });

  // Resolve App URL dynamically from current request to tell storefront client where to log analytics
  const requestUrl = new URL(request.url);
  const appUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  // Read optional custom pricing inputs (defaults to 2.99 / 4.99 if not provided in future UI)
  const packageProtectionPrice = parseFloat(formData.get("packageProtectionPrice")) || 2.99;
  const giftWrappingPrice = parseFloat(formData.get("giftWrappingPrice")) || 4.99;

  // Construct settings object (metafields need the appUrl injected)
  const settingsJson = JSON.stringify({
    goals,
    selectedTheme,
    upsellProducts,
    upsellProduct: upsellProducts[0] || "", // fallback for backward compatibility
    selectedToggle,
    upsellProductsDetails,
    upsellProductDetail: upsellProductsDetails[0] || null, // fallback for backward compatibility
    packageProtectionPrice,
    giftWrappingPrice,
    appUrl,
  });

  // Sync settings directly to Neon DB
  try {
    await prisma.settings.upsert({
      where: { shop: session.shop },
      update: {
        isEnabled: true,
        selectedTheme,
        selectedToggle,
        packageProtectionPrice,
        giftWrappingPrice,
        goals: JSON.stringify(goals),
        upsellProducts: JSON.stringify(upsellProducts),
      },
      create: {
        shop: session.shop,
        isEnabled: true,
        selectedTheme,
        selectedToggle,
        packageProtectionPrice,
        giftWrappingPrice,
        goals: JSON.stringify(goals),
        upsellProducts: JSON.stringify(upsellProducts),
      },
    });
    console.log(`[CartElevate] Settings synced to database for shop ${session.shop}`);
  } catch (err) {
    console.error("[CartElevate] Failed to sync settings to database:", err);
  }

  // Set the metafield
  try {
    const metafieldResponse = await admin.graphql(`
      #graphql
      mutation setSettingsMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
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
            key: "settings",
            value: settingsJson,
            type: "json",
          },
        ],
      },
    });

    const responseJson = await metafieldResponse.json();
    const userErrors = responseJson.data?.metafieldsSet?.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("Metafield creation errors:", userErrors);
      return { success: false, error: userErrors[0].message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error setting metafield:", err);
    return { success: false, error: err.message };
  }
};

export default function Settings() {
  const data = useLoaderData();
  const actionData = useActionData();
  return (
    <SettingsPage
      shop={data?.shop}
      initialAppEnabled={data?.isAppEnabled}
      savedSettings={data?.savedSettings}
      actionData={actionData}
      products={data?.products}
    />
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
