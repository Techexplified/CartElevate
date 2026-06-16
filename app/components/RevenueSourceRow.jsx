/**
 * RevenueSourceRow — A single row in the Revenue Breakdown list.
 * Shows: colored dot, name, horizontal progress bar, revenue amount, and growth %.
 */

/**
 * @param {object} props
 * @param {string} props.name
 * @param {string} props.amountFormatted
 * @param {number} props.percentage
 * @param {string} props.percentageLabel
 * @param {string} props.growth
 * @param {boolean} props.growthPositive
 * @param {string} props.color       - hex color for dot and bar
 */
export default function RevenueSourceRow({
  name,
  amountFormatted,
  percentage,
  percentageLabel,
  growth,
  growthPositive = true,
  color,
}) {
  return (
    <div className="revenue-source">
      {/* Name row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Colored dot */}
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-gray-800 whitespace-nowrap truncate">{name}</span>
        </div>
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          {amountFormatted}
        </span>
      </div>

      {/* Progress bar */}
      <div className="revenue-source__bar">
        <div
          className="revenue-source__bar-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{percentageLabel}</span>
        <span
          className={`text-xs font-semibold ${
            growthPositive ? "text-brand-600" : "text-red-500"
          }`}
        >
          {growth}
        </span>
      </div>
    </div>
  );
}
