/**
 * CartElevateContainer.js
 *
 * The inner layout container that wraps all CartElevate widgets.
 * Sits inside CartElevateProvider.
 * Applies the scoped .ce-root namespace to prevent theme CSS conflicts.
 *
 * In production: this is mounted into the merchant's cart DOM.
 * In dev: rendered inside CartElevatePreview.
 */
import React from 'react';
import { FeatureRenderer } from '../FeatureRenderer/FeatureRenderer.js';
import { useCartElevate } from '../../context/CartElevateContext.js';
import { LoadingState } from '../LoadingState/LoadingState.js';

export function CartElevateContainer() {
  const { loading, error, theme } = useCartElevate();

  // Log for debugging — remove once theme switching is confirmed
  const activeTheme = theme || 'dynamic';
  console.log('[CartElevate] Rendering with theme class: ce-theme--' + activeTheme);

  if (error) {
    console.error('[CartElevate] Error:', error);
    return null; // Silent fail — don't break merchant cart
  }

  if (loading) {
    return (
      <div className={`ce-root ce-theme--${activeTheme}`}>
        <LoadingState message="Loading CartElevate..." />
      </div>
    );
  }

  return (
    <div className={`ce-root ce-theme--${activeTheme}`}>
      {/* DEBUG BADGE — remove this div once theme is confirmed working */}
      <div style={{
        fontSize: '10px',
        fontWeight: '700',
        color: '#fff',
        background: activeTheme === 'dynamic' ? '#0f766e' : activeTheme === 'classic' ? '#374151' : '#059669',
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        marginBottom: '6px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        Theme: {activeTheme}
      </div>
      <FeatureRenderer />
    </div>
  );
}

export default CartElevateContainer;

