/**
 * Service to manage Shopify Automatic Free Shipping Discounts for CartElevate.
 * Automatically synchronizes shipping threshold rules to Shopify Checkout.
 */

export const POST_PURCHASE_DISCOUNT_TTL_MS = 30 * 60 * 1000; // 30 minutes auto-expiration window

export async function syncFreeShippingAutomaticDiscount({
  admin,
  goalType,
  shippingThreshold,
  currencySymbol = "$",
  existingDiscountId = null,
}) {
  const requiresFreeShipping = goalType === "free_shipping" || goalType === "both";
  const numThreshold = parseFloat(shippingThreshold) || 75;
  const formattedThreshold = numThreshold.toFixed(2);
  const discountTitle = `Free Shipping over ${currencySymbol}${numThreshold} (CartElevate)`;

  console.log(
    `[CartElevate Discount Sync] Goal: ${goalType}, requiresFreeShipping: ${requiresFreeShipping}, existingId: ${existingDiscountId}`
  );

  // 1. If Free Shipping is NOT selected (e.g. merchant chose free_gift only)
  if (!requiresFreeShipping) {
    if (existingDiscountId) {
      try {
        console.log(
          `[CartElevate Discount Sync] Deleting free shipping discount ${existingDiscountId} as goalType is ${goalType}`
        );
        const deleteRes = await admin.graphql(
          `#graphql
          mutation DeleteAutomaticDiscount($id: ID!) {
            discountAutomaticDelete(id: $id) {
              deletedAutomaticDiscountId
              userErrors {
                field
                message
              }
            }
          }`,
          { variables: { id: existingDiscountId } }
        );
        const data = await deleteRes.json();
        console.log("[CartElevate Discount Sync] Delete result:", JSON.stringify(data));
      } catch (delErr) {
        console.warn("[CartElevate Discount Sync] Delete discount error:", delErr.message);
      }
    }
    return null;
  }

  // 2. If Free Shipping IS required:
  // If we already have an existing discountId, try updating it
  if (existingDiscountId) {
    try {
      console.log(`[CartElevate Discount Sync] Updating existing discount ${existingDiscountId}...`);
      const updateRes = await admin.graphql(
        `#graphql
        mutation UpdateFreeShippingDiscount($id: ID!, $freeShippingAutomaticDiscount: DiscountAutomaticFreeShippingInput!) {
          discountAutomaticFreeShippingUpdate(id: $id, freeShippingAutomaticDiscount: $freeShippingAutomaticDiscount) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticFreeShipping {
                  title
                  status
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            id: existingDiscountId,
            freeShippingAutomaticDiscount: {
              title: discountTitle,
              minimumRequirement: {
                subtotal: {
                  greaterThanOrEqualToSubtotal: formattedThreshold,
                },
              },
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: true,
              },
            },
          },
        }
      );

      const updateData = await updateRes.json();
      const node = updateData?.data?.discountAutomaticFreeShippingUpdate?.automaticDiscountNode;
      const userErrors = updateData?.data?.discountAutomaticFreeShippingUpdate?.userErrors || [];

      if (node?.id) {
        console.log(
          `[CartElevate Discount Sync] Successfully updated discount ${node.id} to threshold ${formattedThreshold}`
        );
        return node.id;
      }

      console.warn(`[CartElevate Discount Sync] Update returned errors:`, JSON.stringify(userErrors));
    } catch (updateErr) {
      console.warn("[CartElevate Discount Sync] Update discount failed:", updateErr.message);
    }
  }

  // 3. Create a new Automatic Free Shipping discount
  try {
    console.log(
      `[CartElevate Discount Sync] Creating new Automatic Free Shipping discount for threshold ${formattedThreshold}...`
    );
    const createRes = await admin.graphql(
      `#graphql
      mutation CreateFreeShippingDiscount($freeShippingAutomaticDiscount: DiscountAutomaticFreeShippingInput!) {
        discountAutomaticFreeShippingCreate(freeShippingAutomaticDiscount: $freeShippingAutomaticDiscount) {
          automaticDiscountNode {
            id
            automaticDiscount {
              ... on DiscountAutomaticFreeShipping {
                title
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          freeShippingAutomaticDiscount: {
            title: discountTitle,
            startsAt: new Date(Date.now() - 60000).toISOString(),
            minimumRequirement: {
              subtotal: {
                greaterThanOrEqualToSubtotal: formattedThreshold,
              },
            },
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
            },
          },
        },
      }
    );

    const createData = await createRes.json();
    const node = createData?.data?.discountAutomaticFreeShippingCreate?.automaticDiscountNode;
    const userErrors = createData?.data?.discountAutomaticFreeShippingCreate?.userErrors || [];

    if (node?.id) {
      console.log(
        `[CartElevate Discount Sync] Successfully created discount ${node.id} with status ${node.automaticDiscount?.status}`
      );
      return node.id;
    }

    console.error("[CartElevate Discount Sync] Create discount userErrors:", JSON.stringify(userErrors));
    return null;
  } catch (createErr) {
    console.error("[CartElevate Discount Sync] Create discount error:", createErr.message);
    return null;
  }
}

/**
 * Service to manage Shopify Automatic 100% Product Discount for Free Gifts.
 * Automatically cleans up any obsolete automatic discount nodes.
 */
export async function syncFreeGiftAutomaticDiscount({
  admin,
  existingDiscountId = null,
}) {
  // If an obsolete Shopify automatic discount exists from the previous BXGY implementation, delete it cleanly
  if (existingDiscountId) {
    try {
      console.log(`[CartElevate Free Gift Sync] Cleaning up previous discount node ${existingDiscountId}...`);
      await admin.graphql(
        `#graphql
        mutation DeleteAutomaticDiscount($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors {
              field
              message
            }
          }
        }`,
        { variables: { id: existingDiscountId } }
      );
    } catch (delErr) {
      console.warn("[CartElevate Free Gift Sync] Previous discount cleanup error:", delErr.message);
    }
  }

  // Free gifts are managed as promotional order attributes for fulfillment, requiring no catalog product discounts
  return null;
}

/**
 * Completely removes/deletes all Shopify automatic discounts associated with a Volume Bundle.
 * Deletes by stored discount IDs and sweeps Shopify Admin for any matching automatic discount nodes.
 */
export async function deleteVolumeDiscounts({ admin, bundle = null, bundleId = null }) {
  const idsToDelete = new Set();

  if (bundle && Array.isArray(bundle.shopifyDiscountIds)) {
    bundle.shopifyDiscountIds.forEach((id) => {
      if (id) idsToDelete.add(id);
    });
  }

  // Sweep Shopify Admin for any automatic discounts matching "Volume discount", bundle name, or tier buy patterns
  try {
    const res = await admin.graphql(
      `#graphql
      query GetAllVolumeDiscounts {
        automaticDiscountNodes(first: 100) {
          nodes {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                title
                status
              }
              ... on DiscountAutomaticBxgy {
                title
                status
              }
              ... on DiscountAutomaticFreeShipping {
                title
                status
              }
            }
          }
        }
      }`
    );
    const json = await res.json();
    const nodes = json?.data?.automaticDiscountNodes?.nodes || [];
    for (const node of nodes) {
      const title = (node?.automaticDiscount?.title || "").trim();
      const lowerTitle = title.toLowerCase();

      const matchesVolumeKeyword = lowerTitle.includes("volume discount");
      const matchesBundleName = bundle?.name && title.includes(bundle.name) && title.includes("- Buy ");
      const matchesTierPattern = title.includes("- Buy ") && (lowerTitle.includes("% off") || lowerTitle.includes("% off)"));
      const isBundleIdMatch = bundleId && title.includes(bundleId);

      if (
        idsToDelete.has(node.id) ||
        matchesVolumeKeyword ||
        matchesBundleName ||
        matchesTierPattern ||
        isBundleIdMatch
      ) {
        if (node?.id) {
          idsToDelete.add(node.id);
        }
      }
    }
  } catch (err) {
    console.warn("[CartElevate Volume Sync] Error sweeping orphan discounts:", err?.message);
  }

  // Delete all identified discount nodes from Shopify
  for (const discId of idsToDelete) {
    try {
      console.log(`[CartElevate Volume Sync] Deleting volume discount node ${discId}...`);
      await admin.graphql(
        `#graphql
        mutation DeleteVolumeDiscount($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors {
              field
              message
            }
          }
        }`,
        { variables: { id: discId } }
      );
    } catch (e) {
      console.warn("[CartElevate Volume Sync] Error deleting discount:", discId, e?.message);
    }
  }

  return true;
}

/**
 * Service to manage Shopify Automatic Basic Discounts for Volume Discount Tiers.
 * Automatically synchronizes tiers to Shopify Checkout.
 */
export async function syncBundleVolumeAutomaticDiscounts({
  admin,
  bundle,
  previousDiscountIds = [],
  collectionGids = [],
}) {
  const createdDiscountIds = [];

  // 1. Delete previous Shopify automatic discounts by ID
  const allOldIds = new Set(previousDiscountIds.filter(Boolean));
  if (bundle && Array.isArray(bundle.shopifyDiscountIds)) {
    bundle.shopifyDiscountIds.forEach((id) => {
      if (id) allOldIds.add(id);
    });
  }

  for (const oldId of allOldIds) {
    try {
      console.log(`[CartElevate Bundle Sync] Deleting previous discount ${oldId}...`);
      await admin.graphql(
        `#graphql
        mutation DeleteAutomaticDiscount($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors {
              field
              message
            }
          }
        }`,
        { variables: { id: oldId } }
      );
    } catch (e) {
      console.warn("[CartElevate Bundle Sync] Error deleting old automatic discount:", oldId, e?.message);
    }
  }

  // 2. If bundle is not published, sweep any orphan discounts for this bundle and stop
  if (!bundle || bundle.status !== "PUBLISHED" || !Array.isArray(bundle.tiers) || bundle.tiers.length === 0) {
    console.log("[CartElevate Bundle Sync] Bundle not published or has no tiers, cleaning up any orphans...");
    await deleteVolumeDiscounts({ admin, bundle });
    return createdDiscountIds;
  }

  // 3. Prepare customer gets items specification
  let itemsInput = { all: true };
  if (bundle.appliesTo === "specific_products" && Array.isArray(bundle.products) && bundle.products.length > 0) {
    const productGids = bundle.products
      .map((p) => {
        const rawId = p.id || p;
        if (!rawId) return null;
        return String(rawId).startsWith("gid://") ? String(rawId) : `gid://shopify/Product/${rawId}`;
      })
      .filter(Boolean);

    if (productGids.length > 0) {
      itemsInput = {
        products: {
          productsToAdd: productGids,
        },
      };
    }
  } else if (bundle.appliesTo === "specific_collection") {
    let gids = Array.isArray(collectionGids) ? collectionGids.slice() : [];
    if (gids.length === 0 && Array.isArray(bundle.collections) && bundle.collections.length > 0) {
      gids = bundle.collections
        .map((c) => (typeof c === "object" ? c.id : c))
        .filter(Boolean);
    }
    let formattedGids = gids
      .filter((id) => !isNaN(Number(String(id).split("/").pop())))
      .map((id) =>
        String(id).startsWith("gid://") ? String(id) : `gid://shopify/Collection/${id}`
      );

    // If still empty or collections contains titles, resolve via GraphQL query
    if (formattedGids.length === 0 && Array.isArray(bundle.collections) && bundle.collections.length > 0) {
      for (const col of bundle.collections) {
        const title = typeof col === "object" ? col.title : col;
        if (!title) continue;
        try {
          const colQuery = await admin.graphql(
            `#graphql
            query FindCollection($query: String!) {
              collections(first: 1, query: $query) {
                nodes {
                  id
                }
              }
            }`,
            { variables: { query: `title:${title}` } }
          );
          const colJson = await colQuery.json();
          const foundId = colJson?.data?.collections?.nodes?.[0]?.id;
          if (foundId && !formattedGids.includes(foundId)) {
            formattedGids.push(foundId);
          }
        } catch (e) {
          console.warn("[CartElevate Bundle Sync] Error resolving collection GID:", e?.message);
        }
      }
    }

    if (formattedGids.length > 0) {
      itemsInput = {
        collections: {
          add: formattedGids,
        },
      };
    }
  }

  // 4. Create an automatic discount rule in Shopify for each tier
  const tiers = (bundle.tiers || []).slice().sort((a, b) => (Number(a.buyQty) || 0) - (Number(b.buyQty) || 0));

  for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
    const tier = tiers[tierIdx];
    const buyQty = Number(tier.buyQty) || 1;
    const discountPct = Number(tier.discountPercent) || 0;
    if (buyQty <= 0 || discountPct <= 0) continue;

    // Build a clean, customer-friendly title without developer prefixes or raw IDs
    let scopeLabel = "";
    if (bundle.appliesTo === "specific_products" && bundle.targetProducts) {
      scopeLabel = ` (${bundle.targetProducts})`;
    } else if (bundle.appliesTo === "specific_collection" && bundle.targetCollection) {
      scopeLabel = ` (${bundle.targetCollection})`;
    }

    const baseName = bundle.name && bundle.name !== "Volume discount" ? bundle.name : "Volume discount";
    let discountTitle = `${baseName}${scopeLabel} - Buy ${buyQty}+ (${discountPct}% off)`;

    const createDiscountCall = async (titleToUse) => {
      return await admin.graphql(
        `#graphql
        mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  title
                  status
                }
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }`,
        {
          variables: {
            automaticBasicDiscount: {
              title: titleToUse,
              startsAt: new Date(Date.now() - 60000).toISOString(),
              customerGets: {
                value: {
                  percentage: discountPct / 100,
                },
                items: itemsInput,
              },
              minimumRequirement: {
                quantity: {
                  greaterThanOrEqualToQuantity: String(buyQty),
                },
              },
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: false,
                shippingDiscounts: true,
              },
            },
          },
        }
      );
    };

    try {
      console.log(`[CartElevate Bundle Sync] Creating automatic discount for Buy ${buyQty}+ Save ${discountPct}%...`);
      let res = await createDiscountCall(discountTitle);
      let json = await res.json();
      let node = json?.data?.discountAutomaticBasicCreate?.automaticDiscountNode;
      let userErrors = json?.data?.discountAutomaticBasicCreate?.userErrors || [];
      let gqlErrors = json?.errors || [];

      // If title is already taken, retry with a clean tier label (never raw ID digits)
      const isTitleTaken =
        userErrors.some((e) => e.code === "TAKEN" || (e.message && e.message.toLowerCase().includes("taken"))) ||
        gqlErrors.some((e) => e.message && e.message.toLowerCase().includes("taken"));

      if (!node?.id && isTitleTaken) {
        discountTitle = `${baseName}${scopeLabel} - Tier ${tierIdx + 1}: Buy ${buyQty}+ (${discountPct}% off)`;
        console.log(`[CartElevate Bundle Sync] Retrying with clean title: ${discountTitle}`);
        res = await createDiscountCall(discountTitle);
        json = await res.json();
        node = json?.data?.discountAutomaticBasicCreate?.automaticDiscountNode;
        userErrors = json?.data?.discountAutomaticBasicCreate?.userErrors || [];
        gqlErrors = json?.errors || [];
      }

      if (node?.id) {
        console.log(`[CartElevate Bundle Sync] Created discount ${node.id} (${discountTitle})`);
        createdDiscountIds.push(node.id);
      } else {
        console.error(
          `[CartElevate Bundle Sync] Errors for ${discountTitle}:`,
          JSON.stringify(gqlErrors.length > 0 ? gqlErrors : userErrors)
        );
      }
    } catch (err) {
      console.error("[CartElevate Bundle Sync] Error creating automatic discount for tier:", tier, err.message);
    }
  }

  return createdDiscountIds;
}

/**
 * Service to manage Shopify Automatic Discount for Post-Purchase / Pre-Checkout Upsell Offers.
 * - Uses BXGY with usesPerOrderLimit: "1" and discountOnQuantity: "1" so only 1 unit is discounted.
 * - Sets an `endsAt` timestamp (default 1 hour) so Shopify automatically expires the discount.
 * - Keeps the discount DEACTIVATED by default until the customer clicks "Add" on the modal.
 */
export async function syncPostPurchaseAutomaticDiscount({
  admin,
  offer,
  previousDiscountId = null,
  initialActive = true,
  ttlMs = null,
}) {
  console.log(
    `[CartElevate Post-Purchase Sync] Syncing discount for offer:`,
    offer?.name,
    `status:`,
    offer?.status,
    `prevId:`,
    previousDiscountId,
    `initialActive:`,
    initialActive
  );

  // 1. Delete previous discount if exists
  if (previousDiscountId) {
    try {
      console.log(`[CartElevate Post-Purchase Sync] Deleting previous discount ${previousDiscountId}...`);
      await admin.graphql(
        `#graphql
        mutation DeleteAutomaticDiscount($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors {
              field
              message
            }
          }
        }`,
        { variables: { id: previousDiscountId } }
      );
    } catch (e) {
      console.warn("[CartElevate Post-Purchase Sync] Error deleting old discount:", previousDiscountId, e.message);
    }
  }

  // 2. Clean up any existing orphan "Post-Purchase Deal:" discounts to prevent TAKEN title errors
  try {
    const existingQuery = await admin.graphql(
      `#graphql
      query FindExistingPostPurchaseDiscounts {
        automaticDiscountNodes(first: 25, query: "title:Post-Purchase Deal") {
          nodes {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                title
              }
              ... on DiscountAutomaticBxgy {
                title
              }
            }
          }
        }
      }`
    );
    const existingJson = await existingQuery.json();
    const existingNodes = existingJson?.data?.automaticDiscountNodes?.nodes || [];
    for (const node of existingNodes) {
      const title = node?.automaticDiscount?.title || "";
      if (node?.id && title.includes("Post-Purchase Deal:") && title.includes("(CartElevate)")) {
        await admin.graphql(
          `#graphql
          mutation DeleteOrphanPostPurchaseDiscount($id: ID!) {
            discountAutomaticDelete(id: $id) {
              deletedAutomaticDiscountId
            }
          }`,
          { variables: { id: node.id } }
        );
      }
    }
  } catch (cleanupErr) {
    console.warn("[CartElevate Post-Purchase Sync] Cleanup query warning:", cleanupErr.message);
  }

  // 3. If offer is not published or missing product or discount <= 0, return null
  if (!offer || offer.status !== "PUBLISHED" || !offer.productId) {
    console.log("[CartElevate Post-Purchase Sync] Offer not active or missing product. No discount created.");
    return null;
  }

  const discountPct = Number(offer.discountPercentage) || 20;
  if (discountPct <= 0) return null;

  const prodGid = String(offer.productId).startsWith("gid://")
    ? String(offer.productId)
    : `gid://shopify/Product/${offer.productId}`;

  const discountTitle = `Post-Purchase Deal: ${discountPct}% off ${offer.productTitle || "Special Offer"} (CartElevate)`;

  const startsAt = new Date(Date.now() - 60000).toISOString();
  const endsAt = ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null;

  try {
    console.log(
      `[CartElevate Post-Purchase Sync] Creating Automatic Basic discount for all quantities of product ${prodGid} (${discountPct}% off, initialActive: ${initialActive})...`
    );

    const discountInput = {
      title: discountTitle,
      startsAt,
      customerGets: {
        value: {
          percentage: discountPct / 100,
        },
        items: {
          products: {
            productsToAdd: [prodGid],
          },
        },
      },
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: true,
      },
    };

    if (endsAt) {
      discountInput.endsAt = endsAt;
    }

    const basicRes = await admin.graphql(
      `#graphql
      mutation CreatePostPurchaseBasicDiscount($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
        discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
          automaticDiscountNode {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                title
                status
                startsAt
                endsAt
              }
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
      {
        variables: {
          automaticBasicDiscount: discountInput,
        },
      }
    );

    const basicJson = await basicRes.json();
    const basicNode = basicJson?.data?.discountAutomaticBasicCreate?.automaticDiscountNode;
    const basicErrors = basicJson?.data?.discountAutomaticBasicCreate?.userErrors || [];

    if (basicNode?.id) {
      console.log(`[CartElevate Post-Purchase Sync] Created Basic discount ${basicNode.id} (${discountTitle}) status: ${basicNode.automaticDiscount?.status}`);
      if (!initialActive) {
        await deactivatePostPurchaseDiscount({ admin, discountId: basicNode.id });
      }
      return basicNode.id;
    }

    console.error("[CartElevate Post-Purchase Sync] Error creating discount:", JSON.stringify(basicErrors));
  } catch (err) {
    console.error("[CartElevate Post-Purchase Sync] GraphQL error creating discount:", err.message);
  }

  return null;
}

/**
 * Activates the Shopify automatic discount when the customer explicitly accepts the post-purchase offer,
 * and refreshes its `startsAt` and `endsAt` timestamps FIRST so expired discounts can be activated cleanly.
 */
export async function activatePostPurchaseDiscount({
  admin,
  discountId,
  offer = null,
  ttlMs = POST_PURCHASE_DISCOUNT_TTL_MS,
}) {
  if (!discountId) return false;

  const freshStartsAt = new Date(Date.now() - 60000).toISOString();
  const freshEndsAt = ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null;
  const discountPct = Number(offer?.discountPercentage) || 20;

  try {
    // 1. First refresh startsAt, endsAt, percentage, and non-stacking combinesWith
    //    so any expired endsAt is cleared to a fresh future window BEFORE calling discountAutomaticActivate
    const updateInput = {
      startsAt: freshStartsAt,
      customerGets: {
        value: {
          percentage: discountPct / 100,
        },
      },
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: true,
      },
    };

    if (freshEndsAt) {
      updateInput.endsAt = freshEndsAt;
    }

    const updateRes = await admin.graphql(
      `#graphql
      mutation RefreshPostPurchaseBasicExpiry($id: ID!, $automaticBasicDiscount: DiscountAutomaticBasicInput!) {
        discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $automaticBasicDiscount) {
          automaticDiscountNode {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                status
                startsAt
                endsAt
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          id: discountId,
          automaticBasicDiscount: updateInput,
        },
      }
    );

    const updateJson = await updateRes.json();
    const updateNode = updateJson?.data?.discountAutomaticBasicUpdate?.automaticDiscountNode;
    const updateErrors = updateJson?.data?.discountAutomaticBasicUpdate?.userErrors || [];
    if (updateErrors.length > 0) {
      console.warn("[CartElevate] Refresh expiry userErrors:", updateErrors);
    }

    // 2. Now activate the discount node
    const res = await admin.graphql(
      `#graphql
      mutation ActivatePostPurchaseDiscount($id: ID!) {
        discountAutomaticActivate(id: $id) {
          automaticDiscountNode {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                status
              }
              ... on DiscountAutomaticBxgy {
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { id: discountId } }
    );
    const json = await res.json();
    const node = json?.data?.discountAutomaticActivate?.automaticDiscountNode;
    const userErrors = json?.data?.discountAutomaticActivate?.userErrors || [];

    if (node?.id && userErrors.length === 0) {
      console.log(`[CartElevate] Post-purchase discount activated: ${discountId}`);
      return true;
    }

    if (updateNode?.automaticDiscount?.status === "ACTIVE") {
      return true;
    }

    console.warn("[CartElevate] Activate discount userErrors:", userErrors);
    return false;
  } catch (err) {
    console.error("[CartElevate] Error activating post-purchase discount:", err?.message);
    return false;
  }
}

/**
 * Deactivates the Shopify automatic discount so regular purchases are never discounted.
 */
export async function deactivatePostPurchaseDiscount({ admin, discountId }) {
  if (!discountId) return false;
  try {
    const res = await admin.graphql(
      `#graphql
      mutation DeactivatePostPurchaseDiscount($id: ID!) {
        discountAutomaticDeactivate(id: $id) {
          automaticDiscountNode {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                status
              }
              ... on DiscountAutomaticBxgy {
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { id: discountId } }
    );
    const json = await res.json();
    const userErrors = json?.data?.discountAutomaticDeactivate?.userErrors || [];
    if (userErrors.length > 0) {
      console.warn("[CartElevate] Deactivate discount userErrors:", userErrors);
      return false;
    }
    console.log("[CartElevate] Post-purchase discount deactivated successfully:", discountId);
    return true;
  } catch (err) {
    console.error("[CartElevate] Error deactivating post-purchase discount:", err.message);
    return false;
  }
}