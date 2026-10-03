CREATE TYPE "public"."debt_direction" AS ENUM('lent', 'borrowed');--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"installments_count" smallint NOT NULL,
	"total_minor" bigint NOT NULL,
	"first_due_date" date NOT NULL,
	"due_day" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_plans_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "installment_plans_count_range" CHECK ("installment_plans"."installments_count" between 2 and 60),
	CONSTRAINT "installment_plans_total_positive" CHECK ("installment_plans"."total_minor" > 0),
	CONSTRAINT "installment_plans_due_day_range" CHECK ("installment_plans"."due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lender" text,
	"principal_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"installments_count" smallint NOT NULL,
	"installment_minor" bigint NOT NULL,
	"first_due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_principal_positive" CHECK ("loans"."principal_minor" > 0),
	CONSTRAINT "loans_installment_positive" CHECK ("loans"."installment_minor" > 0),
	CONSTRAINT "loans_count_range" CHECK ("loans"."installments_count" between 1 and 600)
);
--> statement-breakpoint
CREATE TABLE "personal_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"person" text NOT NULL,
	"direction" "debt_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"occurred_on" date NOT NULL,
	"notes" text,
	"settled_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_debts_amount_positive" CHECK ("personal_debts"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_limit_minor" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "statement_close_day" smallint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "payment_due_day" smallint;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_debts" ADD CONSTRAINT "personal_debts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installment_plans_account_idx" ON "installment_plans" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_close_day_range" CHECK ("accounts"."statement_close_day" is null or "accounts"."statement_close_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_due_day_range" CHECK ("accounts"."payment_due_day" is null or "accounts"."payment_due_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credit_limit_nonnegative" CHECK ("accounts"."credit_limit_minor" is null or "accounts"."credit_limit_minor" >= 0);