import { getCollectorScript } from '../../../../lib/enterprise/collector-scripts';

type Context = { params: Promise<{ platform: string }> };

export async function GET(request: Request, context: Context) {
  const { platform } = await context.params;
  const script = getCollectorScript(platform);

  if (!script) {
    return new Response(
      'Collector script not found. Supported platforms: windows11, ubuntu, macos',
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  const url = new URL(request.url);
  const rawCaseId = url.searchParams.get('caseId') || '';
  const rawCallbackUrl = url.searchParams.get('callbackUrl') || '';
  const safeCaseId = rawCaseId.replace(/[^a-zA-Z0-9_-]/g, '');
  let safeCallbackUrl = '';
  if (rawCallbackUrl) {
    try {
      const parsedCb = new URL(rawCallbackUrl);
      if (parsedCb.protocol === 'http:' || parsedCb.protocol === 'https:') {
        safeCallbackUrl = parsedCb.toString().replace(/["`$\\]/g, '');
      }
    } catch {}
  }

  let content = script.content;
  if (safeCallbackUrl || safeCaseId) {
    if (script.platform === 'windows') {
      const inject = `$env:RELAY_CASE_ID = "${safeCaseId}"\n$env:RELAY_CALLBACK_URL = "${safeCallbackUrl}"\n`;
      content = inject + content;
    } else {
      const inject = `export RELAY_CASE_ID="${safeCaseId}"\nexport RELAY_CALLBACK_URL="${safeCallbackUrl}"\n`;
      content = content.replace(/^#!\/usr\/bin\/env bash\n/, `#!/usr/bin/env bash\n${inject}`);
    }
  }

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': script.contentType,
      'Content-Disposition': `attachment; filename="${script.filename}"`,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
