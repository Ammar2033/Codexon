"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCodexonWizard = runCodexonWizard;
const vscode = __importStar(require("vscode"));
async function runCodexonWizard() {
    // 1. Model Name
    const name = await vscode.window.showInputBox({
        prompt: "Model Name",
        validateInput: text => text ? null : 'Model name is required'
    });
    if (!name)
        return;
    // 2. Runtime Framework
    const framework = await vscode.window.showQuickPick(['onnx', 'pytorch', 'tensorflow'], {
        placeHolder: 'Select Framework'
    });
    if (!framework)
        return;
    // 3. Resources (CPU & Memory)
    const cpu = await vscode.window.showInputBox({ prompt: "CPU Cores", value: "2" });
    const memory = await vscode.window.showInputBox({ prompt: "Memory (e.g. 4GB)", value: "4GB" });
    // 4. Billing
    const price = await vscode.window.showInputBox({ prompt: "Price per Request", value: "0.002" });
    const codexonData = {
        model: { name, version: "1.0", description: "" },
        runtime: { framework, python: "3.12" },
        resources: { cpu: Number(cpu), memory, gpu: 0 },
        api: { endpoint: "/predict" },
        billing: { price_per_request: Number(price) }
    };
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(codexonData, null, 2),
        language: 'codexon'
    });
    await vscode.window.showTextDocument(doc);
}
//# sourceMappingURL=wizard.js.map