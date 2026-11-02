import React, { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { syncBundleVolumeAutomaticDiscounts, deleteVolumeDiscounts } from "../services/discount.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop; 

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
    const shopId = metaRes?.data?.shop?.id;
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
      if (Array.isArray(parsed.bundles)) {
        bundles = parsed.bundles;
      } else if (Array.isArray(parsed)) {
        bundles = parsed;
      }
    }

    // Auto-sync any published bundles that are missing active Shopify discount IDs or need non-stacking sync
    let hasUpdated = false;
    for (let i = 0; i < bundles.length; i++) {
      const b = bundles[i];
      if (
        b &&
        b.status === "PUBLISHED" &&
        (!Array.isArray(b.shopifyDiscountIds) || b.shopifyDiscountIds.length === 0 || !b.nonStackingSynced)
      ) {
        console.log(`[CartElevate] Auto-syncing non-stacking Shopify discounts for published bundle: ${b.name} (${b.id})`);
        const discIds = await syncBundleVolumeAutomaticDiscounts({
          admin,
          bundle: b,
          previousDiscountIds: b.shopifyDiscountIds || [],
          collectionGids: b.collectionGids || [],
        });
        bundles[i] = {
          ...b,
          shopifyDiscountIds: discIds,
          nonStackingSynced: true,
          updatedAt: new Date().toISOString(),
        };
        hasUpdated = true;
      }
    }

    if (hasUpdated && shopId) {
      await admin.graphql(
        `#graphql
        mutation SetBundlesMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
            }
          }
        }`,
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

    // Calculate active automatic discount slots used across the store
    const publishedBundles = bundles.filter((b) => b && b.status === "PUBLISHED");
    if (publishedBundles.length === 0) {
      // If no bundles are published, ensure zero Volume Discounts exist in Shopify Admin
      try {
        await deleteVolumeDiscounts({ admin });
      } catch (e) {
        console.warn("[CartElevate] Sweep volume discounts warning:", e?.message);
      }
    }
    const activeBundleTiersCount = publishedBundles.reduce(
      (sum, b) => sum + (Array.isArray(b.tiers) && b.tiers.length > 0 ? b.tiers.length : (b.shopifyDiscountIds?.length || 1)),
      0
    );

    let totalStoreActiveDiscounts = activeBundleTiersCount;
    try {
      const discQuery = await admin.graphql(`
        query GetActiveAutomaticDiscounts {
          automaticDiscountNodes(first: 50) {
            nodes {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  status
                }
                ... on DiscountAutomaticBxgy {
                  status
                }
                ... on DiscountAutomaticFreeShipping {
                  status
                }
              }
            }
          }
        }
      `);
      const discRes = await discQuery.json();
      const nodes = discRes?.data?.automaticDiscountNodes?.nodes || [];
      const activeNodes = nodes.filter((n) => n?.automaticDiscount?.status === "ACTIVE");
      if (activeNodes.length > 0) {
        totalStoreActiveDiscounts = activeNodes.length;
      }
    } catch (e) {
      console.warn("[CartElevate] Error querying automaticDiscountNodes:", e);
    }

    return {
      shop,
      bundles,
      activeSlots: totalStoreActiveDiscounts,
      discountLimit,
      isPlus,
      planName,
    };
  } catch (err) {
    console.warn("[CartElevate] Error loading bundles:", err);
    return { shop: "", bundles: [], activeSlots: 0, discountLimit: 25, isPlus: false, planName: "" };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const bundleId = formData.get("id");

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

    if (intent === "toggle") {
      const targetStatus = formData.get("status") || "PUBLISHED";
      const targetBundle = bundles.find((b) => b.id === bundleId);

      if (targetStatus === "DRAFT" && targetBundle) {
        await deleteVolumeDiscounts({ admin, bundle: targetBundle, bundleId });
        bundles = bundles.map((b) =>
          b.id === bundleId
            ? {
                ...b,
                status: "DRAFT",
                shopifyDiscountIds: [],
                updatedAt: new Date().toISOString(),
              }
            : b
        );
      } else if (targetStatus === "PUBLISHED" && targetBundle) {
        // Enforce Shopify's active automatic discounts platform limit (50 on Plus, 25 on standard)
        const otherPublished = bundles.filter((b) => b.id !== bundleId && b.status === "PUBLISHED");
        const otherActiveSlots = otherPublished.reduce(
          (sum, b) => sum + (Array.isArray(b.tiers) && b.tiers.length > 0 ? b.tiers.length : (b.shopifyDiscountIds?.length || 1)),
          0
        );
        const thisTiersCount = Array.isArray(targetBundle.tiers) && targetBundle.tiers.length > 0 ? targetBundle.tiers.length : 1;
        if (otherActiveSlots + thisTiersCount > discountLimit) {
          return {
            success: false,
            error: `Cannot activate: Activating "${targetBundle.name || "Volume discount"}" requires ${thisTiersCount} slots, which would exceed Shopify's platform limit of ${discountLimit} active automatic discounts (${otherActiveSlots} slots currently in use). Please turn off other bundles first.`,
            bundles,
          };
        }

        const discIds = await syncBundleVolumeAutomaticDiscounts({
          admin,
          bundle: { ...targetBundle, status: "PUBLISHED" },
          previousDiscountIds: targetBundle.shopifyDiscountIds || [],
          collectionGids: targetBundle.collectionGids || [],
        });
        bundles = bundles.map((b) =>
          b.id === bundleId
            ? {
                ...b,
                status: "PUBLISHED",
                shopifyDiscountIds: discIds,
                nonStackingSynced: true,
                updatedAt: new Date().toISOString(),
              }
            : b
        );
      }
    } else if (intent === "duplicate") {
      const original = bundles.find((b) => b.id === bundleId);
      if (original) {
        const copy = {
          ...original,
          id: "bundle_" + Date.now(),
          name: `${original.name} (Copy)`,
          status: "DRAFT",
          shopifyDiscountIds: [],
          updatedAt: new Date().toISOString(),
        };
        bundles.push(copy);
      }
    } else if (intent === "delete") {
      const bundleToDelete = bundles.find((b) => b.id === bundleId);
      if (bundleToDelete) {
        await deleteVolumeDiscounts({ admin, bundle: bundleToDelete, bundleId });
      }
      bundles = bundles.filter((b) => b.id !== bundleId);
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

    return { success: true, bundles };
  } catch (err) {
    console.error("[CartElevate] Bundles action error:", err);
    return { success: false, error: err.message };
  }
};

export default function BundlesAndDiscountsPage() {
  const {
    bundles: initialBundles,
    discountLimit = 25,
    isPlus = false,
  } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [bundles, setBundles] = useState(initialBundles || []);
  const [errorMessage, setErrorMessage] = useState("");

  React.useEffect(() => {
    if (initialBundles) setBundles(initialBundles);
  }, [initialBundles]);

  React.useEffect(() => {
    if (fetcher.data?.bundles) {
      setBundles(fetcher.data.bundles);
    }
    if (fetcher.data?.error) {
      setErrorMessage(fetcher.data.error);
    }
  }, [fetcher.data]);

  const publishedCount = React.useMemo(() => {
    return bundles.filter((b) => b.status === "PUBLISHED").length;
  }, [bundles]);

  // Live active discount slots count based on published bundles and their tiers
  const activeSlots = React.useMemo(() => {
    return bundles
      .filter((b) => b.status === "PUBLISHED")
      .reduce(
        (sum, b) => sum + (Array.isArray(b.tiers) && b.tiers.length > 0 ? b.tiers.length : (b.shopifyDiscountIds?.length || 1)),
        0
      );
  }, [bundles]);

  const handleToggle = (bundleId, nextStatus) => {
    setErrorMessage("");
    if (nextStatus === "PUBLISHED") {
      const bundleToPublish = bundles.find((b) => b.id === bundleId);
      const tiersNeeded = Array.isArray(bundleToPublish?.tiers) && bundleToPublish.tiers.length > 0
        ? bundleToPublish.tiers.length
        : 1;

      // Count slots currently used by other published bundles
      const otherSlots = bundles
        .filter((b) => b.id !== bundleId && b.status === "PUBLISHED")
        .reduce(
          (sum, b) => sum + (Array.isArray(b.tiers) && b.tiers.length > 0 ? b.tiers.length : (b.shopifyDiscountIds?.length || 1)),
          0
        );

      if (otherSlots + tiersNeeded > discountLimit) {
        setErrorMessage(
          `Cannot activate "${bundleToPublish?.name || "Volume discount"}": Activating this bundle requires ${tiersNeeded} discount slot(s), but only ${Math.max(0, discountLimit - otherSlots)} slot(s) remain under Shopify's 25-discount platform limit. Please turn off another bundle first.`
        );
        return;
      }
    }

    setBundles((prev) =>
      prev.map((b) => (b.id === bundleId ? { ...b, status: nextStatus } : b))
    );

    fetcher.submit(
      { intent: "toggle", id: bundleId, status: nextStatus },
      { method: "post" }
    );
  };

  const handleDelete = (bundleId) => {
    if (confirm("Are you sure you want to delete this bundle?")) {
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      fetcher.submit({ intent: "delete", id: bundleId }, { method: "post" });
    }
  };

  const handleCreateBundle = () => {
    navigate("/app/createNewBundle");
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-20 font-sans">
      <main className="max-w-[1080px] mx-auto px-6 sm:px-10 pt-8">
        {/* Back navigation */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-950 transition group cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-50 transition">
              ←
            </span>
            <span>Back to dashboard</span>
          </button>
        </div>

        {/* Page Heading & + New Bundle Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-[34px] font-black tracking-tight text-slate-950">
                Bundles and discounts
              </h1>
              {bundles.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EAFBF1] text-[#0A8754] border border-[#0A8754]/20">
                  <span className="w-2 h-2 rounded-full bg-[#0A8754]"></span>
                  <span>{publishedCount} active in cart</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Create volume tiers, buy-more-save-more offers, and curated product bundles.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCreateBundle}
            className="inline-flex items-center justify-center gap-1.5 bg-[#F95738] hover:bg-[#EA3E1E] active:scale-[0.98] text-white text-sm font-bold px-6 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
          >
            <span>+</span>
            <span>New bundle</span>
          </button>
        </div>

        {/* Error message if limit exceeded */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start justify-between gap-3 shadow-2xs animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-xs sm:text-sm font-semibold">{errorMessage}</p>
                <p className="text-xs text-red-600 mt-1">
                  To free up automatic discount slots, toggle any active bundle to Draft.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage("")}
              className="text-red-400 hover:text-red-700 text-sm font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Shopify Automatic Discount Platform Limit Indicator Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 mb-8 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Left: Icon + Title + Explanatory info */}
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  activeSlots >= discountLimit
                    ? "bg-red-50 border-red-200 text-red-600"
                    : activeSlots >= 18
                    ? "bg-amber-50 border-amber-200 text-amber-600"
                    : "bg-emerald-50 border-emerald-200 text-emerald-600"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                    Shopify Automatic Discount Slots
                  </h2>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                    isPlus
                      ? "bg-[#EAFBF1] text-[#0A8754] border border-[#0A8754]/20"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {isPlus ? "Shopify Plus (Limit: 50)" : "Standard Plan (Limit: 25)"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-[620px]">
                  Shopify allows a maximum of <strong>{discountLimit} active automatic discounts</strong> for your store ({isPlus ? "Shopify Plus enterprise tier" : "50 on Shopify Plus"}). Each published bundle tier creates 1 native automatic discount so customers get savings at checkout without needing coupon codes. Draft bundles consume 0 slots.
                </p>
              </div>
            </div>

            {/* Right: Counter Badge & Status */}
            <div className="shrink-0 text-left sm:text-right">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  activeSlots >= discountLimit
                    ? "bg-red-50 text-red-700 border-red-200"
                    : activeSlots >= 18
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeSlots >= discountLimit
                      ? "bg-red-500"
                      : activeSlots >= 18
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                ></span>
                <span>{activeSlots} / {discountLimit} slots active</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {Math.max(0, discountLimit - activeSlots)} slot{discountLimit - activeSlots !== 1 ? "s" : ""} remaining
              </p>
            </div>
          </div>

          {/* Capacity Progress Bar */}
          <div className="mt-4 pt-3.5 border-t border-slate-100">
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeSlots >= discountLimit
                    ? "bg-red-500"
                    : activeSlots >= 18
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, Math.round((activeSlots / discountLimit) * 100))}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Empty State or Bundles List */}
        {bundles.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-2xl bg-white/70 py-20 px-6 sm:px-12 text-center shadow-2xs">
            {/* Stacked Layers Icon matching screenshot */}
            <div className="flex justify-center mb-5">
              <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 text-[#F95738]">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="#F95738"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="#F95738"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="#F95738"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h2 className="text-xl sm:text-[22px] font-bold text-slate-950 mb-3 tracking-tight">
              No bundles or discounts yet
            </h2>

            <p className="text-sm sm:text-base text-slate-500 max-w-[540px] mx-auto leading-relaxed mb-7 font-normal">
              Reward shoppers for buying more. Create volume tiers like &ldquo;buy 3, save 15%&rdquo;, and scope each one to specific collections or products if you like.
            </p>

            <button
              type="button"
              onClick={handleCreateBundle}
              className="inline-flex items-center justify-center bg-[#FFF1ED] hover:bg-[#FFE6E0] text-[#F95738] border border-[#FDDCD3]/80 font-bold text-sm px-6 py-2.5 rounded-xl transition cursor-pointer shadow-2xs"
            >
              Create your first bundle
            </button>
          </div>
        ) : (
          /* ================= LIST OF CONFIGURED BUNDLES ================= */
          <div className="space-y-4">
            {bundles.map((bundle) => {
              const isPublished = bundle.status === "PUBLISHED";

              return (
                <div
                  key={bundle.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs flex items-center justify-between gap-4 transition hover:border-slate-300"
                >
                  {/* Left Section: Icon Box + Title & Subtitle */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                        isPublished
                          ? "bg-[#FFF2EE] border-[#FDDCD3] text-[#F95738]"
                          : "bg-slate-50/50 border-slate-200/60 text-slate-400"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                        <path
                          d="M12 2L2 7L12 12L22 7L12 2Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 12L12 17L22 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 17L12 22L22 17"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base sm:text-[17px] font-bold text-slate-950 truncate">
                          {bundle.name}
                        </h3>
                        {isPublished ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#EAFBF1] text-[#0A8754] tracking-wider uppercase">
                            PUBLISHED
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] tracking-wider uppercase">
                            DRAFT
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 truncate">
                        {bundle.name || "Volume discount"} • {bundle.discountValue || "15% off"}
                        {bundle.appliesTo === "specific_collection" && bundle.targetCollection && ` • Collections: ${bundle.targetCollection}`}
                        {bundle.appliesTo === "specific_products" && bundle.targetProducts && ` • Products: ${bundle.targetProducts}`}
                        {bundle.appliesTo === "all_products" && ` • All products`}
                        {!bundle.appliesTo && bundle.targetCollection && ` • Scoped to: ${bundle.targetCollection}`}
                      </p>
                    </div>
                  </div>

                  {/* Right Section: Delete, Edit, and Toggle Switch */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDelete(bundle.id)}
                      title="Delete bundle"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => navigate(`/app/createNewBundle?id=${bundle.id}`)}
                      title="Edit bundle"
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPublished}
                      onClick={() => handleToggle(bundle.id, isPublished ? "DRAFT" : "PUBLISHED")}
                      title={isPublished ? "Click to set to Draft" : "Click to Publish"}
                      style={{ width: "48px", height: "24px" }}
                      className={`w-12 h-6 shrink-0 rounded-full transition-colors relative cursor-pointer focus:outline-none p-0.5 inline-flex items-center ${
                        isPublished ? "bg-[#F95738]" : "bg-[#CBD5E1]"
                      }`}
                    >
                      <span
                        style={{ width: "20px", height: "20px" }}
                        className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
                          isPublished ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}