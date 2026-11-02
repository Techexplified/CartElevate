# CartElevate — Complete Technical Project Context

> **Last Updated**: October 2026  
> **Target Audience**: AI Agents, Core Engineers, and System Architects continuing development without prior chat context.  
> **Status**: Production / Active Development  
> **Project Root**: `d:\CodeWIthMe\Explified\shopify\CartElevate\CartElevate`

---

## 1. Executive Summary & Project Overview

### 1.1 Project Identity & Purpose
**CartElevate** is a high-performance, embedded Shopify application designed to turn standard Shopify slide-out cart drawers and cart pages into revenue-generating conversion engines.

In typical Shopify stores, the cart drawer is purely transactional. CartElevate transforms this critical funnel step by embedding dynamic upselling, automated discount tiers, progress thresholds, add-on services, and pre-checkout offers directly into the merchant's active theme drawer—**without requiring theme code edits or manual Liquid modifications**.

### 1.2 Problems Solved
1. **Cart Abandonment & Low Average Order Value (AOV)**: Shoppers leave without purchasing complementary goods or fail to hit free shipping thresholds.
2. **Theme Breakage & Invasive Code Changes**: Many cart apps edit theme Liquid templates (`cart-drawer.liquid`, `cart.liquid`), causing theme conflicts and broken stores upon uninstall. CartElevate runs as a non-invasive **Shopify Theme App Extension (App Embed)**.
3. **Discount Stacking & Shopify Platform Limits**: Managing tiered quantity discounts natively in Shopify often requires complex Scripts or Shopify Plus Functions. Standard Shopify stores are capped at 25 active automatic discounts (50 on Plus). CartElevate coordinates and tracks automatic discount allocations to prevent hitting Shopify API limits.
4. **Friction in Service Add-ons**: Charging for insurance (Package Protection) and Gift Wrapping usually requires complex custom line-item scripts. CartElevate automatically provisions real, hidden service products in the merchant's catalog and syncs prices dynamically via REST API.

### 1.3 Target Users
- **Shopify & Shopify Plus Merchants**: Store owners wanting higher AOV and checkout conversions without custom developer work.
- **E-Commerce Agencies & Operations Teams**: Teams needing reliable branding customizability, tiered volume discounting, and post-purchase upsells that respect native Shopify checkout rules.

### 1.4 Core Architecture & System Topology
```
┌───────────────────────────────────────────────────────────────────────────┐
│                           STOREFRONT THEME                                │
│                                                                           │
│   extensions/cart-elevate/blocks/app-embed.liquid                         │
│   ├── Injected Liquid Globals (window.CartElevate*)                       │
│   ├── Core Cart Hub: cart-elevate.js (Fetch/XHR/DOM Mutation Interceptor) │
│   └── 6 Feature Scripts (Branding, Shipping Bar, Recommendations,        │
│       Bundles, Protection/Wrapping, Post-Purchase)                        │
└──────────────────────┬───────────────────────────────▲────────────────────┘
                       │ Storefront API Calls          │ DOM Injection &
                       │ (GET / POST /api/*)           │ Native /cart/add.js
                       ▼                               │
┌───────────────────────────────────────────────────────────────────────────┐
│                        CARTELEVATE BACKEND ENGINE                         │
│                                                                           │
│   React Router v7 + Vite Embedded App (@shopify/shopify-app-react-router) │
│   ├── Loaders & Actions (/app/*, /api/*, /webhooks/*)                     │
│   ├── Authentication Layer (authenticate.admin / unauthenticated.admin)   │
│   ├── Services:                                                           │
│   │   ├── discount.server.js (Automatic BXGY/Basic/FreeShipping Sync)     │
│   │   └── protection-wrapping.server.js (Service Product Provisioner)     │
└──────────────┬───────────────────────────────────────────────┬────────────┘
               │                                               │
               ▼                                               ▼
┌──────────────────────────────┐              ┌─────────────────────────────┐
│  DATABASE (Neon PostgreSQL)  │              │    SHOPIFY ADMIN GRAPHQL    │
│                              │              │          & REST API         │
│  - Session (OAuth tokens)    │              │                             │
│  - Settings (Onboarding)     │              │  - Shop Metafields (Config) │
│  - CartDrawerBranding        │              │  - Automatic Discounts GQL  │
│  - ShippingProgressBar       │              │  - Products & Variants GQL  │
│                              │              │  - Sales Channel Publishing │
└──────────────────────────────┘              └─────────────────────────────┘
```

---

## 2. Technology Stack & Runtime Configuration

| Layer | Technology | Version | Rationale |
| :--- | :--- | :--- | :--- |
| **Framework** | React Router | `7.12.0` | Powers both the embedded admin UI and server-side API endpoints (`@react-router/node`, `@react-router/fs-routes`). |
| **Frontend UI** | React | `18.3.1` | Used for embedded admin dashboard, feature configurators, and interactive live preview. |
| **Styling** | TailwindCSS + Vanilla CSS | `3.4.19` | TailwindCSS powers the admin UI; Vanilla CSS is used for storefront Theme App Extensions to avoid CSS conflicts. |
| **Build Tool** | Vite | `6.3.6` | Fast HMR development and optimized production builds. |
| **Shopify SDK** | `@shopify/shopify-app-react-router` | `1.1.0` | Official Shopify SDK providing App Bridge, session management, webhooks, and Admin GraphQL clients. |
| **Shopify App Bridge**| `@shopify/app-bridge-react` | `4.1.6` | Seamless embedding inside Shopify Admin with navigation and native modals. |
| **ORM** | Prisma Client | `6.16.3` | Schema management and type-safe relational database access. |
| **Database** | PostgreSQL (Neon Serverless) | Serverless | Scalable serverless database connecting over pooled port 5432. |
| **Storefront Extension**| Shopify Theme App Extension | CLI 3.x | App Embed block targeting `body` with native zero-runtime JavaScript. |

### 2.1 Application Entry Points
1. **Embedded Admin Dashboard**: `app/routes/app.jsx` wrapping `app/routes/app._index.jsx`.
2. **Public Storefront APIs**: `app/routes/api.*.jsx` responding with permissive CORS headers for storefront AJAX consumption.
3. **Storefront Embed Block**: `extensions/cart-elevate/blocks/app-embed.liquid` rendered directly by Shopify into the merchant theme.
4. **Shopify Webhooks**: `app/routes/webhooks.*.jsx` listening for app uninstallation and scope updates.

---

## 3. Complete Feature Documentation

### Feature 1: Store Onboarding & Currency Sync
- **Purpose**: Welcomes newly installed merchants, verifies database connectivity, fetches the store's primary currency code from Shopify Admin, and establishes the store settings record.
- **Workflow**:
  1. Merchant installs CartElevate from Shopify App Store.
  2. Shopify redirects to `/app`. Dashboard loader queries `prisma.settings.findUnique({ where: { shop } })`.
  3. If `!settings || !settings.isOnboarded`, loader immediately redirects to `/app/onboarding`.
  4. Onboarding wizard renders:
     - **Step 1**: Welcome overview highlighting AOV improvement, setup guide, and 1-click store connect button.
     - **Step 2**: Feature tour showcasing Branding, Shipping Bar, Volume Discounts, Recommendations, and Protection.
  5. Merchant clicks **Connect Store**. Form submits `intent=connect_store`.
  6. Action executes GraphQL query `query { shop { currencyCode } }`, writes `is_onboarded = true` and `currency = currencyCode` to `settings` table, and redirects to `/app`.
- **Implementation**:
  - Frontend: `app/routes/app.onboarding.jsx`
  - Database: `Settings` model (`settings` table)
  - GraphQL: `query GetShopCurrency { shop { currencyCode } }`
- **Current Status**: Complete and operational.

---

### Feature 2: Cart Drawer Branding & Layout Positioning
- **Purpose**: Gives merchants full visual control over their cart drawer header, accent color, brand logo, and positioning (left vs. right).
- **Workflow**:
  1. Merchant navigates to `/app/CartDrawerBranding`.
  2. Current settings load from PostgreSQL (`cart_drawer_branding` table) with fallback to defaults:
     - Accent Color: `#F95738`
     - Drawer Position: `right`
     - Cart Title: `Your Cart`
  3. Merchant customizes the palette using interactive hex inputs, quick-select swatches, uploads/pastes a brand logo URL, and toggles drawer alignment between **Left** and **Right**.
  4. Form submission persists changes to both PostgreSQL and the Shopify Shop Metafield (`cart_elevate.branding`).
  5. On the storefront, `feature-cart-branding.js`:
     - Reads `window.CartElevateBranding`.
     - Sets CSS custom property `--ce-accent-color: #accentColor`.
     - Toggles `ce-drawer-left` and `ce-drawer-right` classes on `document.body`.
     - Detects drawer headers (`.drawer__header`, `.cart-drawer__header`, etc.) and injects the custom logo or branded SVG cart badge alongside the live item count.
- **Implementation**:
  - Admin UI: `app/routes/app.CartDrawerBranding.jsx`
  - Storefront Script: `extensions/cart-elevate/assets/feature-cart-branding.js`
  - Storefront CSS: `extensions/cart-elevate/assets/feature-cart-branding.css`
  - Public API: `app/routes/api.branding.jsx`
  - Database: `CartDrawerBranding` model (`cart_drawer_branding` table)
  - Metafield: `cart_elevate.branding`
- **Current Status**: Complete and operational.

---

### Feature 3: Shipping & Free Gift Progress Bar
- **Purpose**: Motivates shoppers to increase cart value by showing real-time progress toward Free Shipping, a Free Promotional Gift, or both.
- **Workflow**:
  1. Merchant configures goals on `/app/s-a-g-p-b`:
     - **Goal Type**: `free_shipping`, `free_gift`, or `both`.
     - **Thresholds**: E.g., Free Shipping at $75, Free Gift at $120.
     - **Gift Selector**: Merchant selects a catalog product from their store using Shopify Resource Picker or selects from the pre-built gift library.
     - **Message Template**: E.g., `Add {amount} more for free shipping`.
  2. When saved:
     - The threshold is synchronized to Shopify's native checkout via `syncFreeShippingAutomaticDiscount` in `app/services/discount.server.js`.
     - An automatic discount node (`DiscountAutomaticFreeShipping`) is created or updated in Shopify.
     - Settings are stored in PostgreSQL (`shipping_progress_bar` table) and Shopify Metafield (`cart_elevate.shipping_bar`).
  3. Storefront behavior (`feature-shipping-bar.js`):
     - Listens to `cartelevate:cart-updated` custom events dispatched by the core cart hub.
     - Computes `amountRemaining = threshold - currentSubtotal`.
     - Renders an animated progress bar fill at `#cart-elevate-root` at the top of the cart drawer.
     - When the goal is reached, the text updates to congratulations (e.g., `You unlocked Free Shipping!`).
- **Implementation**:
  - Admin UI: `app/routes/app.s-a-g-p-b.jsx`
  - Discount Service: `app/services/discount.server.js` (`syncFreeShippingAutomaticDiscount`)
  - Storefront Script: `extensions/cart-elevate/assets/feature-shipping-bar.js`
  - Storefront CSS: `extensions/cart-elevate/assets/feature-shipping-bar.css`
  - Public API: `app/routes/api.shipping-bar.jsx`
  - Database: `ShippingProgressBar` model (`shipping_progress_bar` table)
  - Metafield: `cart_elevate.shipping_bar`
- **Current Status**: Complete and operational.

---

### Feature 4: Dynamic Multi-Set Recommendations
- **Purpose**: Displays smart product recommendation carousels inside the cart drawer based on customizable rule sets.
- **Supported Recommendation Logics**:
  1. `Frequently bought together`: Leverages Shopify's standard recommendation engine (`/recommendations/products.json?product_id={id}&limit={n}`).
  2. `Same collection`: Automatically resolves the collection of the item in the cart via `/api/recommendations?action=same_collection` and recommends other active products from that same collection.
  3. `Curated Recommendations`: Recommends explicit product IDs handpicked by the merchant.
  4. `Highest margin products`: Prioritizes designated high-margin catalog items.
- **Workflow**:
  1. Merchant creates/edits recommendation sets at `/app/recommendation` and `/app/newRecomendation`.
  2. Configures set title, number of products displayed (1–5), exclusion rules (e.g. exclude "Gift cards" or "Sale items"), and priority ranking.
  3. Config is written to `shop.metafields.cartelevate.recommendations`.
  4. On storefront (`feature-recommendations.js`):
     - Mounts `#ce-recommendations-root` below cart items.
     - Evaluates active cart items against published sets in rank order.
     - Renders product cards with image, title, price, compare-at price, and dynamic variant selector.
     - Clicking **Add** calls `/cart/add.js`, triggers a loading spinner, displays a checkmark confirmation, and fires a cart refresh.
- **Implementation**:
  - Admin UI: `app/routes/app.recommendation.jsx`, `app/routes/app.newRecomendation.jsx`
  - Storefront Script: `extensions/cart-elevate/assets/feature-recommendations.js`
  - Storefront CSS: `extensions/cart-elevate/assets/feature-recommendations.css`
  - Public API: `app/routes/api.recommendations.jsx`
  - Metafield: `cartelevate.recommendations`
- **Current Status**: Complete and operational.

---

### Feature 5: Volume Discount Tiers & Bundle Upsells
- **Purpose**: Encourages multi-unit purchasing by configuring quantity-based tiered discounts (e.g., Buy 2 get 10% off, Buy 3 get 15% off, Buy 5 get 20% off).
- **Automatic Shopify Discount Sync**:
  - Shopify limits active automatic discounts to **25** on standard plans and **50** on Shopify Plus.
  - CartElevate's discount engine (`app/services/discount.server.js`) creates actual `DiscountAutomaticBasic` rules in Shopify checkout for each tier.
  - Checks remaining discount slots before publishing to guarantee merchants never exceed Shopify limits.
  - Scopes discounts to:
    - **All products**
    - **Specific products** (resolves product GIDs)
    - **Specific collection** (resolves collection GIDs)
- **Storefront Experience (`feature-bundles.js`)**:
  - Monitors cart quantities for eligible items.
  - Displays a **Progress Banner** inside the cart drawer (e.g., `Buy 1 more to save 15%!`).
  - Displays **Tier Badges** on cart line items.
  - Calculates and renders a **Savings Summary** in the cart drawer footer showing total dollars saved before checkout.
- **Implementation**:
  - Admin UI: `app/routes/app.bundleAndDiscount.jsx`, `app/routes/app.createNewBundle.jsx`
  - Discount Service: `app/services/discount.server.js` (`syncBundleVolumeAutomaticDiscounts`)
  - Storefront Script: `extensions/cart-elevate/assets/feature-bundles.js`
  - Storefront CSS: `extensions/cart-elevate/assets/feature-bundles.css`
  - Metafield: `cartelevate.bundles`
- **Current Status**: Complete and operational.

---

### Feature 6: Order Protection & Gift Wrapping
- **Purpose**: Monetizes cart fulfillment with 1-click upsells for package insurance and gift wrapping directly above the checkout button.
- **How It Works (Hidden Service Products Engine)**:
  1. Standard storefront cart APIs (`/cart/add.js`) will **reject** any item that is not a published, active product variant.
  2. CartElevate solves this by automatically querying and provisioning two real service products in the merchant's catalog:
     - `[CartElevate] Package Protection` (tagged `_cartelevate_service`, `cartelevate-protection`)
     - `[CartElevate] Gift Wrapping` (tagged `_cartelevate_service`, `cartelevate-gift-wrapping`)
  3. The service (`app/services/protection-wrapping.server.js`) publishes both products to the **Online Store sales channel** via REST/GraphQL.
  4. Pricing modes:
     - **Gift Wrapping**: Flat fee (e.g. $4.00 per order or per item), optional gift note textarea synced to Shopify cart attributes (`attributes[Gift Note]`).
     - **Package Protection**: Flat fee (e.g. $1.99) or dynamic percentage (e.g. 2% of cart subtotal).
     - For dynamic percentage pricing, storefront calls `POST /api/protection-wrapping` with `{ action: 'update-price', variantId, price }`. The backend updates the variant price via REST API before the item is added to the cart!
- **Storefront Experience (`feature-protection-wrapping.js`)**:
  - Locates the checkout button (`#CartDrawer-Checkout`, `button[name="checkout"]`, etc.) and inserts `#ce-protection-wrapping-root` immediately above it.
  - Renders checkbox toggles with real-time price labels.
  - Checking the box executes `/cart/add.js`. Unchecking executes `/cart/change.js?quantity=0`.
- **Implementation**:
  - Admin UI: `app/routes/app.protectionAndWrapping.jsx`
  - Backend Service: `app/services/protection-wrapping.server.js`
  - Public API: `app/routes/api.protection-wrapping.jsx`
  - Storefront Script: `extensions/cart-elevate/assets/feature-protection-wrapping.js`
  - Storefront CSS: `extensions/cart-elevate/assets/feature-protection-wrapping.css`
  - Metafield: `cartelevate.protection_wrapping`
- **Current Status**: Complete and operational.

---

### Feature 7: Pre-Checkout / Post-Purchase 1-Click Upsell Interceptor
- **Purpose**: Catches shoppers at peak purchase intent by intercepting the checkout button click and presenting a high-converting 1-click offer modal before redirecting to Shopify Checkout.
- **Discount Safety & Auto-Expiry**:
  - To prevent customers from obtaining discounted items during normal browsing, the Shopify Automatic Discount is created in a **DEACTIVATED** state.
  - The discount has an auto-expiration window of **30 minutes** (`POST_PURCHASE_DISCOUNT_TTL_MS = 30 * 60 * 1000`).
  - When the customer clicks **Add to Order** in the modal:
    1. Modal calls `GET /api/post-purchase?action=activate`.
    2. Backend activates the Shopify automatic discount (`discountAutomaticActivate`) and refreshes its `endsAt` timestamp.
    3. Storefront adds the item to the cart via `/cart/add.js` with property `{ properties: { _cartelevate_ppo: "true" } }`.
    4. Storefront immediately redirects the customer to `/checkout`.
  - If the customer declines or closes the modal, the checkout click proceeds normally without adding the offer.
- **Implementation**:
  - Admin UI: `app/routes/app.postPurchase.jsx`, `app/routes/app.createNewPostPurchaseOffer.jsx`
  - Discount Service: `app/services/discount.server.js` (`syncPostPurchaseAutomaticDiscount`, `activatePostPurchaseDiscount`, `deactivatePostPurchaseDiscount`)
  - Public API: `app/routes/api.post-purchase.jsx`
  - Storefront Script: `extensions/cart-elevate/assets/feature-post-purchase.js`
  - Storefront CSS: `extensions/cart-elevate/assets/feature-post-purchase.css`
  - Metafield: `cartelevate.post_purchase`
- **Current Status**: Complete and operational.

---

### Feature 8: Analytics & Conversion Dashboard
- **Purpose**: Displays KPI cards and feature-by-feature revenue attribution across configurable timeframes (`Today`, `Last 7 days`, `Last 30 days`, `Last 90 days`, `All time`).
- **Metrics Tracked in UI**:
  - **Upsell Impressions**: Number of times an upsell or progress bar was viewed.
  - **Acceptance Rate**: Percentage of viewers who accepted an upsell.
  - **Attributed Revenue**: Revenue from orders containing an accepted CartElevate offer.
  - **Average Order Value (AOV)**: Overall store health metric.
  - **Performance by Feature Table**: Breakdown for `Shipping and gift bar`, `Recommendations`, and `Post purchase offer`.
- **Implementation**:
  - Admin UI: `app/routes/app.analytics.jsx`
  - Database Models: `analytics_events` and `converted_orders` tables exist in migration SQL.
- **Current Status & Technical Finding**:
  - The frontend UI matches the merchant specifications with period pickers, metric cards, trend arrows, and informational tooltips.
  - **Notice**: Currently, `app.analytics.jsx` renders structured baseline dataset constants (`PERIOD_DATA`), and `extensions/cart-elevate/assets/cart-elevate.js` does not yet expose an active `window.CartElevate.trackEvent()` dispatcher. Real-time event ingestion pipeline is planned for the next development phase (see §10 & §13).

---

### Feature 9: Interactive Live Cart Preview
- **Purpose**: Provides merchants with an instant, interactive simulator of their cart drawer inside the admin dashboard without needing to open the storefront.
- **Capabilities**:
  - Live simulation of header branding, accent color, and logo.
  - Interactive stepper to increment/decrement item quantities.
  - Dynamic Shipping Bar recalculating remaining amount and fill percentage in real-time.
  - Volume discount badge and bundle savings updates.
  - Checkbox toggles for Package Protection and Gift Wrapping updating subtotal dynamically.
  - Device toggle between **Desktop** (420px drawer) and **Mobile** (360px viewport).
- **Implementation**:
  - Component: `app/components/LiveCartPreview.jsx`
  - Integrated in: `app/routes/app._index.jsx`
- **Current Status**: Complete and operational.

---

### Feature 10: Help Center & Merchant Support (Contact Us)
- **Purpose**: In-app FAQ accordion and dedicated customer support email channel for merchant inquiries.
- **Implementation**:
  - Route: `app/routes/app.contact-us.jsx`
  - Redirect Shim: `app/routes/contact-us.jsx`
- **Current Status**: Complete and operational.

---

## 4. Frontend Architecture & Design System

### 4.1 Routing Structure (React Router v7)
CartElevate uses flat-file routing based on React Router v7 (`@react-router/fs-routes`):
```
app/routes/
├── _index/                     <- Unauthenticated root fallback
│   ├── route.jsx               <- Redirects to /app?shop=...
│   └── styles.module.css
├── auth.login/                 <- Standalone login screen
│   ├── route.jsx
│   └── error.server.jsx
├── auth.$.jsx                  <- OAuth callback handler
├── app.jsx                     <- App Bridge Layout wrapper (<AppProvider>, <LoadingProvider>)
├── app._index.jsx              <- Main Dashboard (Feature cards, KPIs, Live Preview)
├── app.onboarding.jsx          <- Merchant onboarding wizard
├── app.CartDrawerBranding.jsx  <- Header, logo, and drawer position configurator
├── app.s-a-g-p-b.jsx           <- Shipping and Gift Progress Bar configurator
├── app.recommendation.jsx      <- Recommendation sets list
├── app.newRecomendation.jsx    <- Recommendation set builder
├── app.bundleAndDiscount.jsx   <- Volume discount bundles list
├── app.createNewBundle.jsx     <- Volume discount builder
├── app.protectionAndWrapping.jsx <- Protection & Gift Wrapping configurator
├── app.postPurchase.jsx        <- Post-purchase offers list
├── app.createNewPostPurchaseOffer.jsx <- Post-purchase offer builder
├── app.analytics.jsx           <- Store analytics dashboard
├── app.contact-us.jsx          <- FAQ and support page
├── api.*.jsx                   <- Public storefront API endpoints (see §5)
├── webhooks.*.jsx              <- Shopify webhook handlers (see §5)
└── [compatibility shims].jsx   <- Redirects top-level routes to /app/*
```

### 4.2 Layouts & Contexts
- **App Wrapper (`app/routes/app.jsx`)**:
  - Initializes Shopify App Bridge using the API key passed from loader.
  - Mounts `<LoadingProvider>` from `app/components/LoadingContext.jsx`.
  - Defines global top navigation links (`Dashboard` -> `/app`, `Analytics` -> `/app/analytics`).
  - Implements `ErrorBoundary` and `HydrateFallback` for seamless loading states.
- **Loading Overlay (`app/components/LoadingScreen.jsx`)**:
  - Global branded loading animation rendered during asynchronous navigations and save operations.

### 4.3 Styling System
- **Admin UI**: Styled exclusively with TailwindCSS 3.4 using standard Polaris-inspired neutral palettes (`#F6F6F7`, `#202223`, `#6D7175`, `#E5E7EB`) with CartElevate's signature accent color (`#F95738`).
- **Storefront Widgets**: Styled with scoped Vanilla CSS files (`feature-*.css`) with strict class names (`ce-*`) to prevent styling bleed into merchant themes.

---

## 5. Backend Architecture & API Specification

### 5.1 Server Initialization & Middleware
- **`app/shopify.server.js`**:
  - Configures `@shopify/shopify-app-react-router` with API version `2025-01`.
  - Session storage powered by `PrismaSessionStorage(prisma)`.
  - Scopes: `write_products,write_metaobjects,write_metaobject_definitions,read_themes,read_orders,write_discounts`.
  - Exposes `authenticate.admin`, `authenticate.webhook`, `login`, and `unauthenticated.admin`.
- **`app/db.server.js`**:
  - Prisma client singleton with global caching to prevent exhausting PostgreSQL connection pools during development HMR.

### 5.2 Storefront Public API Endpoints
All storefront endpoints return permissive CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`) to allow AJAX consumption from merchant storefront domains.

#### 1. `GET /api/branding?shop={shop}`
- **Purpose**: Returns cart header branding, accent color, and drawer alignment.
- **Response**:
  ```json
  {
    "success": true,
    "branding": {
      "logoUrl": "https://cdn.shopify.com/...",
      "accentColor": "#F95738",
      "cartTitle": "Your Cart",
      "drawerPosition": "right"
    }
  }
  ```
- **Source**: `app/routes/api.branding.jsx`

#### 2. `GET /api/shipping-bar?shop={shop}`
- **Purpose**: Returns shipping progress bar threshold rules, goal type, and gift product variant.
- **Response**:
  ```json
  {
    "success": true,
    "settings": {
      "goalType": "both",
      "shippingThreshold": 75.0,
      "giftThreshold": 120.0,
      "messageBeforeGoal": "Add {amount} more for free shipping",
      "giftProductId": "gid://shopify/Product/123",
      "giftVariantId": "gid://shopify/ProductVariant/456",
      "currency": "USD",
      "currencySymbol": "$"
    }
  }
  ```
- **Source**: `app/routes/api.shipping-bar.jsx`

#### 3. `GET /api/recommendations?shop={shop}&action={action}&product_id={productId}`
- **Purpose**:
  - If `action=same_collection`: Queries Shopify Admin GraphQL using offline token via `unauthenticated.admin(shop)` to resolve the parent collection and return related catalog products.
  - Default: Returns active recommendation set configurations.
- **Source**: `app/routes/api.recommendations.jsx`

#### 4. `GET /api/protection-wrapping?shop={shop}` & `POST /api/protection-wrapping`
- **GET**: Returns protection and gift wrapping configuration and service product IDs.
- **POST**: Action `{ action: 'update-price', shop, variantId, price }`.
  - Uses the offline session access token to execute a REST API `PUT` to `/admin/api/2025-01/variants/{id}.json`, updating the Package Protection line item price dynamically to match the cart's percentage fee.
- **Source**: `app/routes/api.protection-wrapping.jsx`

#### 5. `GET /api/post-purchase?shop={shop}&action={action}`
- **Purpose**:
  - `action=activate`: Activates the Shopify Automatic Discount for the active pre-checkout offer and sets a 30-minute auto-expiration window.
  - `action=deactivate`: Deactivates the automatic discount.
  - Default: Returns the published offer details and variant pricing.
- **Source**: `app/routes/api.post-purchase.jsx`

### 5.3 Webhook Handlers
- **`POST /webhooks/app/uninstalled`** (`app/routes/webhooks.app.uninstalled.jsx`):
  - Authenticated via `authenticate.webhook(request)`.
  - Deletes all sessions associated with the uninstalled shop: `prisma.session.deleteMany({ where: { shop } })`.
- **`POST /webhooks/app/scopes_update`** (`app/routes/webhooks.app.scopes_update.jsx`):
  - Updates the stored session scope string when app permissions change.

---

## 6. Database Architecture & Metafield Storage Model

### 6.1 Relational Database (Neon PostgreSQL via Prisma)

```
                 ┌────────────────────────────────────────────────┐
                 │                    Session                     │
                 ├────────────────────────────────────────────────┤
                 │ id: String [PK]                                │
                 │ shop: String                                   │
                 │ state: String                                  │
                 │ isOnline: Boolean                              │
                 │ accessToken: String                            │
                 │ scope: String?                                 │
                 │ expires: DateTime?                             │
                 └────────────────────────────────────────────────┘

┌────────────────────────────────┐              ┌────────────────────────────────┐
│            Settings            │              │       CartDrawerBranding       │
├────────────────────────────────┤              ├────────────────────────────────┤
│ shop: String [PK]              │              │ id: String [PK, cuid]          │
│ is_onboarded: Boolean          │              │ shop: String [UNIQUE]          │
│ currency: String               │              │ logo_url: String?              │
│ created_at: DateTime           │              │ accent_color: String           │
│ updated_at: DateTime           │              │ drawer_position: String        │
└────────────────────────────────┘              │ created_at: DateTime           │
                                                │ updated_at: DateTime           │
┌────────────────────────────────┐              └────────────────────────────────┘
│      ShippingProgressBar       │
├────────────────────────────────┤
│ id: String [PK, cuid]          │
│ shop: String [UNIQUE]          │
│ goal_type: String              │
│ shipping_threshold: Float      │
│ gift_threshold: Float          │
│ message_before_goal: String    │
│ discount_id: String?           │
│ gift_product_id: String?       │
│ gift_variant_id: String?       │
│ gift_product_title: String?    │
│ gift_product_image: String?    │
│ gift_product_price: Float?     │
│ gift_discount_id: String?      │
│ gift_quantity: Int             │
│ created_at: DateTime           │
│ updated_at: DateTime           │
└────────────────────────────────┘
```

### 6.2 Shopify Shop Metafields Schema
Storefront extension scripts require sub-millisecond access to configuration without waiting for database roundtrips. CartElevate achieves this by syncing all core configs into **Shop Metafields**:

| Metafield Namespace | Key | Type | Content / Structure |
| :--- | :--- | :--- | :--- |
| `cart_elevate` | `branding` | `json` | `{ accentColor, logoUrl, drawerPosition, cartTitle }` |
| `cart_elevate` | `shipping_bar` | `json` | `{ goalType, shippingThreshold, giftThreshold, messageBeforeGoal, giftProductId, giftVariantId }` |
| `cartelevate` | `recommendations` | `json` | `{ sets: [ { id, name, status, logic, numberShown, sectionTitle, excludeCollections, products } ] }` |
| `cartelevate` | `bundles` | `json` | `{ bundles: [ { id, name, status, appliesTo, tiers: [ { buyQty, discountPercent } ], shopifyDiscountIds } ] }` |
| `cartelevate` | `protection_wrapping` | `json` | `{ protection: { enabled, priceType, flatFee, percentage }, giftWrapping: { enabled, price, allowGiftNote }, serviceProductIds }` |
| `cartelevate` | `post_purchase` | `json` | `{ offers: [ { id, name, status, productId, variantId, discountPercentage, headline, showTimer, discountId } ] }` |

---

## 7. Authentication, Authorization & Security

1. **OAuth 2.0 & Token Exchange**: Handled natively by `@shopify/shopify-app-react-router`. Offline session tokens are stored in the PostgreSQL `Session` table.
2. **Access Scopes**:
   - `write_products`: Used to provision hidden service products and update variant prices.
   - `write_discounts`: Used to manage automatic volume tiers and free shipping rules.
   - `write_metaobjects`, `write_metaobject_definitions`: For custom store data objects.
   - `read_themes`: To inspect theme configurations.
   - `read_orders`: Required for upsell revenue attribution.
3. **Storefront Security & CORS**:
   - Storefront APIs (`/api/*`) accept public requests but **never expose secret tokens or private customer data**.
   - Offline Admin API operations from public endpoints are executed exclusively using `unauthenticated.admin(shop)`, which validates that a valid session exists for that shop in the local database.
4. **Environment Security**: Secret keys (`SHOPIFY_API_SECRET`, database passwords) must remain strictly in environment variables and are never committed to version control.

---

## 8. Important End-to-End Workflows

### 8.1 Merchant Volume Bundle Creation Workflow
```
[Merchant UI: /app/createNewBundle]
       │
       ▼ (Form Submission)
[app/routes/app.createNewBundle.jsx (action)]
       │
       ├─► 1. Query Shopify active discounts count via GraphQL
       │      Validate: (usedSlots + bundleTiers <= platformLimit (25 or 50))
       │
       ├─► 2. Call syncBundleVolumeAutomaticDiscounts() in discount.server.js
       │      ├── Delete obsolete discount nodes (discountAutomaticDelete)
       │      └── For each tier: Execute discountAutomaticBasicCreate
       │            - startsAt: now - 60s
       │            - minimumRequirement: quantity >= buyQty
       │            - customerGets: percentage = discountPercent / 100
       │            - combinesWith: orderDiscounts=true, shippingDiscounts=true
       │
       ├─► 3. Save bundle config & discount IDs to shop.metafield(cartelevate.bundles)
       │
       └─► 4. Redirect to /app/bundleAndDiscount
```

### 8.2 Storefront Cart Interaction & Hub Sync Workflow
```
[User clicks "Add to Cart" or modifies quantity in Theme]
       │
       ▼
[extensions/cart-elevate/assets/cart-elevate.js]
       │
       ├─► Intercepts window.fetch / XMLHttpRequest (/cart/add, /cart/change)
       ├─► Debounces and executes fetch('/cart.js')
       ├─► Updates count, cartTotal, and cartCurrency
       │
       ▼ Dispatches CustomEvent: 'cartelevate:cart-updated'
       │
       ├─► [feature-shipping-bar.js]
       │      Recalculates progress percentage & updates progress bar text
       │
       ├─► [feature-bundles.js]
       │      Evaluates eligible quantities & updates progress banner and savings summary
       │
       ├─► [feature-recommendations.js]
       │      Refreshes recommended items & excludes items already in cart
       │
       └─► [feature-protection-wrapping.js]
              Recalculates percentage-based protection fee if cart total changed
```

### 8.3 Pre-Checkout Upsell Intercept Workflow
```
[Customer clicks "Checkout" in Theme Cart Drawer]
       │
       ▼
[feature-post-purchase.js: click listener on CHECKOUT_SELECTOR]
       │
       ├─► Event paused: e.preventDefault() & e.stopPropagation()
       ├─► Modal rendered with countdown timer and special discount offer
       │
       ├──► CASE A: Customer clicks "Add to Order"
       │      │
       │      ├─► Calls GET /api/post-purchase?action=activate
       │      │      └── Backend activates Shopify automatic discount node
       │      ├─► Calls /cart/add.js with offer variant & {_cartelevate_ppo: true}
       │      └─► Executes window.location.href = '/checkout'
       │
       └──► CASE B: Customer clicks "No thanks" or closes modal
              │
              └─► Executes window.location.href = '/checkout' directly
```

---

## 9. Environment & Setup Instructions

### 9.1 Prerequisites
- **Node.js**: v18.20.0 or higher (v20+ recommended).
- **Package Manager**: npm v9+.
- **Shopify CLI**: `@shopify/cli` v3.x.
- **Database**: PostgreSQL database (Neon Serverless PostgreSQL).

### 9.2 Environment Variables (`.env`)
Create a `.env` file in the project root with the following keys:
```bash
# Shopify App Credentials (from Shopify Partners Dashboard)
SHOPIFY_API_KEY="your_shopify_client_id"
SHOPIFY_API_SECRET="your_shopify_client_secret"
SHOPIFY_APP_URL="https://your-tunnel-or-domain.com"
SCOPES="write_products,write_metaobjects,write_metaobject_definitions,read_themes,read_orders,write_discounts"

# Database Connection (Neon Serverless PostgreSQL pooled connection string)
DATABASE_URL="postgresql://username:password@ep-pooler.region.neon.tech/neondb?sslmode=require"

# Application Port
PORT=3000
```

### 9.3 Verified Terminal Commands
```bash
# 1. Install dependencies
npm install

# 2. Run Prisma migrations and generate client
npx prisma generate
npx prisma migrate dev

# 3. Start local development server with Shopify CLI tunnel
npm run dev

# 4. Build application for production
npm run build

# 5. Deploy Shopify extensions
npm run deploy
```

---

## 10. Current Development Status

| Feature / Module | Implementation Status | Verification Details | Notes / Next Steps |
| :--- | :--- | :--- | :--- |
| **Store Onboarding** | **Complete** | Verified in `app.onboarding.jsx` & `prisma.settings`. | Fetches currency, marks `is_onboarded: true`. |
| **Cart Branding** | **Complete** | Verified in `app.CartDrawerBranding.jsx` & `feature-cart-branding.js`. | Dual persistence (DB + Metafield). Left/right alignment functional. |
| **Shipping Progress Bar** | **Complete** | Verified in `app.s-a-g-p-b.jsx`, `discount.server.js`, and `feature-shipping-bar.js`. | Free Shipping syncs to Shopify Checkout discounts automatically. |
| **Multi-Set Recommendations** | **Complete** | Verified in `app.newRecomendation.jsx`, `api.recommendations.jsx`, and `feature-recommendations.js`. | Supports 4 recommendation engines with collections exclusion. |
| **Volume Discount Bundles** | **Complete** | Verified in `app.createNewBundle.jsx`, `discount.server.js`, and `feature-bundles.js`. | Validates Shopify 25/50 discount slot limit. Syncs tiers to Checkout. |
| **Protection & Gift Wrapping** | **Complete** | Verified in `app.protectionAndWrapping.jsx`, `protection-wrapping.server.js`, and `feature-protection-wrapping.js`. | Hidden products created, published to Online Store, variant prices updated via REST. |
| **Pre-Checkout Upsell (PPO)** | **Complete** | Verified in `app.createNewPostPurchaseOffer.jsx`, `api.post-purchase.jsx`, and `feature-post-purchase.js`. | 1-click modal interceptor with 30-min auto-expiring discount activation. |
| **Live Cart Preview** | **Complete** | Verified in `LiveCartPreview.jsx`. | Desktop/mobile simulation matching user specifications. |
| **Contact Us / Support FAQ** | **Complete** | Verified in `app.contact-us.jsx`. | Interactive FAQ accordion and support contact details. |
| **Analytics Dashboard UI** | **Complete** | Verified in `app.analytics.jsx`. | Visual cards, trend indicators, period filters, and tooltips. |
| **Analytics Storefront Ingestion**| **Partially Implemented** | Database tables (`analytics_events`, `converted_orders`) exist in migrations; `cart-elevate.js` currently lacks active `trackEvent` dispatcher. | Connect storefront event emitter (`trackEvent`) to record live merchant conversions. |
| **Order Webhook Handler** | **Planned / Incomplete** | Subscribed in `shopify.app.toml` (`/webhooks/orders/create`), but route file is missing in `app/routes/`. | Create `app/routes/webhooks.orders.create.jsx` to calculate revenue attribution. |

---

## 11. Important Technical Decisions & Architectural Rationale

1. **Dual Storage Architecture (PostgreSQL vs. Metafields)**:
   - *Rationale*: Storefront extension scripts run in the shopper's browser and must load immediately with the page. Querying the backend app server for every cart view would introduce latency and could crash under flash sales. Storing live widget configs in **Shopify Shop Metafields** allows Liquid to render values directly onto `window.CartElevate*` with zero network delay. Relational settings (sessions, onboarding, DB records) remain safely in PostgreSQL.
2. **Non-Invasive Theme App Extension (App Embed Block)**:
   - *Rationale*: Modifying merchant theme files directly causes uninstallation residue, theme update breakages, and Shopify App Store rejection. Using an App Embed block ensures 100% clean installation and zero residue upon deactivation.
3. **Native Shopify Automatic Discount Synchronization**:
   - *Rationale*: Displaying a discounted price in the cart drawer that disappears or requires a manual coupon code at checkout destroys customer trust. CartElevate programmatically syncs automatic discounts directly into Shopify's backend discount engine so the exact savings reflect in Checkout.
4. **Platform Automatic Discount Quota Management**:
   - *Rationale*: Shopify strictly caps automatic discounts at 25 for standard stores and 50 for Shopify Plus. CartElevate inspects total active automatic discounts before creating new ones and throws friendly merchant validation warnings rather than letting Shopify API errors crash the app.
5. **Real Hidden Catalog Products for Service Upsells**:
   - *Rationale*: Storefront `/cart/add.js` rejects arbitrary line items. CartElevate creates real products (`[CartElevate] Package Protection`), tags them with internal prefixes, and publishes them to the Online Store sales channel so Shopify accepts them as valid cart items.

---

## 12. File and Directory Reference Map

```
d:\CodeWIthMe\Explified\shopify\CartElevate\CartElevate\
│
├── app/                                        <- Core Backend & Admin Application
│   ├── components/                             <- Reusable Admin React Components
│   │   ├── LiveCartPreview.jsx                 <- Interactive Cart Drawer simulator
│   │   ├── LoadingContext.jsx                  <- React Context for global loading state
│   │   └── LoadingScreen.jsx                   <- Fullscreen animated loading overlay
│   ├── routes/                                 <- React Router v7 routes & endpoints
│   │   ├── _index/                             <- Unauthenticated root route
│   │   ├── auth.login/                         <- Admin login screen
│   │   ├── auth.$.jsx                          <- OAuth handler
│   │   ├── app.jsx                             <- App Bridge layout & navigation
│   │   ├── app._index.jsx                      <- Main Dashboard
│   │   ├── app.onboarding.jsx                  <- Setup wizard
│   │   ├── app.CartDrawerBranding.jsx          <- Header & color branding editor
│   │   ├── app.s-a-g-p-b.jsx                   <- Shipping & gift progress bar editor
│   │   ├── app.recommendation.jsx              <- Recommendations list
│   │   ├── app.newRecomendation.jsx            <- Recommendation rule builder
│   │   ├── app.bundleAndDiscount.jsx           <- Bundles list
│   │   ├── app.createNewBundle.jsx             <- Bundle & volume discount builder
│   │   ├── app.protectionAndWrapping.jsx       <- Protection & gift wrapping editor
│   │   ├── app.postPurchase.jsx                <- Post-purchase offers list
│   │   ├── app.createNewPostPurchaseOffer.jsx  <- Post-purchase offer builder
│   │   ├── app.analytics.jsx                   <- Analytics & KPI reporting
│   │   ├── app.contact-us.jsx                  <- FAQ & support page
│   │   ├── api.branding.jsx                    <- Storefront public API for branding
│   │   ├── api.shipping-bar.jsx                <- Storefront public API for shipping bar
│   │   ├── api.recommendations.jsx             <- Storefront public API for recommendations
│   │   ├── api.protection-wrapping.jsx         <- Storefront public API for protection pricing
│   │   ├── api.post-purchase.jsx               <- Storefront public API for PPO discount activation
│   │   ├── webhooks.app.uninstalled.jsx        <- App uninstallation webhook
│   │   ├── webhooks.app.scopes_update.jsx      <- Scope change webhook
│   │   └── [redirect shims].jsx                <- URL compatibility shims (e.g. s-a-g-p-b.jsx -> app.s-a-g-p-b.jsx)
│   ├── services/                               <- Core Business Logic & Shopify APIs
│   │   ├── discount.server.js                  <- Shopify Automatic Discounts GraphQL engine
│   │   └── protection-wrapping.server.js       <- Service product creation & publishing
│   ├── db.server.js                            <- Prisma client singleton
│   ├── shopify.server.js                       <- Shopify App SDK configuration
│   └── root.jsx                                <- Root HTML document & App Bridge wrapper
│
├── extensions/                                 <- Shopify Theme App Extensions
│   └── cart-elevate/
│       ├── blocks/
│       │   └── app-embed.liquid                <- Injected App Embed Block (Liquid globals & scripts)
│       └── assets/
│           ├── cart-elevate.js                 <- Core Cart Hub (DOM observer, Fetch/XHR interceptor)
│           ├── cart-elevate.css                <- Base storefront styles
│           ├── feature-cart-branding.js/.css   <- Header branding & drawer positioning
│           ├── feature-shipping-bar.js/.css    <- Dynamic Shipping & Gift Progress Bar
│           ├── feature-recommendations.js/.css <- Multi-set recommendation carousels
│           ├── feature-bundles.js/.css         <- Volume discount banners & savings summary
│           ├── feature-protection-wrapping.js/.css <- Package Protection & Gift Wrapping checkboxes
│           └── feature-post-purchase.js/.css   <- 1-click Pre-Checkout Upsell Interceptor modal
│
├── prisma/                                     <- Database ORM
│   ├── migrations/                             <- SQL migration history
│   └── schema.prisma                           <- Prisma data models
│
├── shopify.app.toml                            <- Shopify App Configuration (Scopes, webhooks, client_id)
├── package.json                                <- Project dependencies & scripts
├── vite.config.js                              <- Vite build & dev server configuration
└── PROJECT_CONTEXT.md                          <- This comprehensive documentation file
```

---

## 13. Known Issues, Technical Debt & Potential Risks

1. **Neon Serverless Database Suspension**:
   - *Issue*: Neon serverless PostgreSQL suspends compute instances when idle. The first request after suspension can take 1–2 seconds to wake up or throw connection pool timeouts if not handled gracefully.
   - *Mitigation*: Key loaders implement fallback retry blocks and raw SQL queries, but connection pooling parameters (`?sslmode=require&connect_timeout=15`) should be monitored.
2. **Shopify Automatic Discount Platform Cap**:
   - *Issue*: Standard Shopify stores cannot have more than 25 active automatic discounts across all apps.
   - *Mitigation*: Handled in `app.createNewBundle.jsx` by checking active slots before creation. Future agents must not bypass this validation.
3. **Analytics Real-Time Storefront Ingestion Gap**:
   - *Issue*: The analytics dashboard (`app.analytics.jsx`) currently renders baseline dataset constants (`PERIOD_DATA`), while `extensions/cart-elevate/assets/cart-elevate.js` does not yet have an active `window.CartElevate.trackEvent()` method to record storefront impressions to the backend.
   - *Fix Needed*: Add `trackEvent(feature, eventType, value)` to `cart-elevate.js` and implement an ingestion endpoint (`POST /api/analytics`) that writes to `analytics_events`.
4. **Missing Order Creation Webhook Handler**:
   - *Issue*: `shopify.app.toml` defines a subscription for `orders/create` pointing to `/webhooks/orders/create`, but there is currently no `app/routes/webhooks.orders.create.jsx` file to process order payloads and attribute elevated revenue.

---

## 14. Instructions for Future AI Agents

When working on this repository, all AI agents **must adhere to these instructions**:

1. **Read `PROJECT_CONTEXT.md` First**: Always consult this file before making any changes.
2. **Never Break Theme Independence**: Do **not** inject hardcoded HTML into theme files or create dependencies on specific theme frameworks. All storefront code must reside within `extensions/cart-elevate/` as scoped, non-conflicting JavaScript and CSS.
3. **Respect Dual Storage Patterns**:
   - Settings needed by the storefront Liquid template must be synced to **Shopify Shop Metafields** (`cartelevate.*` or `cart_elevate.*`).
   - Settings needed by the admin dashboard or session layer must be persisted in **PostgreSQL via Prisma**.
4. **Always Manage Automatic Discount Limits**: Whenever modifying discount logic, always verify that the total active automatic discount count does not exceed 25 (or 50 on Plus) using `automaticDiscountNodes` GraphQL queries.
5. **Maintain Service Product Publishing**: Service products (`[CartElevate] Package Protection` and `[CartElevate] Gift Wrapping`) must remain published to the `Online Store` sales channel, or `/cart/add.js` will reject them.
6. **No Phantom Implementations**: Do not claim an API endpoint or tracking feature is operational unless verified against real code and network requests.
7. **Keep Documentation Updated**: If you add new routes, modify database schemas, or update storefront extensions, update `PROJECT_CONTEXT.md` accordingly.

---
*End of CartElevate Project Context Documentation.*
