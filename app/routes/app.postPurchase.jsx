/* global process */
import React, { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { syncPostPurchaseAutomaticDiscount, activatePostPurchaseDiscount } from "../services/discount.server";

const getDefaultOffers = () => [
  // {
  //   id: "sample_coaster",
  //   name: "Cork coaster set",
  //   productTitle: "Cork coaster set",
  //   productPrice: 20.0,
  //   discountPercentage: 20,
  //   status: "PUBLISHED",
  //   headline: "Wait! Add this before you go",
  //   showTimer: true,
  //   productImage: "",
  //   updatedAt: new Date().toISOString(),
  // },
  // {
  //   id: "sample_giftbox",
  //   name: "Diwali gift box",
  //   productTitle: "Diwali gift box",
  //   productPrice: 40.0,
  //   discountPercentage: 15,
  //   status: "DRAFT",
  //   headline: "Festive pick, just for you",
  //   showTimer: false,
  //   productImage: "",
  //   updatedAt: new Date().toISOString(),
  // },
  // {
  //   id: "sample_teatowel",
  //   name: "Tea towel bundle",
  //   productTitle: "Tea towel bundle",
  //   productPrice: 25.0,
  //   discountPercentage: 10,
  //   status: "DRAFT",
  //   headline: "One more for the kitchen",
  //   showTimer: true,
  //   productImage: "",
  //   updatedAt: new Date().toISOString(),
  // },
];

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let offers = [];
  try {
    const metaQuery = await admin.graphql(`
      query GetPostPurchaseMetafield {
        shop {
          id
          metafield(namespace: "cartelevate", key: "post_purchase") {
            value
          }
        }
      }
    `);
    const metaRes = await metaQuery.json();
    const rawVal = metaRes?.data?.shop?.metafield?.value;
    if (rawVal) {
      const parsed = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (Array.isArray(parsed.offers) && parsed.offers.length > 0) {
        offers = parsed.offers;
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        offers = parsed;
      } else {
        offers = getDefaultOffers();
      }
    } else {
      offers = getDefaultOffers();
    }
  } catch (err) {
    console.warn("[CartElevate] Error loading post purchase offers:", err);
    offers = getDefaultOffers();
  }

  // If there is an active published offer, ensure its discount is active in Shopify
  const pubOffer = offers.find((o) => o && o.status === "PUBLISHED");
  if (pubOffer && pubOffer.discountId) {
    activatePostPurchaseDiscount({ admin, discountId: pubOffer.discountId, offer: pubOffer }).catch(() => {});
  }

  return {
    shop,
    offers,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const offerId = formData.get("id");

  let offers = [];

  try {
    const metaQuery = await admin.graphql(`
      query GetPostPurchaseMetafield {
        shop {
          id
          metafield(namespace: "cartelevate", key: "post_purchase") {
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
      if (Array.isArray(parsed.offers)) {
        offers = parsed.offers;
      } else if (Array.isArray(parsed)) {
        offers = parsed;
      }
    }

    if (offers.length === 0) {
      offers = getDefaultOffers();
    }

    if (intent === "toggle-status" && offerId) {
      const targetOffer = offers.find((o) => o.id === offerId);
      const willPublish = targetOffer?.status !== "PUBLISHED";
      let newDiscountId = null;

      if (willPublish && targetOffer) {
        newDiscountId = await syncPostPurchaseAutomaticDiscount({
          admin,
          offer: { ...targetOffer, status: "PUBLISHED" },
          previousDiscountId: targetOffer.discountId,
        });
      } else if (targetOffer?.discountId) {
        await syncPostPurchaseAutomaticDiscount({
          admin,
          offer: null,
          previousDiscountId: targetOffer.discountId,
        });
      }

      offers = offers.map((o) => {
        if (o.id === offerId) {
          return {
            ...o,
            status: willPublish ? "PUBLISHED" : "DRAFT",
            discountId: willPublish ? newDiscountId : null,
            updatedAt: new Date().toISOString(),
          };
        }
        // "Only one offer can be published at a time"
        if (willPublish) {
          return { ...o, status: "DRAFT" };
        }
        return o;
      });
    } else if (intent === "duplicate" && offerId) {
      const source = offers.find((o) => o.id === offerId);
      if (source) {
        const copy = {
          ...source,
          id: `ppo_${Date.now()}`,
          name: `${source.name || source.productTitle} (Copy)`,
          productTitle: source.productTitle,
          status: "DRAFT",
          discountId: null,
          updatedAt: new Date().toISOString(),
        };
        const idx = offers.findIndex((o) => o.id === offerId);
        offers.splice(idx + 1, 0, copy);
      }
    } else if (intent === "delete" && offerId) {
      const doomed = offers.find((o) => o.id === offerId);
      if (doomed?.discountId) {
        await syncPostPurchaseAutomaticDiscount({
          admin,
          offer: null,
          previousDiscountId: doomed.discountId,
        });
      }
      offers = offers.filter((o) => o.id !== offerId);
    }

    if (shopId) {
      await admin.graphql(
        `#graphql
        mutation SetPostPurchaseMetafield($metafields: [MetafieldsSetInput!]!) {
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
                key: "post_purchase",
                type: "json",
                value: JSON.stringify({ offers, appUrl: process.env.SHOPIFY_APP_URL || "https://cart-elevate.vercel.app", updatedAt: new Date().toISOString() }),
              },
              {
                ownerId: shopId,
                namespace: "cartelevate",
                key: "app_url",
                type: "single_line_text_field",
                value: process.env.SHOPIFY_APP_URL || "https://cart-elevate.vercel.app",
              },
            ],
          },
        }
      );
    }

    return { success: true, offers };
  } catch (err) {
    console.error("[CartElevate] Post purchase action error:", err);
    return { success: false, error: err.message };
  }
};

export default function PostPurchaseOffersPage() {
  const { offers: initialOffers = [] } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [offers, setOffers] = useState(initialOffers || []);

  React.useEffect(() => {
    if (initialOffers) setOffers(initialOffers);
  }, [initialOffers]);

  React.useEffect(() => {
    if (fetcher.data?.offers) {
      setOffers(fetcher.data.offers);
    }
  }, [fetcher.data]);

  const handleCreateOffer = () => {
    navigate("/app/createNewPostPurchaseOffer");
  };

  const handleEditOffer = (offerId) => {
    navigate(`/app/createNewPostPurchaseOffer?id=${offerId}`);
  };

  const handleToggleStatus = (offerId) => {
    // Optimistic UI update immediately
    const targetOffer = offers.find((o) => o.id === offerId);
    const willPublish = targetOffer?.status !== "PUBLISHED";
    setOffers((prev) =>
      prev.map((o) => {
        if (o.id === offerId) {
          return { ...o, status: willPublish ? "PUBLISHED" : "DRAFT" };
        }
        if (willPublish) {
          return { ...o, status: "DRAFT" };
        }
        return o;
      })
    );

    const fd = new FormData();
    fd.append("intent", "toggle-status");
    fd.append("id", offerId);
    fetcher.submit(fd, { method: "POST" });
  };

  const handleDeleteOffer = (offerId) => {
    if (!window.confirm("Are you sure you want to delete this offer?")) return;
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("id", offerId);
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-24 font-sans">
      <main className="max-w-[1040px] mx-auto px-4 sm:px-8 pt-8">
        {/* Back navigation */}
        <div className="mb-5">
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

        {/* Header matching screenshot */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">
            Post purchase offers
          </h1>

          <button
            type="button"
            onClick={handleCreateOffer}
            className="inline-flex items-center gap-1.5 bg-[#F95738] hover:bg-[#EA3E1E] active:scale-[0.98] text-white text-xs sm:text-sm font-bold px-4 sm:px-5 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
          >
            <span>+</span>
            <span>New offer</span>
          </button>
        </div>

        {/* Main Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 sm:p-8">
          {offers.length === 0 ? (
            /* Empty State */
            <div className="border border-dashed border-slate-300 rounded-2xl py-16 sm:py-20 px-6 sm:px-12 flex flex-col items-center justify-center text-center bg-white">
              <div className="w-12 h-12 flex items-center justify-center text-[#F95738] mb-4">
                <RocketIcon className="w-10 h-10" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-950 mb-2">
                No post purchase offers yet
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed mb-6 font-normal">
                Show shoppers a one click offer right after they pay, before the order confirmation page. Create an offer with a product and a discount, then publish it when you&apos;re ready.
              </p>
              <button
                type="button"
                onClick={handleCreateOffer}
                className="bg-[#FFF1ED] hover:bg-[#FDDCD3] active:scale-[0.98] text-[#F95738] font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl transition shadow-2xs cursor-pointer"
              >
                Create your first offer
              </button>
            </div>
          ) : (
            /* Offer Rows List matching screenshot */
            <div className="divide-y divide-slate-100">
              {offers.map((offer) => {
                const isPublished = offer.status === "PUBLISHED";
                const discount = offer.discountPercentage ?? 20;

                return (
                  <div
                    key={offer.id}
                    className="py-5 sm:py-6 first:pt-1 last:pb-2 flex items-center justify-between gap-4"
                  >
                    {/* Left: Thumbnail & Offer Info */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Product Thumbnail */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[#FAF5F2] border border-slate-100 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                        {offer.productImage ? (
                          <img
                            src={offer.productImage}
                            alt={offer.productTitle || offer.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <RenderProductGraphic title={offer.productTitle || offer.name} />
                        )}
                      </div>

                      {/* Offer Titles & Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="text-sm sm:text-base font-bold text-slate-950 truncate">
                            {offer.productTitle || offer.name}, {discount}% off
                          </h2>

                          {/* Status Badge */}
                          {isPublished ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E6F4EA] text-[#137333] tracking-wide shrink-0">
                              PUBLISHED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F1F3F4] text-[#5F6368] tracking-wide shrink-0">
                              DRAFT
                            </span>
                          )}
                        </div>

                        <p className="text-xs sm:text-sm text-slate-500 mt-1 truncate">
                          Headline: &quot;{offer.headline || "Wait! Add this before you go"}&quot; · Timer {offer.showTimer ? "on" : "off"}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions (Duplicate, Edit, Toggle) */}
                    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                      {/* Delete (Trash) Icon Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteOffer(offer.id)}
                        title="Delete offer"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>

                      {/* Edit (Pencil) Icon Button */}
                      <button
                        type="button"
                        onClick={() => handleEditOffer(offer.id)}
                        title="Edit offer"
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                      >
                        <PencilIcon className="w-5 h-5" />
                      </button>

                      {/* Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(offer.id)}
                        aria-checked={isPublished}
                        title={isPublished ? "Published (click to pause)" : "Draft (click to publish)"}
                        className={`w-11 sm:w-12 h-6 sm:h-6.5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer relative flex items-center ${
                          isPublished ? "bg-[#F95738]" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`w-5 h-5 bg-white rounded-full shadow-xs transition-transform duration-200 block ${
                            isPublished ? "translate-x-5 sm:translate-x-6" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer Note matching screenshot */}
          {offers.length > 0 && (
            <div className="pt-6 pb-2 text-center text-xs text-slate-400 font-normal">
              Only one offer can be published at a time.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ================= Custom SVG Graphics & Icons ================= */

function RenderProductGraphic({ title = "" }) {
  const lower = title.toLowerCase();
  if (lower.includes("diwali") || lower.includes("gift") || lower.includes("box")) {
    return <GiftBoxGraphic className="w-10 h-10" />;
  }
  if (lower.includes("towel") || lower.includes("bundle") || lower.includes("tea")) {
    return <TeaTowelGraphic className="w-10 h-10" />;
  }
  return <CoasterGraphic className="w-10 h-10" />;
}

function CoasterGraphic({ className = "w-10 h-10" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <ellipse cx="24" cy="33" rx="17" ry="7.5" fill="#BF7E4C" />
      <ellipse cx="24" cy="29" rx="17" ry="7.5" fill="#D39768" />
      <ellipse cx="24" cy="25" rx="17" ry="7.5" fill="#E2AC7E" />
      <ellipse cx="24" cy="21" rx="17" ry="7.5" fill="#ECC095" />
      <ellipse cx="24" cy="17" rx="17" ry="7.5" fill="#F4D3B0" />
    </svg>
  );
}

function GiftBoxGraphic({ className = "w-10 h-10" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <rect x="8" y="19" width="32" height="23" rx="3" fill="#D7A168" />
      <rect x="6" y="15" width="36" height="7" rx="2" fill="#C48455" />
      <rect x="21" y="15" width="6" height="27" fill="#B3261E" />
      <path d="M24 15C20 9 12 9 12 12C12 15 24 15 24 15Z" fill="#B3261E" />
      <path d="M24 15C28 9 36 9 36 12C36 15 24 15 24 15Z" fill="#B3261E" />
    </svg>
  );
}

function TeaTowelGraphic({ className = "w-10 h-10" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <rect x="9" y="28" width="30" height="11" rx="3" fill="#5F826E" />
      <rect x="9" y="20" width="30" height="11" rx="3" fill="#84A794" />
      <rect x="9" y="12" width="30" height="11" rx="3" fill="#E6EFE9" />
      <line x1="13" y1="17" x2="35" y2="17" stroke="#5F826E" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

function TrashIcon({ className = "w-5 h-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PencilIcon({ className = "w-5 h-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function RocketIcon({ className = "w-10 h-10" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
