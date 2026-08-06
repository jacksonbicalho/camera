# Análise de vídeo (YOLO)

O sistema suporta análise automática de gravações usando modelos YOLO via um microserviço
Python opcional. Cada chunk MP4 fechado é enviado ao serviço para detecção de objetos;
o resultado é exibido na interface web junto ao evento de movimento correspondente.

---

## Pré-requisitos

- Docker instalado no host
- Para GPU NVIDIA: [`nvidia-container-toolkit`](#gpu-nvidia) instalado

---

## Subir o serviço

O serviço é totalmente independente do `docker-compose.yml` da câmera — tem
seu próprio compose file em `services/yolo/`. Ele só precisa (1) estar
acessível pela URL configurada em quem for usá-lo — detector, trainer ou o
seletor de classificação de estado (ver "Configuração na interface web"
abaixo) — e (2) montar o **mesmo diretório de storage** usado pela
instância da câmera que vai consumi-lo (os paths de arquivo trocados via API, ex. `/data/state_samples/...`,
são resolvidos dentro do container do YOLO a partir desse volume). Copie
`services/yolo/.env.example` para `services/yolo/.env` e ajuste
`YOLO_STORAGE_PATH`/`YOLO_MODELS_PATH` antes de subir.

### Sem GPU (CPU — funciona em qualquer hardware, incluindo Raspberry Pi)

```bash
docker compose -f services/yolo/docker-compose.yml up -d
```

### Com GPU NVIDIA

```bash
docker compose -f services/yolo/docker-compose.yml -f services/yolo/docker-compose.nvidia.yml up -d
```

> O arquivo `docker-compose.nvidia.yml` adiciona o device reservation para NVIDIA.
> Requer `nvidia-container-toolkit` instalado no host (veja abaixo).

### Verificar se a GPU está sendo usada

```bash
docker compose -f services/yolo/docker-compose.yml exec yolo nvidia-smi
```

---

## GPU NVIDIA

### Instalar nvidia-container-toolkit

```bash
# Adicionar repositório
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Instalar e configurar
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

---

## Configuração na interface web

Não existe um form único "ligar a análise" — cada papel tem seu próprio
cadastro, todos apontando pro(s) mesmo(s) container(es) YOLO:

| Papel | Onde configurar | O que cadastra |
|---|---|---|
| **Análise por câmera** (detecção de objetos nas gravações) | Configurações → Detectores de objetos (cadastro do detector) + Configurações → Câmeras → Análise (por câmera) | URL do serviço + modelo (livre, ex. `yolov8n`, `custom+yolov8n`) no detector; habilita/desabilita e escolhe o detector por câmera |
| **Fine-tuning** (treinar um modelo personalizado) | Configurações → Treinadores | URL do serviço + modelo base (livre, default `yolov8n`) |
| **Classificação de estado** | Configurações → Análise de vídeo | Escolhe, num `<select>`, qual trainer já cadastrado (acima) fornece o serviço — não digita URL de novo |

---

## Modelos disponíveis

### Recomendações por hardware

| Hardware | Análise | Fine-tuning |
|---|---|---|
| Raspberry Pi / CPU | `yolov8n` | inviável (horas) |
| GPU 4GB (ex: RTX 3050) | qualquer | `yolov8n`, `yolov8s`, `yolo11n`, `yolo11s` |
| GPU 8GB+ | qualquer | qualquer |

### Tamanhos disponíveis

Cada geração oferece cinco tamanhos — nano (n), small (s), medium (m), large (l), extra (x):

| Geração | Modelos | Característica |
|---|---|---|
| **YOLOv8** | yolov8n … yolov8x | Estável, bem documentado |
| **YOLO11** | yolo11n … yolo11x | Mais preciso que v8 no mesmo tamanho |
| **YOLO12** | yolo12n … yolo12x | Mais recente, baseado em attention |

> Modelos `l` e `x` requerem 6GB+ de VRAM para fine-tuning. Para inferência, cabem em 4GB.

### Modo combinado

O campo **Modelo** do detector (Configurações → Detectores de objetos) aceita
`custom+yolov8n` — executa os dois modelos e une os resultados. Útil para
complementar o modelo fine-tunado (que conhece seus objetos específicos) com
a detecção genérica do modelo base.

---

## Fine-tuning

O fine-tuning treina um modelo personalizado (`custom.pt`) usando os snapshots que você
anotou na seção **Rotular eventos**.

### Fluxo

1. Cadastre um trainer em **Configurações → Treinadores** (URL do serviço +
   modelo base, default `yolov8n`)
2. Acesse **Configurações → Análise de vídeo → Rotular eventos**
3. Atribua labels e bounding boxes aos eventos de movimento
4. Em **Fine-tuning**, escolha o trainer cadastrado e as épocas, clique em
   **Treinar agora** — o progresso aparece em tempo real
5. Após concluir, o modelo treinado (`custom.pt`) fica disponível pra
   qualquer detector cadastrado (Configurações → Detectores de objetos) que
   aponte pro nome `custom` (ou `custom+<modelo base>`, modo combinado) —
   não existe mais um "modelo ativo" global pra selecionar

### Épocas recomendadas

| Dataset | Épocas |
|---|---|
| < 50 exemplos | 20–50 |
| 50–200 exemplos | 30–80 |
| > 200 exemplos | 50–100 |

> Muitas épocas com poucos dados causam overfitting — o modelo decora os exemplos
> em vez de generalizar.

---

## Arquitetura

```
Go (camera server)
      │  HTTP POST /analyze
      ▼
Python FastAPI (services/yolo/) — porta 8001
      ├── POST /analyze          → inferência em arquivo MP4
      ├── POST /finetune         → inicia treino em background
      ├── GET  /finetune/status/{id} → progresso do treino
      └── DELETE /finetune/{id}  → cancela treino
```

O serviço mantém os modelos carregados em memória entre requisições. O modelo fine-tunado
fica em `./models/custom.pt` (volume compartilhado com o host).
