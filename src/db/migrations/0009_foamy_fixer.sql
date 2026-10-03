CREATE TABLE "budget_totals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_totals_household_month_unique" UNIQUE("household_id","month"),
	CONSTRAINT "budget_totals_amount_positive" CHECK ("budget_totals"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "rollover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_totals" ADD CONSTRAINT "budget_totals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;