import React, { useState, useRef, useMemo } from "react";
import { useLoaderData, useNavigate, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

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
    console.error("[CartElevate] Could not fetch branding:", err);
  }

  return {
    shop,
    branding: branding || {
      logoUrl: "",
      accentColor: "#F95738",
      drawerPosition: "right",
    },
  };
};

export const action = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const logoUrl = formData.get("logoUrl")?.toString() || "";
  const accentColor = formData.get("accentColor")?.toString() || "#F95738";
  const drawerPosition = formData.get("drawerPosition")?.toString() || "right";

  try {
    if (prisma.cartDrawerBranding) {
      await prisma.cartDrawerBranding.upsert({
        where: { shop },
        create: {
          shop,
          logoUrl,
          accentColor,
          drawerPosition,
        },
        update: {
          logoUrl,
          accentColor,
          drawerPosition,
        },
      });
    } else {
      await prisma.$executeRaw`
        INSERT INTO "cart_drawer_branding" ("id", "shop", "logo_url", "accent_color", "drawer_position", "created_at", "updated_at")
        VALUES (CONCAT('cuid_', floor(random()*10000000)::text), ${shop}, ${logoUrl}, ${accentColor}, ${drawerPosition}, NOW(), NOW())
        ON CONFLICT ("shop") DO UPDATE
        SET "logo_url" = ${logoUrl},
            "accent_color" = ${accentColor},
            "drawer_position" = ${drawerPosition},
            "updated_at" = NOW()
      `;
    }

    // Sync to Shopify Shop Metafield so storefront theme extension has instant access
    try {
      const shopQuery = await admin.graphql(`
        query GetShopId {
          shop {
            id
          }
        }
      `);
      const shopRes = await shopQuery.json();
      const shopId = shopRes?.data?.shop?.id;

      if (shopId) {
        const metaRes = await admin.graphql(`
          mutation SetBrandingMetafield($metafields: [MetafieldsSetInput!]!) {
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
                namespace: "cart_elevate",
                key: "branding",
                type: "json",
                value: JSON.stringify({
                  accentColor,
                  logoUrl,
                  drawerPosition,
                  updatedAt: new Date().toISOString(),
                }),
              },
            ],
          },
        });
        const metaJson = await metaRes.json();
        const userErrors = metaJson?.data?.metafieldsSet?.userErrors;
        if (userErrors && userErrors.length > 0) {
          console.error("[CartElevate] Metafield save error:", JSON.stringify(userErrors));
        } else {
          console.log("[CartElevate] Synced branding to shop metafield successfully, logo length:", logoUrl ? logoUrl.length : 0);
        }
      }
    } catch (metaErr) {
      console.warn("[CartElevate] Metafield sync skipped or failed:", metaErr.message);
    }

    // Save and redirect back to main dashboard
    return redirect("/app");
  } catch (err) {
    console.error("[CartElevate] Failed to save branding:", err);
    return { success: false, error: err.message };
  }
};

export default function CartDrawerBrandingPage() {
  const { branding } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const fileInputRef = useRef(null);
  const colorInputRef = useRef(null);

  // Form State with real-time live preview synchronization
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl || "");
  const [accentColor, setAccentColor] = useState(branding?.accentColor || "#F95738");
  const [drawerPosition, setDrawerPosition] = useState(branding?.drawerPosition || "right");
  const [isDragging, setIsDragging] = useState(false);

  // Cart Items State for interactive live preview
  const [cartItems, setCartItems] = useState([
    {
      id: "mug",
      name: "Ceramic mug",
      price: 14.0,
      quantity: 1,
    },
    {
      id: "tote",
      name: "Tote bag",
      price: 22.0,
      quantity: 1,
    },
  ]);

  const isSaving = navigation.state === "submitting" || navigation.state === "loading";

  // Predefined swatches matching the user design
  const presetSwatches = [
    { color: "#F95738", label: "Coral Orange" },
    { color: "#1E232A", label: "Midnight Charcoal" },
    { color: "#1E88E5", label: "Royal Blue" },
  ];

  // Dynamic Free Gift calculations
  const giftThreshold = 54.0;
  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [cartItems]);

  const totalQuantity = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const amountRemaining = Math.max(0, giftThreshold - subtotal);
  const progressPercent = Math.min(100, Math.round((subtotal / giftThreshold) * 100));

  const updateQuantity = (id, delta) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean),
    );
  };

  const resetItems = () => {
    setCartItems([
      { id: "mug", name: "Ceramic mug", price: 14.0, quantity: 1 },
      { id: "tote", name: "Tote bag", price: 22.0, quantity: 1 },
    ]);
  };

  // Process file upload safely with instant real-time live preview and compact data URL
  const processImageFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|svg|webp|gif)$/i.test(file.name)) {
      alert("Please select a valid image or PNG file (PNG, JPG, SVG, WebP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl !== "string" || !dataUrl) return;

      const img = new Image();
      img.onload = () => {
        // Scale logo to crisp 2x retina size for the 90×28px badge (max 180×60px)
        // Keeps file size tiny (~2-4KB) so it saves cleanly into Shopify metafield
        const maxWidth = 180;
        const maxHeight = 60;
        let width = img.width;
        let height = img.height;

        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          const compactDataUrl = canvas.toDataURL("image/png");
          setLogoUrl(compactDataUrl);
          return;
        }
        setLogoUrl(dataUrl);
      };
      img.onerror = () => {
        setLogoUrl(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.onerror = (err) => {
      console.error("[CartElevate] Failed to read image file:", err);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e) => {
    const input = e.target;
    const file = input?.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // Safely reset input after starting read so selecting same file again fires onChange
    setTimeout(() => {
      try {
        if (input) input.value = "";
      } catch (err) {}
    }, 100);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFC] text-slate-900 select-none py-10 px-4 sm:px-8 lg:px-12">
      <div className="max-w-[1400px] mx-auto">
        {/* Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ================= LEFT COLUMN: SETTINGS FORM (col-span-6) ================= */}
          <div className="lg:col-span-6 space-y-4">
            {/* Back to dashboard button */}
            <div>
              <button
                type="button"
                onClick={() => navigate("/app")}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-600 hover:text-gray-950 transition group"
              >
                <span className="w-7 h-7 rounded-full bg-white border border-gray-200 shadow-2xs flex items-center justify-center text-gray-700 group-hover:border-gray-400 group-hover:bg-gray-50 transition">
                  ←
                </span>
                <span>Back to dashboard</span>
              </button>
            </div>

            {/* Header */}
            <div>
              <h1 className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-gray-950">
                Cart drawer branding
              </h1>
              <p className="text-sm text-gray-500 font-normal mt-1.5 leading-relaxed">
                Match the drawer to your store so it feels native to checkout.
              </p>
            </div>

            {/* Left Configuration Card */}
            <div className="bg-white rounded-[28px] border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.03)] p-8 sm:p-10 space-y-7">
              <Form method="post" className="space-y-7">
                <input type="hidden" name="logoUrl" value={logoUrl} />
                <input type="hidden" name="accentColor" value={accentColor} />
                <input type="hidden" name="drawerPosition" value={drawerPosition} />

                {/* 1. Logo Section */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-900">
                    Logo
                  </label>
                  <div className="flex items-center gap-4">
                    {/* Dotted Coral Box with Drag-and-Drop and Click-to-Upload */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      className={`relative w-16 h-16 rounded-xl border border-dashed cursor-pointer flex items-center justify-center shrink-0 overflow-hidden transition shadow-2xs group ${
                        isDragging
                          ? "border-[#F95738] bg-[#FFF0ED] scale-105"
                          : "border-[#FCA5A5] bg-[#FFF5F3] hover:border-[#F95738]"
                      }`}
                      title="Click or drag an image here to upload logo"
                    >
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Store Logo"
                          className="w-full h-full object-contain p-1.5"
                        />
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-6 h-6 text-[#F95738] group-hover:scale-110 transition-transform"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      )}
                    </div>

                    {/* Upload & Remove Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-900 font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-lg shadow-2xs transition cursor-pointer"
                      >
                        Upload
                      </button>

                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl("")}
                          className="text-xs text-rose-500 hover:text-rose-700 font-semibold px-2 py-1 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp, image/gif, .png, .jpg, .jpeg, .svg, .webp"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Recommended size: 200 × 60px (PNG, SVG, or JPG).
                  </p>
                </div>

                {/* 2. Accent Color Section */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-bold text-gray-900">
                    Accent color
                  </label>

                  <div className="flex items-center gap-3.5 pt-0.5">
                    {/* Predefined Swatches */}
                    {presetSwatches.map((swatch) => {
                      const isSelected = accentColor.toLowerCase() === swatch.color.toLowerCase();
                      return (
                        <button
                          key={swatch.color}
                          type="button"
                          onClick={() => setAccentColor(swatch.color)}
                          aria-label={swatch.label}
                          style={{ backgroundColor: swatch.color }}
                          className={`w-10 h-10 rounded-full transition-all duration-150 transform hover:scale-105 ${
                            isSelected
                              ? "ring-2 ring-offset-2 ring-[#F95738] scale-105 shadow-sm"
                              : "hover:ring-1 hover:ring-gray-300"
                          }`}
                        />
                      );
                    })}

                    {/* Custom (+) Color Swatch with Hidden Color Input */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => colorInputRef.current?.click()}
                        style={{
                          backgroundColor: !presetSwatches.some((s) => s.color.toLowerCase() === accentColor.toLowerCase())
                            ? accentColor
                            : "#FFFFFF",
                        }}
                        className={`w-10 h-10 rounded-full border border-dashed border-[#FCA5A5] flex items-center justify-center text-lg font-light transition-all duration-150 transform hover:scale-105 ${
                          !presetSwatches.some((s) => s.color.toLowerCase() === accentColor.toLowerCase())
                            ? "ring-2 ring-offset-2 ring-[#F95738] text-white shadow-sm"
                            : "text-[#F95738] hover:bg-[#FFF5F3]"
                        }`}
                        title="Pick custom color"
                      >
                        +
                      </button>
                      <input
                        ref={colorInputRef}
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Drawer Position Section */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-900">
                    Drawer position
                  </label>
                  <div className="relative">
                    <select
                      value={drawerPosition}
                      onChange={(e) => setDrawerPosition(e.target.value)}
                      className="w-full appearance-none bg-white border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#F95738] transition shadow-2xs pr-10 cursor-pointer"
                    >
                      <option value="right">Right side</option>
                      <option value="left">Left side</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 4. Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center justify-center gap-2 bg-[#F95738] hover:bg-[#EA4323] text-white font-bold text-sm px-6 py-3 rounded-xl shadow-xs transition disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <span>Save and continue</span>
                        <span>→</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/app")}
                    className="inline-flex items-center justify-center bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 font-bold text-sm px-6 py-3 rounded-xl transition shadow-2xs"
                  >
                    Back
                  </button>
                </div>
              </Form>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: LIVE PREVIEW (col-span-6) ================= */}
          <div className="lg:col-span-6 space-y-4">
            {/* Header */}
            <div>
              <h2 className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-gray-950">
                Live preview
              </h2>
              <p className="text-sm text-gray-500 font-normal mt-1.5 leading-relaxed">
                See how your cart drawer looks with your branding changes.
              </p>
            </div>

            {/* Right Canvas Card */}
            <div className="bg-white rounded-[28px] border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.03)] p-8 sm:p-12 flex items-center justify-center min-h-[580px]">
              {/* Floating Cart Drawer with Dynamic Ambient Shadow */}
              <div
                style={{
                  boxShadow: `0 28px 65px -15px ${accentColor}36, 0 10px 25px -4px rgba(0, 0, 0, 0.06)`,
                }}
                className="w-full max-w-[340px] bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col transition-all duration-300 ease-out mx-auto"
              >
                  {/* 1. Branded Header Styled Dynamically with Accent Color */}
                  <div
                    style={{ backgroundColor: accentColor }}
                    className="flex items-center justify-between px-4 py-3.5 text-white transition-colors duration-200"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Left side of 'Your cart': By default shows cart icon (not logo); when user uploads PNG/image, shows that logo directly */}
                      {logoUrl ? (
                        <div className="h-7 max-w-[100px] flex items-center justify-center shrink-0">
                          <img
                            src={logoUrl}
                            alt="Store logo"
                            className="h-auto max-h-7 w-auto max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-xs shrink-0">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={accentColor}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4"
                          >
                            <circle cx="8" cy="21" r="1.5" />
                            <circle cx="19" cy="21" r="1.5" />
                            <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                          </svg>
                        </div>
                      )}
                      <span className="text-sm font-bold text-white tracking-tight truncate">
                        Your Cart ({totalQuantity})
                      </span>
                    </div>

                    <button
                      type="button"
                      className="w-6 h-6 rounded-full text-white/90 hover:text-white flex items-center justify-center text-sm font-bold transition hover:bg-white/10 cursor-pointer shrink-0 ml-2"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 2. Free Gift Progress Bar Banner */}
                  <div className="p-4 space-y-4">
                    <div className="bg-[#FFF5F3] border border-[#FEE2D8]/70 rounded-xl p-3 space-y-2">
                      <div className="relative flex items-center justify-center text-xs font-bold text-center" style={{ color: accentColor }}>
                        <span className="absolute left-0 text-sm">🚚</span>
                        <span className="px-6 truncate">
                          {amountRemaining > 0
                            ? `Add $${amountRemaining.toFixed(0)} more for a free gift`
                            : "🎉 You unlocked a Free Gift!"}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${progressPercent}%`,
                            backgroundColor: accentColor,
                          }}
                        />
                      </div>
                    </div>

                    {/* 3. Cart Items List */}
                    <div className="space-y-3 pt-1">
                      {cartItems.length === 0 ? (
                        <div className="text-center py-6 text-gray-400 space-y-2">
                          <p className="text-xs">Your cart is empty</p>
                          <button
                            type="button"
                            onClick={resetItems}
                            className="text-xs font-semibold text-[#F95738] hover:underline"
                          >
                            Reset items
                          </button>
                        </div>
                      ) : (
                        cartItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 p-2.5 rounded-xl bg-[#FCFCFD] border border-gray-100 hover:border-gray-200 transition"
                          >
                            {/* Product Thumbnail */}
                            <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                              {item.id === "mug" ? (
                                <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
                                  <rect x="11" y="13" width="16" height="18" rx="4" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1" />
                                  <path d="M27 16 C32 16 32 26 27 26" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
                                  <ellipse cx="19" cy="14" rx="6.5" ry="1.5" fill="#78350F" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
                                  <path d="M15 17 V9 C15 7 25 7 25 9 V17" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" />
                                  <path d="M11 17 H29 L27 34 H13 L11 17 Z" fill="#FDE68A" stroke="#B45309" strokeWidth="1" />
                                </svg>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-gray-900 truncate">{item.name}</h4>
                              <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                ${item.price.toFixed(2)}
                              </p>
                            </div>

                            {/* Stepper & Trash */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center border border-gray-200 bg-white rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.id, -1)}
                                  className="px-1 text-gray-400 hover:text-gray-900"
                                >
                                  −
                                </button>
                                <span className="px-1.5 text-xs font-bold">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.id, 1)}
                                  className="px-1 text-gray-400 hover:text-gray-900"
                                >
                                  +
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -item.quantity)}
                                className="text-gray-400 hover:text-rose-500 transition p-1 cursor-pointer"
                                title="Remove item"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 4. Footer Area with Centered Checkout matching screenshot */}
                    <div className="pt-8 pb-3 text-center space-y-2">
                      <div className="text-xs text-gray-400">
                        Subtotal: <span className="font-bold text-gray-900">${subtotal.toFixed(2)}</span>
                      </div>
                      <button
                        type="button"
                        style={{ color: accentColor }}
                        className="text-xs font-bold tracking-wide hover:opacity-80 transition py-1"
                      >
                        Checkout
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }
