import * as React from 'react'

import { Button } from '@/components/ui/button'

// ApplyButton — botão "Aplicar" compartilhado (história
// refactor/switch-apply-button-compartilhados, T2), extraído do bloco
// `disabled={saving} / {saving ? 'Aplicando...' : 'Aplicar'}` que existia
// duplicado byte a byte em toda seção "sempre editável" de câmera
// (CameraCaptureSection/CameraRecordingSection/CameraTransmissionSection/
// CameraMotionSection/CameraMotionTelegramNotify) e nos
// cards de extensão (TelegramExtensionCard/S3ExtensionCard). `disabled` é
// combinado com `saving` via OR (ex.: `!hasChanges` nos cards de extensão);
// `type`/`onClick` cobrem tanto o uso dentro de <form onSubmit> (type
// "submit", sem onClick) quanto o uso avulso dos cards de extensão (type
// "button" + onClick).
export interface ApplyButtonProps {
  id: string
  saving: boolean
  disabled?: boolean
  size?: 'default' | 'sm'
  icon?: React.ReactNode
  type?: 'button' | 'submit'
  onClick?: () => void
}

export function ApplyButton({
  id,
  saving,
  disabled,
  size = 'sm',
  icon,
  type = 'submit',
  onClick,
}: ApplyButtonProps) {
  return (
    <Button id={id} type={type} size={size} disabled={saving || disabled} onClick={onClick}>
      {icon}
      {saving ? 'Aplicando...' : 'Aplicar'}
    </Button>
  )
}
