import React, { useState, useMemo, useRef, useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  let currencySymbol = "$";
  try {
    const q = await admin.graphql(`{ shop { currencyCode moneyFormat } }`);
    const res = await q.json();
    if (res?.data?.shop?.currencyCode) {
      const code = res.data.shop.currencyCode;
      const symbols = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", INR: "₹" };
      currencySymbol = symbols[code] || "$";
    }
  } catch (e) {}

  return { shop, currencySymbol };
};

// Data sets matching the screenshot with concise comparison labels
const PERIOD_DATA = {
  "30d": {
    label: "Last 30 days",
    comparisonLabel: "vs last month",
    impressions: "18,420",
    impressionsTrend: "12.4%",
    acceptanceRate: "11.2%",
    acceptanceRateTrend: "2.1%",
    revenue: "4,280",
    revenueTrend: "18.7%",
    aov: "58.90",
    aovTrend: "14.6%",
    features: [
      {
        id: "shipping_bar",
        name: "Shipping and gift bar",
        icon: "gift",
        impressions: "9,120",
        accepted: "14.8%",
        revenue: "1,940",
      },
      {
        id: "recommendations",
        name: "Recommendations",
        icon: "sparkle",
        impressions: "6,300",
        accepted: "9.1%",
        revenue: "1,120",
      },
      {
        id: "post_purchase",
        name: "Post purchase offer",
        icon: "rocket",
        impressions: "3,000",
        accepted: "10.4%",
        revenue: "1,220",
      },
    ],
  },
  "today": {
    label: "Today",
    comparisonLabel: "vs yesterday",
    impressions: "640",
    impressionsTrend: "8.2%",
    acceptanceRate: "12.1%",
    acceptanceRateTrend: "1.4%",
    revenue: "165",
    revenueTrend: "22.5%",
    aov: "61.20",
    aovTrend: "5.4%",
    features: [
      {
        id: "shipping_bar",
        name: "Shipping and gift bar",
        icon: "gift",
        impressions: "320",
        accepted: "15.0%",
        revenue: "75",
      },
      {
        id: "recommendations",
        name: "Recommendations",
        icon: "sparkle",
        impressions: "220",
        accepted: "9.5%",
        revenue: "45",
      },
      {
        id: "post_purchase",
        name: "Post purchase offer",
        icon: "rocket",
        impressions: "100",
        accepted: "11.0%",
        revenue: "45",
      },
    ],
  },
  "7d": {
    label: "Last 7 days",
    comparisonLabel: "vs last week",
    impressions: "4,280",
    impressionsTrend: "9.8%",
    acceptanceRate: "11.8%",
    acceptanceRateTrend: "1.8%",
    revenue: "1,040",
    revenueTrend: "15.2%",
    aov: "59.40",
    aovTrend: "8.3%",
    features: [
      {
        id: "shipping_bar",
        name: "Shipping and gift bar",
        icon: "gift",
        impressions: "2,120",
        accepted: "15.0%",
        revenue: "480",
      },
      {
        id: "recommendations",
        name: "Recommendations",
        icon: "sparkle",
        impressions: "1,450",
        accepted: "9.5%",
        revenue: "280",
      },
      {
        id: "post_purchase",
        name: "Post purchase offer",
        icon: "rocket",
        impressions: "710",
        accepted: "10.8%",
        revenue: "280",
      },
    ],
  },
  "90d": {
    label: "Last 90 days",
    comparisonLabel: "vs last quarter",
    impressions: "52,400",
    impressionsTrend: "18.5%",
    acceptanceRate: "11.6%",
    acceptanceRateTrend: "2.7%",
    revenue: "12,680",
    revenueTrend: "22.4%",
    aov: "58.10",
    aovTrend: "12.1%",
    features: [
      {
        id: "shipping_bar",
        name: "Shipping and gift bar",
        icon: "gift",
        impressions: "26,100",
        accepted: "15.1%",
        revenue: "5,820",
      },
      {
        id: "recommendations",
        name: "Recommendations",
        icon: "sparkle",
        impressions: "17,800",
        accepted: "9.3%",
        revenue: "3,360",
      },
      {
        id: "post_purchase",
        name: "Post purchase offer",
        icon: "rocket",
        impressions: "8,500",
        accepted: "10.2%",
        revenue: "3,500",
      },
    ],
  },
  "all": {
    label: "All time",
    comparisonLabel: "all time",
    impressions: "84,600",
    impressionsTrend: "24.1%",
    acceptanceRate: "11.9%",
    acceptanceRateTrend: "3.2%",
    revenue: "21,450",
    revenueTrend: "28.5%",
    aov: "58.40",
    aovTrend: "15.2%",
    features: [
      {
        id: "shipping_bar",
        name: "Shipping and gift bar",
        icon: "gift",
        impressions: "42,200",
        accepted: "15.4%",
        revenue: "9,840",
      },
      {
        id: "recommendations",
        name: "Recommendations",
        icon: "sparkle",
        impressions: "28,900",
        accepted: "9.6%",
        revenue: "5,680",
      },
      {
        id: "post_purchase",
        name: "Post purchase offer",
        icon: "rocket",
        impressions: "13,500",
        accepted: "10.5%",
        revenue: "5,930",
      },
    ],
  },
};

// Exact tooltips from the user's mockup image
const TOOLTIPS = {
  impressions: "How many times a shopper saw an upsell, like a bundle suggestion or the progress bar. Shows how much reach your upsells are getting.",
  acceptanceRate: "Of everyone who saw an upsell, the percent who accepted it. Low rate with high impressions usually means the offer or price needs work.",
  revenue: "Total revenue from orders that included an accepted upsell. This is an estimate based on what customers added, not a guaranteed causal lift.",
  aov: "Your store's average order amount across all orders in this period, not only ones with upsells. Good for tracking overall store health.",
};

export default function AnalyticsPage() {
  const { currencySymbol } = useLoaderData();
  const navigate = useNavigate();

  const [period, setPeriod] = useState("30d");
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const data = useMemo(() => PERIOD_DATA[period] || PERIOD_DATA["30d"], [period]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const PERIOD_OPTIONS = [
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <div className="min-h-screen bg-[#F6F6F7] text-[#202223] font-sans antialiased pb-20 select-none">
      <main className="max-w-[1200px] w-full mx-auto px-6 sm:px-8 pt-6">
        {/* Back navigation */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition cursor-pointer"
          >
            <span>←</span>
            <span>Back to dashboard</span>
          </button>
        </div>

        {/* Header: Title + Date Range Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-bold text-[#202223] tracking-tight leading-tight">
              Analytics
            </h1>
            <p className="text-sm text-[#6D7175] mt-1 font-normal">
              How your upsells are performing across the store.
            </p>
          </div>

          {/* Date Picker Pill Dropdown matching mockup */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="inline-flex items-center gap-2.5 bg-white border border-[#D2D5D8] hover:border-[#8C9196] rounded-xl px-3.5 py-2 shadow-2xs transition text-xs sm:text-sm font-medium text-[#202223] cursor-pointer"
            >
              {/* Calendar Icon */}
              <svg className="w-4 h-4 text-[#5C5F62] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{data.label}</span>
              <svg className={`w-3.5 h-3.5 text-[#5C5F62] transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white border border-[#E1E3E5] rounded-xl shadow-lg py-1.5 z-40 animate-fadeIn">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPeriod(opt.value);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center justify-between hover:bg-[#F6F6F7] transition cursor-pointer ${
                      period === opt.value ? "text-[#F95738] font-bold bg-[#FFF8F6]" : "text-[#202223]"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {period === opt.value && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4 Metric Cards matching mockup */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Upsell impressions */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative">
            <div className="flex items-center gap-3.5">
              {/* Peach Icon Box */}
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FFF2ED] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#F95738]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#6D7175]">
                  <span className="truncate">Upsell impressions</span>
                  <div className="relative inline-flex items-center shrink-0">
                    <button
                      type="button"
                      onMouseEnter={() => setActiveTooltip("impressions")}
                      onMouseLeave={() => setActiveTooltip(null)}
                      onClick={() => setActiveTooltip(activeTooltip === "impressions" ? null : "impressions")}
                      className="text-[#8C9196] hover:text-[#202223] transition cursor-pointer"
                      aria-label="More info"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>

                    {activeTooltip === "impressions" && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 w-64 bg-white border border-[#E1E3E5] rounded-xl p-3 shadow-xl text-xs text-[#202223] leading-relaxed font-normal pointer-events-none animate-fadeIn">
                        {TOOLTIPS.impressions}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-white border-b border-r border-[#E1E3E5] rotate-45 -mt-1"></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[24px] sm:text-[26px] font-bold text-[#202223] tracking-tight mt-0.5 leading-none">
                  {data.impressions}
                </div>

                <div className="flex items-center gap-1 mt-2 text-xs font-medium overflow-hidden">
                  <span className="text-[#008060] font-semibold whitespace-nowrap shrink-0">
                    ↑&nbsp;{data.impressionsTrend}
                  </span>
                  <span className="text-[#6D7175] text-[11px] whitespace-nowrap truncate">
                    {data.comparisonLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Acceptance rate */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative">
            <div className="flex items-center gap-3.5">
              {/* Peach Icon Box */}
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FFF2ED] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#F95738]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#6D7175]">
                  <span className="truncate">Acceptance rate</span>
                  <div className="relative inline-flex items-center shrink-0">
                    <button
                      type="button"
                      onMouseEnter={() => setActiveTooltip("acceptanceRate")}
                      onMouseLeave={() => setActiveTooltip(null)}
                      onClick={() => setActiveTooltip(activeTooltip === "acceptanceRate" ? null : "acceptanceRate")}
                      className="text-[#8C9196] hover:text-[#202223] transition cursor-pointer"
                      aria-label="More info"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>

                    {activeTooltip === "acceptanceRate" && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 w-64 bg-white border border-[#E1E3E5] rounded-xl p-3 shadow-xl text-xs text-[#202223] leading-relaxed font-normal pointer-events-none animate-fadeIn">
                        {TOOLTIPS.acceptanceRate}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-white border-b border-r border-[#E1E3E5] rotate-45 -mt-1"></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[24px] sm:text-[26px] font-bold text-[#202223] tracking-tight mt-0.5 leading-none">
                  {data.acceptanceRate}
                </div>

                <div className="flex items-center gap-1 mt-2 text-xs font-medium overflow-hidden">
                  <span className="text-[#008060] font-semibold whitespace-nowrap shrink-0">
                    ↑&nbsp;{data.acceptanceRateTrend}
                  </span>
                  <span className="text-[#6D7175] text-[11px] whitespace-nowrap truncate">
                    {data.comparisonLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Attributed revenue */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative">
            <div className="flex items-center gap-3.5">
              {/* Peach Icon Box */}
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FFF2ED] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#F95738]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="10" />
                  <line x1="6" y1="20" x2="6" y2="15" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#6D7175]">
                  <span className="truncate">Attributed revenue</span>
                  <div className="relative inline-flex items-center shrink-0">
                    <button
                      type="button"
                      onMouseEnter={() => setActiveTooltip("revenue")}
                      onMouseLeave={() => setActiveTooltip(null)}
                      onClick={() => setActiveTooltip(activeTooltip === "revenue" ? null : "revenue")}
                      className="text-[#8C9196] hover:text-[#202223] transition cursor-pointer"
                      aria-label="More info"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>

                    {activeTooltip === "revenue" && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 w-64 bg-white border border-[#E1E3E5] rounded-xl p-3 shadow-xl text-xs text-[#202223] leading-relaxed font-normal pointer-events-none animate-fadeIn">
                        {TOOLTIPS.revenue}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-white border-b border-r border-[#E1E3E5] rotate-45 -mt-1"></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[24px] sm:text-[26px] font-bold text-[#202223] tracking-tight mt-0.5 leading-none">
                  {currencySymbol}{data.revenue}
                </div>

                <div className="flex items-center gap-1 mt-2 text-xs font-medium overflow-hidden">
                  <span className="text-[#008060] font-semibold whitespace-nowrap shrink-0">
                    ↑&nbsp;{data.revenueTrend}
                  </span>
                  <span className="text-[#6D7175] text-[11px] whitespace-nowrap truncate">
                    {data.comparisonLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Average order value */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative">
            <div className="flex items-center gap-3.5">
              {/* Peach Icon Box */}
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FFF2ED] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#F95738]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#6D7175]">
                  <span className="truncate">Average order value</span>
                  <div className="relative inline-flex items-center shrink-0">
                    <button
                      type="button"
                      onMouseEnter={() => setActiveTooltip("aov")}
                      onMouseLeave={() => setActiveTooltip(null)}
                      onClick={() => setActiveTooltip(activeTooltip === "aov" ? null : "aov")}
                      className="text-[#8C9196] hover:text-[#202223] transition cursor-pointer"
                      aria-label="More info"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>

                    {activeTooltip === "aov" && (
                      <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 -top-2 -translate-y-full z-50 w-64 bg-white border border-[#E1E3E5] rounded-xl p-3 shadow-xl text-xs text-[#202223] leading-relaxed font-normal pointer-events-none animate-fadeIn">
                        {TOOLTIPS.aov}
                        <div className="absolute right-4 sm:left-1/2 sm:-translate-x-1/2 top-full w-2 h-2 bg-white border-b border-r border-[#E1E3E5] rotate-45 -mt-1"></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[24px] sm:text-[26px] font-bold text-[#202223] tracking-tight mt-0.5 leading-none">
                  {currencySymbol}{data.aov}
                </div>

                <div className="flex items-center gap-1 mt-2 text-xs font-medium overflow-hidden">
                  <span className="text-[#008060] font-semibold whitespace-nowrap shrink-0">
                    ↑&nbsp;{data.aovTrend}
                  </span>
                  <span className="text-[#6D7175] text-[11px] whitespace-nowrap truncate">
                    {data.comparisonLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance by feature Table Card matching mockup */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 pt-5 pb-3">
            <h2 className="text-base sm:text-lg font-bold text-[#202223] tracking-tight">
              Performance by feature
            </h2>
          </div>

          <div className="w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E1E3E5] text-xs text-[#6D7175] font-normal">
                  <th className="py-2.5 px-6 font-normal">Feature</th>
                  <th className="py-2.5 px-6 font-normal text-right">Impressions</th>
                  <th className="py-2.5 px-6 font-normal text-right">Accepted</th>
                  <th className="py-2.5 px-6 font-normal text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F2F3] text-sm">
                {data.features.map((feat) => (
                  <tr key={feat.id} className="hover:bg-[#FAFBFB] transition-colors">
                    {/* Feature: Icon + Title */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#FFF2ED] flex items-center justify-center shrink-0">
                          {feat.icon === "gift" && (
                            <svg className="w-5 h-5 text-[#F95738]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 12 20 22 4 22 4 12" />
                              <rect x="2" y="7" width="20" height="5" />
                              <line x1="12" y1="22" x2="12" y2="7" />
                              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                            </svg>
                          )}
                          {feat.icon === "sparkle" && (
                            <svg className="w-5 h-5 text-[#F95738]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" />
                            </svg>
                          )}
                          {feat.icon === "rocket" && (
                            <svg className="w-5 h-5 text-[#F95738]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                            </svg>
                          )}
                        </div>

                        <span className="font-semibold text-[#202223] text-sm">
                          {feat.name}
                        </span>
                      </div>
                    </td>

                    {/* Impressions */}
                    <td className="py-4 px-6 text-right text-[#202223] font-normal">
                      {feat.impressions}
                    </td>

                    {/* Accepted Rate */}
                    <td className="py-4 px-6 text-right text-[#202223] font-normal">
                      {feat.accepted}
                    </td>

                    {/* Revenue */}
                    <td className="py-4 px-6 text-right text-[#202223] font-semibold">
                      {currencySymbol}{feat.revenue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
