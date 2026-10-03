ALTER TYPE "public"."currency" ADD VALUE 'EUR';--> statement-breakpoint
ALTER TABLE "holding_flows" ADD COLUMN "units" numeric(28, 8);--> statement-breakpoint
ALTER TABLE "holding_valuations" ADD COLUMN "unit_price" numeric(28, 6);--> statement-breakpoint
ALTER TABLE "holding_valuations" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "valuation_method" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "asset_code" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "term_start" date;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "term_end" date;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "rate_percent" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "rate_period" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_valuation_method_valid" CHECK ("holdings"."valuation_method" in ('manual', 'fx', 'crypto', 'priced', 'fixed_term'));--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_rate_period_valid" CHECK ("holdings"."rate_period" is null or "holdings"."rate_period" in ('monthly', 'annual'));--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_fixed_term_complete" CHECK ("holdings"."valuation_method" <> 'fixed_term' or ("holdings"."term_start" is not null and "holdings"."term_end" is not null and "holdings"."rate_percent" is not null and "holdings"."rate_period" is not null));--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_units_asset_required" CHECK ("holdings"."valuation_method" not in ('fx', 'crypto') or "holdings"."asset_code" is not null);