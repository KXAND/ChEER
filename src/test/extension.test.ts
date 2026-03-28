import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	async function createEditor() {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '',
		});
		return vscode.window.showTextDocument(document);
	}

	async function documentText(editor: vscode.TextEditor) {
		return editor.document.getText();
	}

	test('typing 《 inserts a pair and one undo removes it', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '《' });
		assert.strictEqual(await documentText(editor), '《》');

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(await documentText(editor), '');
	});

	test('continuous correction undo restores the previous pair state', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '《' });
		await vscode.commands.executeCommand('type', { text: '《' });
		assert.strictEqual(await documentText(editor), '<>');

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(await documentText(editor), '《》');

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(await documentText(editor), '');
	});

	test('typing 《 wraps selected text', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: 'hello',
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 5));

		await vscode.commands.executeCommand('type', { text: '《' });
		assert.strictEqual(await documentText(editor), '《hello》');
	});

	test('composition end preserves selection wrapping', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: '等等等',
		});
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 3));

		await vscode.commands.executeCommand('compositionStart');
		await vscode.commands.executeCommand('type', { text: '《' });
		await vscode.commands.executeCommand('compositionEnd');

		assert.strictEqual(await documentText(editor), '等《等等》');
	});

	test('typing 〈 inserts a paired 〈〉', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '〈' });
		assert.strictEqual(await documentText(editor), '〈〉');
	});

	test('typing ，， converts to comma', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '，' });
		await vscode.commands.executeCommand('type', { text: '，' });
		assert.strictEqual(await documentText(editor), ',');
	});

	test('typing ￥ keeps the original symbol', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '￥' });
		assert.strictEqual(await documentText(editor), '￥');
	});

	test('typing ￥￥ converts to inline math pair', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '￥' });
		await vscode.commands.executeCommand('type', { text: '￥' });
		assert.strictEqual(await documentText(editor), '$$');
		assert.strictEqual(editor.selection.active.character, 1);
	});

	test('smart delete removes paired 《》', async () => {
		const editor = await createEditor();

		await vscode.commands.executeCommand('type', { text: '《' });
		assert.strictEqual(await documentText(editor), '《》');

		await vscode.commands.executeCommand('CHEER.SmartDelete');
		assert.strictEqual(await documentText(editor), '');
		assert.strictEqual(editor.selection.active.character, 0);
	});
});
