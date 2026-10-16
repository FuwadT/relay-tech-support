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

  return new Response(script.content, {
    status: 200,
    headers: {
      'Content-Type': script.contentType,
      'Content-Disposition': `attachment; filename="${script.filename}"`,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
