#!/usr/bin/env python3
import asyncio
import json
import os
import time
from datetime import datetime
from typing import Any, List, Optional
import logging

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Codexon GPU Worker")

MODEL_DIR = os.environ.get("MODEL_DIR", "/app/model")
MODEL_ID = os.environ.get("MODEL_ID", "unknown")
MODEL_VERSION = os.environ.get("MODEL_VERSION", "1.0")
TRACE_ID = os.environ.get("TRACE_ID", "")

model = None
model_type = None
model_loaded_at = None


class InferenceInput(BaseModel):
    input: Any = {}
    request_id: Optional[str] = None


class BatchInferenceInput(BaseModel):
    inputs: List[Any]


class InferenceResponse(BaseModel):
    request_id: str
    result: Any
    latency: float
    gpu_time: Optional[float] = None
    timestamp: str
    trace_id: Optional[str] = None


def load_model():
    global model, model_type, model_loaded_at

    logger.info(f"Loading model from {MODEL_DIR}")

    onnx_path = os.path.join(MODEL_DIR, "model.onnx")
    pt_path = os.path.join(MODEL_DIR, "model.pt")

    try:
        if os.path.exists(onnx_path):
            import onnxruntime as ort

            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = (
                ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            )
            model = ort.InferenceSession(onnx_path, sess_options=sess_options)
            model_type = "onnx"
            model_loaded_at = datetime.now()
            logger.info(f"ONNX model loaded from {onnx_path}")
            return
    except Exception as e:
        logger.warning(f"Failed to load ONNX: {e}")

    try:
        if os.path.exists(pt_path):
            import torch

            model = torch.load(pt_path, map_location="cpu")
            model.eval()
            model_type = "pytorch"
            model_loaded_at = datetime.now()
            logger.info(f"PyTorch model loaded from {pt_path}")
            return
    except Exception as e:
        logger.warning(f"Failed to load PyTorch: {e}")

    model_type = "mock"
    model_loaded_at = datetime.now()
    logger.info("Running in mock mode")


def warmup():
    if model_type == "onnx" and model:
        input_name = model.get_inputs()[0].name
        dummy_input = [[0.0] * 10]
        model.run(None, {input_name: dummy_input})
    elif model_type == "pytorch" and model:
        import torch

        dummy_input = torch.zeros(1, 10)
        with torch.no_grad():
            _ = model(dummy_input)
    logger.info("Warmup complete")


@app.on_event("startup")
async def startup():
    load_model()
    warmup()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "model_type": model_type,
        "model_loaded_at": model_loaded_at.isoformat() if model_loaded_at else None,
        "trace_id": TRACE_ID,
    }


@app.get("/metrics")
async def metrics():
    import psutil

    return {
        "model_id": MODEL_ID,
        "uptime_seconds": (datetime.now() - model_loaded_at).total_seconds()
        if model_loaded_at
        else 0,
        "memory_usage_mb": psutil.Process().memory_info().rss / 1024 / 1024,
        "cpu_percent": psutil.Process().cpu_percent(),
    }


@app.post("/predict", response_model=InferenceResponse)
async def predict(input_data: InferenceInput, request: Request):
    start_time = time.time()
    request_id = input_data.request_id or f"req_{int(start_time * 1000)}"
    trace_id = request.headers.get("X-Trace-ID") or TRACE_ID or request_id

    logger.info(f"Processing request {request_id}, trace_id: {trace_id}")

    try:
        if model is None or model_type == "mock":
            result = {
                "prediction": "mock_result",
                "confidence": 0.95,
                "trace_id": trace_id,
            }
        elif model_type == "onnx":
            input_name = model.get_inputs()[0].name
            input_array = [input_data.input.get("data", [0] * 10)]
            outputs = model.run(None, {input_name: input_array})
            result = {
                "prediction": int(outputs[0][0].argmax()),
                "probabilities": outputs[0][0].tolist(),
                "trace_id": trace_id,
            }
        elif model_type == "pytorch":
            import torch

            input_tensor = torch.tensor([input_data.input.get("data", [0] * 10)])
            with torch.no_grad():
                output = model(input_tensor)
            result = {
                "prediction": int(output[0].argmax()),
                "probabilities": output[0].tolist(),
                "trace_id": trace_id,
            }
        else:
            result = {"error": "Unknown model type", "trace_id": trace_id}

        latency = (time.time() - start_time) * 1000

        return InferenceResponse(
            request_id=request_id,
            result=result,
            latency=latency,
            timestamp=datetime.now().isoformat(),
            trace_id=trace_id,
        )
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/batch", response_model=List[InferenceResponse])
async def batch_predict(batch_input: BatchInferenceInput, request: Request):
    trace_id = request.headers.get("X-Trace-ID") or TRACE_ID
    results = []

    batch_size = 8
    for i in range(0, len(batch_input.inputs), batch_size):
        batch = batch_input.inputs[i : i + batch_size]
        batch_start = time.time()

        try:
            if model is None or model_type == "mock":
                batch_results = [
                    {"prediction": "mock", "batch_index": j} for j in range(len(batch))
                ]
            elif model_type == "onnx":
                import numpy as np

                input_name = model.get_inputs()[0].name
                input_arrays = np.array([inp.get("data", [0] * 10) for inp in batch])
                outputs = model.run(None, {input_name: input_arrays})
                batch_results = [
                    {"prediction": int(outputs[0][j].argmax()), "batch_index": j}
                    for j in range(len(batch))
                ]
            elif model_type == "pytorch":
                import torch

                input_tensors = torch.tensor(
                    [inp.get("data", [0] * 10) for inp in batch]
                )
                with torch.no_grad():
                    outputs = model(input_tensors)
                batch_results = [
                    {"prediction": int(outputs[j].argmax()), "batch_index": j}
                    for j in range(len(batch))
                ]
            else:
                batch_results = [{"error": "Unknown"}]
        except Exception as e:
            logger.warning(f"Batch error: {e}")
            batch_results = [{"error": str(e)} for _ in batch]

        batch_latency = (time.time() - batch_start) * 1000

        for j, br in enumerate(batch_results):
            results.append(
                InferenceResponse(
                    request_id=f"batch_{i + j}_{int(time.time() * 1000)}",
                    result=br,
                    latency=batch_latency / len(batch),
                    timestamp=datetime.now().isoformat(),
                    trace_id=f"{trace_id}_batch_{i // batch_size}",
                )
            )

    return results


@app.post("/stream")
async def stream_predict(input_data: InferenceInput, request: Request):
    trace_id = (
        request.headers.get("X-Trace-ID")
        or TRACE_ID
        or f"stream_{int(time.time() * 1000)}"
    )

    async def generate():
        text = input_data.input.get("text", "Streaming response")
        words = text.split()

        for i, word in enumerate(words):
            chunk = {
                "token": i + 1,
                "text": word + " ",
                "done": False,
                "trace_id": trace_id,
            }
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.05)

        final_chunk = {
            "token": len(words),
            "text": "",
            "done": True,
            "trace_id": trace_id,
        }
        yield f"data: {json.dumps(final_chunk)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/")
async def root():
    return {
        "service": "Codexon GPU Worker",
        "model_id": MODEL_ID,
        "version": MODEL_VERSION,
        "status": "running",
        "trace_id": TRACE_ID,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
