// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios from "axios";
import * as vscode from 'vscode';
import * as path from 'path';
// Thanks to George Fraser's for how to use tree-sitter with his tree-sitter vscode lib: https://github.com/georgewfraser/vscode-tree-sitter
import * as Parser from 'web-tree-sitter';

const MSG = 'AUTO-GENERATED COMMENT PLEASE VERIFY AND UPDATE';

/**
 * Generate and setup the parser for a specific language
 * @param context the current context of the VSCode extension
 * @return {Promise<Parser>}
 */
async function getParser(context: vscode.ExtensionContext): Promise<Parser> {
	await Parser.init();
	const absolute = path.join(context.extensionPath, 'parsers', 'tree-sitter-java' + '.wasm');
	const parser = new Parser;
	const lang = await Parser.Language.load(absolute);
	parser.setLanguage(lang);
	return parser;
}

/**
 * Properly construct a method comment using the predict comment from the model
 * @param {string} cmt the predicted comment from the model
 * @param {Array<string>} paramNames array of parameter names to add to the docstring
 * @param {boolean} isVoid whether to add the return JavaDoc annotation
 * @param {string} alignChars characters to add to the beginning of the comment to properly indent it
 * @return {string} the method comment
 */
function genMethodComment(
	cmt: string, paramNames: Array<string>, isVoid: boolean, alignChars: string
): string {
	let mthdCmt = `/** ${MSG}\n${alignChars} *${cmt}\n${alignChars} *\n`;
	for (let i = 0; i < paramNames.length; i++) {
		mthdCmt += `${alignChars} * @param ${paramNames[i]}\n`;
	}
	if (!isVoid) {
		mthdCmt += `${alignChars} * @return STUB PLEASE FILL IN\n`;
	}
	mthdCmt += `${alignChars} */\n`;

	return mthdCmt;
}

/**
 * Properly construct an inline comment using the predict comment from the model
 * @param {string} cmt the predicted comment from the model
 * @param {string} alignChars characters to add to the beginning of the comment to properly indent it
 * @return {string} the inline comment
 */
function genInlineComment(cmt: string, alignChars: string): string {
	let inlineCmt = `// ${MSG}\n`;
	inlineCmt += `${alignChars}//${cmt}\n`;

	return inlineCmt;
}

/**
 * Generate the comment for the given highlighted code
 * @param code the code to send to the server to have the model generate the comment for
 * @param isMthd whether the given code is a method or code snippet
 * @param paramNames array of parameter names to add to the docstring if it is a method
 * @param isVoid whether to add the return docstring annotation
 * @param url the url to send the code to
 * @param editor the current editor to make sure the editor is still open
 * @param selection the highlighted selection in the editor to determine how far to indent
 */
function genComment(
	code: string, isMthd: boolean, paramNames: Array<string>,
	isVoid: boolean, url: string, editor: vscode.TextEditor, selection: vscode.Selection
) {
	if (!editor) {
		return;
	}

	const alignChars = ' '.repeat(selection.start.character);
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
					let cmt;
					if (isMthd) {
						cmt = genMethodComment(response.data, paramNames, isVoid, alignChars);
					} else {
						cmt = genInlineComment(response.data, alignChars);
					}
					editBuilder.insert(selection.start, cmt + ' '.repeat(selection.start.character));
				});
			}
		});
}

/**
 * Determine if the given AST tree is a method
 * @param {Parser.Tree} tree the AST tree to check is a method
 * @param {Parser.Language} lang the Parser.Language object for building the query to check if a tree is a method
 * @return {boolean} whether or not the given AST tree is a method
 */
function isMethod(tree: Parser.Tree, lang: Parser.Language): boolean {
	const query1 = lang.query('(method_declaration name: (identifier) @function.method)');
	const matches1 = query1.matches(tree.rootNode);
	if (matches1.length === 1) {
		const query2 = lang.query('(ERROR (identifier) @function.method)');
		const matches2 = query2.matches(tree.rootNode);
		if (matches2.length >= 1) { return false; }
		return true;
	}
	else { return false; }
}

/**
 * Determine if the given AST tree is a void method
 * @param {Parser.Tree} tree the AST tree to check is a void method
 * @param {Parser.Language} lang the Parser.Language object for building the query to check if a tree is a void method
 * @return {boolean} whether or not the given AST tree is a void method
 */
function isVoidMethod(tree: Parser.Tree, lang: Parser.Language): boolean {
	const query = lang.query('(method_declaration type: (void_type) @function.method)');
	const matches = query.matches(tree.rootNode);
	if (matches.length === 1) { return true; }
	else { return false; }
}

// To get access to the .query, you need to download the correct tree-sitter-web.d.ts
// from: https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/tree-sitter-web.d.ts
/**
 * Get the parameter names of the given method
 * @param {string} mthd the method to get the parameters from
 * @param {Parser.Tree} tree the AST tree to query to get the location of the parameters from
 * @param {Parser.Language} lang the Parser.Language object for building the query to get the location of the parameters from
 * @return {Array<string>} array of strings containing the parameter names of the given method
 */
function getParams(mthd: string, tree: Parser.Tree, lang: Parser.Language): Array<any> {
	const query = lang.query('(formal_parameter name: (identifier) @function.method)');
	const matches = query.matches(tree.rootNode);
	let paramNames = new Array();
	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].captures[0].node.startIndex;
		const end = matches[i].captures[0].node.endIndex;
		paramNames.push(mthd.slice(start, end));
	}

	return paramNames;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const parser = await getParser(context);
	const lang = parser.getLanguage();
	// Summarize a highlighted code snippet
	let disposable = vscode.commands.registerCommand('code-summarizer.summarize', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // No open text editor
		}

		const document = editor.document;
		const selection = editor.selection;

		// Get selected code and strip out whitespace and lower case all tokens
		let code = document.getText(selection);
		code = 'public class temp {' + code + '}';
		const tree = parser.parse(code);
		let paramNames = new Array();
		if (isMethod(tree, lang)) {
			paramNames = getParams(code, tree, lang);
		}

		var url = vscode.workspace.getConfiguration().get('code-summarizer.url');
		if (!url) {
			vscode.window.showInputBox({}).then(
				function (result) {
					vscode.workspace.getConfiguration().update('code-summarizer.url', result);
					url = result;
				}
			);
		}

		code = code.split(/[\s]+/).join(' ').toLowerCase();
		genComment(
			code, isMethod(tree, lang), paramNames,
			isVoidMethod(tree, lang), String(url),
			editor, selection
		);
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }