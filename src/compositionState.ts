import * as vscode from 'vscode';

export class CompositionState {
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