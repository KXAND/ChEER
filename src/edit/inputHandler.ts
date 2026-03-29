import * as vscode from 'vscode';
import { isLanguageEnabled } from '../common/config';
import { debugOutput } from '../common/debugOutput';
import { ContinuousCorrectionUndoEntry, iEdit } from '../common/types';
import { cjkPairMap, continuousInputCorrectionRules, selectionInsertMap, selectionReplaceMap } from '../rules';

import { CompositionState } from './compositionState';

const compositionState = new CompositionState();
let continuousCorrectionUndoEntry: ContinuousCorrectionUndoEntry | undefined;

const checkCJKPunctuation = /^[？《》“”‘’；：【＊·】、，。…￥！（）]*$/;
const checkLatin = /^(?=.*[A-Za-z])[A-Za-z']+$/;
const Pos2Str = (pos: vscode.Position) => { return '(' + pos.line + ',' + pos.character + ')'; };
const typeEvent2iEdit = (selection: vscode.Selection, text: string): iEdit => {
	return {
		range: selection,
		text: text,
		newRange: new vscode.Range(selection.start.translate(0, text.length), selection.start.translate(0, text.length)),
		delta: 0,
	};
};

function clearContinuousCorrectionUndoState() {
	continuousCorrectionUndoEntry = undefined;
}

export async function handleUndo() {
	const editor = vscode.window.activeTextEditor;
	const state = continuousCorrectionUndoEntry;

	if (!editor || !state || editor.document.uri.toString() !== state.uri) {
		clearContinuousCorrectionUndoState();
		debugOutput.appendLine('[Undo]: Dont have matched context.');
		return vscode.commands.executeCommand('default:undo');
	}

	if (!state.restored) {
		if (editor.document.version !== state.afterVersion) {
			debugOutput.appendLine('[Undo]: document version already changed.');
			clearContinuousCorrectionUndoState();
			return vscode.commands.executeCommand('default:undo');
		}

		const startOffset = editor.document.offsetAt(state.start);
		const end = editor.document.positionAt(startOffset + state.afterText.length);
		const didApply = await editor.edit(editBuilder => {
			editBuilder.replace(new vscode.Range(state.start, end), state.beforeText);
		}, {
			undoStopBefore: false,
			undoStopAfter: false,
		});

		if (didApply) {
			editor.selections = state.beforeSelections.map(selection =>
				new vscode.Selection(selection.anchor, selection.active)
			);
			state.restored = true;
			debugOutput.appendLine('[Undo]: apply ChEER undo entry.');
			return;
		}

		clearContinuousCorrectionUndoState();
	}

	debugOutput.appendLine('[Undo]: ChEER undo entry already restored.');
	clearContinuousCorrectionUndoState();

	debugOutput.appendLine('[Undo]: undo.');
	await vscode.commands.executeCommand('default:undo');
	await vscode.commands.executeCommand('default:undo');
	await vscode.commands.executeCommand('default:undo');
	return vscode.commands.executeCommand('default:undo');
}

async function processTypeInput(editor: vscode.TextEditor, text: string, shouldUndoNativeInput: boolean) {
	clearContinuousCorrectionUndoState();
	const config = vscode.workspace.getConfiguration('CHEER', editor.document.uri);

	if (text === '\n' || text === '\r\n') {
		return vscode.commands.executeCommand('default:type', { text });
	}
	if (checkLatin.test(text)) {
		return vscode.commands.executeCommand('default:type', { text });
	}

	const languageId = editor.document.languageId;
	if (!isLanguageEnabled(config, languageId)) {
		if (shouldUndoNativeInput && checkCJKPunctuation.test(text) === true && editor.selection.isEmpty) {
			await vscode.commands.executeCommand('undo');
		}
		const edits = [...editor.selections].map(e => typeEvent2iEdit(e, text));
		await applyEdits(editor, edits);
		return;
	}

	debugOutput.instance().enableDebug = config.get('enableDebugOutput');

	const document = editor.document;
	const edits: iEdit[] = [];
	let hasContinuousCorrection = false;
	let continuousCorrectionStateCandidate: Omit<ContinuousCorrectionUndoEntry, 'afterVersion' | 'restored'> | undefined;
	debugOutput.appendLine('Type in: ' + text);

	if (text.length > 1 && text !== '……') {
		return vscode.commands.executeCommand('default:type', { text });
	}

	for (const selection of editor.selections) {
		let edit = typeEvent2iEdit(selection, text);
		if (config.get('enablePairedInputAndDeleteSymbols', true)) {
			edit = addPairedInput2Edits(selection, document, text);
		}
		if (config.get('enableContinuousInputCorrection', true)) {
			const rangeBeforeCorrection = edit.range;
			const textBeforeCorrection = edit.text;
			edit = addContinuousInputCorrection2Edits(document, edit, text);
			if (!edit.range.isEqual(rangeBeforeCorrection) || edit.text !== textBeforeCorrection) {
				hasContinuousCorrection = true;
				if (editor.selections.length === 1 && !continuousCorrectionStateCandidate) {
					continuousCorrectionStateCandidate = {
						uri: editor.document.uri.toString(),
						start: edit.range.start,
						beforeText: document.getText(edit.range),
						afterText: edit.text,
						beforeSelections: editor.selections.map(currentSelection =>
							new vscode.Selection(currentSelection.anchor, currentSelection.active)
						),
					};
				}
			}
		}
		edits.push(edit);
	}

	if (shouldUndoNativeInput && checkCJKPunctuation.test(text) === true && editor.selection.isEmpty) {
		await vscode.commands.executeCommand('undo');
	}
	await applyEdits(editor, edits);
	if (hasContinuousCorrection && continuousCorrectionStateCandidate) {
		continuousCorrectionUndoEntry = {
			...continuousCorrectionStateCandidate,
			afterVersion: editor.document.version,
			restored: false,
		};
	}
}

export async function handleType(args: { text: string }) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const text = args.text;
	if (compositionState.isInComposition) {
		compositionState.composingText += text;
		compositionState.insertedText = true;
		return vscode.commands.executeCommand('default:type', args);
	}

	return processTypeInput(editor, text, true);
}

export async function handleReplacePreviousChar(args: { replaceCharCnt: number; text: string }) {
	if (compositionState.isInComposition) {
		compositionState.composingText =
			compositionState.composingText.substring(0, compositionState.composingText.length - args.replaceCharCnt) + args.text;
		if (compositionState.insertedText) {
			return vscode.commands.executeCommand('default:replacePreviousChar', args);
		}
	}

	return vscode.commands.executeCommand('default:replacePreviousChar', args);
}

export async function handleCompositionStart() {
	compositionState.reset();
	compositionState.isInComposition = true;
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		compositionState.selections = editor.selections.map(selection =>
			new vscode.Selection(selection.anchor, selection.active)
		);
		compositionState.selectionTexts = editor.selections.map(selection =>
			editor.document.getText(selection)
		);
	}
}

export async function handleCompositionEnd() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		compositionState.reset();
		return;
	}

	const text = compositionState.composingText;
	const compositionSelections = compositionState.selections.map(selection =>
		new vscode.Selection(selection.anchor, selection.active)
	);
	const compositionSelectionTexts = [...compositionState.selectionTexts];
	if (compositionState.insertedText) {
		await vscode.commands.executeCommand('default:replacePreviousChar', {
			text: '',
			replaceCharCnt: text.length,
		});
	}

	compositionState.reset();

	if (text.length === 0) {
		return;
	}

	if (text.length === 1 || text === '……') {
		const originalSelections = editor.selections.map(selection =>
			new vscode.Selection(selection.anchor, selection.active)
		);
		if (compositionSelections.some(selection => !selection.isEmpty)) {
			const restoreTargets = compositionSelections.map((selection, index) => ({
				selection,
				text: compositionSelectionTexts[index] ?? '',
			}));
			const didRestore = await editor.edit(editBuilder => {
				for (const target of restoreTargets
					.slice()
					.sort((a, b) => editor.document.offsetAt(b.selection.start) - editor.document.offsetAt(a.selection.start))) {
					editBuilder.insert(target.selection.start, target.text);
				}
			}, {
				undoStopBefore: false,
				undoStopAfter: false,
			});
			if (didRestore) {
				editor.selections = restoreTargets.map(target => {
					const start = target.selection.start;
					const startOffset = editor.document.offsetAt(start);
					const end = editor.document.positionAt(startOffset + target.text.length);
					return new vscode.Selection(start, end);
				});
			}
		}
		if (compositionSelections.length > 0) {
			editor.selections = compositionSelections.map(selection =>
				new vscode.Selection(selection.anchor, selection.active)
			);
		}
		await processTypeInput(editor, text, false);
		if (compositionSelections.length === 0) {
			editor.selections = originalSelections;
		}
		return;
	}

	await vscode.commands.executeCommand('default:type', { text });
}

function addPairedInput2Edits(selection: vscode.Selection, document: vscode.TextDocument, inputText: string): iEdit {
	if (selection.isEmpty) {
		const match = selectionInsertMap.get(inputText);
		if (!match) {
			return typeEvent2iEdit(selection, inputText);
		}

		const range = selection;
		const text = match.left + match.right;
		const newRange = new vscode.Range(range.start.translate(0, match.left.length),
			range.start.translate(0, match.left.length));
		const delta = text.length;
		return { range, text, newRange, delta };
	} else {
		const match = selectionReplaceMap.get(inputText);
		if (!match) {
			return typeEvent2iEdit(selection, inputText);
		}

		const range = selection;
		const text = match.left + document.getText(selection) + match.right;
		const newRange = new vscode.Range(range.start.translate(0, match.left.length),
			range.isSingleLine ?
				range.end.translate(0, match.left.length) :
				range.end);
		const delta = (() => {
			return range.isSingleLine ?
				match.left.length + match.right.length :
				match.right.length;
		})();

		return { range, text, newRange, delta };
	}
}

function addContinuousInputCorrection2Edits(document: vscode.TextDocument, edit: iEdit, originalInput: string): iEdit {
	if (edit.range.isEmpty === false) {
		return edit;
	}

	const position = edit.range.start;
	for (const e of continuousInputCorrectionRules) {
		if (e.input !== originalInput) {
			continue;
		}

		const [left, right] = e.env.split('|');
		if (position.character >= left.length) {
			const leftStr = document.getText(new vscode.Range(position.translate(0, -left.length), position));
			if (leftStr !== left) {
				continue;
			}
			if (right === '' || right === undefined) {
				if (position.character !== document.lineAt(position.line).text.length) {
					const rightStr = document.getText(new vscode.Range(position, position.translate(0, left.length)));
					if (rightStr === leftStr) {
						continue;
					}
					if (rightStr === cjkPairMap[leftStr]) {
						continue;
					}
				}

				const [resLeft, resRight] = e.result.split('|');
				edit.text = resLeft + (resRight ? resRight : '');
				edit.range = new vscode.Range(position.translate(0, -left.length), position);
				edit.delta = edit.text.length - left.length;
				edit.newRange = new vscode.Range(position.translate(0, resLeft.length - left.length), position.translate(0, resLeft.length - left.length));
				return edit;
			} else {
				const rightStr = document.getText(new vscode.Range(position, position.translate(0, right.length)));
				if (rightStr !== right) {
					continue;
				}

				const [resLeft, resRight] = e.result.split('|');
				edit.text = resLeft + (resRight ? resRight : '');
				edit.range = new vscode.Range(position.translate(0, -left.length), position.translate(0, right.length));
				edit.delta = edit.text.length - left.length - right.length;
				edit.newRange = new vscode.Range(position.translate(0, resLeft.length - left.length), position.translate(0, resLeft.length - left.length));
				return edit;
			}
		}
	}

	return edit;
}

async function applyEdits(editor: vscode.TextEditor, edits: iEdit[]) {
	if (edits.length === 0) {
		return;
	}

	const didApply = await editor.edit(editBuilder => {
		for (const edit of edits) {
			if (edit.range.isEmpty) {
				debugOutput.appendLine('Insert bf：' + editor.document.lineAt(edit.range.start.line).text);
				editBuilder.insert(edit.range.start, edit.text);
			} else {
				debugOutput.appendLine('Replace bf：' + editor.document.lineAt(edit.range.start.line).text);
				editBuilder.replace(edit.range, edit.text);
			}
		}
	});

	if (!didApply) {
		vscode.window.showWarningMessage('ChEER failed to apply edits.');
		return;
	}

	const indexedEdits = edits.map((edit, index) => ({ edit, index }));
	const cumulativeOffsets = new Map<number, number>();
	const totalDelta = new Map<number, number>();

	indexedEdits
		.slice()
		.sort((a, b) => a.edit.range.start.compareTo(b.edit.range.start))
		.forEach(({ edit, index }) => {
			const line = edit.range.start.line;
			const lineTotalDelta = totalDelta.get(line) || 0;
			cumulativeOffsets.set(index, lineTotalDelta);

			if (edit.range.isSingleLine) {
				totalDelta.set(line, lineTotalDelta + edit.delta);
			} else {
				totalDelta.set(edit.range.end.line, edit.delta);
			}
		});

	editor.selections = indexedEdits.map(({ edit, index }) => {
		debugOutput.appendLine('update selections:' + Pos2Str(edit.newRange.start) + ' ' + Pos2Str(edit.newRange.end));
		debugOutput.appendLine('ranges:' + Pos2Str(edit.range.start) + ' ' + Pos2Str(edit.range.end));
		const offsetDelta = cumulativeOffsets.get(index) ?? 0;
		const newStartPos = edit.newRange.start.translate(0, offsetDelta);
		const newEndPos = edit.range.isSingleLine ? edit.newRange.end.translate(0, offsetDelta) : edit.newRange.end;
		return new vscode.Selection(newStartPos, newEndPos);
	});
}
