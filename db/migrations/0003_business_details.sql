ALTER TABLE "app"."businesses" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "vat_condition" "app"."vat_condition";--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "gross_income_number" text;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "activity_start_date" date;