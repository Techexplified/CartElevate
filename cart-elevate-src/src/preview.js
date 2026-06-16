/**
 * preview.js — Dev preview entry point.
 *
 * This renders CartElevatePreview into a standalone HTML page.
 * Run `npm run dev` inside the extension folder to use this.
 *
 * This is the primary development environment — no Shopify store needed.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CartElevatePreview } from './components/CartElevatePreview/CartElevatePreview.js';

const root = createRoot(document.getElementById('root'));
root.render(<CartElevatePreview />);
