CREATE TYPE "public"."holding_kind" AS ENUM('fixed_term_deposit', 'mutual_fund', 'stock', 'crypto', 'foreign_currency', 'other');--> statement-breakpoint
CREATE TABLE "holding_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"holding_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_flows_amount_nonzero" CHECK ("holding_flows"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "holding_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"holding_id" uuid NOT NULL,
	"valued_on" date NOT NULL,
	"value_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_valuations_holding_date_unique" UNIQUE("holding_id","valued_on"),
	CONSTRAINT "holding_valuations_value_nonnegative" CHECK ("holding_valuations"."value_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "holding_kind" NOT NULL,
	"currency" "currency" NOT NULL,
	"institution" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_flows" ADD CONSTRAINT "holding_flows_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_flows" ADD CONSTRAINT "holding_flows_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_valuations" ADD CONSTRAINT "holding_valuations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_valuations" ADD CONSTRAINT "holding_valuations_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holding_flows_holding_idx" ON "holding_flows" USING btree ("holding_id","occurred_on");