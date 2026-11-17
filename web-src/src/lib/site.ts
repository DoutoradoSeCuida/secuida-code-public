export type Site = {
  appUrl: string;
  restUrl: string;
  nonce: string;
  siteScope: string;
  loginUrl: string;
  registerUrl: string;
  resetUrl: string;
  logoutUrl: string;
  executorUrl: string;
};

export function site(): Site {
  const context = (globalThis as typeof globalThis & { SC_CODE_PUBLIC?: Site }).SC_CODE_PUBLIC;
  if (!context) throw new Error('Abra o SeCuida Code Público pelo seu site WordPress.');
  return context;
}

export function storageKey(name: string): string {
  return `sc-code-public.${site().siteScope}.${name}`;
}

export function accountPage(path: string): void {
  const topWindow = window.top || window;
  topWindow.location.assign(path);
}
