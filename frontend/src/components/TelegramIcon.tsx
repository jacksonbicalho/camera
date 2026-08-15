import type { SVGProps } from 'react'
import { siTelegram } from 'simple-icons'

// TelegramIcon — logo de marca do Telegram, via `simple-icons` (path data
// real, não path.tsx-style "inventado" — ver header de Icons.tsx: a
// lucide-react (fonte dos ícones genéricos do app) não tem logos de marca).
// Wrapper fino pra não espalhar o import de `simple-icons` por vários
// arquivos.
export function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d={siTelegram.path} />
    </svg>
  )
}
