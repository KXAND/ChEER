import * as assert from 'assert';
import * as vscode from 'vscode';

async function createEditor(content: string = '') {
	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content,
	});
	return vscode.window.showTextDocument(document);
}

function documentText(editor: vscode.TextEditor) {
	return editor.document.getText();
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	suite('Paired Input', () => {
		test('typing 《 inserts a pair and one undo removes it', async () => {
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '《' });
			assert.strictEqual(documentText(editor), '《》');

			await vscode.commands.executeCommand('undo');
			assert.strictEqual(documentText(editor), '');
		});

		test('typing 《 wraps selected text', async () => {
			const editor = await createEditor('hello');
			editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 5));

			await vscode.commands.executeCommand('type', { text: '《' });
			assert.strictEqual(documentText(editor), '《hello》');
		});

		test('typing 〈 inserts a paired 〈〉', async () => {
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '〈' });
			assert.strictEqual(documentText(editor), '〈〉');
		});

		test('smart delete removes paired 《》', async () => {
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '《' });
			assert.strictEqual(documentText(editor), '《》');

			await vscode.commands.executeCommand('CHEER.SmartDelete');
			assert.strictEqual(documentText(editor), '');
			assert.strictEqual(editor.selection.active.character, 0);
		});
	});

	suite('Continuous Correction', () => {
		test('case 1', async () => {// ，， -> ,
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '，' });
			await vscode.commands.executeCommand('type', { text: '，' });
			assert.strictEqual(documentText(editor), ',');
		});

		test('case 2. typing ￥ keeps the original symbol', async () => {// 允许单独中文符号
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '￥' });
			assert.strictEqual(documentText(editor), '￥');
		});

		test('case 2.2 continuous input CJK character', async () => {// 连续输入变成拉丁符号
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '￥' });
			await vscode.commands.executeCommand('type', { text: '￥' });
			assert.strictEqual(documentText(editor), '$$');
			assert.strictEqual(editor.selection.active.character, 1);
		});

		test('case 3. continuous correction undo restores the previous pair state', async () => {
			const editor = await createEditor();

			await vscode.commands.executeCommand('type', { text: '《' });
			await vscode.commands.executeCommand('type', { text: '《' });
			assert.strictEqual(documentText(editor), '<>');

			await vscode.commands.executeCommand('undo');
			assert.strictEqual(documentText(editor), '《》');

			await vscode.commands.executeCommand('undo');
			assert.strictEqual(documentText(editor), '');
		});
	});

	suite('Composition', () => {
		test('composition end preserves selection wrapping', async () => {
			const editor = await createEditor('等等等');
			editor.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 3));

			await vscode.commands.executeCommand('compositionStart');
			await vscode.commands.executeCommand('type', { text: '《' });
			await vscode.commands.executeCommand('compositionEnd');

			assert.strictEqual(documentText(editor), '等《等等》');
		});
	});

	// Pangu
	suite('Pangu', () => {
		// Rule 1. 中英文之間需要增加空格
		test('Pangu.case1.1', async () => {
			const editor = await createEditor('在LeanCloud上，數據儲存是圍繞AVObject進行的。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '在 LeanCloud 上，數據儲存是圍繞 AVObject 進行的。');
		});
		test('Pangu.case1.2', async () => {
			const editor = await createEditor('在 LeanCloud上，數據儲存是圍繞AVObject 進行的。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '在 LeanCloud 上，數據儲存是圍繞 AVObject 進行的。');
		});
		// Rule 2. 中文與數字之間需要增加空格
		test('Pangu.case2.1', async () => {
			const editor = await createEditor('今天出去買菜花了 5000元。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '今天出去買菜花了 5000 元。');
		});
		test('Pangu.case2.2', async () => {
			const editor = await createEditor('今天出去買菜花了5000元。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '今天出去買菜花了 5000 元。');
		});
		// Rule 3. 數字與單位之間需要增加空格（度數／百分比與數字之間不需要增加空格）
		test('Pangu.case3.1', async () => {// 數字與單位之間需要增加空格
			const editor = await createEditor('我家的光纖入屋寬頻有 10Gbps，SSD 一共有 20TB。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '我家的光纖入屋寬頻有 10 Gbps，SSD 一共有 20 TB。');
		});
		test('Pangu.case3.2.1', async () => {// 度數／百分比與數字之間多余空格应删去
			const editor = await createEditor('角度為 90 ° 的角，就是直角。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '角度為 90° 的角，就是直角。');
		});
		test('Pangu.case3.2.2', async () => {
			const editor = await createEditor('新 MacBook Pro 有 15 % 的 CPU 性能提升。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '新 MacBook Pro 有 15% 的 CPU 性能提升。');
		});
		test('Pangu.case3.3.1', async () => {// 度數／百分比與數字之間不需要增加空格
			const editor = await createEditor('角度為 90° 的角，就是直角。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.notStrictEqual(documentText(editor), '角度為 90 ° 的角，就是直角。');
		});
		test('Pangu.case3.3.2', async () => {
			const editor = await createEditor('新 MacBook Pro 有 15% 的 CPU 性能提升。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.notStrictEqual(documentText(editor), '新 MacBook Pro 有 15 % 的 CPU 性能提升。');
		});
		// Rule 4. 全形標點與其他字符之間不加空格
		test('Pangu.case4.1.1', async () => {// 应删去多余空格
			const editor = await createEditor('剛剛買了一部 iPhone ，好開心！');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '剛剛買了一部 iPhone，好開心！');
		});
		test('Pangu.case4.1.2', async () => {
			const editor = await createEditor('剛剛買了一部 iPhone， 好開心！');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '剛剛買了一部 iPhone，好開心！');
		});
		test('Pangu.case4.2.1', async () => {// 不准加空格
			const editor = await createEditor('剛剛買了一部 iPhone，好開心！');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.notStrictEqual(documentText(editor), '剛剛買了一部 iPhone ，好開心！');
		});
		test('Pangu.case4.2.2', async () => {
			const editor = await createEditor('剛剛買了一部 iPhone，好開心！');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.notStrictEqual(documentText(editor), '剛剛買了一部 iPhone， 好開心！');
		});
		// Rule 5. 中文與中文之間應使用全形標點
		test('Pangu.case5.1', async () => {
			const editor = await createEditor('你好,世界!今天:真好;是不是?');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '你好，世界！今天：真好；是不是？');
		});
		test('Pangu.case5.2', async () => {
			const editor = await createEditor('請參考(附錄A)與[案例一]。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '請參考（附錄 A）與［案例一］。');
		});
		// Rule 6. 數字與字母始終使用半形形式
		test('Pangu.case6.1', async () => {
			const editor = await createEditor('型號ＡＢＣ１２３，版本２．０。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '型號 ABC123，版本 2.0。');
		});
		// Rule 7. 完整英語表述應使用英文標點，英文作品名不應使用中文書名號
		test('Pangu.case7.1', async () => {
			const editor = await createEditor('《The Lord of the Rings》 is a fantasy novel.');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '"The Lord of the Rings" is a fantasy novel.');
		});
		test('Pangu.case7.2', async () => {
			const editor = await createEditor('He said，"Hello，world！"');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), 'He said, "Hello, world!"');
		});
		test('Pangu.case7.3', async () => {
			const editor = await createEditor('賈伯斯那句話是怎麼說的？「Stay hungry，stay foolish。」');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '賈伯斯那句話是怎麼說的？「Stay hungry, stay foolish.」');
		});
		test('Pangu.case7.4', async () => {
			const editor = await createEditor('陈睿说：“bilibili，cheers！”。');

			await vscode.commands.executeCommand('CHEER.PanguFormat');
			assert.strictEqual(documentText(editor), '陈睿说：“bilibili, cheers!”。');
		});
	});
});
