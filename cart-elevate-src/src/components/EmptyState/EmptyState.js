/**
 * EmptyState.js — Shown when a section has no content to render.
 */
import React from 'react';

/** @param {{ message?: string }} props */
export function EmptyState({ message = 'Nothing to show.' }) {
  return <div className="ce-empty">{message}</div>;
}

export default EmptyState;
