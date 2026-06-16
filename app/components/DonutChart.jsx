/**
 * DonutChart — SVG-based donut chart for revenue breakdown.
 * Renders arc segments proportional to each source's percentage.
 */

const SIZE = 180;
const STROKE = 32;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

/**
 * Converts a list of segments into SVG strokeDasharray/offset values.
 * Each segment: { percentage, color }
 */
function buildSegments(sources) {
  let accumulated = 0;
  return sources.map((source) => {
    const dashLength = (source.percentage / 100) * CIRCUMFERENCE;
    const gapLength = CIRCUMFERENCE - dashLength;
    const offset = CIRCUMFERENCE - accumulated * (CIRCUMFERENCE / 100);
    accumulated += source.percentage;
    return {
      ...source,
      dashArray: `${dashLength} ${gapLength}`,
      dashOffset: offset,
    };
  });
}

/**
 * @param {object} props
 * @param {Array<{id:string, name:string, percentage:number, color:string}>} props.sources
 * @param {string} props.centerLabel
 * @param {string} props.centerSubLabel
 */
export default function DonutChart({ sources, centerLabel, centerSubLabel }) {
  const segments = buildSegments(sources);

  return (
    <div className="donut-wrapper" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-label="Revenue breakdown donut chart"
        role="img"
      >
        {/* Background track */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={STROKE}
        />

        {/* Segments — rotate start from top (−90°) */}
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {segments.map((seg) => (
            <circle
              key={seg.id}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE - 2}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              strokeLinecap="butt"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          ))}
        </g>
      </svg>

      {/* Center text overlay */}
      <div className="donut-center">
        <span className="text-xl font-bold text-gray-900 leading-tight">
          {centerLabel}
        </span>
        <span className="text-xs text-gray-500 mt-0.5 leading-tight">
          {centerSubLabel}
        </span>
      </div>
    </div>
  );
}
