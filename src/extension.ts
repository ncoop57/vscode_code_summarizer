// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios from "axios";
import * as vscode from 'vscode';

function gen_comment(code: string, url: string, editor: vscode.TextEditor, selection: vscode.Selection) {
	if (!editor) {
		return;
	}

	// Construct POST request
	const headers = {
		'Content-Type': 'application/json'
	};
	axios.post(String(url), {code: code}, {
		headers: headers
	})
	.then(function (response) {
		// From https://stackoverflow.com/questions/53585737/vscode-extension-how-to-alter-files-text
		// Take response from server and place generated comment above the highlighted code
		if (editor) {
			editor.edit(editBuilder => {
				editBuilder.insert(selection.start, '//' + response.data + '\n');
			});
		}
	});
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Summarize a highlighted code snippet
	let disposable = vscode.commands.registerCommand('code-summarizer.summarize', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // No open text editor
		}

		const document = editor.document;
		const selection = editor.selection;

		// Get selected code and strip out whitespace and lower case all tokens
		var code = document.getText(selection);
		code = code.split(/[\s]+/).join(' ').toLowerCase();

		var url = vscode.workspace.getConfiguration().get('code-summarizer.url');
		if (!url) {
			vscode.window.showInputBox({}).then(
				function (result) {
					vscode.workspace.getConfiguration().update('code-summarizer.url', result);
					url = result;
				}
			);
		}

		gen_comment(code, String(url), editor, selection);
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
