// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios from "axios";
import * as vscode from 'vscode';
// Thanks to George Fraser's for how to use tree-sitter with his tree-sitter vscode lib: https://github.com/georgewfraser/vscode-tree-sitter
import * as Parser from 'web-tree-sitter';
const initParser = Parser.init();

async function loadLang() {
	const parser = new Parser;
	const java = await Parser.Language.load('./tree-sitter-java.wasm');
	parser.setLanguage(java);

	return parser;
}

function genComment(code: string, paramNames: Array<string>, isVoid: boolean, url: string, editor: vscode.TextEditor, selection: vscode.Selection) {
	if (!editor) {
		return;
	}

	// Construct POST request
	const headers = {
		// eslint-disable-next-line @typescript-eslint/naming-convention
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
				let javaDoc = '/**\n' + ' * ' + response.data + '\n';
				for (let i = 0; i < paramNames.length; i++) {
					javaDoc += ' * @param ' + paramNames[i] + '\n';
				}
				if (!isVoid) {
					javaDoc += ' * @return \n';
				}
				javaDoc += '*/\n';
				editBuilder.insert(selection.start, javaDoc);
			});
		}
	});
}

function isVoid(tree: Parser.Tree) {
	let signature = tree.rootNode.children[0].children[0];
	for (let i = 0; i < signature.children.length; i++) {
		if (signature.children[i].type === 'void_type') {
			return true;
		}
	}

	return false;
}

function getParams(tree: Parser.Tree) {
	let params = tree.rootNode.children[1].children[0];
	let paramNames = new Array();
	for (let i = 0; i < params.children.length; i++) {
		if (params.children[i].type === 'formal_parameter') {
			paramNames.push(params.children[i].children[1].text);
		}
	}

	return paramNames;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Summarize a highlighted code snippet
	let disposable = vscode.commands.registerCommand('code-summarizer.summarize', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // No open text editor
		}

		const lang = await Parser.Language.load('./src/tree-sitter-java.wasm');
		const parser = new Parser();
		parser.setLanguage(lang);
		

		const document = editor.document;
		const selection = editor.selection;

		// Get selected code and strip out whitespace and lower case all tokens
		var code = document.getText(selection);
		const tree = parser.parse(code);
		const voidMethod = isVoid(tree);
		const paramNames = getParams(tree);

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

		genComment(code, paramNames, voidMethod, String(url), editor, selection);
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
