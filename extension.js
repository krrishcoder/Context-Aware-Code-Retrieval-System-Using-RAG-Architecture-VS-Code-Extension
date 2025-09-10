// Import VS Code API
const vscode = require('vscode');
// Import child_process to run Python script
const { exec } = require('child_process');
// Import path module to resolve script path
const path = require('path');


function activate(context) {
    console.log('Extension "krrishcoder" is active!');

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(search) CtrlF';
    statusBarItem.tooltip = 'Click to search Python code';
    statusBarItem.command = 'krrishcoder.searchCode';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Command
    const disposable = vscode.commands.registerCommand('krrishcoder.searchCode', () => {
        vscode.window.showInputBox({ prompt: 'Enter your query' }).then(query => {
            if (!query) return;
            runPython(query, (err, lines) => {
                if (err) {
                    vscode.window.showErrorMessage('Python script failed');
                    return;
                }
                vscode.window.showQuickPick(lines, { placeHolder: 'Select a match' }).then(selected => {
                    if (!selected) return;
                    jumpToLine(selected);
                });
            });
        });
    });

    context.subscriptions.push(disposable);
}


// Function to run the Python script

function runPython(query, callback) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Open a folder first!');
        return;
    }

    const folderPath = workspaceFolders[0].uri.fsPath; // current workspace folder
    const scriptPath = path.join(__dirname, 'script.py');

    // Use your Miniconda Python path
	const pythonPath = 'python';


    // Pass query and folderPath as arguments
    exec(`"${pythonPath}" "${scriptPath}" "${query}" "${folderPath}"`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error: ${stderr}`);
            callback(err);
            return;
        }
        const lines = stdout.trim().split('\n');
        callback(null, lines);
    });
}

// Function to jump to a specific line in the active editor
function jumpToLine(lineInfo) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Open a file first');
        return;
    }
    const lineNumber = parseInt(lineInfo.split(':')[0], 10) - 1;
    const position = new vscode.Position(lineNumber, 0);
    const selection = new vscode.Selection(position, position);
    editor.selection = selection;
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate
};
