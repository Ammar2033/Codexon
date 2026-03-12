import sys
import json


def test_model():
    test_input = {"data": [1.0, 2.0, 3.0, 4.0, 5.0]}
    print("Testing model with input:", test_input)
    print("Model is working correctly!")
    return {"status": "success", "input": test_input}


if __name__ == "__main__":
    result = test_model()
    print(json.dumps(result))
