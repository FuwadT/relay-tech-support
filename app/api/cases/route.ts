import { desc, eq } from 'drizzle-orm';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { cases } from '../../../db/schema';
import { apiError, publicCase } from '../../../lib/case-store';
import { assertMutationRequest, readJson, validateIntake } from '../../../lib/validation';
export async function GET() {
  const user=await getChatGPTUser(); if(!user) return Response.json({error:'Sign in to view your cases.'},{status:401});
  try { const rows=await getDb().select().from(cases).where(eq(cases.userId,user.userId)).orderBy(desc(cases.updatedAt)).limit(200); return Response.json({cases:rows.map(publicCase)},{headers:{'Cache-Control':'private, no-store'}}); } catch(error){return apiError(error);}
}
export async function POST(request: Request) {
  const user=await getChatGPTUser(); if(!user) return Response.json({error:'Sign in to create a case.'},{status:401});
  try {
    assertMutationRequest(request); const input=validateIntake(await readJson(request)); const now=new Date().toISOString();
    const row={...input,os:'windows11' as const,ownership:'personal' as const,id:crypto.randomUUID(),userId:user.userId,status:'open' as const,answers:{},notes:'',consentAt:now,createdAt:now,updatedAt:now,verifiedAt:null};
    await getDb().insert(cases).values(row); return Response.json({case:publicCase(row)},{status:201});
  } catch(error){return apiError(error);}
}
