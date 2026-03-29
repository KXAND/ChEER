import * as vscode from 'vscode';

const chineseChar = '[\\u3400-\\u9fff]';
const asciiToken = '[A-Za-z][A-Za-z0-9]*';
const numberToken = '\\d+(?:\\.\\d+)?';
const fullwidthPunctuation = '，。！？；：、';
const punctuationToFullwidthMap: Record<string, string> = {
	',': '，',
	'.': '。',
	'!': '！',
	'?': '？',
	':': '：',
	';': '；',
	'(': '（',
	')': '）',
	'[': '［',
	']': '］',
};

function toHalfwidthAlphaNumeric(text: string): string {
	return text
		.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
			String.fromCharCode(char.charCodeAt(0) - 0xfee0)
		)
		.replace(/．/g, '.');
}

function normalizePureEnglishText(text: string): string {
	if (new RegExp(chineseChar).test(text)) {
		return text;
	}

	return text
		.replace(/，/g, ',')
		.replace(/。/g, '.')
		.replace(/！/g, '!')
		.replace(/？/g, '?')
		.replace(/：/g, ':')
		.replace(/；/g, ';')
		.replace(/([,.:;!?])(?=[A-Za-z"])/g, '$1 ')
		.replace(/,(")/g, ', $1')
		.replace(/([.!?;:])\s+(?=")/g, '$1')
		.replace(/\s+([,.:;!?])/g, '$1')
		.replace(/([,.:;!?])\s+(?=[)\]])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

function normalizeEmbeddedEnglishText(text: string): string {
	return text.replace(/([「『“"])([A-Za-z0-9][A-Za-z0-9\s'",.!?;:()[\]\-，。！？：；]*)([」』”"])/g, (_, left, content, right) => {
		return `${left}${normalizePureEnglishText(content)}${right}`;
	});
}

function normalizeEnglishPunctuation(text: string): string {
	return text
		.replace(/《([A-Za-z0-9][A-Za-z0-9\s'",.!?;:()[\]\-]*)》/g, '"$1"');
}

function normalizeChinesePunctuation(text: string): string {
	let formatted = text;
	for (const [halfwidth, fullwidth] of Object.entries(punctuationToFullwidthMap)) {
		const escaped = halfwidth.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		formatted = formatted.replace(new RegExp(`(${chineseChar})\\s*${escaped}\\s*(?=${chineseChar})`, 'g'), `$1${fullwidth}`);
		formatted = formatted.replace(new RegExp(`(${chineseChar})\\s*${escaped}(?=$|[）］】」』]|${chineseChar})`, 'g'), `$1${fullwidth}`);
	}
	return formatted;
}

export function formatPangu(text: string): string {
	return normalizePureEnglishText(
		normalizeChinesePunctuation(
			normalizeEmbeddedEnglishText(
				normalizeEnglishPunctuation(
					toHalfwidthAlphaNumeric(text)
				)
			)
		)
	)
		.replace(/([（［【])\s*/g, '$1')
		.replace(/\s*([）］】])/g, '$1')
		.replace(new RegExp(`(${chineseChar})(${asciiToken})`, 'g'), '$1 $2')
		.replace(new RegExp(`(${asciiToken})(${chineseChar})`, 'g'), '$1 $2')
		.replace(new RegExp(`(${chineseChar})(${numberToken})`, 'g'), '$1 $2')
		.replace(new RegExp(`(${numberToken})(${chineseChar})`, 'g'), '$1 $2')
		.replace(new RegExp(`(${numberToken})\\s*([A-Za-z]+)`, 'g'), '$1 $2')
		.replace(/(\d)\s*([%°])/g, '$1$2')
		.replace(new RegExp(`\\s*([${fullwidthPunctuation}])\\s*`, 'g'), '$1')
		.replace(/\(\s*/g, '（')
		.replace(/\s*\)/g, '）')
		.replace(/\[\s*/g, '［')
		.replace(/\s*\]/g, '］')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

export async function handlePanguFormat() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const hasNonEmptySelection = editor.selections.some(selection => !selection.isEmpty);
	if (!hasNonEmptySelection) {
		const document = editor.document;
		const fullRange = new vscode.Range(
			document.positionAt(0),
			document.positionAt(document.getText().length)
		);
		const formattedText = formatPangu(document.getText());
		await editor.edit(editBuilder => {
			editBuilder.replace(fullRange, formattedText);
		});
		return;
	}

	await editor.edit(editBuilder => {
		for (const selection of editor.selections) {
			if (selection.isEmpty) {
				continue;
			}
			editBuilder.replace(selection, formatPangu(editor.document.getText(selection)));
		}
	});
}
