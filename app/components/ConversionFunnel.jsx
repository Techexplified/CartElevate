/**
 * ConversionFunnel — Shows cart-to-reward-tier conversion with
 * progressively shrinking bars and drop-off indicators.
 */

// Sliders icon for the Edit Thresholds button
function SlidersIcon() {
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
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

// Triangle drop icon
function TriangleDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-3.5 h-3.5 text-gray-400"
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

// Tier colour palette
const TIER_COLORS = {
  baseline: { bg: "#008060", text: "text-white" },
  tier1: { bg: "#00a47c", text: "text-white" },
  tier2: { bg: "#5eecc8", text: "text-gray-800" },
};

const COLOR_SEQUENCE = ["baseline", "tier1", "tier2"];

/**
 * Single funnel bar row.
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.sublabel
 * @param {number} props.percentage    - 0-100, drives bar width
 * @param {number} props.count
 * @param {number|null} props.droppedCount
 * @param {boolean} props.isBaseline
 * @param {string} props.colorKey      - "baseline" | "tier1" | "tier2"
 */
function FunnelBar({ label, sublabel, percentage, count, droppedCount, isBaseline, colorKey }) {
  const { bg, text } = TIER_COLORS[colorKey] ?? TIER_COLORS.tier2;

  return (
    <div className="mb-3 last:mb-0">
      {/* The proportional bar */}
      <div
        className="funnel-bar__fill flex items-center justify-between rounded-lg px-4 py-3"
        style={{
          width: `${percentage}%`,
          minWidth: "55%", // ensure label always fits
          backgroundColor: bg,
          transition: "width 0.7s ease",
        }}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div>
          <p className={`text-sm font-semibold leading-tight ${text}`}>{label}</p>
          <p className={`text-xs mt-0.5 opacity-80 ${text}`}>{sublabel}</p>
        </div>
        <span className={`text-xl font-bold tabular-nums ml-4 ${text}`}>
          {count.toLocaleString()}
        </span>
      </div>

      {/* Drop-off indicator */}
      {!isBaseline && droppedCount != null && (
        <div className="funnel-bar__dropout">
          <TriangleDown />
          <span>{droppedCount.toLocaleString()} dropped off</span>
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.data  - conversionFunnel data from dashboardData.js
 * @param {function} [props.onEditThresholds]
 */
export default function ConversionFunnel({ data, onEditThresholds }) {
  return (
    <section className="analytics-card" aria-labelledby="funnel-title">
      {/* Header */}
      <div className="analytics-card__header">
        <div>
          <h2 id="funnel-title" className="analytics-card__title">
            {data.title}
          </h2>
          <p className="analytics-card__subtitle">{data.subtitle}</p>
        </div>

        <button
          id="edit-thresholds-btn"
          className="btn-outline"
          onClick={onEditThresholds}
          type="button"
          aria-label="Edit reward thresholds"
        >
          <SlidersIcon />
          Edit Thresholds
        </button>
      </div>

      {/* Funnel bars */}
      <div className="mt-2">
        {data.tiers.map((tier, index) => (
          <FunnelBar
            key={tier.id}
            label={tier.label}
            sublabel={tier.sublabel}
            percentage={tier.percentage}
            count={tier.count}
            droppedCount={tier.droppedCount}
            isBaseline={tier.isBaseline}
            colorKey={COLOR_SEQUENCE[index] ?? "tier2"}
          />
        ))}
      </div>
    </section>
  );
}
