import { and, eq } from 'drizzle-orm';
import { cases } from '../db/schema';
import type { CaseRecord } from './contracts';
import { InputError } from './validation';
export const ownedCase = (id: string, userId: string) => and(eq(cases.id,id),eq(cases.userId,userId));
export function publicCase(row: typeof cases.$inferSelect): CaseRecord {
  return {id:row.id,title:row.title,description:row.description,deviceName:row.deviceName,category:row.category,os:row.os,ownership:row.ownership,status:row.status,answers:row.answers,notes:row.notes,createdAt:row.createdAt,updatedAt:row.updatedAt,verifiedAt:row.verifiedAt};
}
export function apiError(error: unknown): Response {
  if(error instanceof InputError) return Response.json({error:error.message},{status:400});
  console.error('Case operation failed',error instanceof Error ? error.name : 'UnknownError');
  return Response.json({error:'Unable to save or load cases. Please try again.'},{status:500});
}
