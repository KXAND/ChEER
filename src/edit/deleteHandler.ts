import * as vscode from 'vscode';
import { isLanguageEnabled } from '../common/config';
import { debugOutput } from '../common/debugOutput';
import { deletionRules, multiLinesDeletionRules } from '../rules';

export async function handleDeletion() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return vscode.commands.executeCommand('deleteLeft');
	}

	const config = vscode.workspace.getConfiguration('CHEER', editor.document.uri);
	const languageId = editor.document.languageId;
	if (!isLanguageEnabled(config, languageId)) {
		return vscode.commands.executeCommand('deleteLeft');
	}

	debugOutput.instance().enableDebug = config.get('enableDebugOutput');
	debugOutput.appendLine('[delete]: enabled ChEER delete');

	const document = editor.document;
	let pairedPositionNum = 0;
	const deletions: vscode.Range[] = [];
	for (const selection of editor.selections) {
		const position = selection.active;
		if (!selection.isEmpty) {
			return vscode.commands.executeCommand('deleteLeft');
		}
		if (position.character === 0) {
			return vscode.commands.executeCommand('deleteLeft');
		}
		if (config.get('enablePairedInputAndDeleteSymbols', true)) {
			for (const rule of deletionRules) {
				if (position.character - rule.left.length < 0) {
					continue;
				}

				const strBefore = document.getText(new vscode.Range(position.translate(0, -rule.left.length), position));
				const strAfter = document.getText(new vscode.Range(position, position.translate(0, rule.right.length)));
				if (rule.left === strBefore && rule.right === strAfter) {
					const deleteRange = new vscode.Range(position.translate(0, -rule.left.length), position.translate(0, rule.right.length));
					deletions.push(deleteRange);
					debugOutput.appendLine(`[delete]: delete  from ${strBefore} to ${strAfter} (${deleteRange.start},${deleteRange.end})`);
					pairedPositionNum += 1;
					break;
				}
			}

			for (const rule of multiLinesDeletionRules) {
				function getExactLineRegex(symbol: string): RegExp {
					return new RegExp(`^\\s*${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
				}
				const currLineNum = position.line;
				const nextLineNum = position.line + 1;
				if (currLineNum < 0 || nextLineNum >= document.lineCount) {
					continue;
				}
				const currLine = document.lineAt(currLineNum);
				const nextLine = document.lineAt(nextLineNum);

				const regCurr = getExactLineRegex(rule.currLine);
				const regNext = getExactLineRegex(rule.nextLine);

				if (regCurr.test(currLine.text) && regNext.test(nextLine.text)) {
					const deleteRange = new vscode.Range(currLine.range.start, nextLine.rangeIncludingLineBreak.end);
					deletions.push(deleteRange);
					pairedPositionNum += 1;
					break;
				}
			}
		}

		if (config.get('enableEmptyListItemDeletionEnhanced', true)) {
			const checkEmptyListItem = new RegExp(`^\\s*(?:[-*+]|\\d+\\.)\\s*$`);
			const checkListItem = new RegExp(`^\\s*(?:[-*+]|\\d+\.)\\s*`);
			const prevLineNum = position.line - 1;
			const currLineNum = position.line;
			if (prevLineNum < 0 || currLineNum >= document.lineCount) {
				continue;
			}
			const prevLine = document.lineAt(prevLineNum);
			const currLine = document.lineAt(currLineNum);
			if (!checkEmptyListItem.test(currLine.text) ||
				!checkListItem.test(prevLine.text) ||
				currLine.firstNonWhitespaceCharacterIndex < prevLine.firstNonWhitespaceCharacterIndex
			) {
				continue;
			}
			const deleteRange = new vscode.Range(currLine.range.start, currLine.rangeIncludingLineBreak.end);
			deletions.push(deleteRange);
			pairedPositionNum += 1;
			break;
		}
	}
	if (pairedPositionNum === editor.selections.length) {
		debugOutput.appendLine('[delete]: delete using ChEER');
		await editor.edit(editBuilder => {
			for (const range of deletions) {
				editBuilder.delete(range);
			}
		});
		return;
	}
	debugOutput.appendLine('[delete]: delete using VSCode default method');
	return vscode.commands.executeCommand('deleteLeft');
}
