import { Badge } from './ui/badge'

// Badge da role do usuário — variante info (azul) pra admin, neutra pros
// demais, mesmo componente Badge (ui/badge.tsx) usado pelos outros badges do
// sistema (StatusBadges de CamerasSettingsPage, método do DiscoverPage).
export default function RoleBadge({ role }: { role: string }) {
  return <Badge variant={role === 'admin' ? 'info' : 'neutral'}>{role}</Badge>
}
