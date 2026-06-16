/**
 * MetricCard — KPI summary card.
 * Supports a `dark` prop for the dark green AOV Lift card variant.
 */

function DollarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function ArrowUpMini({ dark }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 flex-shrink-0 ${dark ? "text-green-300" : "text-brand-500"}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GrowthArrow({ positive }) {
  return positive ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {string}  props.label
 * @param {string}  props.value
 * @param {string}  props.comparison
 * @param {string}  props.growth
 * @param {boolean} props.growthPositive
 * @param {"dollar"|"trend"} props.icon
 * @param {number}  [props.progressPercent]
 * @param {boolean} [props.dark] - renders dark green variant (AOV card)
 */
export default function MetricCard({
  label,
  value,
  comparison,
  growth,
  growthPositive = true,
  icon = "dollar",
  progressPercent = 75,
  dark = false,
}) {
  return (
    <article className={`metric-card flex flex-col${dark ? " metric-card--dark" : ""}`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`metric-card__icon${dark ? " metric-card__icon--dark" : ""}`}>
            {icon === "dollar" ? <DollarIcon /> : <TrendIcon />}
          </div>
          <span className={`text-sm font-medium ${dark ? "text-green-200" : "text-gray-600"}`}>
            {label}
          </span>
        </div>
        <span className={`metric-card__badge ${
          dark
            ? "metric-card__badge--dark"
            : growthPositive
            ? "metric-card__badge--positive"
            : "metric-card__badge--negative"
        }`}>
          <GrowthArrow positive={growthPositive} />
          {growth}
        </span>
      </div>

      {/* Value */}
      <p className={`metric-card__value${dark ? " metric-card__value--dark" : ""}`}>
        {value}
      </p>

      {/* Comparison */}
      <div className={`metric-card__comparison${dark ? " metric-card__comparison--dark" : ""}`}>
        <ArrowUpMini dark={dark} />
        <span>{comparison}</span>
      </div>

      {/* Progress bar */}
      <div className={`metric-card__progress mt-auto pt-4${dark ? " metric-card__progress--dark" : ""}`}>
        <div
          className={`metric-card__progress-fill${dark ? " metric-card__progress-fill--dark" : ""}`}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </article>
  );
}
