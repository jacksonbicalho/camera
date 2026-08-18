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


# ── CA4: lock de GPU (T3, work_progress/stories/202607251518_fine-tuning-yolo-gpu.md) ──
# Serializa /analyze e o corpo de treino de _run_finetune em torno de
# main._gpu_lock — evita OOM por treino+inferência concorrentes na mesma GPU.


def test_ca4_analyze_returns_503_when_gpu_busy():
    main._gpu_lock.acquire()  # simula um treino/outra inferência em andamento
    try:
        resp = client.post(
            "/analyze", json={"path": "/nonexistent.mp4", "model": "yolov8n", "confidence_threshold": 0.4}
        )
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


# história chore/remover-classificacao-estados-yolo — a última das 3 histórias
# sequenciais que removem classificação de estado do sistema (frontend e backend Go
# já removidos). /analyze e /finetune (detecção de objeto) ficam intactos.
def test_ca2_classify_endpoints_removed():
    assert client.get("/classify/models").status_code == 404
    assert client.post("/classify", json={"path": "/x.jpg", "model": "custom-cls"}).status_code == 404
    assert client.post("/classify/train", json={"samples": []}).status_code == 404
