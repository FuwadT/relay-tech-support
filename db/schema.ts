import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Analysis, Answers, CaseMeasurements, CaseStatus, Category } from '../lib/contracts';

export const cases = sqliteTable('support_cases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  deviceName: text('device_name').notNull(),
  category: text('category').$type<Category>().notNull(),
  os: text('os').$type<'windows11'>().notNull(),
  ownership: text('ownership').$type<'personal'>().notNull(),
  status: text('status').$type<CaseStatus>().notNull().default('open'),
  answers: text('answers', {mode:'json'}).$type<Answers>().notNull(),
  measurements: text('measurements', {mode:'json'}).$type<CaseMeasurements>(),
  ruleVersion: text('rule_version').notNull().default('1.0.0'),
  analysisSnapshot: text('analysis_snapshot', {mode:'json'}).$type<Analysis>(),
  notes: text('notes').notNull().default(''),
  internalNotes: text('internal_notes').notNull().default(''),
  assignedTo: text('assigned_to'),
  escalatedAt: text('escalated_at'),
  consent: integer('consent', {mode:'boolean'}).notNull(),
  consentAt: text('consent_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  verifiedAt: text('verified_at'),
}, (table)=>[index('support_cases_owner_updated').on(table.userId,table.updatedAt)]);
