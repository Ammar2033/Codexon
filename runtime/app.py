from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import json
import os
import sys

app = FastAPI()

class InferenceInput(BaseModel):
    input: dict

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    import onnxruntime
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

model = None
model_type = None
config = {}

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

def load_model():
    global model, model_type, config
    
    config_path = os.path.join(MODEL_DIR, 'aimodel.codexon')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = json.load(f)
    
    model_dir = os.path.join(MODEL_DIR, 'model')
    
    onnx_path = os.path.join(model_dir, 'model.onnx')
    pt_path = os.path.join(model_dir, 'model.pt')
    
    if os.path.exists(onnx_path) and ONNX_AVAILABLE:
        model = onnxruntime.InferenceSession(onnx_path)
        model_type = 'onnx'
        print(f"Loaded ONNX model from {onnx_path}")
    elif os.path.exists(pt_path) and TORCH_AVAILABLE:
        model = torch.load(pt_path)
        model_type = 'pytorch'
        print(f"Loaded PyTorch model from {pt_path}")
    else:
        print("No model found, running in mock mode")

load_model()

@app.get("/health")
def health():
    return {"status": "ok", "model_type": model_type}

@app.post("/predict")
def predict(input_data: InferenceInput):
    if model is None:
        return {"result": "mock_response", "input": input_data.input}
    
    if model_type == 'onnx':
        input_name = model.get_inputs()[0].name
        result = model.run(None, {input_name: [input_data.input.get('data', [])}])
        return {"result": result[0].tolist()}
    
    elif model_type == 'pytorch':
        tensor_input = torch.tensor(input_data.input.get('data', []))
        with torch.no_grad():
            result = model(tensor_input)
        return {"result": result.tolist()}
    
    return {"result": "mock_response", "input": input_data.input}

@app.get("/")
def root():
    return {"message": "Codexon Model Runtime", "model_type": model_type}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)