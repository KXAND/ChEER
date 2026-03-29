import * as vscode from 'vscode';

export class debugOutput {
	enableDebug: boolean | undefined = false;
	private readonly _output: vscode.OutputChannel;
	private static _instance: debugOutput;

	constructor() {
		this._output = vscode.window.createOutputChannel('ChEER Debug');
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
