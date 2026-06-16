-- CreateTable
CREATE TABLE "settings" (
    "shop" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "selected_theme" TEXT NOT NULL DEFAULT 'dynamic',
    "selected_toggle" TEXT NOT NULL DEFAULT 'none',
    "package_protection_price" DECIMAL(10,2) NOT NULL DEFAULT 2.99,
    "gift_wrapping_price" DECIMAL(10,2) NOT NULL DEFAULT 4.99,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "upsell_products" JSONB NOT NULL DEFAULT '[]',
    "currency_symbol" TEXT NOT NULL DEFAULT '$',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "cart_token" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "target_variant_id" TEXT,
    "value" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "converted_orders" (
    "order_id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "cart_token" TEXT,
    "total_order_value" DECIMAL(10,2) NOT NULL,
    "elevated_revenue" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "has_upsell" BOOLEAN NOT NULL DEFAULT false,
    "has_protection" BOOLEAN NOT NULL DEFAULT false,
    "has_gift_wrap" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "converted_orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE INDEX "analytics_events_shop_idx" ON "analytics_events"("shop");

-- CreateIndex
CREATE INDEX "analytics_events_cart_token_idx" ON "analytics_events"("cart_token");

-- CreateIndex
CREATE INDEX "converted_orders_shop_idx" ON "converted_orders"("shop");

-- CreateIndex
CREATE INDEX "converted_orders_cart_token_idx" ON "converted_orders"("cart_token");
