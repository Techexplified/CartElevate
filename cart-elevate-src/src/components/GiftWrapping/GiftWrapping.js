/**
 * GiftWrapping.js
 *
 * Add-on toggle card for gift wrapping.
 * Identical pattern to PackageProtection — config driven, no hardcoded values.
 *
 * Future: selection state synced to cart attributes/order notes.
 */
import React from 'react';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { formatCurrency } from '../../utils/cartHelpers.js';

export function GiftWrapping() {
  const { settings, giftWrappingChecked, setGiftWrappingChecked } = useCartElevate();
  const config = settings?.giftWrapping;
  if (!config || !config.enabled) return null;

  const checked = giftWrappingChecked;
  const currencySymbol = settings?.currencySymbol || '$';

  const handleToggle = () => {
    const next = !checked;
    setGiftWrappingChecked(next);
    // TODO: sync to cart attributes or note attributes:
    // updateCartAttribute('gift_wrapping', next ? 'true' : 'false');
  };

  return (
    <div className="ce-section">
      <div
        className={`ce-addon-card${checked ? ' checked' : ''}`}
        onClick={handleToggle}
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => e.key === ' ' && handleToggle()}
      >
        <span className="ce-addon-icon">🎁</span>
        <div className="ce-addon-info">
          <p className="ce-addon-label">{config.label}</p>
          <p className="ce-addon-desc">{config.description}</p>
        </div>
        <div className="ce-addon-right">
          <span className="ce-addon-price">+{formatCurrency(config.price, currencySymbol)}</span>
          <div className="ce-addon-toggle" style={{ pointerEvents: 'none' }}>
            <input type="checkbox" checked={checked} readOnly aria-label={config.label} />
            <span className="ce-toggle-slider" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default GiftWrapping;
