import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import LiveCartPreview from "../components/LiveCartPreview";
import { deleteVolumeDiscounts, activatePostPurchaseDiscount } from "../services/discount.server";

export const loader = async ({ request }) => {
  const { session, admin, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Check whether app data is present in DB for this shop
  let settings = null;
  try {
    settings = await prisma.settings.findUnique({
      where: { shop },
    });
  } catch (err) {
    console.error("[CartElevate] Error checking settings in DB:", err);
  }

  // If NOT present in DB or not onboarded, redirect user to the onboarding page
  if (!settings || !settings.isOnboarded) {
    return redirect("/app/onboarding");
  }

  // 2. Fetch saved branding for this store
  let branding = null;
  try {
    if (prisma.cartDrawerBranding) {
      branding = await prisma.cartDrawerBranding.findUnique({
        where: { shop },
      });
    } else {
      const rows = await prisma.$queryRaw`SELECT * FROM "cart_drawer_branding" WHERE "shop" = ${shop} LIMIT 1`;
      if (rows && rows.length > 0) {
        branding = {
          logoUrl: rows[0].logo_url || "",
          accentColor: rows[0].accent_color || "#F95738",
          drawerPosition: rows[0].drawer_position || "right",
        };
      }
    }
  } catch (err) {
    console.error("[CartElevate] Error checking branding in DB:", err);
  }

  // 2b. Check whether shipping and gift progress bar is configured in DB
  let shippingBar = null;
  let isShippingBarLive = false;
  try {
    const spb = await prisma.shippingProgressBar.findUnique({
      where: { shop },
    });
    if (spb) {
      shippingBar = {
        isLive: true,
        goalType: spb.goalType || "free_shipping",
        shippingThreshold: Number(spb.shippingThreshold) || 75.0,
        giftThreshold: Number(spb.giftThreshold) || 120.0,
        messageBeforeGoal: spb.messageBeforeGoal || "Add {amount} more for free shipping",
        giftProductTitle: spb.giftProductTitle || null,
        giftProductImage: spb.giftProductImage || null,
        giftProductPrice: spb.giftProductPrice !== null ? Number(spb.giftProductPrice) : null,
      };
      isShippingBarLive = true;
    }
  } catch (err) {
    console.error("[CartElevate] Error checking shipping bar in DB:", err);
  }

  // 3. Check whether recommendations are enabled/live for this shop
  let isRecommendationsLive = false;
  let recommendations = { isLive: false, sets: [] };
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
      let sets = [];
      if (Array.isArray(parsed.sets)) {
        sets = parsed.sets;
      } else if (parsed && parsed.logic) {
        sets = [parsed];
      }
      const DUMMY_SET_IDS = new Set(["set_kitchenware_1", "set_homedecor_2", "set_highestmargin_3"]);
      const liveSets = sets.filter((s) => s && s.id && !DUMMY_SET_IDS.has(s.id) && s.status === "PUBLISHED");
      isRecommendationsLive = liveSets.length > 0;
      recommendations = {
        isLive: isRecommendationsLive,
        sets: liveSets,
      };
    }
  } catch (err) {
    console.error("[CartElevate] Error checking recommendations metafield in dashboard loader:", err);
  }

  // 4. Check whether bundles and discounts are enabled/live for this shop
  let isBundlesLive = false;
  let bundles = { isLive: false, list: [] };
  try {
    const bundlesQuery = await admin.graphql(`
      query GetBundlesMetafield {
        shop {
          metafield(namespace: "cartelevate", key: "bundles") {
            value
          }
        }
      }
    `);
    const bundlesRes = await bundlesQuery.json();
    const rawBundlesVal = bundlesRes?.data?.shop?.metafield?.value;
    if (rawBundlesVal) {
      const parsed = typeof rawBundlesVal === "string" ? JSON.parse(rawBundlesVal) : rawBundlesVal;
      let bundlesList = Array.isArray(parsed.bundles) ? parsed.bundles : (Array.isArray(parsed) ? parsed : []);
      const liveBundles = bundlesList.filter((b) => b && b.status === "PUBLISHED");
      isBundlesLive = liveBundles.length > 0;
      bundles = {
        isLive: isBundlesLive,
        list: liveBundles,
      };

      if (!isBundlesLive) {
        deleteVolumeDiscounts({ admin }).catch(() => {});
      }
    } else {
      deleteVolumeDiscounts({ admin }).catch(() => {});
    }
  } catch (err) {
    console.error("[CartElevate] Error checking bundles metafield in dashboard loader:", err);
  }

  // 5. Check whether protection & wrapping is enabled/live for this shop
  let isProtectionLive = false;
  let protectionWrapping = {
    isLive: false,
    protection: { enabled: false, flatFee: 1.99 },
    giftWrapping: { enabled: false, price: 4.0 },
  };
  try {
    const protQuery = await admin.graphql(`
      query GetProtectionMetafield {
        shop {
          metafield(namespace: "cartelevate", key: "protection_wrapping") {
            value
          }
        }
      }
    `);
    const protRes = await protQuery.json();
    const rawProtVal = protRes?.data?.shop?.metafield?.value;
    if (rawProtVal) {
      const parsed = typeof rawProtVal === "string" ? JSON.parse(rawProtVal) : rawProtVal;
      const protEnabled = Boolean(parsed?.protection?.enabled);
      const giftEnabled = Boolean(parsed?.giftWrapping?.enabled);
      isProtectionLive = protEnabled || giftEnabled;
      protectionWrapping = {
        isLive: isProtectionLive,
        protection: {
          enabled: protEnabled,
          priceType: parsed?.protection?.priceType || "flat",
          percentage: Number(parsed?.protection?.percentage) || 10,
          flatFee: Number(parsed?.protection?.flatFee) || 2.03,
          description: parsed?.protection?.description || "Protect your order from loss or damage",
        },
        giftWrapping: {
          enabled: giftEnabled,
          price: Number(parsed?.giftWrapping?.price) || 5.0,
          description: parsed?.giftWrapping?.description || "Add gift wrapping",
        },
      };
    }
  } catch (err) {
    console.error("[CartElevate] Error checking protection metafield in dashboard loader:", err);
  }

  // 6. Check whether post-purchase offers are live
  let isPostPurchaseLive = false;
  let postPurchase = { isLive: false, offer: null };
  try {
    const postQuery = await admin.graphql(`
      query GetPostPurchaseMetafield {
        shop {
          metafield(namespace: "cartelevate", key: "post_purchase") {
            value
          }
        }
      }
    `);
    const postRes = await postQuery.json();
    const rawPostVal = postRes?.data?.shop?.metafield?.value;
    if (rawPostVal) {
      const parsed = typeof rawPostVal === "string" ? JSON.parse(rawPostVal) : rawPostVal;
      const offers = Array.isArray(parsed?.offers) ? parsed.offers : (Array.isArray(parsed) ? parsed : []);
      const liveOffer = offers.find((o) => o && o.status === "PUBLISHED");
      isPostPurchaseLive = Boolean(liveOffer);
      if (liveOffer) {
        if (liveOffer.discountId) {
          activatePostPurchaseDiscount({ admin, discountId: liveOffer.discountId, offer: liveOffer }).catch(() => {});
        }
        postPurchase = {
          isLive: true,
          offer: {
            productTitle: liveOffer.productTitle || "Exclusive Offer",
            productImage: liveOffer.productImage || "",
            productPrice: Number(liveOffer.productPrice) || 20.0,
            discountPercentage: Number(liveOffer.discountPercentage) || 20,
            headline: liveOffer.headline || "Wait! Add this before you go",
            showTimer: liveOffer.showTimer !== false,
          },
        };
      }
    }
  } catch (err) {
    console.error("[CartElevate] Error checking post-purchase metafield in dashboard loader:", err);
  }

  // 7. App data is present in DB -> render main page
  return {
    shop,
    isOnboarded: settings.isOnboarded,
    branding,
    shippingBar,
    isShippingBarLive,
    recommendations,
    isRecommendationsLive,
    bundles,
    isBundlesLive,
    protectionWrapping,
    isProtectionLive,
    postPurchase,
    isPostPurchaseLive,
  };
};

export default function MainDashboardPage() {
  const {
    branding,
    shippingBar,
    isShippingBarLive,
    recommendations,
    isRecommendationsLive,
    bundles,
    isBundlesLive,
    protectionWrapping,
    isProtectionLive,
    postPurchase,
    isPostPurchaseLive,
  } = useLoaderData();
  const navigate = useNavigate();
  const [selectedFeature, setSelectedFeature] = useState(null);

  // Feature cards data matching user screenshot
  const features = [
    {
      id: "branding",
      title: "Cart drawer branding",
      subtitle: "Logo, color, layout",
      status: "LIVE",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      ),
    },
    {
      id: "shipping-bar",
      title: "Shipping and gift bar",
      subtitle: "Thresholds, messaging",
      status: isShippingBarLive ? "LIVE" : "NOT SET UP",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13" />
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
        </svg>
      ),
    },
    {
      id: "recommendations",
      title: "Recommendations",
      subtitle: "Rule based products",
      status: isRecommendationsLive ? "LIVE" : "NOT SET UP",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
        </svg>
      ),
    },
    {
      id: "bundles",
      title: "Bundles and discounts",
      subtitle: "Volume based pricing",
      status: isBundlesLive ? "LIVE" : "NOT SET UP",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
    },
    {
      id: "protection",
      title: "Protection and wrapping",
      subtitle: "Add on toggles",
      status: isProtectionLive ? "LIVE" : "NOT SET UP",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
    },
    {
      id: "post-purchase",
      title: "Post purchase offer",
      subtitle: "Thank you page upsell",
      status: isPostPurchaseLive ? "LIVE" : "NOT SET UP",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 select-none pb-12">
      {/* Top Utility Bar for Dev/Testing */}
      {/* <div className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-4 pb-2 flex items-center justify-between text-xs text-slate-500 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Connected store: <span className="font-mono text-slate-700 font-semibold">{shop}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePreviewLoading}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium transition shadow-2xs"
          >
            Preview Loading Screen ⏱
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/onboarding?force=true")}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium transition shadow-2xs"
          >
            Review Onboarding →
          </button>
        </div>
      </div> */}

      {/* Main 2-Column Dashboard Layout */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* ================= LEFT COLUMN: DASHBOARD & FEATURES (col-span-7) ================= */}
          <div className="xl:col-span-7 space-y-6">
            {/* 1. Dashboard Heading */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">
                Dashboard
              </h1>
            </div>

            {/* 2. Attributed Revenue Banner */}
            {/* <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#FFF5F2] via-[#FFF8F6] to-[#FFF2EE] border border-[#FDDCD3]/80 p-5 sm:p-6 shadow-2xs transition-all hover:shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center shrink-0 mt-0.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                      <polyline points="16 7 22 7 22 13" />
                    </svg>
                  </div>

                  <div className="space-y-0.5">
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-950 tracking-tight">
                      $4,280 attributed revenue this month
                    </h2>
                    <p className="text-xs sm:text-sm font-semibold text-[#F95738]">
                      11.2% acceptance rate across live features
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/app/analytics")}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#F95738] hover:text-[#EA3E1E] transition shrink-0 group self-start sm:self-auto cursor-pointer"
                >
                  <span>View analytics</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </button>
              </div>
            </div> */}

            {/* 3. "Your features" Section */}
            <div className="space-y-4">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-slate-950">
                  Your features
                </h2>
                <span className="text-xs sm:text-sm font-semibold text-slate-400">
                  {features.filter((f) => f.status === "LIVE").length} of {features.length} live
                </span>
              </div>

              {/* 3x2 Grid of Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {features.map((feature) => {
                  const isLive = feature.status === "LIVE";

                  const handleCardClick = () => {
                    if (feature.id === "branding") {
                      navigate("/app/CartDrawerBranding");
                    } else if (feature.id === "shipping-bar") {
                      navigate("/app/s-a-g-p-b");
                    } else if (feature.id === "recommendations") {
                      navigate("/app/recommendation");
                    } else if (feature.id === "bundles") {
                      navigate("/app/bundleAndDiscount");
                    } else if (feature.id === "protection") {
                      navigate("/app/protectionAndWrapping");
                    } else if (feature.id === "post-purchase") {
                      navigate("/app/postPurchase");
                    } else {
                      setSelectedFeature(feature.title);
                    }
                  };

                  return (
                    <div
                      key={feature.id}
                      role="button"
                      tabIndex={0}
                      onClick={handleCardClick}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleCardClick();
                        }
                      }}
                      className="group bg-white rounded-2xl border border-slate-200/70 p-5 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between h-[155px] focus:outline-none focus:ring-2 focus:ring-[#F95738]/50"
                    >
                      {/* Card Top: Icon & Status Badge */}
                      <div className="flex items-start justify-between">
                        <div className="w-11 h-11 rounded-2xl bg-[#FFF2EE] text-[#F95738] flex items-center justify-center transition-transform group-hover:scale-105">
                          {feature.icon}
                        </div>

                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isLive
                              ? "bg-[#EAF8F0] text-[#1E8E3E]"
                              : "bg-[#F1F3F5] text-[#6C757D]"
                          }`}
                        >
                          {feature.status}
                        </span>
                      </div>

                      {/* Card Bottom: Title, Subtitle & Arrow */}
                      <div className="flex items-end justify-between gap-2 mt-auto">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#F95738] transition-colors">
                            {feature.title}
                          </h3>
                          <p className="text-xs text-slate-400 font-normal">
                            {feature.subtitle}
                          </p>
                        </div>

                        <div className="w-7 h-7 rounded-full bg-slate-50 group-hover:bg-[#FEECE8] text-slate-400 group-hover:text-[#F95738] flex items-center justify-center shrink-0 transition-colors">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Bottom Tip Banner and Action Buttons */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
              {/* Tip Banner */}
              <div className="flex-1 bg-[#FFF5F2] border border-[#FDDCD3]/70 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-6 h-6 rounded-md bg-[#FEECE8] text-[#F95738] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="9" y1="18" x2="15" y2="18" />
                    <line x1="10" y1="22" x2="14" y2="22" />
                    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                  </svg>
                </div>
                <p className="text-xs text-slate-700 leading-snug">
                  <span className="font-bold text-slate-900">Tip:</span> Stores with <span className="font-semibold text-slate-900">5+ live features</span> see a <span className="font-semibold text-[#F95738]">2.3x higher attributed revenue</span> on average.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => navigate("/app/contact-us")}
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>💬</span>
                  <span>Issues? Contact us</span>
                </button>
                <a
  href="https://apps.shopify.com/cartelevate/reviews?search_id=238929bd-3af9-4afb-993d-5bc95a4a5322"
  target="_blank"
  rel="noopener noreferrer"
  className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition shadow-2xs flex items-center gap-1.5"
>
  <span>⭐</span>
  <span>Review us</span>
</a>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: LIVE PREVIEW (col-span-5) ================= */}
          <div className="xl:col-span-5 sticky top-6">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-6 shadow-sm">
              <LiveCartPreview
                branding={branding}
                shippingBar={shippingBar}
                recommendations={recommendations}
                bundles={bundles}
                protectionWrapping={protectionWrapping}
                postPurchase={postPurchase}
              />
            </div>
          </div>

        </div>
      </div>

      {/* Feature clicked feedback notification modal */}
      {selectedFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF2EE] text-[#F95738] flex items-center justify-center mx-auto text-xl">
              ⚙️
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{selectedFeature}</h3>
              <p className="text-xs text-slate-500 mt-1">
                You can configure rules, design styles, and milestones directly in the cart drawer preview.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFeature(null)}
              className="w-full bg-[#18181B] hover:bg-black text-white text-xs font-bold py-2.5 rounded-xl transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
