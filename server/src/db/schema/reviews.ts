import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { agents } from './agents';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agentRuns } from './runs';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    /**
     * Nulled when the agent is deleted, exactly like agent_runs.agent_id — the
     * review is still a historical fact, it just no longer names a live agent.
     */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /**
     * The agent_run that produced this review (links the timeline run ↔ review).
     * Cascades because that is already what deleting a run does by hand
     * (run.repo.ts deleteAgentRun removes the run's reviews first).
     */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    // A PR's current findings = the latest run of EACH agent, so (pr_id, agent_id)
    // is the grouping key of the hottest read in the app — the PR page and the
    // PR-list findings column both run it. See INSIGHTS.md 2026-09-22.
    prAgentIdx: index('reviews_pr_agent_idx').on(t.prId, t.agentId),
    wsIdx: index('reviews_ws_idx').on(t.workspaceId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    // Canonical set from the Severity contract. Typed here so a typo cannot be
    // written at all: severity is compared against each agent's ciFailOn
    // threshold, and an unrecognised value would silently never trip the gate.
    severity: text('severity', { enum: ['CRITICAL', 'WARNING', 'SUGGESTION'] }).notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    // Findings are always read through their review (rollups join findings→reviews).
    reviewIdx: index('findings_review_idx').on(t.reviewId),
  }),
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
