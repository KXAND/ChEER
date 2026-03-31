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
const punctuationToHalfwidthMap: Record<string, string> = {
	'，': ',',
	'。': '.',
	'！': '!',
	'？': '?',
	'：': ':',
	'；': ';',
	'（': '(',
	'）': ')',
	'［': '[',
	'］': ']',
};
const alphaNumeric = "A-Za-z0-9";//基础字母和数字
const fullwidthAlphaNumeric = "Ａ-Ｚａ-ｚ０-９";// 全角字母数字
const whitespace = "\\s";//空白字符
const chinesePunctuation = "，。！？：；＆「」【】『』“”";// 中文全角标点
const englishPunctuation = "',.!?;:()[\\]\\-+*\\/=#$%^|_";// 英文半角标点
const englishEmbeddedPunctuation = `${englishPunctuation}"&`;
const isChineseChar = (s: string) => {
	if (s.length !== 1) {
		return false;
	}
	const code = s.charCodeAt(0);
	return code >= 0x3400 && code <= 0x9fff;
};
const isWhitespaceChar = (s: string) => s === ' ' || s === '\t';
const isEnglishLikeQuoteContentStart = (s: string) => isalphaNumericChar(s) || s === '"';

function toHalfwidthAlphaNumeric(text: string): string {
	let result = '';
	for (const char of text) {
		const code = char.charCodeAt(0);
		if ((code >= 0xff10 && code <= 0xff19) || (code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)) {
			result += String.fromCharCode(code - 0xfee0);
			continue;
		}
		if (char === '．') {
			result += '.';
			continue;
		}
		result += char;
	}
	return result;
}

const isalphaNumericChar = (s: string) => {
	const code = s.charCodeAt(0);
	return s.length === 1 &&
		(
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			(code >= 48 && code <= 57)
		);
};

function normalizePureEnglishText(text: string): string {
	if (new RegExp(chineseChar).test(text)) {
		return text;
	}
	let result: string[] = [];
	let last = '';

	for (let i = 0; i < text.length; i++) {
		let c = text[i];
		if (punctuationToHalfwidthMap[c]) {// 移除全角标点
			c = punctuationToHalfwidthMap[c];
		}

		if (c === '"') {
			const next = text[i + 1] ?? '';
			if (',.:;!?'.includes(last) && isEnglishLikeQuoteContentStart(next)) {
				result.push(' ');
			} else {
				while (result.length && result.at(-1) === ' ') {
					result.pop();
				}
			}

			result.push(c);
			last = c;
			continue;
		}

		if (englishPunctuation.includes(c)) {// 移除前置空格
			while (result.length && result.at(-1) === ' ') {
				result.pop();
			}

			result.push(c);
			last = c;
			continue;
		}


		if (c === ' ') {// 不连续添加空格，并且标点后空格在后续处理
			if (last === ' ' || englishPunctuation.includes(last)) {
				continue;
			}

			result.push(' ');
			last = ' ';
			continue;
		}

		// 闭合符号前无空格
		if (c === ']' || c === ')') {
			while (result.length && result.at(-1) === ' ') {
				result.pop();
			}

			result.push(c);
			last = c;
			continue;
		}

		if (isalphaNumericChar(c) || c === '"') {
			if (englishPunctuation.includes(last)) {// 添加必要的空格
				result.push(' ');
			}

			result.push(c);
			last = c;
			continue;
		}

		result.push(c);
		last = c;
	}

	return result.join('').trim();
}
const quotePairs: Record<string, string> = {
	"「": "」",
	"『": "』",
	"“": "”",
	'"': '"'
};



function isEnglishLike(text: string): boolean {
	if (text.length === 0 || !isalphaNumericChar(text[0])) {
		return false;
	}
	for (const char of text) {
		if (isalphaNumericChar(char) || char === ' ' || char === '\t') {
			continue;
		}
		if (englishEmbeddedPunctuation.includes(char) || chinesePunctuation.includes(char)) {
			continue;
		}
		return false;
	}
	return true;
}

// 完整的英文整句、特殊名词，其内容使用半角标点
function normalizeEmbeddedEnglishText(text: string): string {
	let result = "";
	let i = 0;
	while (i < text.length) {
		const left = text[i];
		if (quotePairs[left]) {//左括号
			// 右括号
			const right = quotePairs[left];
			let j = i + 1;
			while (j < text.length && text[j] !== right) {
				j++;
			}

			if (j < text.length) {
				const content = text.slice(i + 1, j);
				if (isEnglishLike(content)) {
					result += left + normalizePureEnglishText(content) + right;
				} else {
					result += left + content + right;
				}
				i = j + 1;
				continue;
			}
		}

		result += left;
		i++;
	}

	return result;
}

function normalizeEmbeddedChineseText(text: string): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		if (text[i] !== '"') {
			result += text[i];
			i++;
			continue;
		}

		let j = i + 1;
		while (j < text.length && text[j] !== '"') {
			j++;
		}
		if (j >= text.length) {
			result += text[i];
			i++;
			continue;
		}

		const content = text.slice(i + 1, j);
		if (new RegExp(chineseChar).test(content) && !isEnglishLike(content)) {
			result += `“${content}”`;
		} else {
			result += `"${content}"`;
		}
		i = j + 1;
	}
	return result;
}

// 将书名号《》转换为英文双引号
function convertChineseQuotesToEnglish(text: string): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		if (text[i] !== '《') {
			result += text[i];
			i++;
			continue;
		}

		let j = i + 1;
		while (j < text.length && text[j] !== '》') {
			j++;
		}
		if (j >= text.length) {
			result += text[i];
			i++;
			continue;
		}

		const content = text.slice(i + 1, j);
		if (isEnglishLike(content)) {
			result += `"${content}"`;
		} else {
			result += `《${content}》`;
		}
		i = j + 1;
	}
	return result;
}

function normalizeChinesePunctuation(text: string): string {
	let result: string[] = [];
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const fullwidth = punctuationToFullwidthMap[char];
		if (!fullwidth) {
			result.push(char);
			continue;
		}

		let prev = '';
		for (let j = result.length - 1; j >= 0; j--) {
			if (!isWhitespaceChar(result[j])) {
				prev = result[j];
				break;
			}
		}

		let next = '';
		let nextIndex = i + 1;
		while (nextIndex < text.length && isWhitespaceChar(text[nextIndex])) {
			nextIndex++;
		}
		if (nextIndex < text.length) {
			next = text[nextIndex];
		}

		// 这是一个非常粗糙且保守的判定。
		const shouldConvert = isChineseChar(prev) && (next === '' || isChineseChar(next) || chinesePunctuation.includes(next));
		if (!shouldConvert) {
			result.push(char);
			continue;
		}

		while (result.length && isWhitespaceChar(result.at(-1)!)) {
			result.pop();
		}
		result.push(fullwidth);
		i = nextIndex - 1;
	}
	return result.join('');
}

// 占位符保护图片和网站URL以防破坏
function protectMarkdownLinks(text: string): { text: string; placeholders: string[] } {
	const placeholders: string[] = [];
	let result = '';
	let i = 0;
	while (i < text.length) {
		const start = i;
		let end = i;
		if (text[i] === '!') {
			i++;
		}

		if (i >= text.length || (text[i] !== '[' && text[i] !== '`')) {
			result += text[start];
			i = start + 1;
			continue;
		}

		if (text[i] === '[') {
			// label
			let labelEnd = i + 1;
			while (labelEnd < text.length && text[labelEnd] !== ']') {
				labelEnd++;
			}
			if (labelEnd + 1 >= text.length || text[labelEnd + 1] !== '(') {
				result += text[start];
				i = start + 1;
				continue;
			}

			// url
			let urlEnd = labelEnd + 2;
			while (urlEnd < text.length && text[urlEnd] !== ')') {
				urlEnd++;
			}
			if (urlEnd >= text.length) {
				result += text[start];
				i = start + 1;
				continue;
			}

			end = urlEnd;
		}
		else if (text[i] === '`') {
			end = i + 1;
			while (end < text.length && text[end] !== '`') {
				end++;
			}
			if (end >= text.length) {
				result += text[start];
				i = start + 1;
				continue;
			}
		}

		const placeholder = `CHEERMARKDOWNLINK${placeholders.length}`;
		placeholders.push(text.slice(start, end + 1));
		result += placeholder;
		i = end + 1;
	}
	return { text: result, placeholders };
}

function restoreMarkdownLinks(text: string, placeholders: string[]): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		if (!text.startsWith('CHEERMARKDOWNLINK', i)) {
			result += text[i];
			i++;
			continue;
		}

		let j = i + 'CHEERMARKDOWNLINK'.length;
		while (j < text.length && text[j] >= '0' && text[j] <= '9') {
			j++;
		}

		const index = Number(text.slice(i + 'CHEERMARKDOWNLINK'.length, j));
		result += placeholders[index] ?? '';
		i = j;
	}
	return result;
}

const fullwidthOpenBracketMap: Record<string, string> = {
	'(': '（',
	'[': '［',
};
const fullwidthCloseBracketMap: Record<string, string> = {
	')': '）',
	']': '］',
};
const isDigitChar = (s: string) => s.length === 1 && s >= '0' && s <= '9';
const isAsciiLetterChar = (s: string) => {
	if (s.length !== 1) {
		return false;
	}
	const code = s.charCodeAt(0);
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
};
const isFullwidthPunctuationChar = (s: string) => '，。！？；：、'.includes(s);
const isFullwidthOpenBracket = (s: string) => s === '（' || s === '［' || s === '【';
const isFullwidthCloseBracket = (s: string) => s === '）' || s === '］' || s === '】';
const isHalfwidthOpenBracket = (s: string) => s === '(' || s === '[';
const isHalfwidthCloseBracket = (s: string) => s === ')' || s === ']';
const isEnglishBoundaryStart = (s: string) => isalphaNumericChar(s) || s === '"' || s === '[' || s === '`' || s === '*';
const isEnglishBoundaryEnd = (s: string) => isalphaNumericChar(s) || s === '"' || s === ']' || s === '`' || s === '*';
const isChineseLikeChar = (s: string) => isChineseChar(s) || isFullwidthOpenBracket(s) || isFullwidthCloseBracket(s) || '「」『』“”《》〈〉'.includes(s);
const isChineseLeftBoundaryChar = (s: string) => isChineseChar(s) || isFullwidthCloseBracket(s) || '」』”》〉'.includes(s);
const isChineseRightBoundaryChar = (s: string) => isChineseChar(s) || isFullwidthOpenBracket(s) || isFullwidthCloseBracket(s) || '「『“《〈」』”》〉'.includes(s);
const isChineseClosingQuoteChar = (s: string) => '」』”》〉'.includes(s);
const isEnglishSentenceEnd = (s: string) => '.!?'.includes(s);

function getLastNonWhitespaceChar(chars: string[]): string {
	for (let i = chars.length - 1; i >= 0; i--) {
		if (!isWhitespaceChar(chars[i])) {
			return chars[i];
		}
	}
	return '';
}

function getNextNonWhitespaceChar(text: string, start: number): string {
	for (let i = start; i < text.length; i++) {
		if (!isWhitespaceChar(text[i])) {
			return text[i];
		}
	}
	return '';
}

function shouldKeepSpace(prev: string, next: string): boolean {
	if (!prev || !next) {
		return false;
	}
	if (isFullwidthOpenBracket(prev) || isHalfwidthOpenBracket(prev)) {
		return false;
	}
	if (isFullwidthCloseBracket(next) || isHalfwidthCloseBracket(next)) {
		return false;
	}
	if (next === '%' || next === '°') {
		return false;
	}
	if (isFullwidthPunctuationChar(next) || ',.!?;:'.includes(next)) {
		return false;
	}
	if (isFullwidthPunctuationChar(prev)) {
		return '。！？；：'.includes(prev) && (isAsciiLetterChar(next) || isDigitChar(next) || next === '"');
	}
	if (',.!?;:'.includes(prev)) {
		return isEnglishBoundaryStart(next);
	}
	if ((isChineseLikeChar(prev) && (isEnglishBoundaryStart(next) || isDigitChar(next))) ||
		((isEnglishBoundaryEnd(prev) || isDigitChar(prev)) && isChineseLikeChar(next))) {
		return true;
	}
	if (isDigitChar(prev) && isAsciiLetterChar(next)) {
		return true;
	}
	if ((isAsciiLetterChar(prev) || isDigitChar(prev)) && (isAsciiLetterChar(next) || isDigitChar(next))) {
		return true;
	}
	if (isEnglishBoundaryEnd(prev) && isEnglishBoundaryStart(next)) {
		return true;
	}
	return true;
}

function shouldUseFullwidthPunctuation(prev: string, next: string): boolean {
	return isChineseLikeChar(prev) && (next === '' || isChineseLikeChar(next) || isDigitChar(next) || isEnglishBoundaryStart(next));
}

function shouldUseHalfwidthPunctuation(current: string, prev: string, next: string): boolean {
	if (!prev) {
		return false;
	}
	if (current === '！' || current === '？') {
		return (isEnglishBoundaryEnd(prev) || ',.!?;:'.includes(prev)) &&
			(next === '' || isEnglishBoundaryStart(next) || next === '"' || next === '\'' || next === '`');
	}
	return false;
}

function extractLeadingWhitespace(text: string): string {
	let i = 0;
	while (i < text.length && /\s/.test(text[i])) {
		i++;
	}
	return text.slice(0, i);
}

function extractTrailingWhitespace(text: string): string {
	let i = text.length - 1;
	while (i >= 0 && /\s/.test(text[i])) {
		i--;
	}
	return text.slice(i + 1);
}

function normalizeMixedText(text: string): string {
	const result: string[] = [];
	const bracketStack: string[] = [];

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (isWhitespaceChar(char)) {
			const prev = getLastNonWhitespaceChar(result);
			const next = getNextNonWhitespaceChar(text, i + 1);
			if (shouldKeepSpace(prev, next) && result.at(-1) !== ' ') {
				result.push(' ');
			}
			continue;
		}

		const prev = getLastNonWhitespaceChar(result);
		const next = getNextNonWhitespaceChar(text, i + 1);
		let current = char;

		if (isHalfwidthOpenBracket(current) && isChineseLikeChar(prev)) {
			current = fullwidthOpenBracketMap[current] ?? current;
			bracketStack.push(fullwidthCloseBracketMap[current === '（' ? ')' : ']'] ?? '');
		} else if (isFullwidthOpenBracket(current)) {
			bracketStack.push(current === '（' ? '）' : current === '［' ? '］' : '】');
		} else if (isHalfwidthCloseBracket(current)) {
			const expectedClose = bracketStack.at(-1) ?? '';
			if (expectedClose === fullwidthCloseBracketMap[current] || isChineseLikeChar(next)) {
				current = fullwidthCloseBracketMap[current] ?? current;
			}
			if (current === expectedClose) {
				bracketStack.pop();
			}
		} else if (isFullwidthCloseBracket(current)) {
			if (bracketStack.at(-1) === current) {
				bracketStack.pop();
			}
		} else if (punctuationToFullwidthMap[current] && ',.!?;:'.includes(current) && shouldUseFullwidthPunctuation(prev, next)) {
			current = punctuationToFullwidthMap[current];
		} else if (punctuationToHalfwidthMap[current] && shouldUseHalfwidthPunctuation(current, prev, next)) {
			current = punctuationToHalfwidthMap[current];
		}

		const outputPrev = getLastNonWhitespaceChar(result);
		if (
			outputPrev &&
			result.at(-1) !== ' ' &&
			(
				(isChineseLeftBoundaryChar(outputPrev) && (isEnglishBoundaryStart(current) || isDigitChar(current))) ||
				((isEnglishBoundaryEnd(outputPrev) || isEnglishSentenceEnd(outputPrev) || isDigitChar(outputPrev) || outputPrev === '%' || outputPrev === '°') &&
					isChineseRightBoundaryChar(current) &&
					!isChineseClosingQuoteChar(current)) ||
				(isDigitChar(outputPrev) && isAsciiLetterChar(current)) ||
				('。！？；：'.includes(outputPrev) && (isAsciiLetterChar(current) || isDigitChar(current) || current === '"'))
			)
		) {
			result.push(' ');
		}

		if ((isFullwidthCloseBracket(current) || isHalfwidthCloseBracket(current) || isFullwidthPunctuationChar(current) || ',.!?;:%°'.includes(current)) &&
			result.at(-1) === ' ') {
			result.pop();
		}

		result.push(current);
	}

	return result.join('');
}
// 格式化单行文本：规范中英文混排、标点符号和间距
function formatPanguLine(text: string): string {
	// 保留原文本的前后空白符
	const leadingWhitespace = extractLeadingWhitespace(text);
	const trailingWhitespace = extractTrailingWhitespace(text);
	const coreText = text.slice(leadingWhitespace.length, text.length - trailingWhitespace.length);
	if (coreText.length === 0) {
		return text;
	}

	// 保护 Markdown 链接防止被破坏
	const { text: protectedText, placeholders } = protectMarkdownLinks(coreText);
	// 处理流程：
	// 1. 转换全宽字母数字为半宽
	// 2. 检查书名号情况
	// 3. 处理引号内的嵌入英文
	// 4. 规范中文标点
	// 5. 规范纯英文文本
	// 6. 规范混合文本
	const formatted = normalizeMixedText(
		normalizePureEnglishText(
			normalizeChinesePunctuation(
				normalizeEmbeddedEnglishText(
					normalizeEmbeddedChineseText(
						convertChineseQuotesToEnglish(
							toHalfwidthAlphaNumeric(protectedText)
						)
					)
				)
			)
		)
	);

	// 恢复保护的 Markdown 链接
	return leadingWhitespace + restoreMarkdownLinks(formatted, placeholders) + trailingWhitespace;
}

// 处理 Pangu 格式化命令：对选中文本或整个文档进行格式化
export async function handlePanguFormat() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	// 检查是否有非空选区（如果有选区但为空，视为无选区）
	const hasNonEmptySelection = editor.selections.some(selection => !selection.isEmpty);
	if (!hasNonEmptySelection) {
		const document = editor.document;
		await editor.edit(editBuilder => {
			for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				const newText = formatPanguLine(line.text);
				const newRange = line.range;
				editBuilder.replace(newRange, newText);
			}
		});
		return;
	}

	await editor.edit(editBuilder => {
		for (const selection of editor.selections) {
			if (selection.isEmpty) {
				continue;
			}
			editBuilder.replace(selection, editor.document.getText(selection)
				.split(/(\r?\n)/)
				.map(part => (part === '\n' || part === '\r\n') ? part : formatPanguLine(part))
				.join(''));
		}
	});
}
