import { useState, useEffect } from "react";
import { useNavigate, useFetcher, useSubmit } from "react-router";

// SVG Chevron Down Icon
function ChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4 text-gray-400"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// SVG Arrow Left Icon (for Back button)
function ArrowLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export default function SettingsPage({ shop: propShop, initialAppEnabled = false, savedSettings = null, actionData = null, products = [] }) {
  const navigate = useNavigate();
  const submit = useSubmit();

  // Get shop domain dynamically from props or window URL search parameters
  const shop = propShop || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("shop") : "") || "locale-mate.myshopify.com";

  // Wizard States
  const [isAppEnabled, setIsAppEnabled] = useState(initialAppEnabled);
  const [isChecking, setIsChecking] = useState(false);
  const [goals, setGoals] = useState(() => {
    const loaded = savedSettings?.goals || [];
    if (loaded.length === 0) {
      return [
        {
          spendGoal: "",
          spendMessage: "",
          rewardType: "",
          rewardProductId: "",
          rewardVariantId: "",
          rewardProductTitle: "",
          rewardAutomaticDiscountId: "",
        },
      ];
    }
    return loaded.map((g) => ({
      spendGoal: g.spendGoal !== undefined && g.spendGoal !== null ? String(g.spendGoal) : "",
      spendMessage: g.spendMessage || "",
      rewardType: g.rewardType || "",
      rewardProductId: g.rewardProductId || "",
      rewardVariantId: g.rewardVariantId || "",
      rewardProductTitle: g.rewardProductTitle || "",
      rewardAutomaticDiscountId: g.rewardAutomaticDiscountId || "",
    }));
  });

  // Modal for Set Tier Rewards
  const [activeGoalIndex, setActiveGoalIndex] = useState(null);
  const [tempRewardType, setTempRewardType] = useState("");
  const [tempRewardProductId, setTempRewardProductId] = useState("");
  const [tempRewardVariantId, setTempRewardVariantId] = useState("");
  const [tempRewardProductTitle, setTempRewardProductTitle] = useState("");

  const handleOpenRewardModal = (index) => {
    const goal = goals[index];
    setActiveGoalIndex(index);
    setTempRewardType(goal.rewardType || "");
    setTempRewardProductId(goal.rewardProductId || "");
    setTempRewardVariantId(goal.rewardVariantId || "");
    setTempRewardProductTitle(goal.rewardProductTitle || "");
  };

  const handleSaveRewardModal = () => {
    if (!tempRewardType) {
      alert("Please select a reward type.");
      return;
    }
    if (tempRewardType === "FREE_PRODUCT" && !tempRewardVariantId) {
      alert("Please select a product for the Free Product reward.");
      return;
    }
    const updated = [...goals];
    updated[activeGoalIndex] = {
      ...updated[activeGoalIndex],
      rewardType: tempRewardType,
      rewardProductId: tempRewardProductId,
      rewardVariantId: tempRewardVariantId,
      rewardProductTitle: tempRewardProductTitle,
    };
    setGoals(updated);
    setActiveGoalIndex(null);
  };

  const [selectedTheme, setSelectedTheme] = useState(savedSettings?.selectedTheme || "dynamic");
  const [upsellProducts, setUpsellProducts] = useState(
    savedSettings?.upsellProducts || (savedSettings?.upsellProduct ? [savedSettings.upsellProduct] : [])
  );
  const [selectedToggle, setSelectedToggle] = useState(savedSettings?.selectedToggle || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Toggle Modal & Dynamic Pricing States
  const [packageProtectionPrice, setPackageProtectionPrice] = useState(
    savedSettings?.packageProtectionPrice !== undefined && savedSettings?.packageProtectionPrice !== null
      ? String(savedSettings.packageProtectionPrice)
      : "2.99"
  );
  const [giftWrappingPrice, setGiftWrappingPrice] = useState(
    savedSettings?.giftWrappingPrice !== undefined && savedSettings?.giftWrappingPrice !== null
      ? String(savedSettings.giftWrappingPrice)
      : "4.99"
  );
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false);

  const [tempPPEnabled, setTempPPEnabled] = useState(false);
  const [tempGWEnabled, setTempGWEnabled] = useState(false);
  const [tempPPPrice, setTempPPPrice] = useState("2.99");
  const [tempGWPrice, setTempGWPrice] = useState("4.99");

  const handleOpenToggleModal = () => {
    setTempPPEnabled(selectedToggle === "package-protection" || selectedToggle === "both");
    setTempGWEnabled(selectedToggle === "gift-wrapping" || selectedToggle === "both");
    setTempPPPrice(packageProtectionPrice);
    setTempGWPrice(giftWrappingPrice);
    setIsToggleModalOpen(true);
  };

  const handleSaveToggleModal = () => {
    let toggleVal = "none";
    if (tempPPEnabled && tempGWEnabled) {
      toggleVal = "both";
    } else if (tempPPEnabled) {
      toggleVal = "package-protection";
    } else if (tempGWEnabled) {
      toggleVal = "gift-wrapping";
    }

    setSelectedToggle(toggleVal);
    setPackageProtectionPrice(tempPPPrice);
    setGiftWrappingPrice(tempGWPrice);
    setIsToggleModalOpen(false);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Monitor save results from actionData
  useEffect(() => {
    if (actionData) {
      setIsSaving(false);
      if (actionData.success) {
        setSaveSuccess(true);
        alert("Cart features synced successfully! Check your storefront.");
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(`Failed to sync settings: ${actionData.error}`);
      }
    }
  }, [actionData]);

  const handleSave = () => {
    // Filter out completely blank goals safely
    const filteredGoals = goals.filter((g) => {
      const spendGoalStr = g && g.spendGoal !== undefined && g.spendGoal !== null ? String(g.spendGoal) : "";
      return spendGoalStr.trim() !== "";
    });

    // Validate that all active goals have selected a reward type
    const invalidGoalIndex = filteredGoals.findIndex((g) => !g.rewardType);
    if (invalidGoalIndex !== -1) {
      alert(`Please select a reward type for Tier ${invalidGoalIndex + 1}.`);
      return;
    }

    setIsSaving(true);
    const formData = new FormData();
    formData.append("goals", JSON.stringify(filteredGoals));
    formData.append("selectedTheme", selectedTheme);
    formData.append("upsellProducts", JSON.stringify(upsellProducts));
    formData.append("upsellProduct", upsellProducts[0] || ""); // Fallback for backward compatibility
    formData.append("selectedToggle", selectedToggle);
    formData.append("packageProtectionPrice", packageProtectionPrice);
    formData.append("giftWrappingPrice", giftWrappingPrice);
    submit(formData, { method: "post", action: "/app/settings" });
  };

  // Handler to open the theme editor deep link
  const handleEnableClick = () => {
    const editorUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=91e88f51d9ec392df7f5a047d343c716/app-embed`;
    window.open(editorUrl, "_blank");
    setIsChecking(true);
  };

  const fetcher = useFetcher();

  // Always poll the storefront app embed status in the background
  useEffect(() => {
    const interval = setInterval(() => {
      fetcher.load("/app/settings?check=true");
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Sync fetcher data with state (both ways)
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.isEnabled) {
        setIsAppEnabled(true);
        setIsChecking(false);
      } else {
        setIsAppEnabled(false);
      }
    }
  }, [fetcher.data]);

  // Handler to add a new spend goal
  const handleAddGoal = () => {
    setGoals([
      ...goals,
      {
        spendGoal: "",
        spendMessage: "",
        rewardType: "",
        rewardProductId: "",
        rewardVariantId: "",
        rewardProductTitle: "",
        rewardAutomaticDiscountId: "",
      },
    ]);
  };

  // Handler to remove a spend goal
  const handleRemoveGoal = (indexToRemove) => {
    if (indexToRemove === 0) return; // Tier 1 cannot be removed
    const confirmed = window.confirm(`Are you sure you want to remove Tier ${indexToRemove + 1}?`);
    if (confirmed) {
      setGoals(goals.filter((_, idx) => idx !== indexToRemove));
    }
  };

  // Calculate completed steps dynamically
  let completedSteps = 0;
  if (isAppEnabled) completedSteps++;
  if (goals.some((g) => g.spendGoal.trim() !== "")) completedSteps++;
  if (selectedTheme !== "") completedSteps++;
  if (upsellProducts.length > 0 || selectedToggle !== "") completedSteps++;

  const progressPercent = completedSteps * 25;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-3 pb-8 sm:px-6 lg:px-8">
      {/* Back button */}
      <button
        onClick={() => navigate("/app")}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-black hover:text-gray-800 transition-colors mb-4 cursor-pointer"
        aria-label="Back to Analytics Dashboard"
      >
        <ArrowLeftIcon />
        <span>Back to Dashboard</span>
      </button>

      {/* Main settings card wrapper */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-10">
        {/* Progress Bar Header */}
        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-2">
          <div
            className="bg-brand-600 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="flex justify-between items-center mb-6">
          <span className="text-xs text-gray-500">
            {completedSteps} of 4 steps completed
          </span>
          <span className="text-xs font-bold text-black">
            {progressPercent}% complete
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-extrabold text-black leading-tight mb-8">
          Let's build your revenue-driving cart.
        </h1>

        {/* Stepper Sections with tight spacing & no borders */}
        <div className="space-y-8">
          
          {/* ── Step 1: Embed App ──────────────────────────────── */}
          <section aria-labelledby="step-1-title">
            <h2 id="step-1-title" className="text-xl font-bold text-black">
              Step 1 Embed App
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Activate your app in the Shopify theme editor to display it on your storefront.
            </p>
            <div className="flex flex-col items-center mt-4 mb-2 gap-3">
              <button
                type="button"
                onClick={isAppEnabled ? undefined : handleEnableClick}
                className={`inline-flex items-center justify-center gap-2 px-8 py-2.5 text-sm font-bold rounded-lg shadow-sm active:scale-95 transition-all duration-150 cursor-pointer ${
                  isAppEnabled
                    ? "bg-brand-700 hover:bg-brand-800 text-white"
                    : isChecking
                    ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse"
                    : "bg-gradient-to-r from-brand-700 to-brand-600 hover:from-brand-800 hover:to-brand-700 text-white"
                }`}
              >
                {isAppEnabled ? (
                  <span>App Enabled</span>
                ) : isChecking ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Checking Status... Click to open editor again</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Enable App in Editor</span>
                  </>
                )}
              </button>

              {isChecking && (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <p className="text-xs text-amber-600 font-semibold animate-pulse">
                    Opening theme editor... Please enable CartElevate under App Embeds, click "Save", then return here.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAppEnabled(true);
                      setIsChecking(false);
                    }}
                    className="text-[10px] font-bold text-gray-400 hover:text-brand-600 underline cursor-pointer"
                  >
                    Bypass check (mark as enabled)
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── Step 2: Setup Progress Bar ─────────────────────── */}
          <section aria-labelledby="step-2-title">
            <h2 id="step-2-title" className="text-xl font-bold text-black">
              Step 2 Setup Progress Bar
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 mb-4">
              Activate your app in the Shopify theme editor to display it on your storefront.
            </p>

            <div className="space-y-6">
              {goals.map((goal, index) => (
                <div key={index} className="relative pt-4 border-t border-gray-100 first:pt-0 first:border-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-400">
                      Tier {index + 1}
                    </span>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGoal(index)}
                        className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Input 1 */}
                    <div className="flex flex-col">
                      <label htmlFor={`spend-goal-${index}`} className="text-sm font-bold text-gray-800">
                        Tier {index + 1} Spend Goal {index === 0 && <span className="text-red-500">*</span>}
                      </label>
                      <span className="text-xs text-gray-400 mt-0.5 mb-1.5">Set</span>
                      <input
                        id={`spend-goal-${index}`}
                        type="text"
                        value={goal.spendGoal}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = [...goals];
                          updated[index].spendGoal = val;
                          if (val.trim() === "") {
                            updated[index].rewardType = "";
                            updated[index].rewardProductId = "";
                            updated[index].rewardVariantId = "";
                            updated[index].rewardProductTitle = "";
                            updated[index].rewardAutomaticDiscountId = "";
                          }
                          setGoals(updated);
                        }}
                        className="w-full border border-gray-300 bg-white rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                      />
                    </div>

                    {/* Input 2 */}
                    <div className="flex flex-col">
                      <label htmlFor={`spend-message-${index}`} className="text-sm font-bold text-gray-800">
                        Tier {index + 1} message
                      </label>
                      <span className="text-xs text-gray-400 mt-0.5 mb-1.5">
                        How many files can be uploaded per order.
                      </span>
                      <input
                        id={`spend-message-${index}`}
                        type="text"
                        value={goal.spendMessage}
                        onChange={(e) => {
                          const updated = [...goals];
                          updated[index].spendMessage = e.target.value;
                          setGoals(updated);
                        }}
                        className="w-full border border-gray-300 bg-white rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                      />
                    </div>
                  </div>

                  {/* Tier Reward Trigger */}
                  <div className="mt-4 flex flex-col">
                    <label className="text-sm font-bold text-gray-800">
                      Tier {index + 1} Reward
                    </label>
                    <span className="text-xs text-gray-400 mt-0.5 mb-1.5">
                      Choose what user will get after they reach this goal.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenRewardModal(index)}
                      className="w-full text-left border border-gray-300 bg-white rounded-lg p-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 flex justify-between items-center cursor-pointer text-gray-700 font-semibold relative shadow-sm"
                    >
                      <span>
                        {goal.rewardType === "FREE_PRODUCT"
                          ? `Free Product: ${goal.rewardProductTitle || "No product selected"}`
                          : goal.rewardType === "FREE_SHIPPING"
                          ? "Free Shipping"
                          : "Choose Reward Type"}
                      </span>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <ChevronDown />
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddGoal}
              className="w-full mt-4 py-2.5 bg-gradient-to-b from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400 text-gray-800 text-sm font-bold border border-gray-300 rounded-lg shadow-sm transition-all duration-150 cursor-pointer text-center"
            >
              + Add More Goal
            </button>
          </section>

          {/* ── Step 3: Set-Up Theme of Your Cart ──────────────── */}
          <section aria-labelledby="step-3-title">
            <h2 id="step-3-title" className="text-xl font-bold text-black">
              Step 3 Set-Up Theme of Your Cart
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 mb-4">
              Activate your app in the Shopify theme editor to display it on your storefront.
            </p>

            <div className="flex flex-col">
              <label htmlFor="choose-theme" className="text-sm font-bold text-gray-800">
                Chose Theme
              </label>
              <span className="text-xs text-gray-400 mt-0.5 mb-1.5">Formats c</span>
              <div className="relative">
                <select
                  id="choose-theme"
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg p-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 cursor-pointer text-gray-700 font-semibold"
                >
                  <option value="dynamic">Dynamic (Recommended)</option>
                  <option value="classic">Classic</option>
                  <option value="minimal">Minimal</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <ChevronDown />
                </span>
              </div>
            </div>
          </section>

          {/* ── Step 4: Upsell & Toggles ───────────────────────── */}
          <section aria-labelledby="step-4-title">
            <h2 id="step-4-title" className="text-xl font-bold text-black">
              Step 4 Upsell & Toggles
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 mb-4">
              Activate your app in the Shopify theme editor to display it on your storefront.
            </p>

            <div className="space-y-4">
              {/* Upsell Product Multi-Select Dropdown Checklist */}
              <div className="flex flex-col relative">
                <label className="text-sm font-bold text-gray-800 mb-1">
                  Choose Upsell Products
                </label>
                <span className="text-xs text-gray-400 mt-0.5 mb-2">
                  Select multiple items to recommend to your customers.
                </span>
                
                {/* Trigger Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 pr-10 text-left text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 cursor-pointer text-gray-700 font-semibold flex items-center justify-between shadow-sm"
                  >
                    <span>
                      {upsellProducts.length === 0
                        ? "Choose Products..."
                        : `${upsellProducts.length} Product(s) Selected`}
                    </span>
                    <ChevronDown />
                  </button>

                  {/* Dropdown Checklist Container */}
                  {dropdownOpen && (
                    <>
                      {/* Backdrop to close dropdown when clicking outside */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setDropdownOpen(false)}
                      />
                      
                      {/* Floating checklist */}
                      <div className="absolute left-0 right-0 bottom-full mb-1 z-20 border border-gray-300 rounded-lg p-4 bg-white max-h-64 overflow-y-auto space-y-4 shadow-lg">
                        {/* Store Products Group */}
                        {products && products.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Store Products</p>
                            {products.map((prod) => {
                              const isChecked = upsellProducts.includes(prod.id);
                              return (
                                <label key={prod.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1.5 rounded transition-colors select-none">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setUpsellProducts([...upsellProducts, prod.id]);
                                      } else {
                                        setUpsellProducts(upsellProducts.filter((id) => id !== prod.id));
                                      }
                                    }}
                                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                                  />
                                  {prod.featuredImage?.url && (
                                    <img
                                      src={prod.featuredImage.url}
                                      alt={prod.title}
                                      className="w-8 h-8 object-cover rounded border border-gray-200"
                                    />
                                  )}
                                  <span className="text-sm font-semibold text-gray-700">{prod.title}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Toggle Select */}
              <div className="flex flex-col">
                <label className="text-sm font-bold text-gray-800">
                  Chose Toggle
                </label>
                <span className="text-xs text-gray-400 mt-0.5 mb-2">
                  Formats customers are allowed to upload.
                </span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleOpenToggleModal}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 pr-10 text-left text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 cursor-pointer text-gray-700 font-semibold relative shadow-sm"
                  >
                    <span>
                      {selectedToggle === "both"
                        ? "Package Protection & Gift Wrapping"
                        : selectedToggle === "package-protection"
                        ? "Package Protection"
                        : selectedToggle === "gift-wrapping"
                        ? "Gift Wrapping"
                        : selectedToggle === "none"
                        ? "None"
                        : "Chose Toggles"}
                    </span>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      <ChevronDown />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Enable Button Footer */}
        <div className="pt-8 flex justify-center">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`px-12 py-3 bg-gradient-to-r from-brand-700 to-brand-600 hover:from-brand-800 hover:to-brand-700 text-white font-bold tracking-wider rounded-lg shadow-md hover:shadow-lg active:scale-95 transition-all duration-150 cursor-pointer text-sm ${
              isSaving ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSaving ? "SAVING..." : saveSuccess ? "SYNCED! ✓" : "ENABLE TO SAVE CHANGES"}
          </button>
        </div>
      </div>

      {/* Set Tier Rewards Modal */}
      {activeGoalIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setActiveGoalIndex(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Title */}
            <h3 className="text-xl font-bold text-teal-800 text-center mb-1">
              Set Tier Rewards
            </h3>
            <p className="text-xs text-center text-gray-500 font-bold mb-6">
              Can Chose only one feature
            </p>

            {/* Reward Options */}
            <div className="space-y-6">
              {/* Option 1: Free Shipping */}
              <div className="flex items-center justify-between">
                <span className={`text-base font-bold transition-colors ${tempRewardType === 'FREE_SHIPPING' ? 'text-gray-800' : 'text-gray-400'}`}>
                  Free Shipping
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTempRewardType('FREE_SHIPPING');
                  }}
                  className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 cursor-pointer focus:outline-none ${
                    tempRewardType === 'FREE_SHIPPING' ? 'bg-teal-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      tempRewardType === 'FREE_SHIPPING' ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Option 2: Free Product */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-base font-bold transition-colors ${tempRewardType === 'FREE_PRODUCT' ? 'text-gray-800' : 'text-gray-400'}`}>
                    Free Product
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTempRewardType('FREE_PRODUCT');
                    }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 cursor-pointer focus:outline-none ${
                      tempRewardType === 'FREE_PRODUCT' ? 'bg-teal-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        tempRewardType === 'FREE_PRODUCT' ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Dropdown for choosing product when Free Product is active */}
                {tempRewardType === 'FREE_PRODUCT' && (
                  <div className="mt-2 animate-in slide-in-from-top-2 duration-150">
                    <label htmlFor="modal-choose-product" className="block text-xs font-bold text-gray-500 mb-1.5">
                      Choose Product
                    </label>
                    <div className="relative">
                      <select
                        id="modal-choose-product"
                        value={tempRewardProductId}
                        onChange={(e) => {
                          const prodId = e.target.value;
                          const prod = products.find(p => p.id === prodId);
                          if (prod) {
                            setTempRewardProductId(prod.id);
                            setTempRewardVariantId(prod.variants?.nodes?.[0]?.id || "");
                            setTempRewardProductTitle(prod.title);
                          } else {
                            setTempRewardProductId("");
                            setTempRewardVariantId("");
                            setTempRewardProductTitle("");
                          }
                        }}
                        className="w-full appearance-none bg-white border border-gray-300 rounded-lg p-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 cursor-pointer text-gray-700 font-semibold"
                      >
                        <option value="">Choose Product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <ChevronDown />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save Changes Button */}
            <div className="mt-8">
              <button
                type="button"
                onClick={handleSaveRewardModal}
                className="w-full py-3 bg-gradient-to-r from-teal-700 to-teal-500 hover:from-teal-800 hover:to-teal-600 text-white font-bold rounded-lg shadow-md active:scale-95 transition-all duration-150 cursor-pointer text-center"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Choose Toggles Modal */}
      {isToggleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setIsToggleModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Title */}
            <h3 className="text-xl font-bold text-teal-800 text-center mb-1">
              Choose Toggles
            </h3>
            <p className="text-xs text-center text-gray-500 font-bold mb-6">
              Can Chose both one or none option
            </p>

            {/* Modal Content */}
            <div className="space-y-6">
              {/* Option 1: Package Protection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-base font-bold transition-colors ${tempPPEnabled ? 'text-gray-800' : 'text-gray-400'}`}>
                    Package Protection
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTempPPEnabled(!tempPPEnabled);
                    }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 cursor-pointer focus:outline-none ${
                      tempPPEnabled ? 'bg-teal-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        tempPPEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1.5">
                    Enter Price Amount
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Set Price"
                      value={tempPPEnabled ? tempPPPrice : ""}
                      disabled={!tempPPEnabled}
                      onChange={(e) => setTempPPPrice(e.target.value)}
                      className={`w-full border rounded-lg p-2.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 ${
                        !tempPPEnabled
                          ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                          : "bg-white text-gray-700 border-gray-300"
                      }`}
                    />
                    {!tempPPEnabled && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-red-500">
                        Cannot Set Price
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Option 2: Gift Wrapping */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-base font-bold transition-colors ${tempGWEnabled ? 'text-gray-800' : 'text-gray-400'}`}>
                    Gift Wrapping
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTempGWEnabled(!tempGWEnabled);
                    }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 cursor-pointer focus:outline-none ${
                      tempGWEnabled ? 'bg-teal-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        tempGWEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1.5">
                    Enter Price Amount
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Set Price"
                      value={tempGWEnabled ? tempGWPrice : ""}
                      disabled={!tempGWEnabled}
                      onChange={(e) => setTempGWPrice(e.target.value)}
                      className={`w-full border rounded-lg p-2.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 ${
                        !tempGWEnabled
                          ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                          : "bg-white text-gray-700 border-gray-300"
                      }`}
                    />
                    {!tempGWEnabled && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-red-500">
                        Cannot Set Price
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Save Changes Button */}
            <div className="mt-8">
              <button
                type="button"
                onClick={handleSaveToggleModal}
                className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-bold rounded-lg shadow-md active:scale-95 transition-all duration-150 cursor-pointer text-center"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
