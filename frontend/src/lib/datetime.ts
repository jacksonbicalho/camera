// datetime: formatação de instantes no fuso configurado da instalação.
//
// Convenção do app: o backend serve tudo em UTC ISO no fio e expõe o `timezone` da
// instalação no /api/config; a formatação para a hora local é feita no cliente (mesmo
// padrão do CameraPage). Este é o ponto ÚNICO dessa formatação — em vez de repetir
// `toLocaleString(..., { timeZone })` espalhado.

// formatDateTime localiza um instante ISO (UTC) no `timezone` dado → "dd/MM/aaaa HH:mm:ss".
// ISO inválido → ''. timezone vazio cai em UTC.
export function formatDateTime(iso: string, timezone: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    timeZone: timezone || 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
