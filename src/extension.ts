// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios from "axios";
import * as vscode from 'vscode';
import * as path from 'path';
// Thanks to George Fraser's for how to use tree-sitter with his tree-sitter vscode lib: https://github.com/georgewfraser/vscode-tree-sitter
import * as Parser from 'web-tree-sitter';
const initParser = Parser.init();

async function loadLang() {
	const parser = new Parser;
	const java = await Parser.Language.load('./tree-sitter-java.wasm');
	parser.setLanguage(java);

	return parser;
}

function genComment(code: string, method: boolean, paramNames: Array<string>, isVoid: boolean, url: string, editor: vscode.TextEditor, selection: vscode.Selection) {
	if (!editor) {
		return;
	}

	// Construct POST request
	const headers = {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		'Content-Type': 'application/json'
	};
	axios.post(String(url), { code: code }, {
		headers: headers
	})
		.then(function (response) {
			// From https://stackoverflow.com/questions/53585737/vscode-extension-how-to-alter-files-text
			// Take response from server and place generated comment above the highlighted code
			if (editor) {
				editor.edit(editBuilder => {
					let comment = '';

					if (method) {
						comment = '/**\n' + ' '.repeat(selection.start.character) + ' *' + response.data + '\n' + ' '.repeat(selection.start.character) + ' *\n';
						for (let i = 0; i < paramNames.length; i++) {
							comment += ' '.repeat(selection.start.character) + ' * @param ' + paramNames[i] + '\n';
						}
						if (!isVoid) {
							comment += ' '.repeat(selection.start.character) + ' * @return \n';
						}
						comment += ' '.repeat(selection.start.character) + '*/\n';
					} else {
						comment = '//' + response.data + '\n';
					}
					editBuilder.insert(selection.start, comment + ' '.repeat(selection.start.character));
				});
			}
		});
}

function isMethod(tree: Parser.Tree, lang: Parser.Language) {
	const query1 = lang.query('(method_declaration name: (identifier) @function.method)');
	const matches1 = query1.matches(tree.rootNode);
	if (matches1.length === 1) {
		const query2 = lang.query('(ERROR (identifier) @function.method)');
		const matches2 = query2.matches(tree.rootNode);
		if (matches2.length === 1) { return false; }
		return true;
	}
	else { return false; }
}

function isVoidMethod(tree: Parser.Tree, lang: Parser.Language) {
	const query = lang.query('(local_variable_declaration type: (void_type) @function.method)');
	const matches = query.matches(tree.rootNode);
	if (matches.length === 1) { return true; }
	else { return false; }
}

// To get access to the .query, you need to download the correct tree-sitter-web.d.ts
// from: https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/tree-sitter-web.d.ts
function getParams(code: string, tree: Parser.Tree, lang: Parser.Language) {
	const query = lang.query('(formal_parameter name: (identifier) @function.method)');
	const matches = query.matches(tree.rootNode);
	let paramNames = new Array();
	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].captures[0].node.startIndex;
		const end = matches[i].captures[0].node.endIndex;
		paramNames.push(code.slice(start, end));
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

		const absolute = path.join(context.extensionPath, 'parsers', 'tree-sitter-java' + '.wasm');
		const lang = await Parser.Language.load(absolute);
		const parser = new Parser();
		parser.setLanguage(lang);


		const document = editor.document;
		const selection = editor.selection;

		// Get selected code and strip out whitespace and lower case all tokens
		let code = document.getText(selection);
		code = 'public class temp {' + code + '}';
		console.log(code);
		const tree = parser.parse(code);
		const method = isMethod(tree, lang); //tree.rootNode.toString());
		let isVoid = false;
		let paramNames = new Array();
		if (method) {
			console.log('This is a method!');
			isVoid = isVoidMethod(tree, lang);
			paramNames = getParams(code, tree, lang);
		} else { console.log('This is a code snippet'); }



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

		genComment(code, method, paramNames, isVoid, String(url), editor, selection);
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }