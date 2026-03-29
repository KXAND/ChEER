import * as vscode from 'vscode';

export interface ContinuousCorrectionUndoEntry {
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
