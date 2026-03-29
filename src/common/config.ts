import * as vscode from 'vscode';

export const isLanguageEnabled = (config: vscode.WorkspaceConfiguration, languageId: string): boolean => {
	const languages = config.get<string[]>('activationOnLanguage', ['*']);
	return languages.includes('*') || languages.includes(languageId);
};
