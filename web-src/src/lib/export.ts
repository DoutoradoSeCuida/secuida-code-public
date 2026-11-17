export async function exportData(data: unknown, fileName='code-export.json') {
  if(!/^[a-z0-9_-]{1,25}\.json$/.test(fileName)) throw new Error('Nome de exportação inválido.');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
