import React, { useState } from "react";
import { useLoaderData, useNavigate, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";

export function normalizeLogic(logic) {
  const l = String(logic || "").trim().toLowerCase();
  if (l.includes("frequently")) return "Frequently bought together";
  if (l.includes("collection")) return "Same collection";
  if (l.includes("curated") || l.includes("manually")) return "Curated Recommendations";
  if (l.includes("margin") || l.includes("highest")) return "Highest margin products";
  return logic || "Frequently bought together";
}

export function getLogicRank(logic) {
  const norm = normalizeLogic(logic);
  if (norm === "Frequently bought together") return 1;
  if (norm === "Same collection") return 2;
  if (norm === "Curated Recommendations") return 3;
  if (norm === "Highest margin products") return 4;
  return 999;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const editId = url.searchParams.get("id");

  let sets = [];
  try {
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
      if (Array.isArray(parsed.sets)) sets = parsed.sets;
    }
  } catch (err) {
    console.warn("[CartElevate] Error fetching recommendations metafield:", err.message);
  }

  // Fetch all available collections dynamically from Shopify store inventory
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
    availableCollections = (colRes?.data?.collections?.edges || []).map((e) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      productsCount: e.node.productsCount?.count ?? 0,
      image: e.node.image?.url || null,
    }));
  } catch (err) {
    console.warn("[CartElevate] Error fetching store collections:", err);
  }

  // Fetch store products for curated products picker
  let storeProducts = [];
  try {
    const prodQuery = await admin.graphql(`
      query GetStoreProducts {
        products(first: 100) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
            variants(first: 10) {
              nodes {
                id
                title
                price
                compareAtPrice
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
        variantId: v?.id || null,
        variantTitle: v?.title || "",
        price: v?.price || "0.00",
        compareAtPrice: v?.compareAtPrice || null,
        variants: (p.variants?.nodes || []).map((vn) => ({
          id: vn.id,
          numericId: vn.id.split("/").pop(),
          title: vn.title,
          price: vn.price || "0.00",
          compareAtPrice: vn.compareAtPrice || null,
        })),
      };
    });
  } catch (err) {
    console.warn("[CartElevate] Error fetching store products:", err);
  }

  // Find set if editing
  const existingSet = editId ? sets.find((s) => s.id === editId) : null;

  const currentSetData = existingSet || {
    id: editId || "",
    name: "Recommendation set",
    logic: "Frequently bought together",
    numberShown: 3,
    sectionTitle: "You might also like",
    excludeCollections: [],
    curatedProducts: [],
    status: "PUBLISHED",
  };

  return { shop, currentSetData, availableCollections, storeProducts, isEditing: Boolean(existingSet), allSets: sets };
};

export const action = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const id = formData.get("id")?.toString() || "";
  const name = formData.get("name")?.toString() || "Recommendation set";
  const logic = formData.get("logic")?.toString() || "Frequently bought together";
  const numberShown = parseInt(formData.get("numberShown")?.toString() || "3", 10);
  const sectionTitle = formData.get("sectionTitle")?.toString() || "You might also like";
  const status = formData.get("status")?.toString() || "PUBLISHED";
  const excludeCollectionsRaw = formData.get("excludeCollections")?.toString() || "[]";
  const curatedProductsRaw = formData.get("curatedProducts")?.toString() || "[]";

  let excludeCollections = [];
  try {
    excludeCollections = JSON.parse(excludeCollectionsRaw);
  } catch (e) {
    excludeCollections = [];
  }

  let curatedProducts = [];
  try {
    curatedProducts = JSON.parse(curatedProductsRaw);
  } catch (e) {
    curatedProducts = [];
  }

  // Normalize excluded collections into clean objects with id, title, handle
  excludeCollections = excludeCollections.map((col) => {
    if (typeof col === "string") {
      return {
        id: "",
        title: col,
        handle: col.toLowerCase().replace(/\s+/g, "-"),
      };
    }
    return {
      id: col.id || "",
      title: col.title || "",
      handle: col.handle || (col.title ? col.title.toLowerCase().replace(/\s+/g, "-") : ""),
    };
  });

  // Query product IDs for each excluded collection so storefront can immediately and accurately exclude them
  let excludedProductIds = [];
  for (const col of excludeCollections) {
    if (col.id) {
      try {
        const prodQuery = await admin.graphql(
          `query GetColProducts($id: ID!) {
            collection(id: $id) {
              products(first: 250) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }`,
          { variables: { id: col.id } }
        );
        const prodRes = await prodQuery.json();
        const edges = prodRes?.data?.collection?.products?.edges || [];
        for (const edge of edges) {
          const numId = edge.node.id.split("/").pop();
          if (numId && !excludedProductIds.includes(numId)) {
            excludedProductIds.push(numId);
          }
        }
      } catch (err) {
        console.warn(`[CartElevate] Failed fetching products for collection ${col.id}:`, err);
      }
    }
  }

  try {
    const shopQuery = await admin.graphql(`
      query GetShopAndMetafield {
        shop {
          id
          metafield(namespace: "cartelevate", key: "recommendations") {
            value
          }
        }
      }
    `);
    const shopRes = await shopQuery.json();
    const shopId = shopRes?.data?.shop?.id;
    const rawVal = shopRes?.data?.shop?.metafield?.value;

    let sets = [];
    if (rawVal) {
      try {
        const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
        if (Array.isArray(parsed.sets)) sets = parsed.sets;
      } catch (e) {}
    }

    const intent = formData.get("intent")?.toString();
    if (intent === "delete" && id) {
      sets = sets.filter((s) => s.id !== id);
      if (shopId) {
        await admin.graphql(
          `
          mutation SetRecommendationMetafield($metafields: [MetafieldsSetInput!]!) {
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
                  key: "recommendations",
                  type: "json",
                  value: JSON.stringify({ sets, appUrl: process.env.SHOPIFY_APP_URL || "", updatedAt: new Date().toISOString() }),
                },
              ],
            },
          }
        );
      }
      return redirect("/app/recommendation");
    }

    const targetSetId = id && id.trim() !== "" ? id : "set_" + Date.now();
    const normNewLogic = normalizeLogic(logic);

    // If saving as PUBLISHED: Ensure only 1 set is enabled per logic across all configurations.
    // Demote any previously published set with this same logic to DRAFT.
    if (status === "PUBLISHED") {
      sets = sets.map((s) => {
        if (s.id !== targetSetId && s.status === "PUBLISHED" && normalizeLogic(s.logic) === normNewLogic) {
          return { ...s, status: "DRAFT", updatedAt: new Date().toISOString() };
        }
        return s;
      });
    }

    const updatedSet = {
      id: targetSetId,
      name,
      logic,
      numberShown,
      sectionTitle,
      excludeCollections,
      excludedProductIds,
      curatedProducts,
      status,
      updatedAt: new Date().toISOString(),
    };

    const existingIdx = sets.findIndex((s) => s.id === targetSetId);
    if (existingIdx !== -1) {
      sets[existingIdx] = updatedSet;
    } else {
      sets.push(updatedSet);
    }

    if (shopId) {
      await admin.graphql(
        `
        mutation SetRecommendationMetafield($metafields: [MetafieldsSetInput!]!) {
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
                key: "recommendations",
                type: "json",
                value: JSON.stringify({ sets, appUrl: process.env.SHOPIFY_APP_URL || "", updatedAt: new Date().toISOString() }),
              },
            ],
          },
        }
      );
    }

    return redirect("/app/recommendation");
  } catch (err) {
    console.error("[CartElevate] Save recommendations error:", err);
    return { success: false, error: err.message };
  }
};

export default function NewRecommendationPage() {
  const { currentSetData, availableCollections = [], storeProducts = [], isEditing, allSets = [] } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting" || navigation.state === "loading";

  // Helper to normalize excluded collection objects
  const normalizeExcludeCollection = (item) => {
    if (typeof item === "string") {
      const match = availableCollections.find(
        (c) => c.title.toLowerCase() === item.toLowerCase() || c.handle === item.toLowerCase()
      );
      if (match) return match;
      return {
        id: "custom_" + item.toLowerCase().replace(/\s+/g, "-"),
        title: item,
        handle: item.toLowerCase().replace(/\s+/g, "-"),
        productsCount: 0,
      };
    }
    return {
      id: item.id || "",
      title: item.title || "",
      handle: item.handle || (item.title ? item.title.toLowerCase().replace(/\s+/g, "-") : ""),
      productsCount: item.productsCount || 0,
    };
  };

  // Form states
  const [name, setName] = useState(currentSetData.name || "Recommendation set");
  const [logic, setLogic] = useState(currentSetData.logic || "Frequently bought together");
  const [numberShown, setNumberShown] = useState(currentSetData.numberShown || 3);
  const [sectionTitle, setSectionTitle] = useState(currentSetData.sectionTitle || "You might also like");
  const [excludeCollections, setExcludeCollections] = useState(() => {
    const raw = currentSetData.excludeCollections || [];
    return raw.map(normalizeExcludeCollection);
  });
  const [curatedProducts, setCuratedProducts] = useState(
    currentSetData.curatedProducts || []
  );
  const [status, setStatus] = useState(() => {
    if (isEditing) return currentSetData.status || "PUBLISHED";
    const hasActive = allSets.some(
      (s) => s.status === "PUBLISHED" && normalizeLogic(s.logic) === normalizeLogic(currentSetData.logic)
    );
    return hasActive ? "DRAFT" : "PUBLISHED";
  });

  const conflictingActiveSet = React.useMemo(() => {
    const normLogic = normalizeLogic(logic);
    return allSets.find(
      (s) => s.id !== (currentSetData.id || "") && s.status === "PUBLISHED" && normalizeLogic(s.logic) === normLogic
    );
  }, [allSets, currentSetData.id, logic]);

  // Custom Dropdown popup state for Recommendation Logic
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Dynamic Collection Picker state
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");

  // Curated Product Picker modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const dropdownOptions = [
    "Frequently bought together",
    "Same collection",
    "Curated Recommendations",
    "Highest margin products",
  ];

  // Filter available store collections by search query
  const filteredAvailableCollections = availableCollections.filter((col) => {
    if (!collectionSearch.trim()) return true;
    const q = collectionSearch.toLowerCase();
    return (
      (col.title && col.title.toLowerCase().includes(q)) ||
      (col.handle && col.handle.toLowerCase().includes(q))
    );
  });

  const toggleCollection = (col) => {
    setExcludeCollections((prev) => {
      const exists = prev.some(
        (c) => (c.id && c.id === col.id) || (c.handle && c.handle === col.handle)
      );
      if (exists) {
        return prev.filter(
          (c) => (c.id ? c.id !== col.id : c.handle !== col.handle)
        );
      } else {
        return [...prev, col];
      }
    });
  };

  const removeCollection = (colToRemove) => {
    setExcludeCollections((prev) =>
      prev.filter(
        (c) => (c.id ? c.id !== colToRemove.id : c.handle !== colToRemove.handle)
      )
    );
  };

  // Filter store products for curated products search
  const filteredStoreProducts = storeProducts.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.handle && p.handle.toLowerCase().includes(q))
    );
  });

  const handleOpenProductPicker = async () => {
    try {
      if (window.shopify && typeof window.shopify.resourcePicker === "function") {
        const selection = await window.shopify.resourcePicker({
          type: "product",
          multiple: true,
          action: "select",
          selectionIds: curatedProducts.map((p) => ({ id: p.id })),
        });
        if (selection && selection.length > 0) {
          const selectedItems = selection.map((prod) => {
            const variant = prod.variants?.[0];
            const img = prod.images?.[0]?.originalSrc || prod.images?.[0]?.src || "";
            const price = variant?.price ? String(variant.price) : "0.00";
            return {
              id: prod.id,
              numericId: prod.id.split("/").pop(),
              title: prod.title,
              handle: prod.handle || "",
              image: img,
              price: price,
              variantId: variant?.id || null,
              variants: (prod.variants || []).map((v) => ({
                id: v.id,
                numericId: v.id.split("/").pop(),
                title: v.title,
                price: v.price || "0.00",
                compareAtPrice: v.compareAtPrice || null,
              })),
            };
          });
          setCuratedProducts(selectedItems);
          return;
        }
      }
    } catch (err) {
      console.warn("[CartElevate] Shopify native resourcePicker unavailable, using modal fallback:", err);
    }
    setShowProductModal(true);
  };

  const toggleCuratedProduct = (prod) => {
    setCuratedProducts((prev) => {
      const exists = prev.some(
        (p) => (p.id && p.id === prod.id) || (p.numericId && p.numericId === prod.numericId)
      );
      if (exists) {
        return prev.filter(
          (p) => p.id !== prod.id && p.numericId !== prod.numericId
        );
      } else {
        return [...prev, prod];
      }
    });
  };

  const removeCuratedProduct = (prodId) => {
    setCuratedProducts((prev) =>
      prev.filter((p) => p.id !== prodId && p.numericId !== prodId)
    );
  };

  // Interactive Live Preview pool with tagged collection handles for live reactive exclusion testing
  const previewProductsPool = [
    {
      id: "coaster",
      title: "Cork coaster",
      price: "$8.00",
      collectionHandles: ["accessories", "kitchenware", "home-decor"],
      imgUrl: "https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#DDB892",
    },
    {
      id: "towel",
      title: "Tea towel",
      price: "$11.00",
      collectionHandles: ["kitchenware", "linens", "textiles"],
      imgUrl: "https://images.unsplash.com/photo-1607344645866-009c320b5ab8?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#F4F1EA",
    },
    {
      id: "trivet",
      title: "Trivet",
      price: "$16.00",
      collectionHandles: ["tableware", "kitchenware", "accessories"],
      imgUrl: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#D4A373",
    },
    {
      id: "plate",
      title: "Ceramic plate",
      price: "$18.00",
      collectionHandles: ["ceramics", "tableware", "dining"],
      imgUrl: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#EAE6DF",
    },
    {
      id: "napkin",
      title: "Linen napkin",
      price: "$9.00",
      collectionHandles: ["linens", "dining", "textiles"],
      imgUrl: "https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#EAE2B7",
    },
    {
      id: "spoons",
      title: "Wood spoons",
      price: "$14.00",
      collectionHandles: ["kitchenware", "woodcraft", "cookware"],
      imgUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#DDA15E",
    },
  ];

  // Dynamic preview filtering: if 'Curated Recommendations' and products are selected, show them directly!
  let visiblePreviewProducts = [];
  if ((logic === "Curated Recommendations" || logic === "Manually curated") && curatedProducts.length > 0) {
    visiblePreviewProducts = curatedProducts.slice(0, Math.min(numberShown, 6)).map((p, idx) => ({
      id: p.id || `curated_${idx}`,
      title: p.title || "Curated product",
      price: typeof p.price === "number" ? `$${p.price.toFixed(2)}` : (p.price?.startsWith("$") ? p.price : `$${p.price || "0.00"}`),
      imgUrl: p.image || p.featured_image || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=180&h=180&q=80",
      fallbackColor: "#F3F4F6",
    }));
  } else {
    const excludedHandlesOrTitles = excludeCollections.map((c) =>
      (c.handle || c.title || "").toLowerCase()
    );

    let filteredPreviewPool = previewProductsPool.filter((p) => {
      return !p.collectionHandles.some((h) =>
        excludedHandlesOrTitles.some((ex) => ex && (ex.includes(h) || h.includes(ex)))
      );
    });

    if (logic === "Highest margin products") {
      filteredPreviewPool = [...filteredPreviewPool].sort((a, b) => {
        const pA = parseFloat(a.price.replace(/[^0-9.]/g, "") || "0");
        const pB = parseFloat(b.price.replace(/[^0-9.]/g, "") || "0");
        return pB - pA;
      });
    }

    visiblePreviewProducts = filteredPreviewPool.slice(0, Math.min(numberShown, 6));
  }

  const sliderPercentage = ((numberShown - 1) / (6 - 1)) * 100;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-16 font-sans">
      {/* Top back navigation breadcrumb */}
      <div className="max-w-[1240px] mx-auto px-6 sm:px-10 pt-6 pb-2">
        <button
          type="button"
          onClick={() => navigate("/app/recommendation")}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-950 transition group cursor-pointer"
        >
          <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-50 transition">
            ←
          </span>
          <span>Back to recommendation sets</span>
        </button>
      </div>

      {/* Main Container Card */}
      <div className="max-w-[1240px] mx-auto px-6 sm:px-10 pt-3">
        <div className="bg-white rounded-[28px] border border-slate-200/80 p-8 sm:p-10 shadow-sm">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-[34px] font-black tracking-tight text-slate-950">
              {isEditing ? "Edit recommendation set" : "New recommendation set"}
            </h1>
            <p className="text-sm text-slate-500 font-normal mt-1 leading-relaxed">
              Configure recommendation logic, number shown, and excluded collections.
            </p>
          </div>

          {/* 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* ================= LEFT COLUMN: SETTINGS PANEL ================= */}
            <div className="lg:col-span-6 border border-slate-200/90 rounded-2xl p-6 sm:p-8 space-y-6 bg-white shadow-2xs">
              <Form method="post" className="space-y-6">
                <input type="hidden" name="id" value={currentSetData.id || ""} />
                <input type="hidden" name="logic" value={logic} />
                <input type="hidden" name="numberShown" value={numberShown} />
                <input type="hidden" name="sectionTitle" value={sectionTitle} />
                <input type="hidden" name="status" value={status} />
                <input
                  type="hidden"
                  name="excludeCollections"
                  value={JSON.stringify(excludeCollections)}
                />
                <input
                  type="hidden"
                  name="curatedProducts"
                  value={JSON.stringify(curatedProducts)}
                />

                {/* 1. Set Name */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-800">
                    Set name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kitchenware set"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition shadow-2xs"
                  />
                </div>

                {/* 2. Recommendation Logic */}
                <div className="space-y-1.5 relative">
                  <label className="block text-sm font-medium text-slate-800">
                    Recommendation logic
                  </label>

                  {/* Select button trigger */}
                  <div
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 cursor-pointer hover:border-slate-300 transition shadow-2xs select-none"
                  >
                    <span className="text-slate-900 font-medium">{logic}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`w-4 h-4 text-slate-500 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Dropdown Menu Popup */}
                  {isDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setIsDropdownOpen(false)}
                      />
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-1.5 overflow-hidden animate-fadeIn select-none">
                        {dropdownOptions.map((opt) => {
                          const isSelected = logic === opt;
                          return (
                            <div
                              key={opt}
                              onClick={() => {
                                setLogic(opt);
                                setIsDropdownOpen(false);
                              }}
                              className={`px-4 py-2.5 text-sm cursor-pointer transition flex items-center justify-between ${
                                isSelected
                                  ? "bg-[#FFF0ED] text-[#F95738] font-bold"
                                  : "text-slate-800 hover:bg-slate-50 font-normal"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className={`text-sm ${isSelected ? "text-[#F95738] font-bold" : "text-transparent"}`}>
                                  ✓
                                </span>
                                <span className={isSelected ? "text-[#F95738] font-bold" : "text-slate-800 font-normal"}>
                                  {opt}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {logic === "Highest margin products" && (
                    <div className="mt-2.5 px-3.5 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/60 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                      <span className="text-amber-500 text-sm leading-none mt-0.5">💎</span>
                      <div className="leading-relaxed">
                        <span className="font-bold">AOV Maximizer:</span> Automatically surfaces top-priced, high-margin products from the active collection and store catalog to maximize order value and profitability.
                      </div>
                    </div>
                  )}
                </div>

                {/* 2.5 Curated Products Section (Visible when logic === "Curated Recommendations") */}
                {(logic === "Curated Recommendations" || logic === "Manually curated") && (
                  <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-b from-[#FFF9F6] to-white border border-[#F95738]/25 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-bold text-slate-900">
                          Curated products
                        </label>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Select the exact products you want to recommend to customers.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenProductPicker}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F95738] text-white text-xs font-bold hover:bg-[#e0482b] transition shadow-2xs cursor-pointer"
                      >
                        <span>+ Add products</span>
                      </button>
                    </div>

                    {curatedProducts.length === 0 ? (
                      <div
                        onClick={handleOpenProductPicker}
                        className="p-6 text-center border-2 border-dashed border-[#F95738]/30 rounded-xl bg-white/70 hover:bg-white hover:border-[#F95738]/60 transition cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#FFF0ED] text-[#F95738] flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                          🛍️
                        </div>
                        <p className="text-xs font-semibold text-slate-800">
                          No products selected yet
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Click here or "+ Add products" above to pick items from your store.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
                          <span>{curatedProducts.length} product{curatedProducts.length !== 1 ? "s" : ""} selected</span>
                          <button
                            type="button"
                            onClick={() => setCuratedProducts([])}
                            className="text-red-500 hover:text-red-700 hover:underline cursor-pointer font-semibold"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                          {curatedProducts.map((prod) => (
                            <div
                              key={prod.id || prod.numericId}
                              className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-[#F95738]/40 transition group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                                  {prod.image ? (
                                    <img
                                      src={prod.image}
                                      alt={prod.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-400">📦</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">
                                    {prod.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {typeof prod.price === "number" ? `$${prod.price.toFixed(2)}` : (prod.price?.startsWith("$") ? prod.price : `$${prod.price || "0.00"}`)}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCuratedProduct(prod.id || prod.numericId)}
                                className="w-6 h-6 rounded-md hover:bg-slate-100 text-slate-400 hover:text-red-600 flex items-center justify-center text-xs transition cursor-pointer"
                                title="Remove product"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Number Shown Slider */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-800">
                    Number shown
                  </label>
                  <div className="flex items-center gap-4 pt-1">
                    <div className="flex-1 relative flex items-center">
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={numberShown}
                        onChange={(e) => setNumberShown(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none ce-custom-range"
                        style={{
                          background: `linear-gradient(to right, #F95738 0%, #F95738 ${sliderPercentage}%, #E2E8F0 ${sliderPercentage}%, #E2E8F0 100%)`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-900 w-5 text-right">
                      {numberShown}
                    </span>
                  </div>
                </div>

                {/* 4. Section Title Input */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-800">
                    Section title
                  </label>
                  <input
                    type="text"
                    value={sectionTitle}
                    onChange={(e) => setSectionTitle(e.target.value)}
                    placeholder="You might also like"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-normal text-slate-900 focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition shadow-2xs"
                  />
                </div>

                {/* 5. Exclude Collections Section */}
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-800">
                      Exclude collections
                    </label>
                    {availableCollections.length > 0 && (
                      <span className="text-[11px] font-medium text-slate-400">
                        {availableCollections.length} store collection{availableCollections.length !== 1 ? "s" : ""} available
                      </span>
                    )}
                  </div>

                  {/* Selected Collections list / Empty placeholder */}
                  {excludeCollections.length === 0 ? (
                    <div className="p-3.5 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl flex items-center justify-between gap-3 transition">
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-normal">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400">
                          <rect x="3" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="14" width="7" height="7" rx="1.5" />
                          <rect x="3" y="14" width="7" height="7" rx="1.5" />
                        </svg>
                        <span>No collections excluded yet. All store collections eligible.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCollectionPickerOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#F95738] hover:text-[#EA3E1E] transition cursor-pointer shrink-0"
                      >
                        <span>+ Exclude</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {excludeCollections.map((col) => (
                        <span
                          key={col.id || col.handle}
                          className="inline-flex items-center gap-1.5 bg-[#FFF0ED] text-[#D9381E] text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#FDDCD3] shadow-2xs"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-70">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          </svg>
                          <span>{col.title}</span>
                          {col.productsCount !== undefined && col.productsCount > 0 && (
                            <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full text-slate-600 font-medium border border-slate-100">
                              {col.productsCount}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCollection(col)}
                            className="hover:text-red-800 font-bold ml-0.5 cursor-pointer text-[#D9381E]/60 hover:text-[#D9381E]"
                            title="Remove from excluded list"
                          >
                            ✕
                          </button>
                        </span>
                      ))}

                      <button
                        type="button"
                        onClick={() => setIsCollectionPickerOpen((prev) => !prev)}
                        className="inline-flex items-center gap-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer shadow-2xs"
                      >
                        <span className="text-[#F95738] font-bold">+</span>
                        <span>Manage</span>
                      </button>
                    </div>
                  )}

                  {/* Searchable Multi-Select Collection Picker Dropdown */}
                  {isCollectionPickerOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsCollectionPickerOpen(false)}
                      />
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden animate-fadeIn select-none">
                        {/* Top Search Input */}
                        <div className="p-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50/60">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 shrink-0">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <input
                            type="text"
                            placeholder="Search store collections..."
                            value={collectionSearch}
                            onChange={(e) => setCollectionSearch(e.target.value)}
                            className="w-full bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                            autoFocus
                          />
                          {collectionSearch && (
                            <button
                              type="button"
                              onClick={() => setCollectionSearch("")}
                              className="text-xs text-slate-400 hover:text-slate-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Summary Bar */}
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                          <span>
                            {filteredAvailableCollections.length} collection{filteredAvailableCollections.length !== 1 ? "s" : ""}
                            {excludeCollections.length > 0 && ` (${excludeCollections.length} excluded)`}
                          </span>
                          {excludeCollections.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExcludeCollections([])}
                              className="text-[#F95738] hover:underline cursor-pointer"
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        {/* Scrollable Collection Items */}
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                          {filteredAvailableCollections.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              {availableCollections.length === 0
                                ? "No collections found in your store inventory."
                                : `No collections match "${collectionSearch}"`}
                            </div>
                          ) : (
                            filteredAvailableCollections.map((col) => {
                              const isExcluded = excludeCollections.some(
                                (c) => (c.id && c.id === col.id) || (c.handle && c.handle === col.handle)
                              );
                              return (
                                <div
                                  key={col.id || col.handle}
                                  onClick={() => toggleCollection(col)}
                                  className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition select-none ${
                                    isExcluded ? "bg-[#FFF6F4]" : "hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                                        isExcluded
                                          ? "bg-[#F95738] border-[#F95738] text-white"
                                          : "border-slate-300 bg-white"
                                      }`}
                                    >
                                      {isExcluded && (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-2.5 h-2.5">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className={`text-xs font-semibold truncate ${isExcluded ? "text-[#F95738]" : "text-slate-900"}`}>
                                        {col.title}
                                      </p>
                                      <p className="text-[10px] text-slate-400 truncate">
                                        {col.productsCount} product{col.productsCount !== 1 ? "s" : ""} &bull; /{col.handle}
                                      </p>
                                    </div>
                                  </div>
                                  {isExcluded ? (
                                    <span className="text-[10px] font-bold text-[#F95738] uppercase tracking-wider bg-white px-2 py-0.5 rounded-full border border-[#FDDCD3]">
                                      Excluded
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium hover:text-slate-600">
                                      Click to exclude
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Done Footer */}
                        <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setIsCollectionPickerOpen(false)}
                            className="px-4 py-1.5 bg-[#F95738] hover:bg-[#EA3E1E] text-white rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  <p className="text-[11px] text-slate-500 font-normal pt-0.5">
                    Products belonging to any excluded collection will never appear in cart recommendations.
                  </p>
                </div>

                {/* 5.5 Cart Status Toggle Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">Cart status</span>
                        {status === "PUBLISHED" ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#EAFBF1] text-[#0A8754] tracking-wider uppercase">
                            PUBLISHED
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] tracking-wider uppercase">
                            DRAFT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        {status === "PUBLISHED"
                          ? "Enabled: displays in the cart drawer (up to 4 logics can be active at once)."
                          : "Draft: saved in your catalog without displaying in the storefront cart."}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={status === "PUBLISHED"}
                      onClick={() => setStatus((prev) => (prev === "PUBLISHED" ? "DRAFT" : "PUBLISHED"))}
                      style={{ width: "48px", height: "24px" }}
                      className={`w-12 h-6 shrink-0 rounded-full transition-colors relative cursor-pointer focus:outline-none p-0.5 inline-flex items-center ${
                        status === "PUBLISHED" ? "bg-[#F95738]" : "bg-[#CBD5E1]"
                      }`}
                    >
                      <span
                        style={{ width: "20px", height: "20px" }}
                        className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
                          status === "PUBLISHED" ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {status === "PUBLISHED" && conflictingActiveSet && (
                    <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                      <span className="text-amber-500 text-sm leading-none mt-0.5">⚠️</span>
                      <div className="leading-relaxed">
                        <span className="font-bold">Logic notice:</span> &ldquo;{conflictingActiveSet.name}&rdquo; is currently enabled for {normalizeLogic(logic)}. Since only 1 set can be active per logic (max 4 active at once), saving this set as Published will switch &ldquo;{conflictingActiveSet.name}&rdquo; to Draft.
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Action Buttons (Save, Back & Delete if editing) */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center justify-center bg-[#F95738] hover:bg-[#EA3E1E] active:scale-[0.98] text-white text-sm font-bold px-7 py-2.5 rounded-xl transition shadow-xs cursor-pointer min-w-[100px]"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate("/app/recommendation")}
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
                        if (!confirm("Are you sure you want to delete this recommendation set?")) {
                          e.preventDefault();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3.5 py-2 rounded-xl transition cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete set</span>
                    </button>
                  )}
                </div>
              </Form>
            </div>

            {/* ================= RIGHT COLUMN: LIVE CART DRAWER PREVIEW ================= */}
            <div className="lg:col-span-6 flex justify-center lg:justify-end">
              <div className="w-full max-w-[380px] rounded-2xl border border-slate-200/90 shadow-md bg-white overflow-hidden transition-all">
                {/* 1. Drawer Header */}
                <div className="bg-[#F95738] text-white p-3.5 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[#F95738] shadow-2xs">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3.5 h-3.5">
                        <circle cx="8" cy="21" r="1.5" />
                        <circle cx="19" cy="21" r="1.5" />
                        <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                      </svg>
                    </div>
                    <span className="font-bold text-sm tracking-tight text-white">
                      Your cart (2)
                    </span>
                  </div>

                  <button
                    type="button"
                    className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white/90 hover:text-white transition cursor-pointer text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* 2. Cart Items list */}
                <div className="p-4 space-y-3.5 divide-y divide-slate-100">
                  <div className="flex items-center gap-3.5 pt-1">
                    <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <img
                        src="https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=120&h=120&q=80"
                        alt="Ceramic mug"
                        className="w-full h-full object-cover rounded-lg"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "block";
                        }}
                      />
                      <svg viewBox="0 0 60 60" className="w-10 h-10 text-slate-700 hidden" fill="none">
                        <path d="M14 18h24v22a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8V18z" fill="#F8F9FA" stroke="#D1D5DB" strokeWidth="2" />
                        <path d="M38 24h6a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5h-6" stroke="#D1D5DB" strokeWidth="2" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        Ceramic mug
                      </h4>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        $14.00
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5 pt-3.5">
                    <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <img
                        src="https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=120&h=120&q=80"
                        alt="Tote bag"
                        className="w-full h-full object-cover rounded-lg"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "block";
                        }}
                      />
                      <svg viewBox="0 0 60 60" className="w-10 h-10 text-amber-700 hidden" fill="none">
                        <path d="M15 24l3 26h24l3-26H15z" fill="#EED9C4" stroke="#CBB196" strokeWidth="2" />
                        <path d="M24 24V14a6 6 0 0 1 12 0v10" stroke="#CBB196" strokeWidth="2" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        Tote bag
                      </h4>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        $22.00
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Recommendations Section */}
                <div className="p-4 pt-3 border-t border-slate-100 bg-white">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold text-slate-950 tracking-tight flex items-center gap-1.5">
                      <span>✨</span>
                      <span>{sectionTitle || "You might also like"}</span>
                    </h4>
                    {numberShown >= 4 && (
                      <span className="text-[10px] font-semibold text-[#F95738] bg-[#FFF0ED] px-2 py-0.5 rounded-full border border-[#FDDCD3] flex items-center gap-1">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5">
                          <polyline points="15 7 20 12 15 17" />
                          <polyline points="9 7 4 12 9 17" />
                        </svg>
                        <span>Scroll</span>
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <div
                      className={`gap-2.5 transition-all ${
                        numberShown >= 4
                          ? "flex overflow-x-auto overflow-y-hidden pb-2 ce-preview-scroll-x scroll-smooth"
                          : numberShown === 1
                          ? "grid grid-cols-1 max-w-[150px] mx-auto"
                          : numberShown === 2
                          ? "grid grid-cols-2"
                          : "grid grid-cols-3"
                      }`}
                    >
                      {visiblePreviewProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className={`bg-white rounded-xl border border-slate-100 p-2 text-center flex flex-col justify-between shadow-2xs group hover:border-[#F95738]/40 transition ${
                            numberShown >= 4 ? "min-w-[108px] max-w-[115px] shrink-0" : ""
                          }`}
                        >
                          <div className="w-full aspect-square bg-[#F8F9FA] rounded-lg p-1 flex items-center justify-center mb-1.5 overflow-hidden">
                            <img
                              src={prod.imgUrl}
                              alt={prod.title}
                              className="w-full h-full object-cover rounded-md group-hover:scale-105 transition"
                              onError={(e) => {
                                e.target.style.display = "none";
                                e.target.nextSibling.style.display = "block";
                              }}
                            />
                            <div
                              className="w-full h-full rounded-md hidden"
                              style={{ backgroundColor: prod.fallbackColor }}
                            />
                          </div>
                          <div className="text-left">
                            <p className="text-[11px] font-semibold text-slate-900 truncate leading-tight">
                              {prod.title}
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5 mb-2">
                              {prod.price}
                            </p>
                            <button
                              type="button"
                              className="w-full py-1 bg-[#FFF1ED] text-[#F95738] rounded-md text-[10px] font-bold group-hover:bg-[#F95738] group-hover:text-white transition shadow-2xs cursor-pointer"
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {numberShown >= 4 && (
                      <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-6 bg-gradient-to-l from-white via-white/50 to-transparent rounded-r-lg" />
                    )}
                  </div>
                </div>

                {/* 4. Bottom Checkout Section */}
                <div className="p-4 text-center border-t border-slate-100">
                  <span className="text-xs font-bold text-[#F95738]/60 cursor-default tracking-wide select-none">
                    Checkout
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fallback Product Picker Modal (when outside Shopify admin or during local dev) */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Select Curated Products
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick products from your store to recommend.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Search */}
            <div className="p-3 px-5 border-b border-slate-100 bg-slate-50/50">
              <div className="relative flex items-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 absolute left-3">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search products by title..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#F95738] focus:ring-2 focus:ring-[#F95738]/20 transition"
                />
              </div>
            </div>

            {/* Modal Product List */}
            <div className="p-3 px-5 overflow-y-auto flex-1 divide-y divide-slate-100">
              {filteredStoreProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No products found.
                </div>
              ) : (
                filteredStoreProducts.map((prod) => {
                  const isSelected = curatedProducts.some(
                    (p) => (p.id && p.id === prod.id) || (p.numericId && p.numericId === prod.numericId)
                  );

                  return (
                    <div
                      key={prod.id || prod.numericId}
                      onClick={() => toggleCuratedProduct(prod)}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {prod.image ? (
                            <img
                              src={prod.image}
                              alt={prod.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">📦</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {prod.title}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            ${typeof prod.price === "number" ? prod.price.toFixed(2) : prod.price}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                          isSelected
                            ? "bg-[#F95738] border-[#F95738] text-white"
                            : "border-slate-300 bg-white group-hover:border-slate-400"
                        }`}
                      >
                        {isSelected && <span className="text-xs font-bold leading-none">✓</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 px-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">
                {curatedProducts.length} product{curatedProducts.length !== 1 ? "s" : ""} selected
              </span>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="px-5 py-2 bg-[#F95738] hover:bg-[#e0482b] text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        input[type=range].ce-custom-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #F95738;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
          transition: transform 0.1s ease;
        }
        input[type=range].ce-custom-range::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
        input[type=range].ce-custom-range::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #F95738;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }
        .ce-preview-scroll-x::-webkit-scrollbar {
          height: 4px;
        }
        .ce-preview-scroll-x::-webkit-scrollbar-track {
          background: #F8FAFC;
          border-radius: 4px;
        }
        .ce-preview-scroll-x::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 4px;
        }
        .ce-preview-scroll-x::-webkit-scrollbar-thumb:hover {
          background: #94A3B8;
        }
      `}</style>
    </div>
  );
}
