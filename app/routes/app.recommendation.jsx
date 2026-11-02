import React, { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
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
      if (Array.isArray(parsed.sets)) {
        sets = parsed.sets;
      } else if (parsed && parsed.logic) {
        sets = [
          {
            id: "set_default",
            name: "Default set",
            status: "PUBLISHED",
            logic: parsed.logic,
            numberShown: parsed.numberShown || 3,
            sectionTitle: parsed.sectionTitle || "You might also like",
            excludeCollections: parsed.excludeCollections || ["Sale items", "Gift cards"],
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          },
        ];
      }
    }
  } catch (err) {
    console.warn("[CartElevate] Error loading recommendation sets:", err);
  }

  const DUMMY_SET_IDS = new Set(["set_kitchenware_1", "set_homedecor_2", "set_highestmargin_3"]);
  const hadDummySets = sets.some((s) => DUMMY_SET_IDS.has(s.id));
  sets = sets.filter((s) => s && s.id && !DUMMY_SET_IDS.has(s.id));

  // Proactively clean up Shopify shop metafield if it had dummy sets saved
  if (hadDummySets) {
    try {
      const shopQuery = await admin.graphql(`query { shop { id } }`);
      const shopRes = await shopQuery.json();
      const shopId = shopRes?.data?.shop?.id;
      if (shopId) {
        await admin.graphql(
          `mutation CleanRecommendationMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields { id }
            }
          }`,
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
    } catch (e) {
      console.warn("[CartElevate] Error cleaning dummy sets from metafield:", e);
    }
  }

  return { shop, sets };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const setId = formData.get("id");

  let sets = [];
  try {
    const metaQuery = await admin.graphql(`
      query GetRecommendationMetafield {
        shop {
          id
          metafield(namespace: "cartelevate", key: "recommendations") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const shopId = metaRes?.data?.shop?.id;
    const rawVal = metaRes?.data?.shop?.metafield?.value;

    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (Array.isArray(parsed.sets)) sets = parsed.sets;
    }

    const DUMMY_SET_IDS = new Set(["set_kitchenware_1", "set_homedecor_2", "set_highestmargin_3"]);
    sets = sets.filter((s) => s && s.id && !DUMMY_SET_IDS.has(s.id));

    if (intent === "toggle") {
      const targetStatus = formData.get("status") || "PUBLISHED";
      const targetSet = sets.find((s) => s.id === setId);

      if (targetStatus === "PUBLISHED" && targetSet) {
        const normTargetLogic = normalizeLogic(targetSet.logic);
        // Enforce rule: only 1 set can be enabled per recommendation logic (max 4 enabled at once).
        // Demote any other set with this logic to DRAFT.
        sets = sets.map((s) => {
          if (s.id !== setId && s.status === "PUBLISHED" && normalizeLogic(s.logic) === normTargetLogic) {
            return { ...s, status: "DRAFT", updatedAt: new Date().toISOString() };
          }
          if (s.id === setId) {
            return { ...s, status: "PUBLISHED", updatedAt: new Date().toISOString() };
          }
          return s;
        });
      } else {
        sets = sets.map((s) =>
          s.id === setId ? { ...s, status: targetStatus, updatedAt: new Date().toISOString() } : s
        );
      }
    } else if (intent === "duplicate") {
      const original = sets.find((s) => s.id === setId);
      if (original) {
        const copy = {
          ...original,
          id: "set_" + Date.now(),
          name: `${original.name} (Copy)`,
          status: "DRAFT",
          updatedAt: new Date().toISOString(),
        };
        sets.push(copy);
      }
    } else if (intent === "delete") {
      sets = sets.filter((s) => s.id !== setId);
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

    return { success: true, sets };
  } catch (err) {
    console.error("[CartElevate] Action error:", err);
    return { success: false, error: err.message };
  }
};

export default function RecommendationSetsPage() {
  const { sets: initialSets } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [sets, setSets] = useState(initialSets || []);

  React.useEffect(() => {
    if (initialSets) setSets(initialSets);
  }, [initialSets]);

  React.useEffect(() => {
    if (fetcher.data?.sets) {
      setSets(fetcher.data.sets);
    }
  }, [fetcher.data]);

  const sortedSets = React.useMemo(() => {
    return [...sets].sort((a, b) => {
      const aPub = a.status === "PUBLISHED" ? 0 : 1;
      const bPub = b.status === "PUBLISHED" ? 0 : 1;
      if (aPub !== bPub) return aPub - bPub;
      return getLogicRank(a.logic) - getLogicRank(b.logic);
    });
  }, [sets]);

  const publishedCount = React.useMemo(() => {
    return sets.filter((s) => s.status === "PUBLISHED").length;
  }, [sets]);

  const handleToggle = (setId, nextStatus) => {
    const targetSet = sets.find((s) => s.id === setId);
    if (nextStatus === "PUBLISHED" && targetSet) {
      const normLogic = normalizeLogic(targetSet.logic);
      const conflict = sets.find(
        (s) => s.id !== setId && s.status === "PUBLISHED" && normalizeLogic(s.logic) === normLogic
      );
      if (conflict) {
        const ok = confirm(
          `"${conflict.name}" is already enabled for "${normLogic}".\n\nOnly 1 set can be enabled per recommendation logic (max 4 enabled at once).\n\nDo you want to enable "${targetSet.name}" and switch "${conflict.name}" to Draft?`
        );
        if (!ok) return;
      }
    }

    setSets((prev) => {
      if (nextStatus === "PUBLISHED" && targetSet) {
        const normLogic = normalizeLogic(targetSet.logic);
        return prev.map((s) => {
          if (s.id !== setId && s.status === "PUBLISHED" && normalizeLogic(s.logic) === normLogic) {
            return { ...s, status: "DRAFT" };
          }
          if (s.id === setId) return { ...s, status: "PUBLISHED" };
          return s;
        });
      }
      return prev.map((s) => (s.id === setId ? { ...s, status: nextStatus } : s));
    });

    fetcher.submit(
      { intent: "toggle", id: setId, status: nextStatus },
      { method: "post" }
    );
  };

  const handleDelete = (setId) => {
    if (confirm("Are you sure you want to delete this recommendation set?")) {
      setSets((prev) => prev.filter((s) => s.id !== setId));
      fetcher.submit({ intent: "delete", id: setId }, { method: "post" });
    }
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

        {/* Page Heading & + New Set Button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-[34px] font-black tracking-tight text-slate-950">
                Recommendation sets
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EAFBF1] text-[#0A8754] border border-[#0A8754]/20">
                <span className="w-2 h-2 rounded-full bg-[#0A8754]"></span>
                <span>{publishedCount}/4 logics active in cart</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Create recommendation sets. Up to 4 sets can be enabled at once (one per unique logic).
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/app/newRecomendation")}
            className="inline-flex items-center justify-center gap-1.5 bg-[#F95738] hover:bg-[#EA3E1E] active:scale-[0.98] text-white text-sm font-bold px-6 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
          >
            <span>+</span>
            <span>New set</span>
          </button>
        </div>

        {/* Empty State or Recommendation Sets List */}
        {sets.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-2xl bg-white/70 py-20 px-6 sm:px-12 text-center shadow-2xs">
            <div className="flex justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-slate-950">
                <path
                  d="M10 3L11.5 7.5C11.9 8.7 12.8 9.6 14 10L18.5 11.5L14 13C12.8 13.4 11.9 14.3 11.5 15.5L10 20L8.5 15.5C8.1 14.3 7.2 13.4 6 13L1.5 11.5L6 10C7.2 9.6 8.1 8.7 8.5 7.5L10 3Z"
                  fill="currentColor"
                />
                <path
                  d="M18.5 3L19.2 5.2C19.4 5.8 19.8 6.2 20.4 6.4L22.6 7.1L20.4 7.8C19.8 8 19.4 8.4 19.2 9L18.5 11.2L17.8 9C17.6 8.4 17.2 8 16.6 7.8L14.4 7.1L16.6 6.4C17.2 6.2 17.6 5.8 17.8 5.2L18.5 3Z"
                  fill="currentColor"
                />
              </svg>
            </div>

            <h2 className="text-xl sm:text-[22px] font-bold text-slate-950 mb-3 tracking-tight">
              No recommendation sets yet
            </h2>

            <p className="text-sm sm:text-base text-slate-500 max-w-[540px] mx-auto leading-relaxed mb-7 font-normal">
              Create recommendation sets to control what gets recommended in your cart drawer, customize display rules, and exclude specific collections.
            </p>

            <button
              type="button"
              onClick={() => navigate("/app/newRecomendation")}
              className="inline-flex items-center justify-center bg-[#FFF1ED] hover:bg-[#FFE6E0] text-[#F95738] border border-[#FDDCD3]/80 font-bold text-sm px-6 py-2.5 rounded-xl transition cursor-pointer shadow-2xs"
            >
              Create your first set
            </button>
          </div>
        ) : (
          /* ================= LIST OF CONFIGURED SETS ================= */
          <div className="space-y-4">
            {sortedSets.map((set) => {
              const isPublished = set.status === "PUBLISHED";
              const rank = getLogicRank(set.logic);
              const normLogic = normalizeLogic(set.logic);

              return (
                <div
                  key={set.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs flex items-center justify-between gap-4 transition hover:border-slate-300"
                >
                  {/* Left Section: Sparkles Icon Box + Title & Subtitle */}
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Sparkles icon rounded box */}
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                        isPublished
                          ? "bg-slate-50/80 border-slate-200 text-slate-900"
                          : "bg-slate-50/30 border-slate-200/60 text-slate-400"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                        <path
                          d="M10 3L11.5 7.5C11.9 8.7 12.8 9.6 14 10L18.5 11.5L14 13C12.8 13.4 11.9 14.3 11.5 15.5L10 20L8.5 15.5C8.1 14.3 7.2 13.4 6 13L1.5 11.5L6 10C7.2 9.6 8.1 8.7 8.5 7.5L10 3Z"
                          fill="currentColor"
                        />
                        <path
                          d="M18.5 3L19.2 5.2C19.4 5.8 19.8 6.2 20.4 6.4L22.6 7.1L20.4 7.8C19.8 8 19.4 8.4 19.2 9L18.5 11.2L17.8 9C17.6 8.4 17.2 8 16.6 7.8L14.4 7.1L16.6 6.4C17.2 6.2 17.6 5.8 17.8 5.2L18.5 3Z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>

                    {/* Set Name, Status Pill & Description */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {isPublished ? (
                          <span
                            title={`Position #${rank} in cart drawer`}
                            className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80 tracking-wide shrink-0"
                          >
                            #{rank} in cart
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 tracking-wide shrink-0">
                            Inactive
                          </span>
                        )}
                        <h3 className="text-base sm:text-[17px] font-bold text-slate-950 truncate">
                          {set.name}
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
                        {normLogic} &bull; shows {set.numberShown || 3}
                        {(normLogic === "Curated Recommendations" || set.logic === "Manually curated") && Array.isArray(set.curatedProducts) && set.curatedProducts.length > 0 && (
                          <span className="text-[#F95738] font-medium">
                            {" "}&bull; {set.curatedProducts.length} curated product{set.curatedProducts.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {Array.isArray(set.excludeCollections) && set.excludeCollections.length > 0 && (
                          <span className="text-slate-400">
                            {" "}&bull; Excludes:{" "}
                            {set.excludeCollections
                              .map((c) => (typeof c === "string" ? c : c?.title || c?.handle || "Collection"))
                              .join(", ")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Right Section: Delete, Edit, and Orange Toggle Switch */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Delete button (Trash icon) */}
                    <button
                      type="button"
                      onClick={() => handleDelete(set.id)}
                      title="Delete recommendation set"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Edit button (Pencil icon) */}
                    <button
                      type="button"
                      onClick={() => navigate(`/app/newRecomendation?id=${set.id}`)}
                      title="Edit set"
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>

                    {/* Toggle Switch (Coral Orange when published, Slate when draft) */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPublished}
                      onClick={() => handleToggle(set.id, isPublished ? "DRAFT" : "PUBLISHED")}
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

            {/* Bottom Centered Clarification Note */}
            <p className="text-center text-xs sm:text-sm text-slate-500 font-normal pt-8 max-w-xl mx-auto leading-relaxed">
              Enabled recommendation sections display in the cart drawer vertically from top to bottom:
              <br />
              <span className="font-semibold text-slate-800">
                1. Frequently Bought Together &bull; 2. Same Collection &bull; 3. Curated Recommendations &bull; 4. Highest Margin Products
              </span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
