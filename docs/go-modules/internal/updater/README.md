# internal/updater

Detecta como o sistema pode se atualizar no ambiente em que roda e aplica a
atualização — detecção por CAPACIDADE, não por adivinhar o ambiente.

## Modo de aplicação
`environment.go` — `Detect(execPath)`/`decideApplyMode`: Docker tem
precedência (mesmo com binário gravável, a troca dentro do container seria
efêmera — o certo é pull+recreate via Watchtower, `ApplyDocker`); fora de
Docker, binário gravável vira self-replace (`ApplySelfReplace`); sem escrita,
`ApplyNotify` (só avisa com instruções, não aplica sozinho).

## Fluxo self-replace
`apply.go` — `Applier`/`Apply(ctx, manifest)`: baixa o binário da arquitetura
atual (`download.go`, valida SHA-256), faz snapshot do banco
([internal/dbbackup](../dbbackup/README.md)), troca o binário
(`replace.go`), grava um `Marker` (`.camera-update.json`, só APÓS a troca —
qualquer erro antes dela não deixa efeito) e re-executa. As operações
(`Download`/`Snapshot`/`Replace`/`Reexec`) são todas injetadas, testável sem
rede/FS de binário/exec real.

## Recuperação no boot
`recover.go` — `EvaluateBoot(marker)`: `Attempts==0` é o **trial** (primeiro
boot pós-update, vira `1`); `Attempts>=1` significa que o trial anterior não
confirmou (subiu quebrado e foi reiniciado) → **rollback**. `Rollback`
restaura o binário anterior E o snapshot do banco pareado (via
`dbbackup.Restore`) — os dois voltam juntos, nunca só um.

## Ver também
- [internal/release](../release/README.md) — `Manifest`, o que `Applier.Apply` consome.
- [internal/dbbackup](../dbbackup/README.md) — snapshot/restore do banco, o par do binário em cada troca.
