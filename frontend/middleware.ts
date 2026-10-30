import { ipAddress, next } from '@vercel/functions';

/** The API is reached through this site (see vercel.json), so it would only see this site's address. Pass the visitor's address along with a shared secret so the API can trust it. */
export const config = { matcher: '/api/:path*' };

export default function middleware(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete('x-resq-client-ip');            // anything the visitor sent under these names is dropped
  headers.delete('x-resq-proxy-secret');
  const ip = ipAddress(request);
  const secret = process.env.RESQ_PROXY_SECRET;
  if (ip && secret) { headers.set('x-resq-client-ip', ip); headers.set('x-resq-proxy-secret', secret); }
  return next({ request: { headers } });
}
