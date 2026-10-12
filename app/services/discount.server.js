/**
 * Service to manage Shopify Automatic Free Shipping Discounts for CartElevate.
 * Automatically synchronizes shipping threshold rules to Shopify Checkout.
 */

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

  console.log(`[CartElevate Discount Sync] Goal: ${goalType}, requiresFreeShipping: ${requiresFreeShipping}, existingId: ${existingDiscountId}`);

  // 1. If Free Shipping is NOT selected (e.g. merchant chose free_gift only)
  if (!requiresFreeShipping) {
    if (existingDiscountId) {
      try {
        console.log(`[CartElevate Discount Sync] Deleting free shipping discount ${existingDiscountId} as goalType is ${goalType}`);
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
        console.log(`[CartElevate Discount Sync] Successfully updated discount ${node.id} to threshold ${formattedThreshold}`);
        return node.id;
      }

      console.warn(`[CartElevate Discount Sync] Update returned errors:`, JSON.stringify(userErrors));
    } catch (updateErr) {
      console.warn("[CartElevate Discount Sync] Update discount failed:", updateErr.message);
    }
  }

  // 3. Create a new Automatic Free Shipping discount
  try {
    console.log(`[CartElevate Discount Sync] Creating new Automatic Free Shipping discount for threshold ${formattedThreshold}...`);
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
      console.log(`[CartElevate Discount Sync] Successfully created discount ${node.id} with status ${node.automaticDiscount?.status}`);
      return node.id;
    }

    console.error("[CartElevate Discount Sync] Create discount userErrors:", JSON.stringify(userErrors));
    return null;
  } catch (createErr) {
    console.error("[CartElevate Discount Sync] Create discount error:", createErr.message);
    return null;
  }
}
