import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { cases } from '@/db/schema';
import { buildDiagnosticArtifactHtml } from '@/lib/diagnostic-artifact';
import { getSampleTelemetry } from '@/lib/collector-templates';
import { analyzeTelemetry } from '@/lib/ai-telemetry';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const url = new URL(request.url);
  const download = url.searchParams.get('download') === '1';

  let html = '';

  try {
    const existing = await getDb().select().from(cases).where(eq(cases.id, id)).limit(1);
    if (existing.length > 0 && existing[0].analysisSnapshot) {
      const snap = existing[0].analysisSnapshot as any;
      if (snap.diagnosticArtifact?.htmlContent) {
        html = snap.diagnosticArtifact.htmlContent;
      }
    }
  } catch (err) {
    console.warn('Could not query D1 for artifact', err);
  }

  // If no stored HTML yet, synthesize from default telemetry
  if (!html) {
    const sample = getSampleTelemetry('high-cpu', 'windows');
    const analysis = analyzeTelemetry(sample, 'System freezing and high CPU utilization.', id);
    html = analysis.artifact.htmlContent;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  };

  if (download) {
    headers['Content-Disposition'] = `attachment; filename="relay-diagnostic-report-${id}.html"`;
  }

  return new Response(html, {
    status: 200,
    headers,
  });
}
