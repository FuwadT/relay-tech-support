import * as oauth from 'oauth4webapi';

export type OidcConfiguration = {
  provider: 'entra' | 'google';
  tenantId?: string;
  clientId: string;
  clientSecret: string;
  relayOrigin: string;
  redirectUri: string;
};
export type OidcTransaction = { state: string; nonce: string; codeVerifier: string; redirectUri: string };
const failure = () => new Error('OIDC authentication failed.');
const tenantUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw failure();
  return url;
}

/** Config is server-approved configuration, never callback/request parameters. */
export function createEnterpriseOidcClient(configuration: OidcConfiguration,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
  try {
    const config = { ...configuration };
    const relayOrigin = httpsUrl(config.relayOrigin);
    const redirect = httpsUrl(config.redirectUri);
    if (relayOrigin.pathname !== '/' || relayOrigin.search || redirect.origin !== relayOrigin.origin || redirect.search ||
      !['entra', 'google'].includes(config.provider) || typeof config.clientId !== 'string' ||
      !config.clientId.length || config.clientId.length > 256 || /[\u0000-\u001f]/.test(config.clientId) ||
      typeof config.clientSecret !== 'string' || !config.clientSecret.length || config.clientSecret.length > 4096) throw failure();
    if (config.provider === 'entra' && (typeof config.tenantId !== 'string' || !tenantUuid.test(config.tenantId))) throw failure();
    const issuer = config.provider === 'google' ? 'https://accounts.google.com'
      : `https://login.microsoftonline.com/${config.tenantId!.toLowerCase()}/v2.0`;
    const approvedHosts = config.provider === 'entra' ? ['login.microsoftonline.com']
      : ['accounts.google.com', 'oauth2.googleapis.com', 'www.googleapis.com'];
    const timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10000) throw failure();
    const transport = options.fetch ?? globalThis.fetch;
    const approvedUrl = (value: string) => {
      const url = httpsUrl(value);
      if (!approvedHosts.includes(url.hostname)) throw failure();
      return url;
    };
    // Bound complete response reads as well as connection establishment. Redirects
    // must not move credentials, JWKS requests, or discovery onto another target.
    const boundedFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
      approvedUrl(url);
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (init.signal?.aborted) throw failure();
      init.signal?.addEventListener('abort', abort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const response = await transport(url, { ...init, redirect: 'error', signal: controller.signal });
            if (response.status >= 300 && response.status < 400 || response.redirected) throw failure();
            if (Number(response.headers.get('content-length')) > 262144) throw failure();
            const reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let length = 0;
            if (reader) {
              while (true) {
                const item = await reader.read();
                if (item.done) break;
                length += item.value.byteLength;
                if (length > 262144) { void reader.cancel(); throw failure(); }
                chunks.push(item.value);
              }
            }
            const bytes = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
          })(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(failure()); }, timeoutMs); }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        init.signal?.removeEventListener('abort', abort);
      }
    };
    const requestOptions = { [oauth.customFetch]: boundedFetch };
    const client: oauth.Client = { client_id: config.clientId, id_token_signed_response_alg: 'RS256', [oauth.clockTolerance]: 0 };
    let metadata: Promise<oauth.AuthorizationServer> | undefined;
    const discover = () => metadata ??= (async () => {
      const response = await oauth.discoveryRequest(new URL(issuer), requestOptions);
      const server = await oauth.processDiscoveryResponse(new URL(issuer), response);
      for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
        if (typeof server[field] !== 'string') throw failure();
        approvedUrl(server[field]);
      }
      return server;
    })();
    return {
      async begin(): Promise<{ authorizationUrl: string; transaction: OidcTransaction }> {
        try {
          const server = await discover();
          const transaction = { state: oauth.generateRandomState(), nonce: oauth.generateRandomNonce(),
            codeVerifier: oauth.generateRandomCodeVerifier(), redirectUri: redirect.href };
          const authorization = approvedUrl(server.authorization_endpoint!);
          authorization.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code',
            redirect_uri: transaction.redirectUri, scope: 'openid', state: transaction.state, nonce: transaction.nonce,
            code_challenge: await oauth.calculatePKCECodeChallenge(transaction.codeVerifier), code_challenge_method: 'S256' }).toString();
          return { authorizationUrl: authorization.href, transaction };
        } catch { throw failure(); }
      },
      /** Caller must consume a browser-bound, expiring transaction exactly once before calling. */
      async exchange(callbackUrl: string, transaction: OidcTransaction): Promise<{ issuer: string; subject: string }> {
        try {
          if (typeof callbackUrl !== 'string' || callbackUrl.length > 8192) throw failure();
          const callback = httpsUrl(callbackUrl);
          if (callback.origin !== redirect.origin || callback.pathname !== redirect.pathname ||
            transaction.redirectUri !== redirect.href ||
            !/^[a-zA-Z0-9_-]{32,256}$/.test(transaction.state) || !/^[a-zA-Z0-9_-]{32,256}$/.test(transaction.nonce) ||
            !/^[a-zA-Z0-9._~-]{43,128}$/.test(transaction.codeVerifier)) throw failure();
          const server = await discover();
          const parameters = oauth.validateAuthResponse(server, client, callback, transaction.state);
          const response = await oauth.authorizationCodeGrantRequest(server, client, oauth.ClientSecretPost(config.clientSecret),
            parameters, transaction.redirectUri, transaction.codeVerifier, requestOptions);
          const result = await oauth.processAuthorizationCodeResponse(server, client, response,
            { expectedNonce: transaction.nonce, requireIdToken: true });
          await oauth.validateApplicationLevelSignature(server, response, requestOptions);
          const claims = oauth.getValidatedIdTokenClaims(result);
          const now = Date.now() / 1000;
          if (!claims || claims.iss !== issuer || typeof claims.sub !== 'string' || !claims.sub.length ||
            claims.sub.length > 255 || /[\u0000-\u001f\u007f]/.test(claims.sub) ||
            !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30 ||
            claims.exp <= claims.iat) throw failure();
          // Never return access/refresh/ID tokens or infer tenant membership/roles.
          return { issuer: claims.iss, subject: claims.sub };
        } catch { throw failure(); }
      },
    };
  } catch { throw failure(); }
}
