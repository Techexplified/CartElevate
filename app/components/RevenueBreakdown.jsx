/**
 * RevenueBreakdown — Analytics card containing the donut chart
 * and the revenue source list with a top-right filter dropdown.
 */
import { useState } from "react";
import DonutChart from "./DonutChart";
import RevenueSourceRow from "./RevenueSourceRow";
import { revenueFilterOptions } from "../data/dashboardData";

// Chevron icon
function ChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
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

/**
 * @param {object} props
 * @param {object} props.data  - revenueBreakdown data object from dashboardData.js
 */
export default function RevenueBreakdown({ data }) {
  const [filter, setFilter] = useState(revenueFilterOptions[0].value);
  const selectedLabel =
    revenueFilterOptions.find((o) => o.value === filter)?.label ?? "By Revenue";

  return (
    <section className="analytics-card" aria-labelledby="revenue-breakdown-title">
      {/* Card header */}
      <div className="analytics-card__header">
        <div>
          <h2 id="revenue-breakdown-title" className="analytics-card__title">
            {data.title}
          </h2>
          <p className="analytics-card__subtitle">{data.subtitle}</p>
        </div>

        {/* Filter dropdown */}
        <div className="relative">
          <select
            id="revenue-filter"
            className="select-pill appearance-none pr-7 cursor-pointer"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter revenue by"
          >
            {revenueFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
            <ChevronDown />
          </span>
        </div>
      </div>

      {/* Body: donut + sources */}
      <div className="flex flex-col sm:flex-row gap-8 items-start">
        {/* Donut chart */}
        <div className="flex-shrink-0 flex justify-center sm:justify-start">
          <DonutChart
            sources={data.sources}
            centerLabel={data.totalLabel}
            centerSubLabel={data.totalSubLabel}
          />
        </div>

        {/* Revenue source list */}
        <div className="flex-1 min-w-0">
          {data.sources.map((source) => (
            <RevenueSourceRow key={source.id} {...source} />
          ))}
        </div>
      </div>
    </section>
  );
}
