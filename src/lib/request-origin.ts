/**
 * Public origin the browser is on (BunnyCDN / proxy aware).
 *
 * BunnyCDN does not send X-Forwarded-Host. It sends CDN-Host as the visitor
 * hostname and replaces Host with the Vercel origin unless "Forward Host
 * Header" is enabled. Using request.url alone therefore redirects users onto
 * *.vercel.app after OAuth and drops the session cookies set for *.b-cdn.net.
 */
export function publicRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const headers = request.headers;

  const bunnyHost = headers.get("cdn-host")?.split(",")[0]?.trim();
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = bunnyHost || forwardedHost;

  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host && !host.includes("localhost") ? "https" : null) ||
    url.protocol.replace(":", "");

  if (host) {
    return `${proto}://${host}`;
  }

  return url.origin;
}

export function publicRequestUrl(request: Request, pathnameWithSearch: string): URL {
  const origin = publicRequestOrigin(request);
  return new URL(pathnameWithSearch, origin.endsWith("/") ? origin : `${origin}/`);
}
