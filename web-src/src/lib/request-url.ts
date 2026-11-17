let readSequence = 0;

// Custom-token authentication is invisible to some intermediaries' cache keys.
// Never reuse a GET URL for account/event reads, including after a mutation.
export function requestUrl(url: string, method: string) {
  if (method.toUpperCase() !== 'GET') return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_sc_read=${Date.now().toString(36)}-${++readSequence}`;
}
