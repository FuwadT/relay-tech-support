import { getChatGPTUser } from '../../../chatgpt-auth';
import { getDb } from '../../../../db';
import { cases } from '../../../../db/schema';
import { apiError, ownedCase, publicCase } from '../../../../lib/case-store';
import { assertMutationRequest, readJson, validatePatch } from '../../../../lib/validation';
type Context = {params: Promise<{id:string}>};
export async function GET(_request: Request, context: Context) {
  const user=await getChatGPTUser(); if(!user) return Response.json({error:'Sign in to view this case.'},{status:401});
  try {const {id}=await context.params; const [row]=await getDb().select().from(cases).where(ownedCase(id,user.userId)).limit(1); if(!row)return Response.json({error:'Case not found.'},{status:404}); return Response.json({case:publicCase(row)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}
}
export async function PATCH(request: Request, context: Context) {
  const user=await getChatGPTUser(); if(!user) return Response.json({error:'Sign in to update this case.'},{status:401});
  try {
    const body=await readJson(request); assertMutationRequest(request); const {id}=await context.params; const db=getDb(); const [row]=await db.select().from(cases).where(ownedCase(id,user.userId)).limit(1); if(!row)return Response.json({error:'Case not found.'},{status:404});
    const patch=validatePatch(body,row.category); const now=new Date().toISOString();
    const updates={...patch,answers:{...row.answers,...patch.answers},updatedAt:now,verifiedAt:patch.status==='resolved'?now:patch.status?null:row.verifiedAt};
    const [updated]=await db.update(cases).set(updates).where(ownedCase(id,user.userId)).returning(); if(!updated)return Response.json({error:'Case not found.'},{status:404}); return Response.json({case:publicCase(updated)});
  } catch(error){return apiError(error);}
}
export async function DELETE(request: Request, context: Context) {
  const user=await getChatGPTUser(); if(!user) return Response.json({error:'Sign in to delete this case.'},{status:401});
  try {assertMutationRequest(request); const {id}=await context.params; const removed=await getDb().delete(cases).where(ownedCase(id,user.userId)).returning({id:cases.id}); if(!removed.length)return Response.json({error:'Case not found.'},{status:404}); return Response.json({ok:true});}catch(error){return apiError(error);}
}
