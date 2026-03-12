import * as vscode from 'vscode';
import { runCodexonWizard } from './wizard';

export function activate(context: vscode.ExtensionContext) {
    // Wizard Komutu
    let wizardCmd = vscode.commands.registerCommand('codexon.openWizard', async () => {
        await runCodexonWizard();
    });

    // Validasyon Komutu (Dosyayı manuel validate etmek için)
    let validateCmd = vscode.commands.registerCommand('codexon.validate', () => {
        vscode.window.showInformationMessage('Validation is handled automatically by the schema.');
    });

    context.subscriptions.push(wizardCmd, validateCmd);
}