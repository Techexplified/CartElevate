/**
 * Service to manage Package Protection & Gift Wrapping for CartElevate.
 *
 * KEY REQUIREMENT for storefront /cart/add.js to work:
 *   - Products must be ACTIVE
 *   - Products must be PUBLISHED to the Online Store sales channel
 *   - Variants must have a price (even $0.00 works)
 *
 * We handle all of this automatically when saving settings.
 */

export const DEFAULT_PROTECTION_WRAPPING_CONFIG = {
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
  serviceProductIds: {
    protectionProductId: null,
    protectionVariantId: null,
    giftWrappingProductId: null,
    giftWrappingVariantId: null,
  },
  updatedAt: null,
};

/**
 * Fetch current Protection and Wrapping configuration from Shopify Metafield.
 */
export async function getProtectionWrappingConfig(admin) {
  try {
    const metaRes = await admin.graphql(`
      query GetProtectionWrappingMetafield {
        shop {
          id
          currencyCode
          metafield(namespace: "cartelevate", key: "protection_wrapping") {
            value
          }
        }
      }
    `);
    const metaJson = await metaRes.json();
    const rawVal = metaJson?.data?.shop?.metafield?.value;
    const shopCurrency = metaJson?.data?.shop?.currencyCode || "USD";

    let parsed = null;
    if (rawVal) {
      try {
        parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      } catch (e) {
        console.warn("[CartElevate] Failed to parse protection_wrapping metafield:", e);
      }
    }

    return {
      protection: {
        enabled: parsed?.protection?.enabled !== undefined ? Boolean(parsed.protection.enabled) : DEFAULT_PROTECTION_WRAPPING_CONFIG.protection.enabled,
        priceType: parsed?.protection?.priceType === "flat" ? "flat" : "percentage",
        percentage: Number(parsed?.protection?.percentage) || DEFAULT_PROTECTION_WRAPPING_CONFIG.protection.percentage,
        flatFee: Number(parsed?.protection?.flatFee) || DEFAULT_PROTECTION_WRAPPING_CONFIG.protection.flatFee,
        description: parsed?.protection?.description || DEFAULT_PROTECTION_WRAPPING_CONFIG.protection.description,
      },
      giftWrapping: {
        enabled: parsed?.giftWrapping?.enabled !== undefined ? Boolean(parsed.giftWrapping.enabled) : DEFAULT_PROTECTION_WRAPPING_CONFIG.giftWrapping.enabled,
        applies: parsed?.giftWrapping?.applies === "per_item" ? "per_item" : "per_order",
        price: Number(parsed?.giftWrapping?.price) >= 0 ? Number(parsed.giftWrapping.price) : DEFAULT_PROTECTION_WRAPPING_CONFIG.giftWrapping.price,
        allowGiftNote: parsed?.giftWrapping?.allowGiftNote !== undefined ? Boolean(parsed.giftWrapping.allowGiftNote) : DEFAULT_PROTECTION_WRAPPING_CONFIG.giftWrapping.allowGiftNote,
        description: parsed?.giftWrapping?.description || DEFAULT_PROTECTION_WRAPPING_CONFIG.giftWrapping.description,
      },
      serviceProductIds: {
        protectionProductId: parsed?.serviceProductIds?.protectionProductId || null,
        protectionVariantId: parsed?.serviceProductIds?.protectionVariantId || null,
        giftWrappingProductId: parsed?.serviceProductIds?.giftWrappingProductId || null,
        giftWrappingVariantId: parsed?.serviceProductIds?.giftWrappingVariantId || null,
      },
      currency: shopCurrency,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch (err) {
    console.error("[CartElevate] Error fetching protection_wrapping config:", err);
    return { ...DEFAULT_PROTECTION_WRAPPING_CONFIG, currency: "USD" };
  }
}

/**
 * Helper: publish a product to the Online Store sales channel so
 * storefront /cart/add.js can add its variants to cart.
 * Uses REST API first (which requires only write_products scope),
 * falling back to GraphQL publishablePublish if publications scope exists.
 */
async function publishProductToOnlineStore(admin, productId, session) {
  const numericId = String(productId).replace(/\D+/g, "");

  // Method 1: Try REST API with session token (requires only write_products scope)
  try {
    let activeSession = session;
    if (!activeSession) {
      const prismaModule = await import("../db.server.js");
      const prisma = prismaModule.default || prismaModule;
      activeSession = await prisma.session.findFirst();
    }

    if (activeSession?.shop && activeSession?.accessToken && numericId) {
      const restRes = await fetch(`https://${activeSession.shop}/admin/api/2025-01/products/${numericId}.json`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": activeSession.accessToken,
        },
        body: JSON.stringify({
          product: {
            id: Number(numericId),
            published: true,
            published_at: new Date().toISOString(),
          },
        }),
      });

      const restJson = await restRes.json();
      if (restJson?.product?.published_at) {
        console.log(`[CartElevate] Successfully published product ${numericId} to Online Store via REST.`);
        return true;
      }
    }
  } catch (restErr) {
    console.warn("[CartElevate] REST publish attempt error:", restErr.message);
  }

  // Method 2: Fall back to GraphQL publishablePublish
  try {
    const pubRes = await admin.graphql(`
      query GetPublications {
        publications(first: 20) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `);
    const pubJson = await pubRes.json();
    const publications = pubJson?.data?.publications?.edges || [];

    let onlineStorePublicationId = null;
    for (const edge of publications) {
      const name = (edge.node?.name || "").toLowerCase();
      if (name.includes("online store") || name === "online store") {
        onlineStorePublicationId = edge.node.id;
        break;
      }
    }

    if (!onlineStorePublicationId && publications.length > 0) {
      onlineStorePublicationId = publications[0].node.id;
    }

    if (onlineStorePublicationId) {
      const publishRes = await admin.graphql(`
        mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable {
              ... on Product {
                id
                title
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          id: productId,
          input: [{ publicationId: onlineStorePublicationId }],
        },
      });

      const publishJson = await publishRes.json();
      const errors = publishJson?.data?.publishablePublish?.userErrors || [];
      if (errors.length === 0) {
        console.log(`[CartElevate] Successfully published product ${productId} to Online Store via GraphQL.`);
        return true;
      }
    }
  } catch (e) {
    console.warn("[CartElevate] GraphQL publish attempt error:", e.message);
  }

  return false;
}

/**
 * Create a single service product and return { productId, variantId }.
 * Also publishes it to Online Store so /cart/add.js works on the storefront.
 * Uses REST API first (handles variants with requires_shipping: false in one atomic call),
 * falling back to GraphQL productCreate without variants in payload (API 2024-04+ compatible).
 */
async function createServiceProduct(admin, { title, tag, description }, session = null) {
  let activeSession = session;
  if (!activeSession) {
    try {
      const prismaModule = await import("../db.server.js");
      const prisma = prismaModule.default || prismaModule;
      activeSession = await prisma.session.findFirst();
    } catch (_e) { /* ignore */ }
  }

  // Method 1: Try REST API (most reliable across all Shopify API versions)
  if (activeSession?.shop && activeSession?.accessToken) {
    try {
      const restRes = await fetch(`https://${activeSession.shop}/admin/api/2025-01/products.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": activeSession.accessToken,
        },
        body: JSON.stringify({
          product: {
            title,
            vendor: "CartElevate",
            product_type: "Service",
            status: "active",
            published: true,
            tags: `_cartelevate_service, ${tag}`,
            body_html: `<p>${description}</p>`,
            variants: [
              {
                price: "0.00",
                requires_shipping: false,
                taxable: false,
                inventory_management: null,
                inventory_policy: "continue",
              },
            ],
          },
        }),
      });

      const restJson = await restRes.json();
      const p = restJson?.product;
      if (p?.id) {
        const variantIdNum = p.variants?.[0]?.id;
        const productId = `gid://shopify/Product/${p.id}`;
        const variantId = variantIdNum ? `gid://shopify/ProductVariant/${variantIdNum}` : null;
        console.log(`[CartElevate] Created service product "${title}" via REST: ${productId}, variant: ${variantId}`);
        await publishProductToOnlineStore(admin, productId, activeSession);
        return { productId, variantId };
      }
      if (restJson?.errors) {
        console.warn(`[CartElevate] REST productCreate errors for "${title}":`, JSON.stringify(restJson.errors));
      }
    } catch (restErr) {
      console.warn(`[CartElevate] REST product create failed for "${title}":`, restErr.message);
    }
  }

  // Method 2: Modern GraphQL productCreate (API 2024-04+)
  // Note: productCreate in 2024-04+ takes `product: ProductCreateInput!` and does NOT accept `variants` in input.
  try {
    const modernRes = await admin.graphql(`
      mutation CreateServiceProductModern($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        product: {
          title,
          vendor: "CartElevate",
          productType: "Service",
          status: "ACTIVE",
          tags: ["_cartelevate_service", tag],
          descriptionHtml: `<p>${description}</p>`,
        },
      },
    });

    const modernJson = await modernRes.json();
    const modernErrors = modernJson?.data?.productCreate?.userErrors || [];
    const modernProduct = modernJson?.data?.productCreate?.product;

    if (modernProduct?.id && modernErrors.length === 0) {
      const variantId = modernProduct.variants?.edges?.[0]?.node?.id || null;
      console.log(`[CartElevate] Created service product "${title}" via GraphQL modern: ${modernProduct.id}, variant: ${variantId}`);
      await publishProductToOnlineStore(admin, modernProduct.id, activeSession);
      return { productId: modernProduct.id, variantId };
    }
  } catch (modernErr) {
    console.warn(`[CartElevate] GraphQL modern productCreate failed for "${title}":`, modernErr.message);
  }

  // Method 3: Fallback GraphQL productCreate(input: $input) without variants in payload
  try {
    const legacyRes = await admin.graphql(`
      mutation CreateServiceProductLegacy($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          title,
          vendor: "CartElevate",
          productType: "Service",
          status: "ACTIVE",
          tags: ["_cartelevate_service", tag],
          descriptionHtml: `<p>${description}</p>`,
        },
      },
    });

    const legacyJson = await legacyRes.json();
    const legacyProduct = legacyJson?.data?.productCreate?.product;
    if (legacyProduct?.id) {
      const variantId = legacyProduct.variants?.edges?.[0]?.node?.id || null;
      console.log(`[CartElevate] Created service product "${title}" via GraphQL legacy: ${legacyProduct.id}, variant: ${variantId}`);
      await publishProductToOnlineStore(admin, legacyProduct.id, activeSession);
      return { productId: legacyProduct.id, variantId };
    }
  } catch (legacyErr) {
    console.warn(`[CartElevate] GraphQL legacy productCreate failed for "${title}":`, legacyErr.message);
  }

  return null;
}

/**
 * Ensure hidden service products exist AND are published in the store
 * so checkout can add them as real line items via /cart/add.js.
 */
export async function ensureServiceProducts(admin, currentProductIds = {}, session = null) {
  const ids = { ...currentProductIds };

  let activeSession = session;
  if (!activeSession) {
    try {
      const prismaModule = await import("../db.server.js");
      const prisma = prismaModule.default || prismaModule;
      activeSession = await prisma.session.findFirst();
    } catch (_e) { /* ignore */ }
  }

  try {
    // 1. If product IDs already exist, verify they are still active in Shopify
    if (ids.protectionProductId) {
      try {
        const verifyRes = await admin.graphql(`
          query VerifyProduct($id: ID!) {
            product(id: $id) {
              id
              status
              publishedAt
              variants(first: 1) {
                edges { node { id } }
              }
            }
          }
        `, { variables: { id: ids.protectionProductId } });
        const verifyJson = await verifyRes.json();
        const p = verifyJson?.data?.product;
        if (p?.id) {
          ids.protectionProductId = p.id;
          ids.protectionVariantId = p.variants?.edges?.[0]?.node?.id || ids.protectionVariantId;
          if (!p.publishedAt) {
            await publishProductToOnlineStore(admin, p.id, activeSession);
          }
        } else {
          ids.protectionProductId = null;
          ids.protectionVariantId = null;
        }
      } catch (e) {
        ids.protectionProductId = null;
        ids.protectionVariantId = null;
      }
    }

    if (ids.giftWrappingProductId) {
      try {
        const verifyRes = await admin.graphql(`
          query VerifyProduct($id: ID!) {
            product(id: $id) {
              id
              status
              publishedAt
              variants(first: 1) {
                edges { node { id } }
              }
            }
          }
        `, { variables: { id: ids.giftWrappingProductId } });
        const verifyJson = await verifyRes.json();
        const p = verifyJson?.data?.product;
        if (p?.id) {
          ids.giftWrappingProductId = p.id;
          ids.giftWrappingVariantId = p.variants?.edges?.[0]?.node?.id || ids.giftWrappingVariantId;
          if (!p.publishedAt) {
            await publishProductToOnlineStore(admin, p.id, activeSession);
          }
        } else {
          ids.giftWrappingProductId = null;
          ids.giftWrappingVariantId = null;
        }
      } catch (e) {
        ids.giftWrappingProductId = null;
        ids.giftWrappingVariantId = null;
      }
    }

    // 2. Query existing products tagged with CartElevate service tags or titles
    if (!ids.protectionProductId || !ids.protectionVariantId || !ids.giftWrappingProductId || !ids.giftWrappingVariantId) {
      const queryRes = await admin.graphql(`
        query FindServiceProducts {
          products(first: 20, query: "tag:cartelevate-protection OR tag:cartelevate-gift-wrapping OR vendor:CartElevate OR title:'Package Protection' OR title:'Gift Wrapping'") {
            edges {
              node {
                id
                title
                status
                tags
                publishedAt
                variants(first: 1) {
                  edges {
                    node {
                      id
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `);
      const queryJson = await queryRes.json();
      const edges = queryJson?.data?.products?.edges || [];

      for (const edge of edges) {
        const p = edge.node;
        const tags = Array.isArray(p.tags) ? p.tags : [];
        const firstVariantId = p.variants?.edges?.[0]?.node?.id || null;

        if ((!ids.protectionProductId || !ids.protectionVariantId) && (tags.includes("cartelevate-protection") || p.title.includes("Package Protection"))) {
          ids.protectionProductId = p.id;
          ids.protectionVariantId = firstVariantId;
          if (!p.publishedAt) {
            await publishProductToOnlineStore(admin, p.id, activeSession);
          }
        }
        if ((!ids.giftWrappingProductId || !ids.giftWrappingVariantId) && (tags.includes("cartelevate-gift-wrapping") || p.title.includes("Gift Wrapping"))) {
          ids.giftWrappingProductId = p.id;
          ids.giftWrappingVariantId = firstVariantId;
          if (!p.publishedAt) {
            await publishProductToOnlineStore(admin, p.id, activeSession);
          }
        }
      }
    }

    // 3. Create Package Protection product if missing
    if (!ids.protectionProductId || !ids.protectionVariantId) {
      console.log("[CartElevate] Creating [CartElevate] Package Protection service product...");
      const result = await createServiceProduct(admin, {
        title: "[CartElevate] Package Protection",
        tag: "cartelevate-protection",
        description: "CartElevate automated package protection guarantee against loss, theft, or damage.",
      }, activeSession);
      if (result) {
        ids.protectionProductId = result.productId;
        ids.protectionVariantId = result.variantId;
        console.log(`[CartElevate] Package Protection created: productId=${result.productId} variantId=${result.variantId}`);
      }
    }

    // 4. Create Gift Wrapping product if missing
    if (!ids.giftWrappingProductId || !ids.giftWrappingVariantId) {
      console.log("[CartElevate] Creating [CartElevate] Gift Wrapping service product...");
      const result = await createServiceProduct(admin, {
        title: "[CartElevate] Gift Wrapping",
        tag: "cartelevate-gift-wrapping",
        description: "CartElevate professional gift wrapping service for your order.",
      }, activeSession);
      if (result) {
        ids.giftWrappingProductId = result.productId;
        ids.giftWrappingVariantId = result.variantId;
        console.log(`[CartElevate] Gift Wrapping created: productId=${result.productId} variantId=${result.variantId}`);
      }
    }

  } catch (e) {
    console.warn("[CartElevate] Service product check failed:", e.message);
  }

  return ids;
}

/**
 * Save Protection & Wrapping configuration to Shopify Shop Metafield.
 */
export async function saveProtectionWrappingConfig({ admin, session = null, config }) {
  try {
    // 1. Get Shop ID
    const shopRes = await admin.graphql(`query { shop { id } }`);
    const shopJson = await shopRes.json();
    const shopId = shopJson?.data?.shop?.id;

    if (!shopId) {
      throw new Error("Unable to retrieve shop ID from Shopify Admin API.");
    }

    // 2. Provision / verify & publish service products
    const serviceProductIds = await ensureServiceProducts(admin, config.serviceProductIds || {}, session);

    console.log("[CartElevate] Service product IDs after ensure:", JSON.stringify(serviceProductIds));

    const updatedConfig = {
      protection: {
        enabled: Boolean(config.protection?.enabled),
        priceType: config.protection?.priceType === "flat" ? "flat" : "percentage",
        percentage: Number(config.protection?.percentage) || 2,
        flatFee: Number(config.protection?.flatFee) || 1.99,
        description: String(config.protection?.description || "Protect your order from loss or damage").trim(),
      },
      giftWrapping: {
        enabled: Boolean(config.giftWrapping?.enabled),
        applies: config.giftWrapping?.applies === "per_item" ? "per_item" : "per_order",
        price: Number(config.giftWrapping?.price) >= 0 ? Number(config.giftWrapping.price) : 4.0,
        allowGiftNote: Boolean(config.giftWrapping?.allowGiftNote),
        description: String(config.giftWrapping?.description || "Add gift wrapping").trim(),
      },
      serviceProductIds,
      appUrl: process.env.SHOPIFY_APP_URL || "",
      updatedAt: new Date().toISOString(),
    };

    // 3. Sync variant prices with Shopify so Checkout displays configured prices instead of FREE
    try {
      let activeSession = session;
      if (!activeSession) {
        const prismaModule = await import("../db.server.js");
        const prisma = prismaModule.default || prismaModule;
        activeSession = await prisma.session.findFirst();
      }

      if (activeSession?.shop && activeSession?.accessToken) {
        // Sync Gift Wrapping variant price
        if (serviceProductIds.giftWrappingVariantId) {
          const giftVarNum = String(serviceProductIds.giftWrappingVariantId).replace(/\D+/g, "");
          const giftPriceFormatted = Number(updatedConfig.giftWrapping.price || 4.0).toFixed(2);
          await fetch(`https://${activeSession.shop}/admin/api/2025-01/variants/${giftVarNum}.json`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": activeSession.accessToken,
            },
            body: JSON.stringify({ variant: { id: giftVarNum, price: giftPriceFormatted } }),
          });
          console.log(`[CartElevate] Synced Gift Wrapping variant ${giftVarNum} price to $${giftPriceFormatted}`);
        }

        // Sync Package Protection variant price (only force flatFee if flat pricing is selected)
        if (serviceProductIds.protectionVariantId && updatedConfig.protection.priceType === "flat") {
          const protVarNum = String(serviceProductIds.protectionVariantId).replace(/\D+/g, "");
          const protPriceFormatted = Number(updatedConfig.protection.flatFee || 1.99).toFixed(2);
          await fetch(`https://${activeSession.shop}/admin/api/2025-01/variants/${protVarNum}.json`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": activeSession.accessToken,
            },
            body: JSON.stringify({ variant: { id: protVarNum, price: protPriceFormatted } }),
          });
          console.log(`[CartElevate] Synced Package Protection variant ${protVarNum} flat price to $${protPriceFormatted}`);
        }
      }
    } catch (priceErr) {
      console.warn("[CartElevate] Error syncing variant prices:", priceErr.message);
    }

    // 4. Save to shop metafield
    const metaRes = await admin.graphql(`
      mutation SaveProtectionWrappingMetafield($metafields: [MetafieldsSetInput!]!) {
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
    `, {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "cartelevate",
            key: "protection_wrapping",
            type: "json",
            value: JSON.stringify(updatedConfig),
          },
        ],
      },
    });

    const metaJson = await metaRes.json();
    const userErrors = metaJson?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("[CartElevate] MetafieldsSet userErrors:", JSON.stringify(userErrors));
      return { success: false, error: userErrors[0]?.message || "Failed to update metafield", config: updatedConfig };
    }

    return { success: true, config: updatedConfig };
  } catch (err) {
    console.error("[CartElevate] Failed to save protection_wrapping config:", err);
    return { success: false, error: err.message };
  }
}
