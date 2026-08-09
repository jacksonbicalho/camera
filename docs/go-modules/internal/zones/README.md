# internal/zones

Tipo de dado puro (`Zone`) pras zonas de exclusão/detecção desenhadas no
canvas de câmera — sem lógica de detecção em si (isso é `internal/motion`),
só o shape compartilhado entre persistência (`internal/db`), API
(`internal/server`) e o diff mascarado.

## Arquivos principais
- `zones.go` — `Zone` (retângulo normalizado `X/Y/W/H`, `Type` — `"exclude"`
  por padrão ou `"detect"` — mais overrides opcionais por zona:
  `Threshold`/`CooldownSeconds`/`FPS`/`Scale`/`Color`/`RotationDeg`, todos
  "0 = herdado da câmera" quando não setados) e `IsExclude()` — zonas
  `"detect"` são excluídas do diff global mas avaliadas independentemente
  (ver `internal/motion`).

## Ver também
- [internal/motion](../motion/README.md) — consome `Zone` pro diff mascarado e pras zonas "detect".
