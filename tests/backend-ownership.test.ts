import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { apiError, ownedCase, publicCase } from '../lib/case-store';
test('owner condition binds both the requested case and authenticated user',()=>{const sql=new SQLiteSyncDialect().sqlToQuery(ownedCase('case-123','owner-abc')!);assert.match(sql.sql,/"id" = \?/);assert.match(sql.sql,/"user_id" = \?/);assert.match(sql.sql,/ and /);assert.deepEqual(sql.params,['case-123','owner-abc']);});
test('public case response does not expose owner or consent storage metadata',()=>{const c=publicCase({id:'1',userId:'private',title:'test',description:'description',deviceName:'pc',category:'network',os:'windows11',ownership:'personal',status:'open',answers:{},notes:'',consent:true,consentAt:'now',createdAt:'now',updatedAt:'now',verifiedAt:null});assert.equal('userId' in c,false);assert.equal('consentAt' in c,false);});

test('failure reference correlates logs without leaking database parameters',async()=>{
  const logs: string[]=[];
  const original=console.error;
  console.error=(value)=>logs.push(String(value));
  try {
    const response=apiError(new Error('SQL failed: private customer notes and email'));
    assert.equal(response.status,500);
    const body=await response.json() as {requestId:string; error:string};
    assert.equal(JSON.parse(logs[0]).requestId,body.requestId);
    assert.match(body.error,new RegExp(body.requestId));
    assert.doesNotMatch(logs.join(' ')+JSON.stringify(body),/private customer|SQL failed|email/);
  } finally {console.error=original;}
});
