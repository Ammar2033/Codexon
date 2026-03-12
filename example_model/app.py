from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np

app = FastAPI()


class InferenceInput(BaseModel):
    input: dict


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(input_data: InferenceInput):
    data = input_data.input.get("data", [])
    if not isinstance(data, list):
        data = [data]

    arr = np.array(data)
    if arr.size == 0:
        arr = np.random.randn(10)

    result = np.argmax(arr)
    confidence = float(np.max(arr) / (np.sum(arr) + 1e-8))

    return {
        "result": int(result),
        "confidence": confidence,
        "classes": ["cat", "dog", "bird", "car", "person"],
    }


@app.get("/")
def root():
    return {"message": "Example Image Classifier"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
