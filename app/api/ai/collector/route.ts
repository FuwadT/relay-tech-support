import {
  generateLinuxCollector,
  generateMacCollector,
  generateWindowsCollector,
} from '@/lib/collector-templates';
import type { SupportedOS } from '@/lib/contracts';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const os = (url.searchParams.get('os') || 'windows').toLowerCase() as SupportedOS;
  const caseId = url.searchParams.get('caseId') || 'live-session';
  const download = url.searchParams.get('download') === '1';

  const origin = url.origin;

  let script = '';
  let filename = '';

  switch (os) {
    case 'macos':
      script = generateMacCollector(caseId, origin);
      filename = 'relay-triage-mac.sh';
      break;
    case 'linux':
      script = generateLinuxCollector(caseId, origin);
      filename = 'relay-triage-linux.sh';
      break;
    case 'windows':
    default:
      script = generateWindowsCollector(caseId, origin);
      filename = 'relay-triage-windows.ps1';
      break;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  };

  if (download) {
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  }

  return new Response(script, {
    status: 200,
    headers,
  });
}
