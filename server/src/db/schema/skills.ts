import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const SKILL_TYPES = ['rubric', 'convention', 'security', 'custom'] as const;
export const SKILL_SOURCES = [
  'manual',
  'imported_url',
  'imported_file',
  'extracted',
  'community',
] as const;

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: SKILL_TYPES }).notNull(),
    source: text('source', { enum: SKILL_SOURCES }).notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Names are how a skill is addressed in manifests / plugin bundles, so they
  // are unique per workspace (this index also serves the workspace_id lookup).
  (t) => ({ wsNameUq: uniqueIndex('skills_ws_name_uq').on(t.workspaceId, t.name) }),
);

// Immutable snapshot of EVERY content field per version — not just the body — so
// a restore brings back name/description/type too and eval replays score the
// exact text. `message` is the optional "what changed" note shown in history.
export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    type: text('type', { enum: SKILL_TYPES }).notNull().default('custom'),
    body: text('body').notNull(),
    message: text('message'),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
