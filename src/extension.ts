import * as vscode from 'vscode';
import { KieChatModelProvider } from './provider';
import {
  clearApiKeyCommand,
  manageCredentialsCommand,
  providerVendor,
} from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new KieChatModelProvider(context);

  context.subscriptions.push(
    provider,
    vscode.lm.registerLanguageModelChatProvider(providerVendor, provider),
    vscode.commands.registerCommand(manageCredentialsCommand, () => provider.promptForApiKey()),
    vscode.commands.registerCommand(clearApiKeyCommand, () => provider.clearApiKey())
  );
}

export function deactivate(): void {}
