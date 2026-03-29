import * as vscode from 'vscode';
import { handlePanguFormat } from './commands/PanguFormat';
import {
	handleCompositionEnd,
	handleCompositionStart,
	handleReplacePreviousChar,
	handleType,
	handleUndo,
} from './edit/inputHandler';
import { handleDeletion } from './edit/deleteHandler';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('type', handleType));
	context.subscriptions.push(vscode.commands.registerCommand('replacePreviousChar', handleReplacePreviousChar));
	context.subscriptions.push(vscode.commands.registerCommand('compositionStart', handleCompositionStart));
	context.subscriptions.push(vscode.commands.registerCommand('compositionEnd', handleCompositionEnd));
	context.subscriptions.push(vscode.commands.registerCommand('undo', handleUndo));
	context.subscriptions.push(vscode.commands.registerCommand('CHEER.SmartDelete', handleDeletion));
	context.subscriptions.push(vscode.commands.registerCommand('CHEER.PanguFormat', handlePanguFormat));
}

export function deactivate() { }
