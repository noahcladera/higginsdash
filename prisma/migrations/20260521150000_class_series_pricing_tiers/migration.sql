-- Add optional multi-tier pricing for events (standard + member price, etc.)
ALTER TABLE "class_series" ADD COLUMN "pricing_tiers" JSONB;
