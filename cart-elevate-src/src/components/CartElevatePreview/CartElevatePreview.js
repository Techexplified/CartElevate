/**
 * CartElevatePreview.js
 *
 * Standalone development preview component.
 * Simulates a merchant cart drawer using mock data.
 *
 * This is the PRIMARY development environment until real Shopify
 * cart APIs are connected. Run `npm run dev` and open the browser
 * to see all widgets rendering live.
 *
 * Features demonstrated:
 *  - Progress Bar
 *  - Reward Tier Tracker
 *  - Upsell Section
 *  - Package Protection
 *  - Gift Wrapping
 *
 * To simulate different cart states, change mockCart.total_price (cents).
 */
import React, { useState } from 'react';
import { CartElevateProvider } from '../../context/CartElevateContext.js';
import { CartElevateContainer } from '../CartElevateContainer/CartElevateContainer.js';
import { formatCurrency } from '../../utils/cartHelpers.js';
import '../../styles/cart-elevate.css';

/** Mock cart items for the preview cart UI */
const MOCK_ITEMS = [
  {
    id: 1,
    variant_id: 'mock-variant-1',
    title: 'Snowboard Pro',
    quantity: 1,
    price: 5000,
    image: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=60&h=60&fit=crop',
  },
  {
    id: 2,
    variant_id: 'mock-variant-2',
    title: 'Ski Poles',
    quantity: 2,
    price: 1297,
    image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=60&h=60&fit=crop',
  },
];

const CART_SUBTOTAL = 75.94; // Partway to tier 1 ($100)

/** Simulated cart total options for toggling different reward states */
const CART_PRESETS = [
  { label: '$75.94 — Approaching Tier 1', total: 7594 },
  { label: '$100.00 — Tier 1 Unlocked', total: 10000 },
  { label: '$125.00 — Between Tiers', total: 12500 },
  { label: '$155.00 — All Tiers Unlocked', total: 15500 },
];

/**
 * Mock cart item row in the preview UI (merchant's cart items — NOT CartElevate)
 */
function PreviewCartItem({ item }) {
  return (
    <div className="ce-preview-cart-item">
      <img className="ce-preview-item-img" src={item.image} alt={item.title} />
      <div className="ce-preview-item-info">
        <p className="ce-preview-item-title">{item.title}</p>
        <p className="ce-preview-item-qty">Qty: {item.quantity}</p>
      </div>
      <span className="ce-preview-item-price">
        {formatCurrency((item.price / 100) * item.quantity)}
      </span>
    </div>
  );
}

/**
 * CartElevatePreview
 *
 * Full preview shell simulating a merchant cart drawer.
 * Wraps CartElevateProvider in previewMode so no real Shopify
 * API calls are made.
 */
export function CartElevatePreview() {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const preset = CART_PRESETS[selectedPreset];

  const mockCart = {
    total_price: preset.total,
    item_count: 3,
    items: MOCK_ITEMS,
  };

  return (
    <div className="ce-page-preview">
      <div className="ce-page-preview-inner">
        {/* Preview header */}
        <div className="ce-page-title">
          <h1>CartElevate</h1>
          <p>Storefront Widget Preview</p>
          <span className="ce-dev-badge">⚠ Development Mode — Mock Data</span>
        </div>

        {/* Cart state simulator */}
        <div style={{ marginBottom: 16 }}>
          <select
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #e0e0e8',
              fontSize: 12,
              background: '#fff',
              color: '#1a1a2e',
              cursor: 'pointer',
            }}
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(Number(e.target.value))}
            aria-label="Simulate cart total"
          >
            {CART_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Merchant cart shell — CartElevate renders INSIDE this */}
        <CartElevateProvider previewMode={true} mockCart={mockCart}>
          <div className="ce-preview-shell">
            {/* Cart header (merchant owned) */}
            <div className="ce-preview-header">
              <span className="ce-preview-header-title">Your Cart</span>
              <span className="ce-preview-badge">CartElevate Active</span>
            </div>

            {/* Cart items (merchant owned) */}
            <div className="ce-preview-cart-items">
              {MOCK_ITEMS.map((item) => (
                <PreviewCartItem key={item.id} item={item} />
              ))}
            </div>

            {/* ↓ CartElevate widgets render here ↓ */}
            <div className="ce-preview-widgets">
              <CartElevateContainer />
            </div>

            {/* Cart footer (merchant owned) */}
            <div className="ce-preview-footer">
              <div className="ce-preview-total">
                <span>Subtotal</span>
                <span>{formatCurrency(preset.total / 100)}</span>
              </div>
              <button className="ce-checkout-btn">Proceed to Checkout →</button>
            </div>
          </div>
        </CartElevateProvider>
      </div>
    </div>
  );
}

export default CartElevatePreview;
