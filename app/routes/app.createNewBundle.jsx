import React, { useState, useMemo } from "react";
import { useLoaderData, useNavigate, Form, useNavigation, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { syncBundleVolumeAutomaticDiscounts, deleteVolumeDiscounts } from "../services/discount.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const editId = url.searchParams.get("id");

  let bundles = [];
  let isPlus = false;
  let discountLimit = 25;
  let planName = "";

  try {
    const metaQuery = await admin.graphql(`
      query GetBundlesMetafield {
        shop {
          id
          plan {
            displayName
            shopifyPlus
          }
          metafield(namespace: "cartelevate", key: "bundles") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const plan = metaRes?.data?.shop?.plan;
    planName = plan?.displayName || "";
    isPlus = Boolean(
      plan?.shopifyPlus === true ||
      (typeof planName === "string" && planName.toLowerCase().includes("plus"))
    );
    discountLimit = isPlus ? 50 : 25;
    const rawVal = metaRes?.data?.shop?.metafield?.value;
    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (Array.isArray(parsed.bundles)) bundles = parsed.bundles;
      else if (Array.isArray(parsed)) bundles = parsed;
    }
  } catch (err) {
    console.warn("[CartElevate] Error loading bundles:", err);
  }

  // Fetch store collections for "Applies to: Specific collection"
  let availableCollections = [];
  try {
    const colQuery = await admin.graphql(`
      query GetStoreCollections {
        collections(first: 250, sortKey: TITLE) {
          edges {
            node {
              id
              title
              handle
              productsCount {
                count
              }
              image {
                url
              }
            }
          }
        }
      }
    `);
    const colRes = await colQuery.json();
    if (colRes?.data?.collections?.edges) {
      availableCollections = colRes.data.collections.edges.map((e) => ({
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        productsCount: e.node.productsCount?.count ?? 0,
        image: e.node.image?.url || null,
      }));
    } else {
      // Fallback query if productsCount field schema differs
      const fallbackQuery = await admin.graphql(`
        query GetStoreCollectionsFallback {
          collections(first: 250, sortKey: TITLE) {
            edges {
              node {
                id
                title
                handle
                image {
                  url
                }
              }
            }
          }
        }
      `);
      const fallbackRes = await fallbackQuery.json();
      availableCollections = (fallbackRes?.data?.collections?.edges || []).map((e) => ({
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        productsCount: 0,
        image: e.node.image?.url || null,
      }));
    }
  } catch (err) {
    console.warn("[CartElevate] Error fetching collections:", err);
  }

  // Fetch store products for "Applies to: Specific products"
  let storeProducts = [];
  try {
    const prodQuery = await admin.graphql(`
      query GetStoreProducts {
        products(first: 250, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
            variants(first: 5) {
              nodes {
                id
                title
                price
              }
            }
          }
        }
      }
    `);
    const prodRes = await prodQuery.json();
    const pNodes = prodRes?.data?.products?.nodes || [];
    storeProducts = pNodes.map((p) => {
      const v = p.variants?.nodes?.[0];
      return {
        id: p.id,
        numericId: p.id.split("/").pop(),
        title: p.title,
        handle: p.handle,
        image: p.featuredImage?.url || "",
        price: v?.price ? `$${parseFloat(v.price).toFixed(2)}` : "$0.00",
        rawPrice: v?.price ? parseFloat(v.price) : 0,
      };
    });
  } catch (err) {
    console.warn("[CartElevate] Error fetching store products:", err);
  }

  const existingBundle = editId ? bundles.find((b) => b.id === editId) : null;

  const currentBundleData = existingBundle || {
    id: editId || "",
    name: "Volume discount bundle",
    discountType: "volume_tiers", // "volume_tiers" | "fixed_bundle"
    appliesTo: "specific_collection", // "specific_collection" | "specific_products" | "all_products"
    collections: [],
    products: [],
    tiers: [
      { id: "tier_1", buyQty: 2, discountPercent: 10, label: "Buy 2" },
      { id: "tier_2", buyQty: 3, discountPercent: 15, label: "Buy 3" },
      { id: "tier_3", buyQty: 5, discountPercent: 20, label: "Buy 5+" },
    ],
    cartMessage: "Buy {qty} more and save {discount}%",
    status: "PUBLISHED",
  };

  // Count slots currently used by other published bundles (excluding this one if editing)
  const otherPublished = bundles.filter((b) => b && b.status === "PUBLISHED" && b.id !== editId);
  const otherActiveSlots = otherPublished.reduce(
    (sum, b) => sum + (Array.isArray(b.tiers) && b.tiers.length > 0 ? b.tiers.length : (b.shopifyDiscountIds?.length || 1)),
    0
  );

  return {
    shop,
    currentBundleData,
    availableCollections,
    storeProducts,
    isEditing: Boolean(existingBundle),
    otherActiveSlots,
    discountLimit,
    isPlus,
    planName,
  };
};

export const action = async ({ request }) => {
  const { admin, redirect } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("intent")?.toString();
  const id = formData.get("id")?.toString() || "";

  let bundles = [];
  let isPlus = false;
  let discountLimit = 25;

  try {
    const metaQuery = await admin.graphql(`
      query GetBundlesMetafield {
        shop {
          id
          plan {
            displayName
            shopifyPlus
          }
          metafield(namespace: "cartelevate", key: "bundles") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const shopId = metaRes?.data?.shop?.id;
    const plan = metaRes?.data?.shop?.plan;
    isPlus = Boolean(
      plan?.shopifyPlus === true ||
      (typeof plan?.displayName === "string" && plan.displayName.toLowerCase().includes("plus"))
    );
    discountLimit = isPlus ? 50 : 25;
    const rawVal = metaRes?.data?.shop?.metafield?.value;

    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (Array.isArray(parsed.bundles)) bundles = parsed.bundles;
      else if (Array.isArray(parsed)) bundles = parsed;
    }

    if (intent === "delete" && id) {
      const bundleToDelete = bundles.find((b) => b.id === id);
      if (bundleToDelete) {
        await deleteVolumeDiscounts({ admin, bundle: bundleToDelete, bundleId: id });
      }
      bundles = bundles.filter((b) => b.id !== id);
    } else {
      const discountType = formData.get("discountType")?.toString() || "volume_tiers";
      const appliesTo = formData.get("appliesTo")?.toString() || "specific_collection";
      const collectionsRaw = formData.get("collections")?.toString() || "[]";
      const collectionGidsRaw = formData.get("collectionGids")?.toString() || "[]";
      const productsRaw = formData.get("products")?.toString() || "[]";
      const tiersRaw = formData.get("tiers")?.toString() || "[]";
      const cartMessage = formData.get("cartMessage")?.toString() || "Buy {qty} more and save {discount}%";
      const status = formData.get("status")?.toString() || "PUBLISHED";
      const existingDiscountIdsRaw = formData.get("existingShopifyDiscountIds")?.toString() || "[]";

      let collections = [];
      try {
        collections = JSON.parse(collectionsRaw);
      } catch (e) {
        collections = [];
      }

      let collectionGids = [];
      try {
        collectionGids = JSON.parse(collectionGidsRaw);
      } catch (e) {
        collectionGids = [];
      }

      let products = [];
      try {
        products = JSON.parse(productsRaw);
      } catch (e) {
        products = [];
      }

      let tiers = [];
      try {
        tiers = JSON.parse(tiersRaw);
      } catch (e) {
        tiers = [];
      }

      let existingShopifyDiscountIds = [];
      try {
        existingShopifyDiscountIds = JSON.parse(existingDiscountIdsRaw);
      } catch (e) {
        existingShopifyDiscountIds = [];
      }

      // Ensure valid numbers and labels
      tiers = tiers.map((t, idx) => {
        const qty = Number(t.buyQty) || (idx + 1) * 2;
        const pct = Number(t.discountPercent) || 10;
        return {
          id: t.id || `tier_${Date.now()}_${idx}`,
          buyQty: qty,
          discountPercent: pct,
          label: `Buy ${qty}`,
        };
      });

      // Validate unique buy quantities (cannot set multiple discounts for same buy quantity)
      const quantities = tiers.map((t) => Number(t.buyQty));
      const uniqueQuantities = new Set(quantities);
      if (uniqueQuantities.size !== quantities.length) {
        return {
          success: false,
          error: "Multiple discounts cannot be set for the same buy quantity. Each tier must have a unique buy quantity.",
        };
      }

      // Validate that at least one collection or product is selected when scoped
      if (appliesTo === "specific_collection" && collections.length === 0) {
        return {
          success: false,
          error: "Cannot save: Please select at least one collection for this bundle.",
        };
      }

      if (appliesTo === "specific_products" && products.length === 0) {
        return {
          success: false,
          error: "Cannot save: Please select at least one product for this bundle.",
        };
      }

      const maxDiscount = tiers.length > 0 ? Math.max(...tiers.map((t) => t.discountPercent)) : 10;
      const discountSummary = tiers.length > 1 ? `Up to ${maxDiscount}% off` : `${maxDiscount}% off`;

      const targetId = id && id.trim() !== "" ? id : "bundle_" + Date.now();
      const existingBundle = bundles.find((b) => b.id === targetId);

      const previousDiscountIds =
        existingShopifyDiscountIds.length > 0
          ? existingShopifyDiscountIds
          : existingBundle?.shopifyDiscountIds || [];

      // Check Shopify's active automatic discounts platform limit (50 on Plus, 25 on standard)
      if (status === "PUBLISHED") {
        const otherPublished = bundles.filter((b) => b && b.status === "PUBLISHED" && b.id !== targetId);
        const otherActiveSlots = otherPublished.reduce(
          (sum, b) => sum + (Array.isArray(b.tiers) && b.tiers.length > 0 ? b.tiers.length : (b.shopifyDiscountIds?.length || 1)),
          0
        );
        if (otherActiveSlots + tiers.length > discountLimit) {
          return {
            success: false,
            error: `Cannot publish: Saving this bundle with ${tiers.length} tiers would exceed Shopify's platform limit of ${discountLimit} active automatic discounts (${otherActiveSlots} slots currently used by other bundles). Please save this bundle as a Draft or deactivate other bundles.`,
          };
        }
      }

      const candidateBundle = {
        id: targetId,
        name: "Volume discount",
        discountType,
        appliesTo,
        collections,
        collectionGids,
        products,
        targetCollection: collections.join(", "),
        targetProducts: products.map((p) => p.title).join(", "),
        discountValue: discountSummary,
        tiers,
        cartMessage,
        status,
        nonStackingSynced: true,
        updatedAt: new Date().toISOString(),
      };

      // Create/Sync real automatic discounts in Shopify checkout if published, or clean up if draft
      let shopifyDiscountIds = [];
      if (status === "PUBLISHED") {
        shopifyDiscountIds = await syncBundleVolumeAutomaticDiscounts({
          admin,
          bundle: candidateBundle,
          previousDiscountIds,
          collectionGids,
        });
      } else {
        // If saving as DRAFT, remove all Shopify automatic discounts associated with this bundle
        await deleteVolumeDiscounts({ admin, bundle: candidateBundle, bundleId: targetId });
      }

      const updatedBundle = {
        ...candidateBundle,
        shopifyDiscountIds,
      };

      const existingIdx = bundles.findIndex((b) => b.id === targetId);
      if (existingIdx !== -1) {
        bundles[existingIdx] = updatedBundle;
      } else {
        bundles.push(updatedBundle);
      }
    }

    if (shopId) {
      await admin.graphql(
        `
        mutation SetBundlesMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
            }
          }
        }
      `,
        {
          variables: {
            metafields: [
              {
                ownerId: shopId,
                namespace: "cartelevate",
                key: "bundles",
                type: "json",
                value: JSON.stringify({ bundles, updatedAt: new Date().toISOString() }),
              },
            ],
          },
        }
      );
    }

    return redirect("/app/bundleAndDiscount");
  } catch (err) {
    console.error("[CartElevate] Save bundle error:", err);
    return { success: false, error: err.message };
  }
};

export default function CreateNewBundlePage() {
  const {
    currentBundleData,
    availableCollections = [],
    storeProducts = [],
    isEditing,
    otherActiveSlots = 0,
    discountLimit = 25,
    isPlus = false,
  } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting" || navigation.state === "loading";

  // Status state (PUBLISHED vs DRAFT)
  const [status, setStatus] = useState(currentBundleData.status || "PUBLISHED");

  // Form states
  const [appliesTo, setAppliesTo] = useState(
    currentBundleData.appliesTo || "specific_collection"
  );
  const [isAppliesDropdownOpen, setIsAppliesDropdownOpen] = useState(false);

  // Collections state
  const [selectedCollections, setSelectedCollections] = useState(
    currentBundleData.collections || []
  );
  const [collectionSearch, setCollectionSearch] = useState("");

  // Products state
  const [selectedProducts, setSelectedProducts] = useState(
    currentBundleData.products || []
  );
  const [productSearch, setProductSearch] = useState("");

  const [tiers, setTiers] = useState(
    currentBundleData.tiers || [
      { id: "tier_1", buyQty: 2, discountPercent: 10, label: "Buy 2" },
      { id: "tier_2", buyQty: 3, discountPercent: 15, label: "Buy 3" },
      { id: "tier_3", buyQty: 5, discountPercent: 20, label: "Buy 5+" },
    ]
  );

  const [cartMessage, setCartMessage] = useState(
    currentBundleData.cartMessage || "Buy {qty} more and save {discount}%"
  );

  // Capacity calculations for Shopify's platform limit
  const projectedTotalSlots = otherActiveSlots + (status === "PUBLISHED" ? tiers.length : 0);
  const wouldExceedIfPublished = otherActiveSlots + tiers.length > discountLimit;
  const isExceededNow = status === "PUBLISHED" && wouldExceedIfPublished;

  // Validation for empty collection / product selection
  const emptySelectionError = useMemo(() => {
    if (appliesTo === "specific_collection" && (!selectedCollections || selectedCollections.length === 0)) {
      return "please select at least one collection";
    }
    if (appliesTo === "specific_products" && (!selectedProducts || selectedProducts.length === 0)) {
      return "please select at least one product";
    }
    return null;
  }, [appliesTo, selectedCollections, selectedProducts]);
  const hasEmptySelection = Boolean(emptySelectionError);
  const { duplicateQuantities, hasDuplicateQty, hasInvalidQty, duplicateIndices } = useMemo(() => {
    const counts = {};
    const dupIndices = new Set();
    let hasInvalid = false;

    tiers.forEach((t, index) => {
      const q = t.buyQty === "" || t.buyQty === null || t.buyQty === undefined ? null : Number(t.buyQty);
      if (q === null || isNaN(q) || q <= 0) {
        hasInvalid = true;
      } else {
        if (!counts[q]) {
          counts[q] = [index];
        } else {
          counts[q].push(index);
        }
      }
    });

    const dupes = [];
    Object.entries(counts).forEach(([qtyStr, indices]) => {
      if (indices.length > 1) {
        dupes.push(Number(qtyStr));
        indices.forEach((idx) => dupIndices.add(idx));
      }
    });

    return {
      duplicateQuantities: dupes,
      hasDuplicateQty: dupes.length > 0,
      hasInvalidQty: hasInvalid,
      duplicateIndices: dupIndices,
    };
  }, [tiers]);

  // Default cart preview items
  const defaultPreviewItems = useMemo(
    () => [
      {
        id: "mug",
        title: "Ceramic mug",
        price: 14.0,
        quantity: 1,
        image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=120&h=120&q=80",
      },
      {
        id: "tote",
        title: "Tote bag",
        price: 22.0,
        quantity: 1,
        image: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=120&h=120&q=80",
      },
    ],
    []
  );

  // Cart Preview Items state
  const [previewCartItems, setPreviewCartItems] = useState(defaultPreviewItems);

  // Sync selected products to live cart preview if "specific_products"
  React.useEffect(() => {
    if (appliesTo === "specific_products" && selectedProducts.length > 0) {
      setPreviewCartItems(
        selectedProducts.slice(0, 2).map((p, idx) => ({
          id: p.id,
          title: p.title,
          price: p.rawPrice || parseFloat(String(p.price || "0").replace(/[^0-9.]/g, "")) || 22.0,
          quantity: idx === 0 ? 1 : 1,
          image: p.image || "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=120&h=120&q=80",
        }))
      );
    } else {
      setPreviewCartItems(defaultPreviewItems);
    }
  }, [appliesTo, selectedProducts, defaultPreviewItems]);

  // Handle tier modifications
  const handleTierChange = (index, field, value) => {
    setTiers((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (field === "buyQty") {
        updated.label = value !== "" ? `Buy ${value}` : "";
      }
      next[index] = updated;
      return next;
    });
  };

  const handleAddTier = () => {
    const existingQuantities = tiers.map((t) => Number(t.buyQty) || 0);
    const maxQty = existingQuantities.length > 0 ? Math.max(...existingQuantities) : 0;
    const nextQty = maxQty > 0 ? maxQty + (maxQty >= 5 ? 2 : 1) : 2;
    const lastTier = tiers[tiers.length - 1];
    const nextPct = lastTier ? Math.min(90, Number(lastTier.discountPercent || 0) + 5) : 10;
    setTiers((prev) => [
      ...prev,
      {
        id: "tier_" + Date.now(),
        buyQty: nextQty,
        discountPercent: nextPct,
        label: `Buy ${nextQty}`,
      },
    ]);
  };

  const handleRemoveTier = (index) => {
    if (tiers.length <= 1) return;
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle collection tags & selection
  const handleRemoveCollection = (colTitle) => {
    setSelectedCollections((prev) => prev.filter((c) => c !== colTitle));
  };

  const handleToggleCollection = (colTitle) => {
    setSelectedCollections((prev) => {
      if (prev.includes(colTitle)) {
        return prev.filter((c) => c !== colTitle);
      } else {
        return [...prev, colTitle];
      }
    });
  };

  // Handle product tags & selection
  const handleRemoveProduct = (prodId) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== prodId));
  };

  const handleToggleProduct = (prod) => {
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.id === prod.id);
      if (exists) {
        return prev.filter((p) => p.id !== prod.id);
      } else {
        return [
          ...prev,
          {
            id: prod.id,
            title: prod.title,
            image: prod.image,
            price: prod.price,
            rawPrice: prod.rawPrice,
          },
        ];
      }
    });
  };

  // Filter available collections by search
  const filteredCollections = useMemo(() => {
    if (!collectionSearch.trim()) return availableCollections;
    const q = collectionSearch.toLowerCase();
    return availableCollections.filter(
      (c) => c.title.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    );
  }, [availableCollections, collectionSearch]);

  // Filter available products by search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return storeProducts;
    const q = productSearch.toLowerCase();
    return storeProducts.filter(
      (p) => p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
    );
  }, [storeProducts, productSearch]);

  // Preview calculations
  const totalCartQty = useMemo(() => {
    return previewCartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [previewCartItems]);

  // Determine active tier and next tier for preview
  const { activeTier, nextTier } = useMemo(() => {
    const validTiers = tiers.filter((t) => Number(t.buyQty) > 0);
    const sortedTiers = [...validTiers].sort((a, b) => Number(a.buyQty) - Number(b.buyQty));
    let active = null;
    let next = null;

    for (let i = 0; i < sortedTiers.length; i++) {
      const qty = Number(sortedTiers[i].buyQty);
      if (totalCartQty >= qty) {
        active = sortedTiers[i];
      } else {
        if (!next) next = sortedTiers[i];
      }
    }

    if (!next && sortedTiers.length > 0 && totalCartQty < Number(sortedTiers[0].buyQty)) {
      next = sortedTiers[0];
    }

    return { activeTier: active, nextTier: next };
  }, [tiers, totalCartQty]);

  // Preview Banner message
  const previewBannerText = useMemo(() => {
    if (nextTier) {
      const nextQty = Number(nextTier.buyQty) || 1;
      const needed = Math.max(1, nextQty - totalCartQty);
      return cartMessage
        .replace("{qty}", String(needed))
        .replace("{discount}", String(nextTier.discountPercent || 0));
    }
    if (activeTier) {
      return `🎉 Maximum volume tier unlocked: ${activeTier.discountPercent}% off!`;
    }
    return `Buy 1 more and save 15%`;
  }, [cartMessage, nextTier, activeTier, totalCartQty]);

  const updatePreviewQuantity = (id, delta) => {
    setPreviewCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = Math.max(1, item.quantity + delta);
            return { ...item, quantity: nextQty };
          }
          return item;
        })
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-20 font-sans">
      <main className="max-w-[1240px] mx-auto px-6 sm:px-10 pt-8">
        {/* Back navigation */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/app/bundleAndDiscount")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-950 transition group cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-50 transition">
              ←
            </span>
            <span>Back to bundles and discounts</span>
          </button>
        </div>

        {/* Page Heading */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-[34px] font-black tracking-tight text-slate-950">
            Bundles and volume discounts
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 leading-relaxed">
            Offer automatic discounts when customers buy more of the same product or bundle products together.
          </p>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* ================= LEFT COLUMN: CONFIGURATION FORM ================= */}
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
            {actionData?.error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2.5">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{actionData.error}</span>
              </div>
            )}
            <Form
              method="post"
              className="space-y-6"
              onSubmit={(e) => {
                if (hasDuplicateQty || hasInvalidQty || isExceededNow || hasEmptySelection) {
                  e.preventDefault();
                  return;
                }
              }}
            >
              <input type="hidden" name="id" value={currentBundleData.id || ""} />
              <input type="hidden" name="discountType" value="volume_tiers" />
              <input type="hidden" name="appliesTo" value={appliesTo} />
              <input
                type="hidden"
                name="collections"
                value={JSON.stringify(selectedCollections)}
              />
              <input
                type="hidden"
                name="collectionGids"
                value={JSON.stringify(
                  availableCollections
                    .filter((c) => selectedCollections.includes(c.title))
                    .map((c) => c.id)
                )}
              />
              <input
                type="hidden"
                name="products"
                value={JSON.stringify(selectedProducts)}
              />
              <input
                type="hidden"
                name="existingShopifyDiscountIds"
                value={JSON.stringify(currentBundleData.shopifyDiscountIds || [])}
              />
              <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
              <input type="hidden" name="cartMessage" value={cartMessage} />
              <input type="hidden" name="status" value={status} />

              {/* Status Selector & Capacity Indicator Card */}
              <div className="bg-[#FAFBFB] rounded-2xl border border-slate-200/90 p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-900">
                      Bundle status
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Published bundles create automatic discounts at checkout.
                    </p>
                  </div>

                  {/* Toggle segmented control */}
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setStatus("PUBLISHED")}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        status === "PUBLISHED"
                          ? "bg-[#EAFBF1] text-[#0A8754] border border-[#0A8754]/20 shadow-2xs"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      Published
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus("DRAFT")}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        status === "DRAFT"
                          ? "bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      Draft
                    </button>
                  </div>
                </div>

                {/* Shopify Platform Limit Indicator */}
                <div className="pt-2 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      Shopify automatic discount slots
                    </span>
                    <span className={`font-bold ${
                      isExceededNow
                        ? "text-red-600"
                        : projectedTotalSlots >= 18
                        ? "text-amber-600"
                        : "text-emerald-700"
                    }`}>
                      {status === "PUBLISHED" ? `${projectedTotalSlots} / ${discountLimit} used` : `${otherActiveSlots} / ${discountLimit} used (Draft uses 0)`}
                    </span>
                  </div>

                  <div className="w-full bg-slate-200/80 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isExceededNow
                          ? "bg-red-500"
                          : projectedTotalSlots >= 18
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.round(((status === "PUBLISHED" ? projectedTotalSlots : otherActiveSlots) / discountLimit) * 100))}%` }}
                    ></div>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Shopify platform limit: Max {discountLimit} active automatic discounts for your store ({isPlus ? "Shopify Plus" : "50 on Shopify Plus"}). Each published tier uses 1 slot so discounts apply at checkout without promo codes.
                  </p>

                  {/* Warning banner when limit exceeded */}
                  {isExceededNow && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-1.5 animate-fadeIn">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="font-semibold">
                          Publishing this bundle with {tiers.length} tiers would exceed Shopify's platform limit of {discountLimit} active automatic discounts ({otherActiveSlots} slots already used by other bundles).
                        </span>
                      </div>
                      <div className="pl-6 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStatus("DRAFT")}
                          className="font-bold text-red-700 bg-white border border-red-300 hover:bg-red-100/50 px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px]"
                        >
                          Switch to Draft to save
                        </button>
                        <span className="text-[11px] text-red-600">or deactivate other bundles first.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 1. Applies to Dropdown */}
              <div className="space-y-2 relative">
                <label className="block text-sm font-bold text-slate-900">
                  Applies to
                </label>

                {/* Dropdown trigger */}
                <div
                  onClick={() => setIsAppliesDropdownOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 cursor-pointer hover:border-slate-300 transition shadow-2xs select-none"
                >
                  <span className="capitalize">
                    {appliesTo === "specific_collection"
                      ? "Specific collection"
                      : appliesTo === "specific_products"
                      ? "Specific products"
                      : "All products"}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-4 h-4 text-slate-500 transition-transform ${
                      isAppliesDropdownOpen ? "rotate-180" : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Dropdown Menu Popup */}
                {isAppliesDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setIsAppliesDropdownOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 overflow-hidden animate-fadeIn select-none">
                      {[
                        { key: "specific_collection", label: "Specific collection" },
                        { key: "specific_products", label: "Specific products" },
                        { key: "all_products", label: "All products" },
                      ].map((item) => {
                        const isSelected = appliesTo === item.key;
                        return (
                          <div
                            key={item.key}
                            onClick={() => {
                              setAppliesTo(item.key);
                              setIsAppliesDropdownOpen(false);
                            }}
                            className={`px-4 py-2.5 text-sm cursor-pointer transition flex items-center justify-between ${
                              isSelected
                                ? "bg-[#FFF0ED] text-[#F95738] font-bold"
                                : "text-slate-800 hover:bg-slate-50 font-normal"
                            }`}
                          >
                            <span>{item.label}</span>
                            {isSelected && <span className="text-[#F95738]">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* 3A. Choose collections (Visible when appliesTo === "specific_collection") */}
              {appliesTo === "specific_collection" && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Choose collections
                    </label>
                    {selectedCollections.length > 0 && (
                      <span className="text-[11px] font-bold text-[#F95738]">
                        {selectedCollections.length} selected
                      </span>
                    )}
                  </div>

                  {/* Selected Tags list */}
                  {selectedCollections.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl">
                      {selectedCollections.map((colTitle) => (
                        <span
                          key={colTitle}
                          className="inline-flex items-center gap-1.5 bg-white text-slate-800 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs"
                        >
                          <span>{colTitle}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCollection(colTitle)}
                            className="hover:text-red-600 font-bold ml-0.5 cursor-pointer text-slate-400 transition"
                            title="Remove collection"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedCollections([])}
                        className="text-[11px] text-slate-400 hover:text-red-500 font-semibold px-2 py-0.5 ml-auto transition cursor-pointer"
                      >
                        Clear all
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1.5 bg-red-50/60 border border-red-200/60 px-3 py-2 rounded-xl">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block shrink-0"></span>
                      No collections selected yet. Please select at least one collection from your store inventory below:
                    </p>
                  )}

                  {/* Search collections input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search collections..."
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition shadow-2xs"
                    />
                  </div>

                  {/* Available collections scrollable list from merchant inventory */}
                  <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white shadow-2xs">
                    {availableCollections.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No collections found in your Shopify store. Create collections in Shopify Admin.
                      </div>
                    ) : filteredCollections.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No collections match &ldquo;{collectionSearch}&rdquo;
                      </div>
                    ) : (
                      filteredCollections.map((col) => {
                        const isSelected = selectedCollections.includes(col.title);
                        return (
                          <div
                            key={col.id || col.handle}
                            onClick={() => handleToggleCollection(col.title)}
                            className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition select-none ${
                              isSelected ? "bg-[#FFF4F1]" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                  isSelected
                                    ? "bg-white border-[#FDDCD3] text-[#F95738]"
                                    : "bg-slate-100 border-slate-200 text-slate-400"
                                }`}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  className="w-4 h-4"
                                >
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <h4
                                  className={`text-xs font-bold truncate ${
                                    isSelected ? "text-[#D9381E]" : "text-slate-900"
                                  }`}
                                >
                                  {col.title}
                                </h4>
                                {col.productsCount !== undefined && (
                                  <span className="text-[11px] text-slate-400">
                                    {col.productsCount} {col.productsCount === 1 ? "product" : "products"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 ml-2">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F95738] bg-white px-2 py-0.5 rounded-md border border-[#FDDCD3]">
                                  ✓ Selected
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
                                  + Select
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* 3B. Choose products (Visible when appliesTo === "specific_products") */}
              {appliesTo === "specific_products" && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Choose products
                    </label>
                    {selectedProducts.length > 0 && (
                      <span className="text-[11px] font-bold text-[#F95738]">
                        {selectedProducts.length} selected
                      </span>
                    )}
                  </div>

                  {/* Selected Products list */}
                  {selectedProducts.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl">
                      {selectedProducts.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 bg-white text-slate-800 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs max-w-[200px]"
                        >
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.title}
                              className="w-4 h-4 rounded object-cover shrink-0"
                            />
                          ) : (
                            <span className="w-4 h-4 rounded bg-slate-100 text-[9px] flex items-center justify-center shrink-0">
                              🛍️
                            </span>
                          )}
                          <span className="truncate">{p.title}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(p.id)}
                            className="hover:text-red-600 font-bold ml-0.5 cursor-pointer text-slate-400 transition"
                            title="Remove product"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedProducts([])}
                        className="text-[11px] text-slate-400 hover:text-red-500 font-semibold px-2 py-0.5 ml-auto transition cursor-pointer"
                      >
                        Clear all
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1.5 bg-red-50/60 border border-red-200/60 px-3 py-2 rounded-xl">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block shrink-0"></span>
                      No products selected yet. Please select at least one product from your inventory below:
                    </p>
                  )}

                  {/* Search products input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search products by title..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition shadow-2xs"
                    />
                  </div>

                  {/* Available products scrollable list from merchant inventory */}
                  <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white shadow-2xs">
                    {storeProducts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No products found in your Shopify store. Add products in Shopify Admin.
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No products match &ldquo;{productSearch}&rdquo;
                      </div>
                    ) : (
                      filteredProducts.map((p) => {
                        const isSelected = selectedProducts.some((sp) => sp.id === p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => handleToggleProduct(p)}
                            className={`px-3.5 py-2 flex items-center justify-between cursor-pointer transition select-none ${
                              isSelected ? "bg-[#FFF4F1]" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 p-0.5 shrink-0 overflow-hidden flex items-center justify-center">
                                {p.image ? (
                                  <img
                                    src={p.image}
                                    alt={p.title}
                                    className="w-full h-full object-cover rounded"
                                  />
                                ) : (
                                  <span className="text-sm">🛍️</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4
                                  className={`text-xs font-bold truncate ${
                                    isSelected ? "text-[#D9381E]" : "text-slate-900"
                                  }`}
                                >
                                  {p.title}
                                </h4>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {p.price}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 ml-2">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F95738] bg-white px-2 py-0.5 rounded-md border border-[#FDDCD3]">
                                  ✓ Selected
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
                                  + Select
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* 3C. All products note (Visible when appliesTo === "all_products") */}
              {appliesTo === "all_products" && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center gap-2.5">
                  <span>This discount bundle will automatically apply to all eligible products across your store.</span>
                </div>
              )}

              {/* 3. Discount tiers */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-bold text-slate-900">
                    Discount tiers
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Quantity to buy &amp; discount %
                  </span>
                </div>

                {/* Error Banner when duplicate quantities exist */}
                {hasDuplicateQty && (
                  <div className="p-3 bg-red-50 border border-red-200/90 rounded-xl text-xs text-red-700 flex items-start gap-2.5 shadow-2xs">
                    <svg
                      className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div>
                      <span className="font-bold text-red-800">
                        Multiple discounts at the same buy quantity are not allowed.
                      </span>
                      <p className="mt-0.5 text-red-600">
                        You have duplicate tiers set to{" "}
                        <span className="font-bold underline">
                          {duplicateQuantities.map((q) => `Buy ${q}`).join(", ")}
                        </span>
                        . Please set a unique buy quantity for each tier before saving.
                      </p>
                    </div>
                  </div>
                )}

                {hasInvalidQty && !hasDuplicateQty && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-amber-500 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span>Please enter a valid buy quantity (at least 1) for all discount tiers.</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  {tiers.map((tier, idx) => {
                    const isDuplicate = duplicateIndices.has(idx);
                    const isInvalid = tier.buyQty === "" || tier.buyQty === null || Number(tier.buyQty) <= 0;

                    return (
                      <div
                        key={tier.id || idx}
                        className={`flex items-center gap-2.5 sm:gap-3 p-1.5 -mx-1.5 rounded-xl transition ${
                          isDuplicate ? "bg-red-50/60 border border-red-200/60" : ""
                        }`}
                      >
                        {/* Buy prefix label */}
                        <span
                          className={`text-sm font-semibold shrink-0 select-none ${
                            isDuplicate ? "text-red-700 font-bold" : "text-slate-700"
                          }`}
                        >
                          Buy
                        </span>

                        {/* Buy Quantity Input Box */}
                        <div
                          className={`flex items-center border rounded-xl px-2.5 py-1.5 transition w-20 shadow-2xs ${
                            isDuplicate
                              ? "border-red-500 bg-white ring-2 ring-red-400/25 focus-within:border-red-600"
                              : isInvalid
                              ? "border-amber-400 bg-white focus-within:border-amber-500"
                              : "border-slate-200 bg-white focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20"
                          }`}
                        >
                          <input
                            type="number"
                            min="1"
                            value={tier.buyQty ?? ""}
                            placeholder="Qty"
                            onChange={(e) => {
                              const val =
                                e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1);
                              handleTierChange(idx, "buyQty", val);
                            }}
                            className={`w-full text-sm font-bold outline-none text-center ${
                              isDuplicate ? "text-red-700" : "text-slate-900"
                            }`}
                            title={isDuplicate ? "Duplicate buy quantity" : "Number of items to buy"}
                          />
                        </div>

                        {/* Percent Input Box */}
                        <div className="flex items-center border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white shadow-2xs focus-within:border-[#F95738] focus-within:ring-2 focus-within:ring-[#F95738]/20 transition w-20">
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={tier.discountPercent ?? ""}
                            placeholder="10"
                            onChange={(e) => {
                              const val =
                                e.target.value === "" ? "" : Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0));
                              handleTierChange(idx, "discountPercent", val);
                            }}
                            className="w-full text-sm font-bold text-slate-900 outline-none text-center"
                            title="Discount percentage"
                          />
                        </div>

                        {/* Suffix */}
                        <span className="text-xs text-slate-500 font-medium shrink-0">
                          % off
                        </span>

                        {/* Duplicate badge indicator */}
                        {isDuplicate && (
                          <span className="text-[11px] font-bold text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded-md shrink-0">
                            Duplicate qty
                          </span>
                        )}

                        {/* Delete tier button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(idx)}
                          className="ml-auto p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition cursor-pointer text-sm font-bold"
                          title="Remove tier"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* + Add tier button */}
                <button
                  type="button"
                  onClick={handleAddTier}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#F95738] hover:text-[#EA3E1E] transition cursor-pointer pt-1"
                >
                  <span>+ Add tier</span>
                </button>
              </div>

              {/* 4. Cart message */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-sm font-bold text-slate-900">
                  Cart message
                </label>
                <input
                  type="text"
                  value={cartMessage}
                  onChange={(e) => setCartMessage(e.target.value)}
                  placeholder="Buy {qty} more and save {discount}%"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-normal text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition shadow-2xs"
                />
              </div>

              {/* 6. Action Buttons */}
              <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={isSaving || hasDuplicateQty || hasInvalidQty || isExceededNow || hasEmptySelection}
                      className={`inline-flex items-center justify-center gap-2 text-sm font-bold px-7 py-2.5 rounded-xl transition min-w-[130px] ${
                        isSaving || hasDuplicateQty || hasInvalidQty || isExceededNow || hasEmptySelection
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none"
                          : "bg-[#F95738] hover:bg-[#EA3E1E] active:scale-[0.98] text-white cursor-pointer shadow-xs"
                      }`}
                      title={
                        hasEmptySelection
                          ? `Cannot save: ${emptySelectionError}`
                          : isExceededNow
                          ? "Cannot save: exceeds Shopify's 25 active automatic discount limit. Please switch to Draft or deactivate other bundles."
                          : hasDuplicateQty
                          ? "Cannot save: multiple discount tiers have the same buy quantity"
                          : hasInvalidQty
                          ? "Cannot save: please enter valid buy quantities"
                          : ""
                      }
                    >
                      <span>{isSaving ? "Saving..." : "Save changes"}</span>
                      <span>→</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate("/app/bundleAndDiscount")}
                      className="inline-flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold px-6 py-2.5 rounded-xl transition cursor-pointer shadow-2xs"
                    >
                      Back
                    </button>
                  </div>

                  {isEditing && (
                    <button
                      type="submit"
                      name="intent"
                      value="delete"
                      onClick={(e) => {
                        if (!confirm("Are you sure you want to delete this bundle?")) {
                          e.preventDefault();
                        }
                      }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3.5 py-2 rounded-xl transition cursor-pointer"
                    >
                      Delete bundle
                    </button>
                  )}
                </div>

                {hasEmptySelection && (
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block shrink-0"></span>
                    Cannot save: {emptySelectionError}.
                  </p>
                )}

                {/* Error message under Save button when disabled due to duplicates */}
                {hasDuplicateQty && (
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block shrink-0"></span>
                    Cannot save: multiple discount tiers have the same buy quantity ({duplicateQuantities.map((q) => `Buy ${q}`).join(", ")}).
                  </p>
                )}

                {isExceededNow && (
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block shrink-0"></span>
                    Cannot publish: exceeds Shopify's 25 active automatic discount limit. Please switch bundle status to Draft or deactivate other bundles.
                  </p>
                )}
              </div>
            </Form>
          </div>

          {/* ================= RIGHT COLUMN: LIVE CART DRAWER PREVIEW ================= */}
          <div className="lg:col-span-6 flex flex-col items-center lg:items-end">
            <div className="w-full max-w-[380px] space-y-3">
              {/* Preview Header */}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Live preview
                </h3>
                <p className="text-xs text-slate-500">
                  See how your bundle and volume discounts look in the cart drawer.
                </p>
              </div>

              {/* Cart Drawer Mockup matching screenshot */}
              <div className="w-full rounded-2xl border border-slate-200/90 shadow-md bg-white overflow-hidden transition-all">
                {/* 1. Drawer Header (Coral Red/Orange) */}
                <div className="bg-[#F95738] text-white p-3.5 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[#F95738] shadow-2xs">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        className="w-3.5 h-3.5"
                      >
                        <circle cx="8" cy="21" r="1.5" />
                        <circle cx="19" cy="21" r="1.5" />
                        <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                      </svg>
                    </div>
                    <span className="font-bold text-sm tracking-tight text-white">
                      Your cart ({totalCartQty})
                    </span>
                  </div>

                  <button
                    type="button"
                    className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white/90 hover:text-white transition cursor-pointer text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* 2. Top Tier Message Banner */}
                <div className="p-4 pb-2">
                  <div className="bg-[#FFF0ED] border border-[#FDDCD3]/90 rounded-xl py-2 px-3 text-center transition-all">
                    <span className="text-xs font-bold text-[#D9381E] tracking-tight">
                      {previewBannerText}
                    </span>
                  </div>
                </div>

                {/* 3. Cart Items list */}
                <div className="px-4 py-2 space-y-3.5 divide-y divide-slate-100">
                  {previewCartItems.map((item, idx) => {
                    const isDiscounted = activeTier && idx === 1; // Shows discount badge like in screenshot
                    const discountRate = activeTier ? activeTier.discountPercent : 10;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3.5 ${idx > 0 ? "pt-3.5" : "pt-1"}`}
                      >
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {item.title}
                          </h4>
                          <p className="text-xs font-semibold text-slate-600 mt-0.5">
                            ${item.price.toFixed(2)}
                          </p>
                          {isDiscounted && (
                            <span className="text-[11px] font-bold text-[#F95738] block mt-0.5 leading-none">
                              {discountRate}% off applied
                            </span>
                          )}
                        </div>

                        {/* Quantity Controls & Delete Icon */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center border border-slate-200 bg-white rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => updatePreviewQuantity(item.id, -1)}
                              className="px-1 text-slate-400 hover:text-slate-900 font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <span className="px-2 text-[11px] font-bold text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updatePreviewQuantity(item.id, 1)}
                              className="px-1 text-slate-400 hover:text-slate-900 font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className="text-slate-300 hover:text-red-500 transition p-1 cursor-pointer"
                            title="Remove item"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              className="w-4 h-4"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 4. Checkout Footer Button */}
                <div className="p-4 pt-5 pb-5 text-center border-t border-slate-100 mt-2">
                  <span className="text-sm font-bold text-[#F95738]/40 tracking-wide select-none cursor-not-allowed">
                    Checkout
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
