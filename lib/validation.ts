import type { Answers, CaseStatus, Category, IntakeInput } from './contracts';
import { getChecks } from './diagnostics';
export class InputError extends Error {}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected a JSON object.'); return value as Record<string, unknown>; }
function text(value: unknown, name: string, max: number, min = 0): string { if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new InputError(`${name} must be ${min}–${max} characters.`); return value.trim(); }
function onlyKeys(value: Record<string, unknown>, keys: string[]) { if(Object.keys(value).some(k=>!keys.includes(k))) throw new InputError('Unsupported field.'); }
export function validateIntake(input: unknown): IntakeInput {
  const v = object(input); onlyKeys(v,['title','description','deviceName','category','os','ownership','consent']);
  if(v.category !== 'performance' && v.category !== 'network') throw new InputError('Choose performance or network.');
  if(v.os !== 'windows11' || v.ownership !== 'personal') throw new InputError('This pilot supports personally owned Windows 11 devices only.');
  if(v.consent !== true) throw new InputError('Consent is required to store this case.');
  return {title:text(v.title,'Title',120,3),description:text(v.description,'Description',2000,10),deviceName:text(v.deviceName,'Device name',100,1),category:v.category,os:v.os,ownership:v.ownership,consent:true};
}
export function validatePatch(input: unknown, category: Category): { answers?: Answers; status?: CaseStatus; notes?: string } {
  const v=object(input); onlyKeys(v,['answers','status','notes']);
  if(!Object.keys(v).length) throw new InputError('Provide answers, status, or notes.');
  const result: {answers?: Answers; status?: CaseStatus; notes?: string}={};
  if(v.answers !== undefined) { const answers=object(v.answers); const allowed=getChecks(category); result.answers={}; for(const [key,value] of Object.entries(answers)) { const check=allowed.find(c=>c.id===key); if(!check || typeof value !== 'string' || !check.options.some(o=>o.value===value)) throw new InputError('Unsupported check or answer.'); result.answers[key]=value; } }
  if(v.status !== undefined) { if(!['open','in_progress','resolved','escalated'].includes(v.status as string)) throw new InputError('Unsupported status.'); result.status=v.status as CaseStatus; }
  if(v.notes !== undefined) result.notes=text(v.notes,'Notes',4000);
  return result;
}
export function assertMutationRequest(request: Request) {
  const origin=request.headers.get('origin');
  if(origin && origin !== new URL(request.url).origin) throw new InputError('Cross-origin requests are not allowed.');
}
export async function readJson(request: Request): Promise<unknown> {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('Content-Type must be application/json.');
  if(Number(request.headers.get('content-length')) > 24000) throw new InputError('Request is too large.');
  const reader=request.body?.getReader(); if(!reader) throw new InputError('A JSON body is required.');
  const chunks: Uint8Array[]=[]; let size=0;
  while(true) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>24000) { await reader.cancel(); throw new InputError('Request is too large.'); } chunks.push(value); }
  const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new InputError('Invalid JSON.');}
}
