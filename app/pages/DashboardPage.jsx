/**
 * DashboardPage — Analytics Dashboard matching the CartElevate wireframe.
 *
 * Layout:
 *  - Header: Title + Date Range dropdown + Edit Settings button
 *  - Row 1: Total Extra Revenue card (white) | AOV Lift card (dark green)
 *  - Row 2: Top Performing Upsells | Revenue Breakdown
 */
import { useNavigate, useSearchParams } from "react-router";
import MetricCard from "../components/MetricCard";
import RevenueBreakdown from "../components/RevenueBreakdown";
import TopUpsells from "../components/TopUpsells";
import {
  kpiData,
  revenueBreakdown,
  topUpsells,
  dateRangeOptions,
} from "../data/dashboardData";

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 text-gray-500"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

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

function SettingsIcon() {
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
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function DashboardPage({ dbData }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateRange = searchParams.get("range") || "30d";
  const navigate = useNavigate();

  // Bind to dynamic DB data or fall back to mock data
  const activeKpis = dbData?.kpiData || kpiData;
  const activeBreakdown = dbData?.revenueBreakdown || revenueBreakdown;
  const activeTopUpsells = dbData?.topUpsells || topUpsells;

  const selectedDateLabel =
    dateRangeOptions.find((o) => o.value === dateRange)?.label ?? "Last 30 Days";

  const revenueProgress = Math.min(
    Math.round(
      (activeKpis.totalExtraRevenue.rawValue / 125000) * 100
    ),
    100,
  );
  const aovProgress = Math.min(
    Math.round(
      (activeKpis.aovLift.rawValue / 280) * 100
    ),
    100,
  );

  return (
    <div className="dashboard-page">
      {/* ── Page Header ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black leading-tight">
            Analytics Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            App performance for the {selectedDateLabel.toLowerCase()}
          </p>
        </div>

        {/* Right controls: Date picker + Edit Settings */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Date range picker */}
          <div className="relative">
            <div className="flex items-center gap-1.5 select-pill">
              <CalendarIcon />
              <select
                id="date-range-select"
                className="appearance-none bg-transparent text-sm font-medium text-gray-700 pr-5 cursor-pointer focus:outline-none"
                value={dateRange}
                onChange={(e) => {
                  setSearchParams((prev) => {
                    const nextParams = new URLSearchParams(prev);
                    nextParams.set("range", e.target.value);
                    return nextParams;
                  });
                }}
                aria-label="Select date range"
              >
                {dateRangeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none">
                <ChevronDown />
              </span>
            </div>
          </div>

          {/* Edit Settings button → navigates to /app/settings */}
          <button
            id="edit-settings-btn"
            onClick={() => navigate("/app/settings")}
            className="edit-settings-btn"
            aria-label="Edit app settings"
          >
            <SettingsIcon />
            <span>Edit Settings</span>
          </button>
        </div>
      </div>

      {/* ── Row 1: KPI Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        {/* White card */}
        <MetricCard
          label={activeKpis.totalExtraRevenue.label}
          value={activeKpis.totalExtraRevenue.value}
          comparison={activeKpis.totalExtraRevenue.comparison}
          growth={activeKpis.totalExtraRevenue.growth}
          growthPositive={activeKpis.totalExtraRevenue.growthPositive}
          icon={activeKpis.totalExtraRevenue.icon}
          progressPercent={revenueProgress}
          dark={false}
        />
        {/* Dark green card */}
        <MetricCard
          label={activeKpis.aovLift.label}
          value={activeKpis.aovLift.value}
          comparison={activeKpis.aovLift.comparison}
          growth={activeKpis.aovLift.growth}
          growthPositive={activeKpis.aovLift.growthPositive}
          icon={activeKpis.aovLift.icon}
          progressPercent={aovProgress}
          dark={true}
        />
      </div>

      {/* ── Row 2: Top Upsells + Revenue Breakdown ──────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <TopUpsells data={activeTopUpsells} />
        <RevenueBreakdown data={activeBreakdown} />
      </div>
    </div>
  );
}
