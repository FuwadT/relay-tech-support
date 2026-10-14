import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Answers, CaseStatus, Category } from '../lib/contracts';
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
  notes: text('notes').notNull().default(''),
  consent: integer('consent', {mode:'boolean'}).notNull(),
  consentAt: text('consent_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  verifiedAt: text('verified_at'),
}, (table)=>[index('support_cases_owner_updated').on(table.userId,table.updatedAt)]);
