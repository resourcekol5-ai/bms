CREATE TABLE "simulation_reports" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"report" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reports_owner_started_idx" ON "simulation_reports" ("owner_id","started_at");