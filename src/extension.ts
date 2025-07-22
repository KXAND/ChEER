// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { error } from 'console';
import * as vscode from 'vscode';
import { Selection } from 'vscode';
import { continuousInputCorrectionRules, selectionInsertMap, selectionReplaceMap, deletionRules, multiLinesDeletionRules, cjkPairMap } from './rules';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	vscode.workspace.onDidChangeTextDocument(event => {
		handlePairedInsertion(event);
	});

	context.subscriptions.push(vscode.commands.registerCommand('type', handleType));

	context.subscriptions.push(vscode.commands.registerCommand('CHEER.SmartDelete', handleDeletion));
}

// This method is called when your extension is deactivated
export function deactivate() { }


class debugOutput {
	enableDebug: boolean | undefined = false;
	private _output: vscode.OutputChannel;
	private static _instance: debugOutput;
	constructor() {
		this._output = vscode.window.createOutputChannel("ChEER Debug");
	}
	public static instance() {
		if (!this._instance)
			this._instance = new debugOutput();
		return this._instance;
	}
	public static appendLine(str: string) {
		if (this.instance().enableDebug) {
			this.instance()._output.appendLine(str);
		}
	}
}


// @todo
// 1. 成对删除``和""，~~
// 2. 代码块判断前面是否有字
// 3. <<>>
// 4. 引用块粘贴自动添加> 
// 5. 行首字符错误的undo
// 6. 允许取消debug


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
const checkUnvisiblePunctuation = /^[\s\u00A0\u200B]*$/;
const Pos2Str = (pos: vscode.Position) => { return "(" + pos.line + ',' + pos.character + ")"; };
const typeEvent2iEdit = (selection: vscode.Selection, text: string): iEdit => { return { range: selection, text: text, newRange: new vscode.Range(selection.start.translate(0, text.length), selection.start.translate(0, text.length)), delta: 0 }; };
export interface iEdit {
	range: vscode.Range;
	text: string;
	newRange: vscode.Range;
	delta: number;
}

// 适用 type 的input main logic
async function handleType(args: { text: string }) {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const text = args.text;
	const config = vscode.workspace.getConfiguration('CHEER', editor.document.uri);

	if (text === "\n" || text === "\r\n") {
		// 换行涉及到行号变化，直接用原生逻辑处理
		return vscode.commands.executeCommand('default:type', args);
	}
	if (checkLatin.test(text)) {
		return vscode.commands.executeCommand('default:type', args);
	}

	let languageId = editor.document.languageId;
	let languages = config.get<string[]>("activationOnLanguage", ["*"]);
	if ((languages.indexOf("*") === -1 && languages.indexOf(languageId) === -1)) {
		if (checkCJKPunctuation.test(text) === true && editor.selection.isEmpty) {
			await vscode.commands.executeCommand('undo');
		}
		const edits = [...editor.selections].map(e => typeEvent2iEdit(e, text));
		applyEdits(editor, edits)
		return;
	}

	debugOutput.instance().enableDebug = config.get('enableDebugOutput');

	const document = editor.document;
	const edits: iEdit[] = [];
	debugOutput.appendLine("Type in: " + args.text);

	if (text.length > 1 && text !== "……") { return; }

	for (const selection of editor.selections) {
		let edit = typeEvent2iEdit(selection, text);
		if (config.get('enablePairedInputAndDeleteSymbols', true)) {
			edit = addPairedInput2Edits(selection, document, text, edits);
		}
		if (config.get('enableContinuousInputCorrection', true)) {
			edit = addContinuousInputCorrection2Edits(document, edit, text);
		}
		edits.push(edit);
	}

	if (checkCJKPunctuation.test(text) === true && editor.selection.isEmpty) {
		await vscode.commands.executeCommand('undo');
	}
	applyEdits(editor, edits);
	return;
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

function applyEdits(editor: vscode.TextEditor, edits: iEdit[]) {
	if (edits.length > 0) {
		editor.edit(editBuilder => {
			for (const edit of edits) {
				if (edit.range.isEmpty) {
					debugOutput.appendLine("Insert bf：" + editor.document.lineAt(edit.range.start).text);
					editBuilder.insert(edit.range.start, edit.text);
				} else {
					debugOutput.appendLine("Replace bf：" + editor.document.lineAt(edit.range.start).text);
					editBuilder.replace(edit.range, edit.text);
				}

			}
		}/*, {
			undoStopBefore: true,  // 与上一个 stop 合并，不产生新的 stop
			undoStopAfter: true     // 插入后再停一个，便于下一次 undo 控制
		}*/).then(() => {
			// 根据之前记录的顺序重建 selection（手动设置位置）
			const cumulativeOffsets = new Map<vscode.Range, number>();
			let totalDelta: Map<number, number> = new Map<number, number>();
			edits.sort((a, b) => a.range.start.compareTo(b.range.start))//升序
				.forEach(edit => {
					// range受到的偏移量由开始行中前面的 range 决定
					const line = edit.range.start.line;
					const lineTotalDelta = totalDelta.get(line) || 0;
					cumulativeOffsets.set(edit.range, lineTotalDelta);

					// range 导致的偏移总是体现在结尾行
					if (edit.range.isSingleLine) {
						totalDelta.set(line, lineTotalDelta + edit.delta);
					}
					else {
						totalDelta.set(edit.range.end.line, edit.delta);
					}
				});

			const updatedSelections = edits.map(edit => {
				debugOutput.appendLine("update selections:" + Pos2Str(edit.newRange.start) + " " + Pos2Str(edit.newRange.end));
				debugOutput.appendLine("ranges:" + Pos2Str(edit.range.start) + " " + Pos2Str(edit.range.end));
				const offsetDelta = cumulativeOffsets.get(edit.range);
				if (offsetDelta === undefined || offsetDelta === null) {
					throw vscode.window.showErrorMessage("offsetDelta should never be undefined");
				}
				const newStartPos = edit.newRange.start.translate(0, offsetDelta);
				const newEndPos = edit.range.isSingleLine ? edit.newRange.end.translate(0, offsetDelta) : edit.newRange.end;
				return new vscode.Selection(newStartPos, newEndPos);
			});
			editor.selections = updatedSelections;
		});
	}
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
	let editor = vscode.window.activeTextEditor;
	if (!editor) { return vscode.commands.executeCommand('deleteLeft'); }

	const config = vscode.workspace.getConfiguration('CHEER', editor.document.uri);

	let languageId = editor.document.languageId;
	let languages = config.get<string[]>("activationOnLanguage", ["*"]);
	if ((languages.indexOf("*") === -1 && languages.indexOf(languageId) === -1)) {
		return vscode.commands.executeCommand('deleteLeft');
	}

	debugOutput.instance().enableDebug = config.get('enableDebugOutput');

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
					const deleteRange = new vscode.Range(position.translate(0, -1), position.translate(0, 1));
					deletions.push(deleteRange);
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
		await editor.edit(editBuilder => {
			for (const range of deletions) { editBuilder.delete(range); }
		});
		return;
	}
	return vscode.commands.executeCommand('deleteLeft');
}

async function handlePairedInsertion(event: vscode.TextDocumentChangeEvent) {
	let editor = vscode.window.activeTextEditor;
	if (!editor || (editor && event.document !== editor.document)) {
		return;
	}
	if (event.contentChanges.length === 0 || event.contentChanges[0].text === '') { return; }

	if (event.reason === vscode.TextDocumentChangeReason.Undo) { return; }
	debugOutput.appendLine("event: " + event.contentChanges[0].text);

	const text0 = event.contentChanges[0].text;

	// 将中文输入分隔成新的撤销单元，避免撤销时撤销用户的输入
	const chineseCharRegex = /^[\u4e00-\u9fa5\u3400-\u4dbf\uF900-\uFAFF]*$/;
	if (chineseCharRegex.test(text0)) {

		await editor.insertSnippet(
			new vscode.SnippetString(''),      // 空片段
			event.contentChanges[0].range.start.translate(0, text0.length), // 在当前光标位置
			{ undoStopBefore: false, undoStopAfter: true }//undoStopBefore: false：插入的空字符和前面的中文是一体的，无需两次撤回
		);
	}
}






