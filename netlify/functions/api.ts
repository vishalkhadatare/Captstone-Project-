const BACKEND_ORIGIN = 'https://backed-repeated-aerobics.ngrok-free.dev';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export default async (request: Request): Promise<Response> => {
  const incomingUrl = new URL(request.url);
  const functionPrefix = '/.netlify/functions/api/';
  const pathFromUrl = incomingUrl.pathname.startsWith(functionPrefix)
    ? incomingUrl.pathname.slice(functionPrefix.length)
    : '';
  const originalPath = [
    incomingUrl.searchParams.get('path'),
    incomingUrl.searchParams.get('splat'),
    incomingUrl.searchParams.get('redirected-from'),
    incomingUrl.searchParams.get('x-nf-original-path'),
    request.headers.get('x-nf-original-path'),
    request.headers.get('x-original-url'),
    request.headers.get('x-forwarded-uri'),
  ].find(value => value && value.length > 0) || '';
  const path = pathFromUrl || originalPath.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/api\//, '');
  if (!path || path.includes('..')) {
    return new Response('Missing API path.', { status: 400 });
  }

  const targetUrl = new URL(`/api/${path}`, BACKEND_ORIGIN);
  for (const [key, value] of incomingUrl.searchParams) {
    if (key !== 'path') targetUrl.searchParams.append(key, value);
  }

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set('ngrok-skip-browser-warning', '1');

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = request.body ?? undefined;
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // Required by Node fetch when streaming a request body.
      ...(body ? { duplex: 'half' as const } : {}),
    });

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend proxy request failed.';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
};
