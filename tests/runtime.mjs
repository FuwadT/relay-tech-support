// Local built Worker only: headers simulate trusted Sites dispatch, not real hosted identities.
import assert from 'node:assert/strict';
const base = process.env.RELAY_TEST_URL ?? 'http://127.0.0.1:8787';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Runtime fixtures are local-only.');
const run = crypto.randomUUID();
const owner = `qa-owner-${run}`;
const other = `qa-other-${run}`;
const created = [];
let passed = 0;
async function request(path, method = 'GET', body, user = owner, status = 200, extra = {}) {
  console.log(`Checking ${method} ${path} -> ${status}`);
  const response = await fetch(`${base}${path}`, {method, signal: AbortSignal.timeout(15000), headers: {
    ...(user ? {'oai-authenticated-user-id':user, 'oai-authenticated-user-email':'fixture@example.invalid'} : {}),
    'Content-Type':'application/json', 'Connection':'close', ...extra,
  }, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  passed++;
  return data;
}
const intake = {title:'Runtime verification fixture',description:'Synthetic local fixture; no real device diagnosis.',deviceName:'QA fixture',category:'performance',os:'windows11',ownership:'personal',consent:true};
try {
  await request('/api/cases','GET',undefined,null,401);
  for (const invalid of [{os:'macos'},{ownership:'work'},{consent:false},{userId:other}]) {
    await request('/api/cases','POST',{...intake,...invalid},owner,400);
  }
  await request('/api/cases/missing-fixture','GET',undefined,owner,404);
  for (const category of ['performance','network']) {
    const {case:initial} = await request('/api/cases','POST',{...intake,category},owner,201);
    created.push(initial.id);
    const path = `/api/cases/${initial.id}`;
    if (process.env.RELAY_GUIDED_ONLY === '1') {
      const unavailable = await fetch(`${base}${path}/ai-explain`, {method:'POST',
        signal:AbortSignal.timeout(15000), headers:{
          'Content-Type':'application/json', 'oai-authenticated-user-id':owner,
          'oai-authenticated-user-email':'fixture@example.invalid',
        }, body:'{}'});
      await unavailable.text();
      assert.equal(unavailable.status,404,'Guided-only candidate must not expose a model endpoint');
      passed++;
    }
    assert.equal('userId' in initial,false);
    assert.ok(initial.analysisSnapshot);
    assert.equal(initial.analysisSnapshot.ruleVersion,initial.ruleVersion);
    for (const method of ['GET','PATCH','DELETE']) await request(path,method,method==='PATCH'?{notes:'denied'}:undefined,other,404);
    const answers = category==='performance' ? {scope:'whole_device',resources:'normal',storage:'enough',restart:'not_tried'} : {scope:'all_devices',connection:'wired',activity:'unknown',reach:'one_service'};
    const metric = category==='performance'?'app_launch_seconds':'download_mbps';
    await request(path,'PATCH',{answers,measurements:{baseline:{[metric]:20}}});
    await request(path,'PATCH',{measurements:{followUp:{[metric]:10}}});
    await request(path,'PATCH',{measurements:{baseline:{[metric]:-1}}},owner,400);
    await request(path,'PATCH',{measurements:{baseline:{unknown_metric:1}}},owner,400);
    const {case:resolved} = await request(path,'PATCH',{status:'resolved',notes:'User report in synthetic fixture'});
    assert.ok(resolved.verifiedAt);
    const {case:reloaded} = await request(path);
    assert.deepEqual(reloaded.answers,answers);
    assert.equal(reloaded.measurements.baseline[metric],20);
    assert.equal(reloaded.measurements.followUp[metric],10);
    assert.deepEqual(reloaded.analysisSnapshot,resolved.analysisSnapshot);
    assert.equal(reloaded.status,'resolved');
    assert.ok(reloaded.analysisSnapshot.evidenceUsed.includes(`baseline_${metric}:20`));
    const {case:reopened} = await request(path,'PATCH',{status:'in_progress'});
    assert.equal(reopened.verifiedAt,null);
    assert.deepEqual(reopened.analysisSnapshot,resolved.analysisSnapshot);
    if (category === 'performance') {
      const {case:conflicting} = await request(path,'PATCH',{
        answers:{resources:'normal'},measurements:{baseline:{cpu_percent:95}},
      });
      assert.match(conflicting.analysisSnapshot.findings.join(' '),/different times or workloads/);
      const {case:unchangedEvidence} = await request(path,'PATCH',{notes:'Retain the evidence reconciliation prompt'});
      assert.deepEqual(unchangedEvidence.analysisSnapshot,conflicting.analysisSnapshot);
    } else {
      const {case:smallChange} = await request(path,'PATCH',{
        measurements:{baseline:{download_mbps:20.01},followUp:{download_mbps:20.02}},
      });
      const {case:storedChange} = await request(path);
      const comparison = storedChange.analysisSnapshot.comparisons.find(c=>c.id==='download_mbps');
      assert.equal(comparison.difference,0.01);
      assert.equal(comparison.direction,'improved');
      assert.deepEqual(storedChange.analysisSnapshot,smallChange.analysisSnapshot);
    }
  }
  const list = await request('/api/cases');
  assert.equal(list.cases.length,2);
  const deniedList = await request('/api/cases','GET',undefined,other);
  assert.equal(deniedList.cases.length,0);
  await request('/api/cases','POST',intake,owner,400,{origin:'https://other.invalid'});
} finally {
  for (const id of created) {
    await request(`/api/cases/${id}`,'DELETE');
    await request(`/api/cases/${id}`,'GET',undefined,owner,404);
  }
}
console.log(`PASS: ${passed} HTTP assertions plus persisted evidence/outcome and isolation assertions; synthetic fixtures removed.`);
