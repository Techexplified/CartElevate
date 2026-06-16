/**
 * UpsellCard.js
 *
 * Single product card in the upsell section.
 * Self-contained — receives product data via props.
 * Add-to-cart action comes from context.
 */
import React from 'react';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { formatCurrency } from '../../utils/cartHelpers.js';

/**
 * @param {{ product: object }} props
 */
export function UpsellCard({ product }) {
  const { addToCart, addedItems, settings } = useCartElevate();
  const currencySymbol = settings?.currencySymbol || '$';
  const status = addedItems[product.variantId];

  const handleAdd = () => {
    if (status === 'loading' || status === 'added') return;
    addToCart(product.variantId, 1);
  };

  return (
    <div className="ce-upsell-card">
      <img
        className="ce-upsell-img"
        src={product.image}
        alt={product.title}
        loading="lazy"
        onError={(e) => { e.target.style.background = '#e8e8f0'; e.target.src = ''; }}
      />
      <div className="ce-upsell-body">
        <p className="ce-upsell-name">{product.title}</p>
        <div className="ce-upsell-price-row">
          <span className="ce-upsell-price">{formatCurrency(product.price, currencySymbol)}</span>
          {product.compareAtPrice && (
            <span className="ce-upsell-compare">{formatCurrency(product.compareAtPrice, currencySymbol)}</span>
          )}
        </div>
        <button
          className={`ce-upsell-btn${status === 'loading' ? ' loading' : status === 'added' ? ' added' : ''}`}
          onClick={handleAdd}
          aria-label={`Add ${product.title} to cart`}
        >
          {status === 'loading' ? '...' : status === 'added' ? '✓ Added' : '+ Add'}
        </button>
      </div>
    </div>
  );
}

export default UpsellCard;
