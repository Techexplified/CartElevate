/**
 * UpsellSection.js
 *
 * "Complete Your Order" section.
 * Loads recommended products via useUpsells hook.
 * Renders a horizontally scrollable row of UpsellCards.
 *
 * Recommendation logic is fully decoupled — swap upsellService
 * without touching this component.
 */
import React, { useState } from 'react';
import { useUpsells } from '../../hooks/useUpsells.js';
import { LoadingState } from '../LoadingState/LoadingState.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { formatCurrency } from '../../utils/cartHelpers.js';

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}

export function UpsellSection() {
  const { products, loading } = useUpsells();
  const { addToCart, addedItems, settings } = useCartElevate();
  const [isOpen, setIsOpen] = useState(() => {
    const saved = sessionStorage.getItem('ce_upsell_open');
    return saved !== 'false';
  });

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    sessionStorage.setItem('ce_upsell_open', String(nextState));
  };

  const handleAdd = async (variantId) => {
    const success = await addToCart(variantId, 1);
    if (success) {
      setIsOpen(false);
      sessionStorage.setItem('ce_upsell_open', 'false');
    }
  };

  if (loading) return <LoadingState message="Finding recommendations..." />;
  if (!products || products.length === 0) return <EmptyState message="No recommendations available." />;

  const currencySymbol = settings?.currencySymbol || '$';

  return (
    <div className="ce-section">
      <div className="ce-upsell-accordion-header" onClick={toggleOpen}>
        <p className="ce-upsell-accordion-title">Add more products to complete order</p>
        <span className={`ce-upsell-chevron ${isOpen ? 'open' : ''}`}>
          <ChevronIcon />
        </span>
      </div>

      {isOpen && (
        <div className="ce-upsell-row-list">
          {products.map((product) => {
            const status = addedItems[product.variantId];
            return (
              <div key={product.id} className="ce-upsell-row-item">
                <img
                  className="ce-upsell-row-img"
                  src={product.image}
                  alt={product.title}
                  loading="lazy"
                  onError={(e) => { e.target.style.background = '#e8e8f0'; e.target.src = ''; }}
                />
                <div className="ce-upsell-row-info">
                  <span className="ce-upsell-row-title">{product.title}</span>
                  <div className="ce-upsell-row-price-row">
                    <span className="ce-upsell-row-price">{formatCurrency(product.price, currencySymbol)}</span>
                    {product.compareAtPrice && (
                      <span className="ce-upsell-row-compare">{formatCurrency(product.compareAtPrice, currencySymbol)}</span>
                    )}
                  </div>
                </div>
                <button
                  className={`ce-upsell-row-btn${status === 'loading' ? ' loading' : status === 'added' ? ' added' : ''}`}
                  disabled={status === 'loading'}
                  onClick={() => handleAdd(product.variantId)}
                  aria-label={`Add ${product.title} to cart`}
                >
                  {status === 'loading' ? '...' : status === 'added' ? '✓ Added' : '+ Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default UpsellSection;
