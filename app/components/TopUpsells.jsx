/**
 * TopUpsells — "Top Performing Upsells" analytics card.
 * Shows ranked upsell products with conversion rates and revenue.
 */

function ProductIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5 text-gray-400"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    </div>
  );
}

function UpsellRow({ item }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0">
      {item.image ? (
        <img
          src={item.image}
          alt={item.name}
          className="w-10 h-10 object-cover rounded-lg border border-gray-200 flex-shrink-0"
        />
      ) : (
        <ProductIcon />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
          <span className="text-xs text-gray-500">{item.conversionRate}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-sm font-bold text-brand-600">{item.revenue}</span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            item.badgeHighlight
              ? "bg-brand-600 text-white"
              : "text-gray-400"
          }`}
        >
          {item.badge}
        </span>
      </div>
    </div>
  );
}

/**
 * @param {{ data: object }} props
 */
export default function TopUpsells({ data }) {
  return (
    <section className="analytics-card h-full" aria-labelledby="top-upsells-title">
      <div className="analytics-card__header">
        <div>
          <h2 id="top-upsells-title" className="analytics-card__title">
            {data.title}
          </h2>
          <p className="analytics-card__subtitle">{data.subtitle}</p>
        </div>
      </div>
      <div className="py-4">
        {(!data.items || data.items.length === 0) ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No upsell conversions tracked yet.
          </p>
        ) : (
          data.items.map((item) => (
            <UpsellRow key={item.id} item={item} />
          ))
        )}
      </div>
    </section>
  );
}
