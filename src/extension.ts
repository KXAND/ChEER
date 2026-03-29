import * as vscode from 'vscode';
import { continuousInputCorrectionRules, selectionInsertMap, selectionReplaceMap, deletionRules, multiLinesDeletionRules, cjkPairMap } from './rules';
import { handlePanguFormat } from './commands/PanguFormat';

class CompositionState {
	isInComposition: boolean = false;
	insertedText: boolean = false;
	composingText: string = '';
	selections: vscode.Selection[] = [];
	selectionTexts: string[] = [];

	reset() {
		this.isInComposition = false;
		this.insertedText = false;
		this.composingText = '';
		this.selections = [];
		this.selectionTexts = [];
	}
}

const compositionState = new CompositionState();

interface ContinuousCorrectionUndoEntry {
	uri: string;
	start: vscode.Position;
	beforeText: string;
	afterText: string;
	beforeSelections: vscode.Selection[];
	afterVersion: number;
	restored: boolean;
}
export interface iEdit {
	range: vscode.Range;
	text: string;
	newRange: vscode.Range;
	delta: number;
}

let continuousCorrectionUndoEntry: ContinuousCorrectionUndoEntry | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('type', handleType));
	context.subscriptions.push(vscode.commands.registerCommand('replacePreviousChar', handleReplacePreviousChar));
	context.subscriptions.push(vscode.commands.registerCommand('compositionStart', handleCompositionStart));
	context.subscriptions.push(vscode.commands.registerCommand('compositionEnd', handleCompositionEnd));
	context.subscriptions.push(vscode.commands.registerCommand('undo', handleUndo));

	context.subscriptions.push(vscode.commands.registerCommand('CHEER.SmartDelete', handleDeletion));
	context.subscriptions.push(vscode.commands.registerCommand('CHEER.PanguFormat', handlePanguFormat));
}

// This method is called when your extension is deactivated
export function deactivate() { }


class debugOutput {
	enableDebug: boolean | undefined = false;
	private readonly _output: vscode.OutputChannel;
	private static _instance: debugOutput;
	constructor() {
		this._output = vscode.window.createOutputChannel("ChEER Debug");
	}
	public static instance() {
		if (!this._instance) {
			this._instance = new debugOutput();
		}
		return this._instance;
	}
	public static appendLine(str: string) {
		if (this.instance().enableDebug) {
			this.instance()._output.appendLine(str);
		}
	}
}

/**
 * case1: 中文替换：
 * 			- 第一次：selections：被替换的范围，event：被替换的范围
 * 			- 第二次：selections：被替换后光标的位置（新地址的结尾），event：是老地址到新地址范围
 * 			- 第三次：相比于第二次没变化，但是字符已经在第二次调用后插入成功，这次是调用成功导致的
 * case2：英文替换
 * 			- selection：被替换的范围，event：有两个，第一个是后面插入的值的坐标，第二是前面插入的值的坐标
 * 			- 如果不是包裹而是真的替换，那么就只有一个event。event的范围是被替换的范围，也即和selection一致
 * case3：中文插入：每次键入都会发送event，如输入`z`, `k`, `\s`，那么依次会触发三次时间分别是“z”, “zao”, “赵”。
 * 			- 如果是标点符号，则会触发两次，如“《”,“《”。
 * 			- 第一次的event位置是老地址，selection老地址;
 * 			- 第二次selection是新地址, event是老地址到新地址范围，
 * case4：英文插入:只有一次插入，selection和event的范围是一致的
 */

const checkCJKPunctuation = /^[？《》“”‘’；：【＊·】、，。…￥！（）]*$/;
const checkLatin = /^(?=.*[A-Za-z])[A-Za-z']+$/;
const Pos2Str = (pos: vscode.Position) => { return "(" + pos.line + ',' + pos.character + ")"; };
const typeEvent2iEdit = (selection: vscode.Selection, text: string): iEdit => { return { range: selection, text: text, newRange: new vscode.Range(selection.start.translate(0, text.length), selection.start.translate(0, text.length)), delta: 0 }; };
const isLanguageEnabled = (config: vscode.WorkspaceConfiguration, languageId: string): boolean => {
	const languages = config.get<string[]>("activationOnLanguage", ["*"]);
	return languages.includes("*") || languages.includes(languageId);
};

function clearContinuousCorrectionUndoState() {
	continuousCorrectionUndoEntry = undefined;
}

async function handleUndo() {
	const editor = vscode.window.activeTextEditor;
	const state = continuousCorrectionUndoEntry;

	if (!editor || !state || editor.document.uri.toString() !== state.uri) {
		clearContinuousCorrectionUndoState();
		debugOutput.appendLine("[Undo]: Dont have matched context.");
		return vscode.commands.executeCommand('default:undo');
	}

	if (!state.restored) {
		if (editor.document.version !== state.afterVersion) {
			debugOutput.appendLine("[Undo]: document version already changed.");
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
			debugOutput.appendLine("[Undo]: apply ChEER undo entry.");
			return;
		}

		clearContinuousCorrectionUndoState();
	}

	debugOutput.appendLine("[Undo]: ChEER undo entry already restored.");
	clearContinuousCorrectionUndoState();

	debugOutput.appendLine("[Undo]: undo.");
	await vscode.commands.executeCommand('default:undo');
	await vscode.commands.executeCommand('default:undo');
	await vscode.commands.executeCommand('default:undo');
	return vscode.commands.executeCommand('default:undo');
}

async function processTypeInput(editor: vscode.TextEditor, text: string, shouldUndoNativeInput: boolean) {
	clearContinuousCorrectionUndoState();
	const config = vscode.workspace.getConfiguration('CHEER', editor.document.uri);

	if (text === "\n" || text === "\r\n") {
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
	debugOutput.appendLine("Type in: " + text);

	if (text.length > 1 && text !== "……") {
		return vscode.commands.executeCommand('default:type', { text });
	}

	for (const selection of editor.selections) {
		let edit = typeEvent2iEdit(selection, text);
		if (config.get('enablePairedInputAndDeleteSymbols', true)) {
			edit = addPairedInput2Edits(selection, document, text, edits);
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

// 适用 type 的input main logic
async function handleType(args: { text: string }) {
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

async function handleReplacePreviousChar(args: { replaceCharCnt: number; text: string }) {
	if (compositionState.isInComposition) {
		compositionState.composingText =
			compositionState.composingText.substring(0, compositionState.composingText.length - args.replaceCharCnt) + args.text;
		if (compositionState.insertedText) {
			return vscode.commands.executeCommand('default:replacePreviousChar', args);
		}
	}

	return vscode.commands.executeCommand('default:replacePreviousChar', args);
}

async function handleCompositionStart() {
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

async function handleCompositionEnd() {
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

	if (text.length === 1 || text === "……") {
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

function addPairedInput2Edits(selection: vscode.Selection, document: vscode.TextDocument, inputText: string, outEdits: iEdit[]): iEdit {
	if (selection.isEmpty) {//插入
		const match = selectionInsertMap.get(inputText);
		if (!match) { return typeEvent2iEdit(selection, inputText); }

		const range = selection;
		const text = match.left + match.right;
		const newRange = new vscode.Range(range.start.translate(0, match.left.length),
			range.start.translate(0, match.left.length));
		const delta = text.length;
		return { range, text, newRange, delta };
	}
	else {// 包裹替换
		const match = selectionReplaceMap.get(inputText);
		if (!match) { return typeEvent2iEdit(selection, inputText); }

		const range = selection;
		const text = match.left + document.getText(selection) + match.right;
		const newRange = new vscode.Range(range.start.translate(0, match.left.length),
			range.isSingleLine ?
				range.end.translate(0, match.left.length) :
				range.end);// 跨行的情况下，match.left.length 不会导致结尾坐标偏移
		const delta = (() => {
			return range.isSingleLine ?
				match.left.length + match.right.length :
				match.right.length;
		})();

		return { range, text, newRange, delta };
	}
}

function addContinuousInputCorrection2Edits(document: vscode.TextDocument, edit: iEdit, originalInput: string,): iEdit {

	if (edit.range.isEmpty === false) {
		return edit;
	}

	const position = edit.range.start;
	for (const e of continuousInputCorrectionRules) {
		if (e.input !== originalInput) { continue; }

		const [left, right] = e.env.split("|");
		if (position.character >= left.length) {
			const leftStr = document.getText(new vscode.Range(position.translate(0, -left.length), position));
			if (leftStr !== left) { continue; }
			if (right === '' || right === undefined) {
				if (position.character !== document.lineAt(position.line).text.length) {
					// 这一步的目的，我们希望在写规则的时候，形如《|》和《这样的规则没有顺序限制
					const rightStr = document.getText(new vscode.Range(position, position.translate(0, left.length)));
					if (rightStr === leftStr) { continue; }
					if (rightStr === cjkPairMap[leftStr]) { continue; }
				}

				const [resLeft, resRight] = e.result.split("|");
				edit.text = resLeft + (resRight ? resRight : '');
				edit.range = new vscode.Range(position.translate(0, -left.length), position);
				edit.delta = edit.text.length - left.length;
				edit.newRange = new vscode.Range(position.translate(0, resLeft.length - left.length), position.translate(0, resLeft.length - left.length));
				return edit;
			}
			else {
				const rightStr = document.getText(new vscode.Range(position, position.translate(0, right.length)));//range 右越界不会导致出问题
				if (rightStr !== right) { continue; }

				const [resLeft, resRight] = e.result.split("|");
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
				debugOutput.appendLine("Insert bf：" + editor.document.lineAt(edit.range.start.line).text);
				editBuilder.insert(edit.range.start, edit.text);
			} else {
				debugOutput.appendLine("Replace bf：" + editor.document.lineAt(edit.range.start.line).text);
				editBuilder.replace(edit.range, edit.text);
			}
		}
	});

	if (!didApply) {
		vscode.window.showWarningMessage("ChEER failed to apply edits.");
		return;
	}

	// 按位置计算偏移，但最终仍按原始 selections 顺序恢复光标，避免打乱主光标。
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
		debugOutput.appendLine("update selections:" + Pos2Str(edit.newRange.start) + " " + Pos2Str(edit.newRange.end));
		debugOutput.appendLine("ranges:" + Pos2Str(edit.range.start) + " " + Pos2Str(edit.range.end));
		const offsetDelta = cumulativeOffsets.get(index) ?? 0;
		const newStartPos = edit.newRange.start.translate(0, offsetDelta);
		const newEndPos = edit.range.isSingleLine ? edit.newRange.end.translate(0, offsetDelta) : edit.newRange.end;
		return new vscode.Selection(newStartPos, newEndPos);
	});
}
/**
 * Selection：The selections in this text editor. The primary selection is always at index 0.
 * event.contentChanges:An array of content changes.
 *
 * 1. 普通的多光标：selection和ecc给出的结果是一样的
 * 2. 假设复制了一个两行的字符串（kb\nb)，并且有两个光标，那么第一个光标粘贴第一个值，第二个光标粘贴第二值
 * 3. 假设不匹配，如有三个光标，那么每个光标都会独立复制上述跨行字符串。注意selction的顺序是光标被添加进来的顺序，ecc则是倒序的
）
 */

async function handleDeletion() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { return vscode.commands.executeCommand('deleteLeft'); }

	const config = vscode.workspace.getConfiguration('CHEER', editor.document.uri);

	const languageId = editor.document.languageId;
	if (!isLanguageEnabled(config, languageId)) {
		return vscode.commands.executeCommand('deleteLeft');
	}

	debugOutput.instance().enableDebug = config.get('enableDebugOutput');
	debugOutput.appendLine("[delete]: enabled ChEER delete");
	
	// @todo：考虑能成对的地方进行成对删除，不能成对的地方普通删除。但是暂时不知道怎么处理这种混合删除的情况
	const document = editor.document;
	let pairedPositionNum = 0;// 只有全部符合成对的情况才成对删除，这是符合 vscode 默认逻辑的做法
	const deletions: vscode.Range[] = [];
	for (const selection of editor.selections) {
		const position = selection.active;
		// selection 表示编辑器中当前选中的文本范围，如果只是光标闪烁（无选中文本），则 selection 的起始和结束位置相同
		if (!selection.isEmpty) { return vscode.commands.executeCommand('deleteLeft'); }// 有选中字符的情况不处理
		if (position.character === 0) { return vscode.commands.executeCommand('deleteLeft'); }// 光标在行首的情况不处理
		if (config.get('enablePairedInputAndDeleteSymbols', true)) {
			for (const rule of deletionRules) {//单行匹配
				if (position.character - rule.left.length < 0) { continue; }


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

			for (const rule of multiLinesDeletionRules) {// 多行匹配，如代码块
				function getExactLineRegex(symbol: string): RegExp {
					return new RegExp(`^\\s*${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);// 判断是否空格+规则+换行的形式，并且对规则中的特殊字符转义
				}
				const currLineNum = position.line;
				const nextLineNum = position.line + 1;
				if (currLineNum < 0 || nextLineNum >= document.lineCount) { continue; }
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
			if (prevLineNum < 0 || currLineNum >= document.lineCount) { continue; }
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
		debugOutput.appendLine("[delete]: delete using ChEER");
		await editor.edit(editBuilder => {
			for (const range of deletions) { editBuilder.delete(range); }
		});
		return;
	}
	debugOutput.appendLine("[delete]: delete using VSCode default method");
	return vscode.commands.executeCommand('deleteLeft');
}






