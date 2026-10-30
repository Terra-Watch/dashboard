import { ipAddress } from '@vercel/functions';

/** The API is reached through this site, so on its own it would only see this site's address. This forwards /api requests itself and adds the visitor's address and a shared secret, which the API believes only when the secret matches. */
export const config = { matcher: '/api/:path*' };

type Env = { process?: { env?: Record<string, string | undefined> } };
const env = (name: string) => (globalThis as Env).process?.env?.[name];

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env('RESQ_API_ORIGIN') || 'https://terra-watch-server.vercel.app');
  const headers = new Headers(request.headers);
  for (const name of ['host', 'x-resq-client-ip', 'x-resq-proxy-secret']) headers.delete(name);   // anything the visitor sent under these names is dropped
  headers.set('accept-encoding', 'identity');
  const ip = ipAddress(request);
  const secret = env('RESQ_PROXY_SECRET');
  if (ip && secret) { headers.set('x-resq-client-ip', ip); headers.set('x-resq-proxy-secret', secret); }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual', duplex: 'half' };
  const upstream = await fetch(target, init);
  const out = new Headers(upstream.headers);
  out.delete('content-encoding'); out.delete('content-length'); out.delete('transfer-encoding');
  out.set('x-resq-forwarded', ip && secret ? 'yes' : ip ? 'no-secret' : 'no-ip');
  out.set('x-resq-seen-ip', ip ?? '');                                                       // TEMPORARY: the visitor's own address, to check what the platform reports
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
