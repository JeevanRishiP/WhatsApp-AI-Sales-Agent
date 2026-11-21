-- ╔════════════════════════════════════════════════════════════════════╗
-- ║ WhatsApp Commerce OS — PostgreSQL RLS, Search Indexes & Constraints ║
-- ║ Run via psql / Supabase SQL editor after `pnpm db:push`            ║
-- ╚════════════════════════════════════════════════════════════════════╝

-- 1. Extensions for fast trigram & vector product catalog search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Inventory non-negative integrity constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_non_negative'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT product_stock_non_negative CHECK (stock >= 0 AND reserved >= 0);
  END IF;
END $$;

-- 3. Populate codeNormalized for indexed SKU lookup (eliminates full-table scans)
UPDATE "Product"
SET "codeNormalized" = UPPER(REGEXP_REPLACE(code, '[^A-Za-z0-9]', '', 'g'))
WHERE "codeNormalized" IS NULL;

-- 4. Performance indexes: Trigram text search + pgvector HNSW
CREATE INDEX IF NOT EXISTS idx_product_name_trgm ON "Product" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_product_searchtext_trgm ON "Product" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_product_embedding_hnsw
  ON "Product" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. Enable Row-Level Security (RLS) on all tenant-scoped tables
-- NOTE: Use a non-superuser application DB role so RLS policies are enforced.
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'Product',
    'Order',
    'InventoryReservation',
    'Conversation',
    'Message',
    'CustomerMemory',
    'Customer',
    'PromptVersion',
    'OutboxEvent',
    'AuditLog',
    'StaffUser',
    'DataRevisionLog',
    'OrderInternalNote'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I
       USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
       WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid);',
      tbl
    );
  END LOOP;
END $$;

-- Child tables inheriting isolation via parent FK
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_order_item ON "OrderItem";
CREATE POLICY tenant_isolation_order_item ON "OrderItem"
  USING (
    EXISTS (
      SELECT 1 FROM "Order" o
      WHERE o.id = "OrderItem"."orderId"
        AND o."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Order" o
      WHERE o.id = "OrderItem"."orderId"
        AND o."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

ALTER TABLE "CustomerAddress" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_customer_address ON "CustomerAddress";
CREATE POLICY tenant_isolation_customer_address ON "CustomerAddress"
  USING (
    EXISTS (
      SELECT 1 FROM "Customer" c
      WHERE c.id = "CustomerAddress"."customerId"
        AND c."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Customer" c
      WHERE c.id = "CustomerAddress"."customerId"
        AND c."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

