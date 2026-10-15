import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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

// Deliberately has no case foreign key: deletion must retain the retry tombstone.
// Prototype metadata has no automatic expiry; review account retention before external release.
export const caseCreateRequests = sqliteTable('case_create_requests', {
  ownerId: text('owner_id').notNull(),
  keyHash: text('key_hash').notNull(),
  payloadHash: text('payload_hash').notNull(),
  caseId: text('case_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.keyHash] })]);
