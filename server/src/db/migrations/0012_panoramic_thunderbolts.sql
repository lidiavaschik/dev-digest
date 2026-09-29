-- Pre-flight, hand-added to this generated migration: ADD CONSTRAINT validates
-- existing rows, so a dangling id would abort the whole migration.
-- `reviews.agent_id` has been an unconstrained uuid until now and agents ARE
-- deletable (modules/agents/repository.ts), so any database created before this
-- migration can hold one. Nulling is deliberate over deleting: the review is
-- still a historical fact, and the PR-list rollup already has a documented path
-- for a review whose run/agent it cannot resolve.
UPDATE "reviews" SET "agent_id" = NULL
 WHERE "agent_id" IS NOT NULL
   AND "agent_id" NOT IN (SELECT "id" FROM "agents");
--> statement-breakpoint
UPDATE "reviews" SET "run_id" = NULL
 WHERE "run_id" IS NOT NULL
   AND "run_id" NOT IN (SELECT "id" FROM "agent_runs");
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;