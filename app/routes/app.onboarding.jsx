import { useState } from "react";
import { useLoaderData, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const force = url.searchParams.get("force");

  // If app data is already present in DB and not forcing preview, send user to main page
  if (!force) {
    const existingSettings = await prisma.settings.findUnique({
      where: { shop },
    });

    if (existingSettings && existingSettings.isOnboarded) {
      return redirect("/app");
    }
  }

  return { shop };
};

export const action = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "connect_store") {
    try {
      // Save onboarding data in settings entity
      await prisma.settings.upsert({
        where: { shop },
        create: {
          shop,
          isOnboarded: true,
        },
        update: {
          isOnboarded: true,
        },
      });

      // Redirect user to the main page once connected
      return redirect("/app");
    } catch (err) {
      console.error("[CartElevate] Failed to connect store:", err);
      return { success: false, error: err.message };
    }
  }

  return { success: false };
};

export default function OnboardingPage() {
  const { shop } = useLoaderData();
  const navigation = useNavigation();

  const [step, setStep] = useState(1);
  const isConnecting = navigation.state === "submitting" || navigation.state === "loading";

  return (
    <div className="onboarding-canvas relative flex flex-col justify-between py-6 px-4 sm:px-8 select-none">
      {/* Top Bar inside iframe */}
      

      {/* Main View Area */}
      <div className="max-w-4xl w-full mx-auto my-auto py-8">
        {step === 1 ? (
          /* ================= STEP 1: WELCOME SCREEN ================= */
          <div className="flex flex-col items-center text-center space-y-8 animate-fadeIn">
            {/* Center Shopping Cart Hero Badge */}
            <div className="w-24 h-24 rounded-3xl bg-[#FEECE8] flex items-center justify-center shadow-[0_8px_20px_rgba(249,87,56,0.12)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F95738"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-12 h-12"
              >
                <circle cx="8" cy="21" r="1.5" />
                <circle cx="19" cy="21" r="1.5" />
                <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                <path d="M12 9l5-5m0 0h-4m4 0v4" strokeWidth="2.5" />
              </svg>
            </div>

            {/* Main Headline & Description */}
            <div className="space-y-3 max-w-xl">
              <h1 className="text-4xl sm:text-[42px] font-extrabold tracking-tight text-gray-950 leading-tight">
                Welcome to Cart Elevate
              </h1>
              <p className="text-sm sm:text-base text-gray-500 leading-relaxed font-normal">
                Turn every cart into more revenue with a custom cart drawer, smart upsells and bundles.
              </p>
            </div>

            {/* 3 Feature Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12 w-full max-w-2xl pt-4">
              {/* Feature 1 */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="10" y1="8" x2="14" y2="8" />
                    <line x1="10" y1="16" x2="14" y2="16" />
                  </svg>
                </div>
                <h3 className="font-bold text-sm text-gray-900 pt-1">Custom cart drawer</h3>
                <p className="text-xs text-gray-500 leading-relaxed">Branded to match your store</p>
              </div>

              {/* Feature 2 */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6"
                  >
                    <rect x="3" y="8" width="18" height="4" rx="1" />
                    <path d="M12 8v13" />
                    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
                  </svg>
                </div>
                <h3 className="font-bold text-sm text-gray-900 pt-1">Bundles and gifts</h3>
                <p className="text-xs text-gray-500 leading-relaxed">Volume discounts and rewards</p>
              </div>

              {/* Feature 3 */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6"
                  >
                    <rect x="4" y="13" width="4" height="8" rx="1" />
                    <rect x="10" y="8" width="4" height="13" rx="1" />
                    <rect x="16" y="3" width="4" height="18" rx="1" />
                  </svg>
                </div>
                <h3 className="font-bold text-sm text-gray-900 pt-1">Revenue dashboard</h3>
                <p className="text-xs text-gray-500 leading-relaxed">See lift from every upsell</p>
              </div>
            </div>

            {/* CTA Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center justify-center gap-2 bg-[#18181B] hover:bg-black text-white text-xs sm:text-sm font-semibold px-7 py-3 rounded-lg shadow-sm hover:shadow transition-all duration-200"
              >
                <span>Start setup</span>
                <span>→</span>
              </button>
            </div>

            {/* Stepper Progress */}
            <div className="flex flex-col items-center space-y-2 pt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1 rounded-full bg-[#F95738]" />
                <div className="w-12 h-1 rounded-full bg-gray-200" />
              </div>
              <span className="text-[11px] font-medium text-gray-400">Step 1 of 2</span>
            </div>
          </div>
        ) : (
          /* ================= STEP 2: CONNECT YOUR STORE ================= */
          <div className="max-w-xl mx-auto bg-white rounded-3xl border border-gray-100/90 shadow-[0_4px_30px_rgba(0,0,0,0.03)] p-8 sm:p-10 animate-fadeIn">
            {/* Top row with heading and illustration */}
            <div className="flex items-start justify-between gap-6 pb-6">
              <div className="space-y-1.5 max-w-sm">
                <span className="text-xs font-semibold text-gray-400">Step 2 of 2</span>
                <h2 className="text-3xl font-extrabold tracking-tight text-gray-950">
                  Connect your store
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                  Cart Elevate needs a few permissions to build your cart drawer and track upsell revenue.
                </p>
              </div>

              {/* Connected Cart Illustration */}
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#FEECE8] flex items-center justify-center shrink-0">
                <span className="absolute -top-1 right-2 text-[#F95738] text-xs font-bold animate-pulse">✦</span>
                <span className="absolute top-2 -right-1 text-[#F95738] text-[10px] font-bold">✦</span>

                <div className="relative text-[#F95738]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-10 h-10 sm:w-11 sm:h-11"
                  >
                    <circle cx="8" cy="21" r="1.5" />
                    <circle cx="19" cy="21" r="1.5" />
                    <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                  </svg>
                  {/* Link Badge attached to cart */}
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#F95738] text-white flex items-center justify-center shadow-sm">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Permission Items */}
            <div className="space-y-3 pt-2">
              {/* Permission 1 */}
              <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-[#FCFCFD]">
                <div className="w-10 h-10 rounded-xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <path d="m7.5 4.27 9 5.15" />
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    <path d="m3.3 7 8.7 5 8.7-5" />
                    <path d="M12 22V12" />
                  </svg>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-xs sm:text-sm text-gray-900">Read products and inventory</h4>
                  <p className="text-xs text-gray-500">Used to power recommendations, bundles and gift options.</p>
                </div>
              </div>

              {/* Permission 2 */}
              <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-[#FCFCFD]">
                <div className="w-10 h-10 rounded-xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <circle cx="8" cy="21" r="1.5" />
                    <circle cx="19" cy="21" r="1.5" />
                    <path d="M2.5 3h2.5l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2l1.4-7.5H6.5" />
                  </svg>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-xs sm:text-sm text-gray-900">Read and write checkout and cart</h4>
                  <p className="text-xs text-gray-500">Lets the app show your custom cart drawer at checkout.</p>
                </div>
              </div>

              {/* Permission 3 */}
              <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-[#FCFCFD]">
                <div className="w-10 h-10 rounded-xl bg-[#FEECE8] text-[#F95738] flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                  </svg>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-xs sm:text-sm text-gray-900">Read orders</h4>
                  <p className="text-xs text-gray-500">Used to calculate revenue lift on your dashboard.</p>
                </div>
              </div>
            </div>

            {/* Security disclaimer */}
            <div className="flex items-center gap-1.5 pt-4 text-[11px] text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>We never access customer payment details.</span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-6">
              <Form method="post" className="inline-block">
                <input type="hidden" name="intent" value="connect_store" />
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="inline-flex items-center justify-center gap-2 bg-[#18181B] hover:bg-black text-white text-xs sm:text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <span>Connect store</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </Form>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center justify-center bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-lg transition-all"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subtle footer */}
      <div className="max-w-6xl w-full mx-auto text-center py-2 text-[11px] text-gray-400">
        CartElevate v3 • Powering high-converting Shopify cart drawers
      </div>
    </div>
  );
}
