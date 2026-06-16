/**
 * Mock analytics data for Upload Studio dashboard.
 * Replace these values with real API calls in the future.
 */

export const kpiData = {
  totalExtraRevenue: {
    label: "Total Extra Revenue",
    value: "$48,312.00",
    rawValue: 48312,
    comparison: "vs. $40,892 previous period",
    previousValue: 40892,
    growth: "+18.2%",
    growthPositive: true,
    icon: "dollar",
  },
  aovLift: {
    label: "AOV Lift",
    value: "$87.40",
    rawValue: 87.4,
    comparison: "Avg. order up from $77.78",
    previousValue: 77.78,
    growth: "+12.4%",
    growthPositive: true,
    icon: "trend",
  },
};

export const revenueBreakdown = {
  title: "Revenue Breakdown",
  subtitle: "Source attribution for the current period",
  totalLabel: "$48.3K",
  totalSubLabel: "Total Revenue",
  total: 48312,
  sources: [
    {
      id: "gap-filler",
      name: "Gap Filler Upsells",
      amount: 26572,
      amountFormatted: "$26,572",
      percentage: 55,
      percentageLabel: "55% of total",
      growth: "+22.1% vs prev",
      growthPositive: true,
      color: "#008060",
    },
    {
      id: "package-protection",
      name: "Package Protection",
      amount: 14493,
      amountFormatted: "$14,493",
      percentage: 30,
      percentageLabel: "30% of total",
      growth: "+14.8% vs prev",
      growthPositive: true,
      color: "#00a47c",
    },
    {
      id: "gift-wrapping",
      name: "Gift Wrapping",
      amount: 7247,
      amountFormatted: "$7,247",
      percentage: 15,
      percentageLabel: "15% of total",
      growth: "+9.3% vs prev",
      growthPositive: true,
      color: "#95e3c8",
    },
  ],
};

export const conversionFunnel = {
  title: "Progress Bar Conversion Funnel",
  subtitle: "Shopper drop-off across reward tiers",
  tiers: [
    {
      id: "cart-views",
      label: "Cart Views",
      sublabel: "100% — Baseline",
      percentage: 100,
      count: 12840,
      dropOff: null,
      droppedCount: null,
      isBaseline: true,
    },
    {
      id: "tier-1",
      label: "Reached Tier 1 (Free Shipping)",
      sublabel: "68.0% — Drop-off: 32%",
      percentage: 68,
      count: 8731,
      dropOff: 32,
      droppedCount: 4109,
      isBaseline: false,
    },
    {
      id: "tier-2",
      label: "Reached Tier 2 (Free Gift)",
      sublabel: "41.0% — Drop-off: 39%",
      percentage: 41,
      count: 5269,
      dropOff: 39,
      droppedCount: 3462,
      isBaseline: false,
    },
  ],
};

export const dateRangeOptions = [
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 12 Months", value: "12m" },
];

export const revenueFilterOptions = [
  { label: "By Revenue", value: "revenue" },
  { label: "By Orders", value: "orders" },
  { label: "By Conversions", value: "conversions" },
];

export const topUpsells = {
  title: "Top Performing Upsells",
  subtitle: "Ranked by revenue generated",
  items: [
    {
      id: "upsell-1",
      name: "Minimalist Leather Wallet",
      conversionRate: "12.4% Conv. Rate",
      revenue: "+$1,850",
      rank: 1,
      badge: "#1 Top Pick",
      badgeHighlight: true,
    },
    {
      id: "upsell-2",
      name: "Ceramic Travel Mug",
      conversionRate: "9.1% Conv. Rate",
      revenue: "+$1,240",
      rank: 2,
      badge: "#2",
      badgeHighlight: false,
    },
    {
      id: "upsell-3",
      name: "Wool Knit Phone Case",
      conversionRate: "6.8% Conv. Rate",
      revenue: "+$890",
      rank: 3,
      badge: "#3",
      badgeHighlight: false,
    },
  ],
};
