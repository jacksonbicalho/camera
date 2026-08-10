# internal/detector/adapters

Os dois backends de detecção de objetos hoje, cada um implementando
`detector.Detector`.

## Arquivos principais
- `yolo.go` — `Yolo`/`NewYolo(serviceURL, model)`: casca fina sobre
  `analysis.Client.Analyze`, passando o `model` configurado.
- `huggingface.go` — `HuggingFace`/`NewHuggingFace(modelID, token,
  baseURL)`: chama a Inference API do Hugging Face diretamente (sem passar
  pelo serviço YOLO). `loadImage` decide entre ler o arquivo direto (já é
  imagem — caso do upload de teste ad-hoc) ou extrair 1 frame via ffmpeg
  (caso da análise automática de gravações, que chama `Detect` com um
  caminho de MP4 — a Inference API só entende imagem estática);
  `extractVideoFrame` tenta o 1º frame e, se vier vazio, recua pro último
  frame do arquivo (`-sseof -1`, mesmo padrão de fallback do
  `extractFrame` em `cmd/camera/main.go`).

## Ver também
- [internal/detector](../README.md) — a interface `Detector` e o discriminador `New(detectorType, config)`.
- [internal/analysis](../../analysis/README.md) — `Client.Analyze`/`Detection` (tipo concreto, consumido direto por `yolo.go` — não a interface `Analyzer`).
