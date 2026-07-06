# Configuração

O arquivo `camera.yaml` é o **bootstrap mínimo** do sistema. Ele define apenas o necessário para o servidor iniciar pela primeira vez. Toda configuração de câmeras, detecção de movimento e zonas de exclusão é feita via interface web e persistida no banco SQLite.

Use o wizard interativo para gerar o arquivo:

```bash
camera init
camera init --output /etc/camera/camera.yaml
```

Ou copie e edite o exemplo:

```bash
cp camera.yaml.example camera.yaml
```

---

## Referência completa

```yaml
debug: false                      # env: OS_CAMERA_DEBUG
timezone: America/Sao_Paulo       # env: OS_CAMERA_TIMEZONE

db_path: /var/camera/data/camera.db

log:
  output: stdout        # stdout | file
  path:                 # diretório quando output: file
  # rotação (somente output: file) — defaults mostrados:
  # max_size_mb: 50     # rotaciona ao atingir este tamanho
  # max_age_days: 30    # apaga rotacionados mais velhos que isto (0 = ilimitado)
  # max_backups: 10     # máx. de rotacionados por nível (0 = ilimitado)
  # compress: true      # comprime os rotacionados em gzip

server:
  port: 8080
  segments_path: /var/camera/data/hls
  jwt_secret: ""        # env: OS_CAMERA_JWT_SECRET

storage:
  path: /var/camera/data/recordings   # env: OS_CAMERA_STORAGE_PATH
  # retenção, tamanho máximo e intervalo de limpeza são configurados
  # via Configurações → Armazenamento na interface web

# smtp:                 # opcional — servidor de e-mail (config only, sem envio ainda)
#   host: smtp.example.com          # env: OS_CAMERA_SMTP_HOST
#   port: 587                       # env: OS_CAMERA_SMTP_PORT
#   username: no-reply@example.com  # env: OS_CAMERA_SMTP_USERNAME
#   password: ""                    # env: OS_CAMERA_SMTP_PASSWORD

admin:
  username: admin
  password: changeme
```

---

## Campos

### Raiz

| Campo | Padrão | Descrição |
|---|---|---|
| `debug` | `false` | Ativa logs de nível debug |
| `timezone` | `UTC` | Fuso horário para logs e nomes de arquivo (ex: `America/Sao_Paulo`) |
| `db_path` | — | Caminho do banco SQLite; criado automaticamente se não existir |

### `log`

| Campo | Padrão | Descrição |
|---|---|---|
| `output` | `stdout` | Destino dos logs: `stdout` ou `file` |
| `path` | — | Diretório dos arquivos de log quando `output: file`; gera `debug.log`, `info.log`, `warn.log`, `error.log` |
| `max_size_mb` | `50` | Tamanho em que cada arquivo rotaciona (MB). Só se aplica a `output: file` |
| `max_age_days` | `30` | Idade máxima dos arquivos rotacionados antes de apagar; `0` = ilimitado |
| `max_backups` | `10` | Quantidade máxima de arquivos rotacionados por nível; `0` = ilimitado |
| `compress` | `true` | Comprime os arquivos rotacionados em gzip |

> A rotação só vale para `output: file`. Em `output: stdout` quem cuida do tamanho/retenção é o supervisor de processo (Docker/journald/systemd).

### `server`

| Campo | Padrão | Descrição |
|---|---|---|
| `port` | — | Porta HTTP da interface web e API |
| `segments_path` | — | Diretório para os segmentos HLS do streaming ao vivo |
| `jwt_secret` | `""` | Segredo JWT fixo; vazio = gerado aleatoriamente a cada boot (tokens não sobrevivem a reinicializações) |

### `storage`

| Campo | Padrão | Descrição |
|---|---|---|
| `path` | — | Diretório raiz das gravações (env: `OS_CAMERA_STORAGE_PATH`) |

> Retenção, intervalo de limpeza, limite de tamanho e drives S3 são configurados via **Configurações → Armazenamento** na interface web e armazenados no banco de dados.

### `smtp`

| Campo | Padrão | Descrição |
|---|---|---|
| `host` | — | Endereço do servidor SMTP |
| `port` | — | Porta do servidor SMTP |
| `username` | — | Usuário de autenticação SMTP |
| `password` | — | Senha de autenticação SMTP |

> Só a configuração de conexão — ainda não há cliente SMTP nem envio de e-mail implementado.

### `admin`

| Campo | Descrição |
|---|---|
| `username` | Usuário administrador criado na **primeira** inicialização |
| `password` | Senha inicial; o sistema exige troca obrigatória no primeiro login |

> Esses campos só têm efeito na primeira execução. Após a criação do usuário, a senha é gerenciada pela interface web.

---

## Variáveis de ambiente

As variáveis de ambiente sobrescrevem os campos correspondentes do `camera.yaml`:

| Variável | Campo sobrescrito |
|---|---|
| `OS_CAMERA_TIMEZONE` | `timezone` |
| `OS_CAMERA_JWT_SECRET` | `server.jwt_secret` |
| `OS_CAMERA_DEBUG` | `debug` |
| `OS_CAMERA_SMTP_HOST` | `smtp.host` |
| `OS_CAMERA_SMTP_PORT` | `smtp.port` |
| `OS_CAMERA_SMTP_USERNAME` | `smtp.username` |
| `OS_CAMERA_SMTP_PASSWORD` | `smtp.password` |
| `OS_CAMERA_STORAGE_PATH` | `storage.path` |

---

## Estrutura de diretórios

Após a primeira execução, os dados ficam organizados assim:

```
{storage.path}/
└── {camera_id}/
    └── {YYYY}/{MM}/{DD}/
        ├── {HHmmss}.mp4                 ← chunk de gravação
        └── {YYYYMMDDHHmmss}_motion.jpg  ← snapshot do evento de movimento

{server.segments_path}/
└── {camera_id}/
    ├── index.m3u8     ← playlist HLS ao vivo
    └── *.ts           ← segmentos de vídeo

{db_path}              ← banco SQLite (câmeras, usuários, eventos, gravações)
```

Ver também: [Armazenamento](storage.md)
