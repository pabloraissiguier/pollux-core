CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."member_role" AS ENUM('owner');--> statement-breakpoint
CREATE TYPE "app"."sequence_kind" AS ENUM('order', 'delivery_note');--> statement-breakpoint
CREATE TYPE "app"."vat_condition" AS ENUM('responsable_inscripto', 'monotributo', 'consumidor_final', 'exento');--> statement-breakpoint
CREATE TYPE "app"."order_status" AS ENUM('pending', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."balance_entry_type" AS ENUM('order_delivered', 'delivery_undone', 'payment', 'payment_voided', 'opening_balance', 'adjustment');--> statement-breakpoint
CREATE TYPE "app"."payment_method" AS ENUM('cash', 'bank_transfer', 'check', 'other');--> statement-breakpoint
CREATE TYPE "app"."stock_adjustment_reason" AS ENUM('initial_count', 'count_correction', 'breakage', 'other');--> statement-breakpoint
CREATE TYPE "app"."stock_movement_type" AS ENUM('order_delivered', 'delivery_undone', 'purchase', 'adjustment');--> statement-breakpoint
CREATE TABLE "app"."business_members" (
	"business_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "app"."member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_members_business_id_profile_id_pk" PRIMARY KEY("business_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "app"."business_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."business_sequences" (
	"business_id" uuid NOT NULL,
	"kind" "app"."sequence_kind" NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_sequences_business_id_kind_pk" PRIMARY KEY("business_id","kind")
);
--> statement-breakpoint
ALTER TABLE "app"."business_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cuit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"province" text DEFAULT 'Córdoba' NOT NULL,
	"postal_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "branches_business_id_customer_id_id_key" UNIQUE("business_id","customer_id","id")
);
--> statement-breakpoint
ALTER TABLE "app"."branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"cuit" text,
	"vat_condition" "app"."vat_condition",
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
ALTER TABLE "app"."customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "categories_business_id_name_key" UNIQUE("business_id","name")
);
--> statement-breakpoint
ALTER TABLE "app"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."product_price_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"old_price" numeric(14, 2),
	"new_price" numeric(14, 2) NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "app"."product_price_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category_id" uuid,
	"price" numeric(14, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '21.00' NOT NULL,
	"image_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "products_business_id_code_key" UNIQUE("business_id","code"),
	CONSTRAINT "products_price_check" CHECK ("app"."products"."price" >= 0),
	CONSTRAINT "products_vat_rate_check" CHECK ("app"."products"."vat_rate" >= 0 and "app"."products"."vat_rate" <= 100)
);
--> statement-breakpoint
ALTER TABLE "app"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_quantity_check" CHECK ("app"."order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_unit_price_check" CHECK ("app"."order_lines"."unit_price" >= 0),
	CONSTRAINT "order_lines_discount_percent_check" CHECK ("app"."order_lines"."discount_percent" >= 0 and "app"."order_lines"."discount_percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "app"."order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"customer_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "app"."order_status" DEFAULT 'pending' NOT NULL,
	"delivery_date" date NOT NULL,
	"delivered_on" date,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"delivery_note_number" integer,
	"delivery_note_issued_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "orders_business_id_customer_id_id_key" UNIQUE("business_id","customer_id","id"),
	CONSTRAINT "orders_business_id_number_key" UNIQUE("business_id","number"),
	CONSTRAINT "orders_business_id_delivery_note_number_key" UNIQUE("business_id","delivery_note_number"),
	CONSTRAINT "orders_delivered_on_check" CHECK (("app"."orders"."status" = 'delivered') = ("app"."orders"."delivered_on" is not null)),
	CONSTRAINT "orders_cancelled_at_check" CHECK (("app"."orders"."status" = 'cancelled') = ("app"."orders"."cancelled_at" is not null)),
	CONSTRAINT "orders_delivery_note_check" CHECK (("app"."orders"."delivery_note_number" is null) = ("app"."orders"."delivery_note_issued_at" is null)),
	CONSTRAINT "orders_discount_percent_check" CHECK ("app"."orders"."discount_percent" >= 0 and "app"."orders"."discount_percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "app"."orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."balance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "app"."balance_entry_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"entry_date" date NOT NULL,
	"order_id" uuid,
	"payment_id" uuid,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_entries_amount_check" CHECK ("app"."balance_entries"."amount" <> 0),
	CONSTRAINT "balance_entries_source_check" CHECK (
    case "app"."balance_entries"."type"
      when 'order_delivered' then "app"."balance_entries"."order_id" is not null and "app"."balance_entries"."payment_id" is null and "app"."balance_entries"."amount" > 0
      when 'delivery_undone' then "app"."balance_entries"."order_id" is not null and "app"."balance_entries"."payment_id" is null and "app"."balance_entries"."amount" < 0
      when 'payment' then "app"."balance_entries"."payment_id" is not null and "app"."balance_entries"."order_id" is null and "app"."balance_entries"."amount" < 0
      when 'payment_voided' then "app"."balance_entries"."payment_id" is not null and "app"."balance_entries"."order_id" is null and "app"."balance_entries"."amount" > 0
      when 'opening_balance' then "app"."balance_entries"."order_id" is null and "app"."balance_entries"."payment_id" is null
      when 'adjustment' then "app"."balance_entries"."order_id" is null and "app"."balance_entries"."payment_id" is null and "app"."balance_entries"."reason" is not null
    end)
);
--> statement-breakpoint
ALTER TABLE "app"."balance_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"method" "app"."payment_method" NOT NULL,
	"reference" text,
	"paid_on" date NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "payments_amount_check" CHECK ("app"."payments"."amount" > 0),
	CONSTRAINT "payments_void_check" CHECK (("app"."payments"."voided_at" is null) = ("app"."payments"."void_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "app"."payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "app"."stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"order_id" uuid,
	"purchase_id" uuid,
	"adjustment_reason" "app"."stock_adjustment_reason",
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_check" CHECK ("app"."stock_movements"."quantity" <> 0),
	CONSTRAINT "stock_movements_source_check" CHECK (
    case "app"."stock_movements"."type"
      when 'order_delivered' then "app"."stock_movements"."order_id" is not null and "app"."stock_movements"."purchase_id" is null and "app"."stock_movements"."adjustment_reason" is null and "app"."stock_movements"."quantity" < 0
      when 'delivery_undone' then "app"."stock_movements"."order_id" is not null and "app"."stock_movements"."purchase_id" is null and "app"."stock_movements"."adjustment_reason" is null and "app"."stock_movements"."quantity" > 0
      when 'purchase' then "app"."stock_movements"."purchase_id" is not null and "app"."stock_movements"."order_id" is null and "app"."stock_movements"."adjustment_reason" is null and "app"."stock_movements"."quantity" > 0
      when 'adjustment' then "app"."stock_movements"."adjustment_reason" is not null and "app"."stock_movements"."order_id" is null and "app"."stock_movements"."purchase_id" is null
    end)
);
--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_lines_quantity_check" CHECK ("app"."purchase_lines"."quantity" > 0),
	CONSTRAINT "purchase_lines_unit_cost_check" CHECK ("app"."purchase_lines"."unit_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."purchase_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchased_on" date NOT NULL,
	"invoice_number" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
ALTER TABLE "app"."purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cuit" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
ALTER TABLE "app"."suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_members" ADD CONSTRAINT "business_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_sequences" ADD CONSTRAINT "business_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "app"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_price_changes" ADD CONSTRAINT "product_price_changes_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."product_price_changes" ADD CONSTRAINT "product_price_changes_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "app"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "app"."categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("business_id","order_id") REFERENCES "app"."orders"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "app"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "app"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_branch_fk" FOREIGN KEY ("business_id","customer_id","branch_id") REFERENCES "app"."branches"("business_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."balance_entries" ADD CONSTRAINT "balance_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."balance_entries" ADD CONSTRAINT "balance_entries_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."balance_entries" ADD CONSTRAINT "balance_entries_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "app"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."balance_entries" ADD CONSTRAINT "balance_entries_order_fk" FOREIGN KEY ("business_id","customer_id","order_id") REFERENCES "app"."orders"("business_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."balance_entries" ADD CONSTRAINT "balance_entries_payment_fk" FOREIGN KEY ("business_id","payment_id") REFERENCES "app"."payments"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_voided_by_profiles_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "app"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_order_fk" FOREIGN KEY ("business_id","customer_id","order_id") REFERENCES "app"."orders"("business_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "app"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_order_fk" FOREIGN KEY ("business_id","order_id") REFERENCES "app"."orders"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_purchase_fk" FOREIGN KEY ("business_id","purchase_id") REFERENCES "app"."purchases"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_fk" FOREIGN KEY ("business_id","purchase_id") REFERENCES "app"."purchases"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."purchase_lines" ADD CONSTRAINT "purchase_lines_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "app"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."purchases" ADD CONSTRAINT "purchases_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."purchases" ADD CONSTRAINT "purchases_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."purchases" ADD CONSTRAINT "purchases_supplier_fk" FOREIGN KEY ("business_id","supplier_id") REFERENCES "app"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suppliers" ADD CONSTRAINT "suppliers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_members_profile_id_idx" ON "app"."business_members" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "customers_business_id_name_idx" ON "app"."customers" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "product_price_changes_product_idx" ON "app"."product_price_changes" USING btree ("business_id","product_id","changed_at");--> statement-breakpoint
CREATE INDEX "products_business_id_category_id_idx" ON "app"."products" USING btree ("business_id","category_id");--> statement-breakpoint
CREATE INDEX "products_business_id_name_idx" ON "app"."products" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "app"."order_lines" USING btree ("business_id","order_id");--> statement-breakpoint
CREATE INDEX "order_lines_product_idx" ON "app"."order_lines" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "orders_business_id_status_delivery_date_idx" ON "app"."orders" USING btree ("business_id","status","delivery_date");--> statement-breakpoint
CREATE INDEX "balance_entries_customer_idx" ON "app"."balance_entries" USING btree ("business_id","customer_id","entry_date");--> statement-breakpoint
CREATE INDEX "balance_entries_order_idx" ON "app"."balance_entries" USING btree ("business_id","order_id");--> statement-breakpoint
CREATE INDEX "balance_entries_payment_idx" ON "app"."balance_entries" USING btree ("business_id","payment_id");--> statement-breakpoint
CREATE INDEX "payments_business_id_customer_id_idx" ON "app"."payments" USING btree ("business_id","customer_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_business_id_order_id_idx" ON "app"."payments" USING btree ("business_id","order_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "app"."stock_movements" USING btree ("business_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "app"."stock_movements" USING btree ("business_id","order_id");--> statement-breakpoint
CREATE INDEX "stock_movements_purchase_idx" ON "app"."stock_movements" USING btree ("business_id","purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_idx" ON "app"."purchase_lines" USING btree ("business_id","purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_product_idx" ON "app"."purchase_lines" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "purchases_business_id_supplier_id_idx" ON "app"."purchases" USING btree ("business_id","supplier_id","purchased_on");--> statement-breakpoint
CREATE INDEX "suppliers_business_id_name_idx" ON "app"."suppliers" USING btree ("business_id","name");