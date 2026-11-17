export function HelpSurface({ page, anchor }: { page: string; anchor: string }) {
  return <iframe title="Ajuda SeCuida Code" src={new URL(`./help/${page}.html#${anchor}`, document.baseURI).href} style={{ border: 0, width: '100%', height: '70vh', minHeight: 420 }} />;
}
