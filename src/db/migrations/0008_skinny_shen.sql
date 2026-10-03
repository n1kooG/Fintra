CREATE TABLE "loan_prepayments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"loan_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"mode" text DEFAULT 'shorten_term' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loan_prepayments_amount_positive" CHECK ("loan_prepayments"."amount_minor" > 0),
	CONSTRAINT "loan_prepayments_mode_valid" CHECK ("loan_prepayments"."mode" in ('shorten_term', 'reduce_installment'))
);
--> statement-breakpoint
ALTER TABLE "loan_prepayments" ADD CONSTRAINT "loan_prepayments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_prepayments" ADD CONSTRAINT "loan_prepayments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_prepayments_loan_idx" ON "loan_prepayments" USING btree ("loan_id","paid_on");