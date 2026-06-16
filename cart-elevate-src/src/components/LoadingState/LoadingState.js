/**
 * LoadingState.js — Spinner shown while async data loads.
 */
import React from 'react';

/** @param {{ message?: string }} props */
export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="ce-loading">
      <div className="ce-loading-spinner" />
      {message}
    </div>
  );
}

export default LoadingState;
