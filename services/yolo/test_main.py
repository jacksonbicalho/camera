"""Testes do serviço YOLO.

As deps pesadas (torch/ultralytics/cv2) são stubadas via sys.modules ANTES de
importar `main`, então os testes rodam numa imagem Python slim, sem GPU nem
torch/ultralytics instalados — só fastapi/pydantic/pyyaml/httpx/pytest.
"""
import sys
import threading
import time
import types
from pathlib import Path

import pytest


# ── stubs das deps pesadas ──────────────────────────────────────────────────
class _FakeProbs:
    def __init__(self, data):
        self.data = data


class _FakeResult:
    def __init__(self, probs):
        self.probs = _FakeProbs(probs)


class FakeYOLO:
    """Mímica mínima do ultralytics.YOLO para classificação."""
    last_train_kwargs = None

    def __init__(self, path):
        self.path = path
        self.names = {0: "aberto", 1: "fechado"}

    def predict(self, source, **kw):
        return [_FakeResult([0.2, 0.8])]  # → top1 = índice 1 = "fechado"

    def train(self, **kw):
        FakeYOLO.last_train_kwargs = kw
        # simula o best.pt para o worker conseguir salvar o modelo
        best = Path(kw["project"]) / kw["name"] / "weights" / "best.pt"
        best.parent.mkdir(parents=True, exist_ok=True)
        best.write_bytes(b"trained")

    def add_callback(self, *a, **k):
        pass


def _install_stubs():
    torch = types.ModuleType("torch")
    torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    sys.modules["torch"] = torch
    sys.modules["cv2"] = types.ModuleType("cv2")
    ultra = types.ModuleType("ultralytics")
    ultra.YOLO = FakeYOLO
    sys.modules["ultralytics"] = ultra


_install_stubs()

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)


# ── /classify (inferência) ──────────────────────────────────────────────────
def test_classify_returns_probabilities(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "MODEL_DIR", tmp_path)
    (tmp_path / "custom-cls.pt").write_bytes(b"model")  # modelo treinado existe
    img = tmp_path / "crop.jpg"
    img.write_bytes(b"fake")
    resp = client.post("/classify", json={"path": str(img), "model": "custom-cls"})
    assert resp.status_code == 200
    body = resp.json()
    labels = {p["label"]: p["prob"] for p in body["predictions"]}
    assert labels == {"aberto": 0.2, "fechado": 0.8}
    assert body["top"] == "fechado"


def test_classify_missing_file_404(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "MODEL_DIR", tmp_path)
    (tmp_path / "custom-cls.pt").write_bytes(b"m")
    resp = client.post("/classify", json={"path": "/nope.jpg", "model": "custom-cls"})
    assert resp.status_code == 404


def test_classify_untrained_model_404(tmp_path, monkeypatch):
    # modelo ainda não treinado → 404 limpo, sem estourar o ultralytics
    monkeypatch.setattr(main, "MODEL_DIR", tmp_path)
    img = tmp_path / "crop.jpg"
    img.write_bytes(b"fake")
    resp = client.post("/classify", json={"path": str(img), "model": "custom-cls-99"})
    assert resp.status_code == 404


# ── /classify/models ────────────────────────────────────────────────────────
def test_classify_models_lists_cls_models():
    resp = client.get("/classify/models")
    assert resp.status_code == 200
    names = [m["name"] for m in resp.json()["models"]]
    assert "yolov8n-cls" in names


# ── dataset builder (pastas por classe) ─────────────────────────────────────
def test_build_classify_dataset_creates_class_folders(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    samples = []
    for i, label in enumerate(["aberto", "fechado", "aberto"]):
        f = src / f"{i}.jpg"
        f.write_bytes(b"x")
        samples.append(main.ClassifySample(image_path=str(f), label=label))
    root, labels = main._build_classify_dataset(samples, tmp_path / "ds")
    assert set(labels) == {"aberto", "fechado"}
    # train/ e val/ com subpasta por classe
    for split in ("train", "val"):
        assert (root / split / "aberto").is_dir()
        assert (root / split / "fechado").is_dir()
    # 3 imagens distribuídas nas pastas de train
    train_imgs = list((root / "train").rglob("*.jpg"))
    assert len(train_imgs) == 3


def test_build_classify_dataset_requires_two_classes(tmp_path):
    src = tmp_path / "s"
    src.mkdir()
    f = src / "a.jpg"
    f.write_bytes(b"x")
    samples = [main.ClassifySample(image_path=str(f), label="aberto")]
    with pytest.raises(ValueError):
        main._build_classify_dataset(samples, tmp_path / "ds")


# ── /classify/train ─────────────────────────────────────────────────────────
def test_classify_train_rejects_empty_samples():
    resp = client.post("/classify/train", json={"samples": [], "base_model": "yolov8n-cls"})
    assert resp.status_code == 400


def test_classify_train_size_guard_blocks_large(tmp_path):
    f = tmp_path / "a.jpg"
    f.write_bytes(b"x")
    sample = {"image_path": str(f), "label": "aberto"}
    sample2 = {"image_path": str(f), "label": "fechado"}
    resp = client.post(
        "/classify/train",
        json={"samples": [sample, sample2], "base_model": "yolov8x-cls"},
    )
    assert resp.status_code == 400


def test_classify_train_saves_to_named_model(tmp_path, monkeypatch):
    models = tmp_path / "models"
    monkeypatch.setattr(main, "MODEL_DIR", models)
    f = tmp_path / "a.jpg"
    f.write_bytes(b"x")
    samples = [
        {"image_path": str(f), "label": "aberto"},
        {"image_path": str(f), "label": "fechado"},
    ]
    resp = client.post(
        "/classify/train",
        json={"samples": samples, "base_model": "yolov8n-cls", "model": "custom-cls-9", "epochs": 1},
    )
    assert resp.status_code == 200
    job = resp.json()["job_id"]
    status = {}
    for _ in range(60):
        status = client.get(f"/finetune/status/{job}").json()
        if status["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert status.get("status") == "done", status
    assert (models / "custom-cls-9.pt").exists(), "modelo deveria ser salvo no nome pedido"


def test_classify_train_disables_horizontal_flip(tmp_path, monkeypatch):
    # Classes direcionais (entrando/saindo) seriam corrompidas por espelhamento
    # horizontal — o treino de classify deve passar fliplr=0.0.
    monkeypatch.setattr(main, "MODEL_DIR", tmp_path / "models")
    FakeYOLO.last_train_kwargs = None
    f = tmp_path / "a.jpg"
    f.write_bytes(b"x")
    samples = [
        {"image_path": str(f), "label": "com-pessoa-entrando"},
        {"image_path": str(f), "label": "com-pessoa-saindo"},
    ]
    resp = client.post(
        "/classify/train",
        json={"samples": samples, "base_model": "yolov8n-cls", "epochs": 1},
    )
    assert resp.status_code == 200
    job = resp.json()["job_id"]
    for _ in range(60):
        status = client.get(f"/finetune/status/{job}").json()
        if status["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert FakeYOLO.last_train_kwargs is not None, "model.train não foi chamado"
    assert FakeYOLO.last_train_kwargs.get("fliplr") == 0.0


def test_classify_train_returns_job_id(tmp_path):
    f = tmp_path / "a.jpg"
    f.write_bytes(b"x")
    samples = [
        {"image_path": str(f), "label": "aberto"},
        {"image_path": str(f), "label": "fechado"},
    ]
    resp = client.post(
        "/classify/train",
        json={"samples": samples, "base_model": "yolov8n-cls", "epochs": 1},
    )
    assert resp.status_code == 200
    assert "job_id" in resp.json()


# ── CA4: lock de GPU (T3, work_progress/stories/202607251518_fine-tuning-yolo-gpu.md) ──
# Serializa /analyze, /classify e o corpo de treino de _run_finetune/_run_classify_train
# em torno de main._gpu_lock — evita OOM por treino+inferência concorrentes na mesma GPU.


def test_ca4_analyze_returns_503_when_gpu_busy():
    main._gpu_lock.acquire()  # simula um treino/outra inferência em andamento
    try:
        resp = client.post(
            "/analyze", json={"path": "/nonexistent.mp4", "model": "yolov8n", "confidence_threshold": 0.4}
        )
        assert resp.status_code == 503
    finally:
        main._gpu_lock.release()


def test_ca4_classify_returns_503_when_gpu_busy():
    main._gpu_lock.acquire()
    try:
        resp = client.post("/classify", json={"path": "/nonexistent.jpg", "model": "custom-cls"})
        assert resp.status_code == 503
    finally:
        main._gpu_lock.release()


def test_ca4_analyze_proceeds_normally_when_gpu_free():
    # GPU livre → passa do gate do lock e chega na checagem normal seguinte
    # (arquivo inexistente → 404, não 503).
    resp = client.post(
        "/analyze", json={"path": "/nonexistent.mp4", "model": "yolov8n", "confidence_threshold": 0.4}
    )
    assert resp.status_code == 404


def test_ca4_finetune_blocks_until_gpu_free(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "MODEL_DIR", tmp_path / "models")
    monkeypatch.setattr(main, "_build_dataset", lambda annotations, work_dir: work_dir / "data.yaml")
    FakeYOLO.last_train_kwargs = None

    req = main.FinetuneRequest(
        annotations=[
            main.AnnotationItem(
                image_path="x.jpg", label="person", bbox_x=0.1, bbox_y=0.1, bbox_w=0.5, bbox_h=0.5
            )
        ],
        base_model="yolov8n",
        epochs=1,
    )
    job_id = "job-ca4-finetune"
    main._jobs[job_id] = {"status": "pending", "epoch": 0, "total_epochs": 1, "error": ""}
    main._cancel_events[job_id] = threading.Event()

    main._gpu_lock.acquire()  # simula GPU ocupada (outro treino ou inferência)
    t = threading.Thread(target=main._run_finetune, args=(job_id, req), daemon=True)
    try:
        t.start()
        time.sleep(0.2)
        assert FakeYOLO.last_train_kwargs is None, "não deveria treinar com a GPU ocupada"
    finally:
        main._gpu_lock.release()

    t.join(timeout=5)
    assert not t.is_alive(), "thread de treino não terminou a tempo depois da GPU liberar"
    assert FakeYOLO.last_train_kwargs is not None, "deveria treinar assim que a GPU ficou livre"
