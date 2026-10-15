import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { cases } from '@/db/schema';
import { apiError } from '@/lib/case-store';
import { analyzeTelemetry } from '@/lib/ai-telemetry';
import { getSampleTelemetry } from '@/lib/collector-templates';
import type { SupportedOS, SystemTelemetry } from '@/lib/contracts';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const caseId = (typeof body.caseId === 'string' && body.caseId) ? body.caseId : 'live-session';
    const os = (typeof body.os === 'string' ? body.os.toLowerCase() : 'windows') as SupportedOS;
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : 'System freezing and high CPU utilization.';

    let telemetry: SystemTelemetry;

    // Check if client sent an explicit scenario or raw telemetry object
    if (body.scenario && typeof body.scenario === 'string') {
      const scenario = body.scenario as 'high-cpu' | 'disk-full' | 'network-dns' | 'memory-leak';
      telemetry = getSampleTelemetry(scenario, os);
    } else if (body.cpuUsagePercent !== undefined) {
      telemetry = {
        os,
        osVersion: typeof body.osVersion === 'string' ? body.osVersion : `${os} (latest)`,
        hostname: typeof body.hostname === 'string' ? body.hostname : 'Device',
        cpuModel: typeof body.cpuModel === 'string' ? body.cpuModel : 'Standard CPU',
        cpuUsagePercent: Number(body.cpuUsagePercent) || 0,
        memoryTotalMb: Number(body.memoryTotalMb) || 16384,
        memoryUsedMb: Number(body.memoryUsedMb) || 8192,
        memoryUsagePercent: Number(body.memoryUsagePercent) || 50,
        diskTotalGb: Number(body.diskTotalGb) || 512,
        diskFreeGb: Number(body.diskFreeGb) || 256,
        diskUsagePercent: Number(body.diskUsagePercent) || 50,
        networkConnected: body.networkConnected !== false,
        dnsWorking: body.dnsWorking !== false,
        gatewayPingMs: typeof body.gatewayPingMs === 'number' ? body.gatewayPingMs : 15,
        topProcesses: Array.isArray(body.topProcesses) ? (body.topProcesses as any) : [],
        systemErrors: Array.isArray(body.systemErrors) ? (body.systemErrors as string[]) : [],
        collectedAt: typeof body.collectedAt === 'string' ? body.collectedAt : new Date().toISOString(),
        rawOutput: typeof body.rawOutput === 'string' ? body.rawOutput : undefined,
      };
    } else {
      // Default to high-cpu scenario if minimal body provided
      telemetry = getSampleTelemetry('high-cpu', os);
    }

    const analysis = analyzeTelemetry(telemetry, userPrompt, caseId);

    // Save snapshot to D1 database if case exists
    try {
      const existing = await getDb().select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (existing.length > 0) {
        const row = existing[0];
        const updatedSnapshot = {
          headline: analysis.defectTitle,
          summary: analysis.rootCause,
          findings: analysis.evidence,
          nextSteps: [analysis.proposedFix.title],
          limitations: ['Constrained read-only telemetry analysis'],
          ruleVersion: '2.0.0',
          evidenceUsed: analysis.evidence,
          telemetryReport: telemetry,
          diagnosticArtifact: analysis.artifact,
          proposedFix: analysis.proposedFix,
        };

        await getDb()
          .update(cases)
          .set({
            analysisSnapshot: updatedSnapshot as any,
            internalNotes: analysis.helpdeskNotes,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(cases.id, caseId));
      }
    } catch (dbErr) {
      console.warn('Could not update case in D1', dbErr);
    }

    return Response.json({
      ok: true,
      caseId,
      telemetry,
      analysis,
    });
  } catch (error) {
    return apiError(error, 'ai_explanation');
  }
}
