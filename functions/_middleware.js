export async function onRequest(context) {
  const res = await context.next();
  const url = new URL(context.request.url);
  const ct = res.headers.get('content-type') || '';
  if (context.request.method !== 'GET' || !ct.includes('text/html') || !['/','/index.html'].includes(url.pathname)) return res;
  let html = await res.text();
  if (!html.includes('/js/curriculum.js')) html = html.replace('<script>', '<script src="/js/curriculum.js"></script>\n<script>');
  if (!html.includes('/js/k5-integration.js')) html = html.replace('</body>', '<script src="/js/k5-integration.js"></script>\n<script src="/js/k5-compat.js"></script>\n</body>');
  const headers = new Headers(res.headers); headers.delete('content-length');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}
