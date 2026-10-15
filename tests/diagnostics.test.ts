import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIAGNOSTIC_RULE_VERSION,
  analyzeCase,
  caseAnalysis,
  compareMeasurements,
  getChecks,
  getMeasurementDefinitions,
} from '../lib/diagnostics';
import { assertMutationRequest, readJson, validateIntake, validatePatch } from '../lib/validation';

const valid={title:'Wi-Fi keeps dropping',description:'Calls freeze every afternoon on my laptop.',deviceName:'Home laptop',category:'network',os:'windows11',ownership:'personal',consent:true};
test('supported intake and bounded strings',()=> {assert.equal(validateIntake(valid).category,'network');assert.throws(()=>validateIntake({...valid,title:'x'.repeat(121)}));assert.equal(validateIntake({...valid,description:'x'.repeat(2000)}).description.length,2000);assert.throws(()=>validateIntake({...valid,description:'x'.repeat(2001)}));});
test('consent, unsupported OS, and work devices rejected',()=>{for(const patch of [{consent:false},{consent:'true'},{os:'macos'},{ownership:'work'}])assert.throws(()=>validateIntake({...valid,...patch}));});
test('reject privileged and unknown input fields',()=>{assert.throws(()=>validateIntake({...valid,userId:'another-user'}));assert.throws(()=>validatePatch({verifiedAt:'today'},'network'));});
test('answer values match category-specific checks',()=>{assert.deepEqual(validatePatch({answers:{scope:'all_devices'}},'network'),{answers:{scope:'all_devices'}});assert.throws(()=>validatePatch({answers:{scope:'all_devices'}},'performance'));assert.throws(()=>validatePatch({answers:{arbitrary:'yes'}},'network'));assert.throws(()=>validatePatch({answers:{scope:42}},'network'));});
test('status and notes validation',()=>{assert.equal(validatePatch({status:'resolved'},'network').status,'resolved');assert.throws(()=>validatePatch({status:'verified'},'network'));assert.equal(validatePatch({notes:'x'.repeat(4000)},'network').notes?.length,4000);assert.throws(()=>validatePatch({notes:'x'.repeat(4001)},'network'));assert.throws(()=>validatePatch({},'network'));});
test('no observations produces an honest incomplete result',()=>{const a=analyzeCase({category:'performance',answers:{}});assert.match(a.summary,/0 of 4/);assert.match(a.findings[0],/No conclusive/);assert.match(a.limitations.join(' '),/cannot inspect/);});
test('network evidence branches into relevant recommendations',()=>{const a=analyzeCase({category:'network',answers:{scope:'all_devices',connection:'better_near',activity:'better_paused',reach:'one_service'}});assert.equal(a.findings.length,4);assert.match(a.nextSteps.join(' '),/provider/);assert.match(a.nextSteps.join(' '),/Schedule/);});
test('performance observations preserve uncertainty and no automated repair claim',()=>{const a=analyzeCase({category:'performance',answers:{scope:'one_app',resources:'memory',storage:'low',restart:'better'}});assert.equal(a.findings.length,4);assert.match(a.findings.join(' '),/does not establish/);assert.match(a.nextSteps.join(' '),/back up/);});
test('all categories have four distinct supported checks',()=>{for(const category of ['network','performance'] as const){const checks=getChecks(category);assert.equal(checks.length,4);assert.equal(new Set(checks.map(c=>c.id)).size,4);}});
test('same-origin mutations accepted; cross-origin rejected',()=>{assertMutationRequest(new Request('https://example.com/api/cases',{headers:{origin:'https://example.com'}}));assert.throws(()=>assertMutationRequest(new Request('https://example.com/api/cases',{headers:{origin:'https://evil.example'}})));});
test('JSON parser rejects unsupported content types and oversized requests',async()=>{await assert.rejects(()=>readJson(new Request('https://example.com',{method:'POST',body:'{}'})));await assert.rejects(()=>readJson(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({a:'x'.repeat(24000)})})));assert.deepEqual(await readJson(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:'{"ok":true}'})),{ok:true});});
test('S3-01 measurement definitions are well-defined with units and instructions',()=>{
  for(const cat of ['network','performance'] as const){
    const defs = getMeasurementDefinitions(cat);
    assert.equal(defs.length, 4);
    for (const d of defs) {
      assert.ok(d.id);
      assert.ok(d.label);
      assert.ok(d.unit);
      assert.ok(d.instruction);
    }
  }
});
test('S3-04 compareMeasurements evaluates improvement and preserves missing as incomplete',()=>{
  const defs = getMeasurementDefinitions('performance');
  assert.equal(defs.length, 4);
  for (const d of defs) { assert.ok(d.unit); assert.ok(d.instruction); }
  const comps = compareMeasurements('performance', {
    baseline: { app_launch_seconds: 20, cpu_percent: 85, memory_percent: null },
    followUp: { app_launch_seconds: 5, cpu_percent: 95, memory_percent: 70 }
  });
  const launch = comps.find((c) => c.id === 'app_launch_seconds');
  assert.equal(launch?.direction, 'improved');
  assert.equal(launch?.difference, -15);
  const cpu = comps.find((c) => c.id === 'cpu_percent');
  assert.equal(cpu?.direction, 'worsened');
  const mem = comps.find((c) => c.id === 'memory_percent');
  assert.equal(mem?.direction, 'incomplete');
  assert.equal(mem?.baseline, null);
});
test('S3-05 rule provenance records version and evidenceUsed',()=>{
  const a = analyzeCase({
    category: 'performance',
    answers: { scope: 'one_app', resources: 'cpu' },
    measurements: { baseline: { app_launch_seconds: 12 } }
  });
  assert.equal(a.ruleVersion, DIAGNOSTIC_RULE_VERSION);
  assert.ok(a.evidenceUsed.includes('scope:one_app'));
  assert.ok(a.evidenceUsed.includes('resources:cpu'));
  assert.ok(a.evidenceUsed.includes('baseline_app_launch_seconds:12'));
});
test('S3-06 contradictory and ambiguous evidence prompts notice',()=>{
  const wiredAll = analyzeCase({
    category: 'network',
    answers: { connection: 'wired', scope: 'all_devices' }
  });
  assert.match(wiredAll.findings.join(' '), /does not establish/);
  assert.match(wiredAll.nextSteps.join(' '), /same time/);
  assert.doesNotMatch(wiredAll.findings.join(' '), /strongly indicates/);
});
test('validatePatch validates structured measurements and rejects bounds violations',()=>{
  const valid = validatePatch({ measurements: { baseline: { download_mbps: 150.5 } } }, 'network');
  assert.equal(valid.measurements?.baseline?.download_mbps, 150.5);
  assert.throws(() => validatePatch({ measurements: { baseline: { download_mbps: -5 } } }, 'network'));
  assert.throws(() => validatePatch({ measurements: { baseline: { unknown_key: 10 } } }, 'network'));
  assert.throws(() => validatePatch({ measurements: { baseline: { download_mbps: 'fast' as unknown as number } } }, 'network'));
});

test('historical analysis is returned unchanged even when current rules differ',()=>{
  const snapshot = {...analyzeCase({category:'network',answers:{}}), ruleVersion:'historical-fixture', findings:['Previously saved finding']};
  const record = {category:'network',answers:{scope:'all_devices'},analysisSnapshot:snapshot} as unknown as import('../lib/contracts').CaseRecord;
  assert.deepEqual(caseAnalysis(record),snapshot);
  assert.equal(caseAnalysis({...record,analysisSnapshot:null}).ruleVersion,DIAGNOSTIC_RULE_VERSION);
});

test('ordinary readings do not justify unsupported thermal or power diagnoses',()=>{
  const result=analyzeCase({category:'performance',answers:{scope:'whole_device',resources:'normal',storage:'enough'}});
  assert.match(result.findings.join(' '),/do not identify a cause/);
  assert.doesNotMatch(result.nextSteps.join(' '),/Best Performance|thermal|indexing/);
});

test('small recorded changes remain visible rather than becoming unchanged', () => {
  const comparisons = compareMeasurements('network', {
    baseline: { download_mbps: 20.01, ping_latency_ms: 1.01, upload_mbps: 0 },
    followUp: { download_mbps: 20.02, ping_latency_ms: 1.02, upload_mbps: 0 },
  });
  assert.equal(comparisons.find(c => c.id === 'download_mbps')?.direction, 'improved');
  assert.equal(comparisons.find(c => c.id === 'download_mbps')?.difference, 0.01);
  assert.equal(comparisons.find(c => c.id === 'ping_latency_ms')?.direction, 'worsened');
  assert.equal(comparisons.find(c => c.id === 'upload_mbps')?.direction, 'unchanged');
  assert.equal(comparisons.find(c => c.id === 'upload_mbps')?.baseline, 0);
});

test('invalid historical readings and unrecognized answers do not become evidence', () => {
  const measurements = { baseline: { download_mbps: NaN, ping_latency_ms: -1, wifi_bars: 99, extra: 10 }, followUp: { download_mbps: 20, ping_latency_ms: 10 } };
  const result = analyzeCase({ category: 'network', answers: { scope: 'not-an-option', extra: 'yes' }, measurements });
  assert.match(result.summary, /0 of 4/);
  assert.deepEqual(result.evidenceUsed, ['followup_download_mbps:20', 'followup_ping_latency_ms:10']);
  assert.ok(result.comparisons?.every(c => c.direction === 'incomplete'));
  assert.ok(result.comparisons?.every(c => c.baseline === null));
});

test('high readings alongside a normal-resource answer request comparable observations', () => {
  for (const phase of ['baseline', 'followUp'] as const) {
    for (const metric of ['cpu_percent', 'memory_percent']) {
      const result = analyzeCase({ category: 'performance', answers: { resources: 'normal' }, measurements: { [phase]: { [metric]: 95 } } });
      assert.match(result.findings.join(' '), /different times or workloads/);
      assert.match(result.nextSteps.join(' '), /Compare the timing/);
      assert.doesNotMatch(result.findings.join(' '), /memory leak|hardware failure/);
    }
  }
});
