import { pgTable, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { StoredReport } from '../reportGenerator';

export const simulationReports = pgTable('simulation_reports', {
  id: uuid().primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  report: jsonb().$type<StoredReport>().notNull(),
}, table => [index('reports_owner_started_idx').on(table.ownerId, table.startedAt)]);
