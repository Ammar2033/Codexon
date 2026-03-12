import * as vscode from 'vscode';

export async function runCodexonWizard() {
    // 1. Model Name
    const name = await vscode.window.showInputBox({ 
        prompt: "Model Name", 
        validateInput: text => text ? null : 'Model name is required' 
    });
    if (!name) return;

    // 2. Runtime Framework
    const framework = await vscode.window.showQuickPick(['onnx', 'pytorch', 'tensorflow'], { 
        placeHolder: 'Select Framework' 
    });
    if (!framework) return;

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