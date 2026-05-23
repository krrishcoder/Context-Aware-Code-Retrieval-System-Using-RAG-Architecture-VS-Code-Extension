const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

let outputChannel;
let pythonExecutablePromise;
let dependencyInstallPromise;

/* -------------------- PYTHON -------------------- */

function findPythonExecutable() {
    if (pythonExecutablePromise) return pythonExecutablePromise;

    pythonExecutablePromise = new Promise((resolve) => {
        const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
        let i = 0;

        const tryNext = () => {
            if (i >= candidates.length) return resolve(null);
            const candidate = candidates[i++];
            const args = candidate === 'py' ? ['-3', '--version'] : ['--version'];

            execFile(candidate, args, (err) => {
                if (!err) return resolve(candidate);
                tryNext();
            });
        };

        tryNext();
    });

    return pythonExecutablePromise;
}

function pythonArgs(py, args) {
    return py === 'py' ? ['-3', ...args] : args;
}

function ensurePythonDependencies() {
    if (dependencyInstallPromise) return dependencyInstallPromise;

    dependencyInstallPromise = new Promise((resolve, reject) => {
        findPythonExecutable().then((py) => {
            if (!py) return reject(new Error('Python not found. Install Python 3 to use RAG Search.'));

            const checkArgs = pythonArgs(py, ['-c', 'import fastembed, numpy']);
            execFile(py, checkArgs, (checkErr) => {
                if (!checkErr) return resolve();

                const requirements = path.join(__dirname, 'requirements.txt');
                const installArgs = pythonArgs(py, ['-m', 'pip', 'install', '--user', '-r', requirements]);
                outputChannel?.appendLine('Installing Python dependencies for RAG Search...');

                execFile(py, installArgs, { timeout: 10 * 60 * 1000 }, (installErr, stdout, stderr) => {
                    if (stdout && outputChannel) outputChannel.appendLine(stdout.trim());
                    if (stderr && outputChannel) outputChannel.appendLine(stderr.trim());
                    if (installErr) return reject(new Error(`Failed to install Python dependencies: ${installErr.message}`));
                    resolve();
                });
            });
        });
    });

    return dependencyInstallPromise;
}

function runPythonArgs(args, callback) {
    return new Promise((resolve) => {
        ensurePythonDependencies()
            .then(() => findPythonExecutable())
            .then((py) => {
                if (!py) throw new Error('Python not found');

                const script = path.join(__dirname, 'script.py');
                execFile(py, pythonArgs(py, [script, ...args]), { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
                    if (stderr && outputChannel) {
                        stderr
                            .split('\n')
                            .filter(line => line.startsWith('#timing-details:'))
                            .forEach(line => outputChannel.appendLine(line));
                    }

                    if (err) return callback(err);
                    const lines = stdout.trim() ? stdout.trim().split('\n') : [];
                    callback(null, lines);
                });
            })
            .catch(callback)
            .finally(resolve);
    });
}

function runPython(query, callback) {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf) return callback(new Error('No workspace open'));

    const folder = wf[0].uri.fsPath;
    runPythonArgs([query, folder], callback);
}

function rebuildIndex(callback) {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf) return callback(new Error('No workspace open'));

    const folder = wf[0].uri.fsPath;
    runPythonArgs(['--rebuild', folder, 'workspace index'], callback);
}

/* -------------------- NAVIGATION -------------------- */

function jumpToLine(info) {
    const parsed = (() => {
        if (info && typeof info === 'object') {
            return {
                file: typeof info.file === 'string' && info.file.trim() ? info.file.trim() : null,
                line: typeof info.line === 'number' ? info.line : parseInt(String(info.line || info.text || '').split(':')[0], 10),
            };
        }
        const match = String(info).match(/^(.+?):(\d+)(?:-\d+)?:/);
        if (match) return { file: match[1], line: parseInt(match[2], 10) };
        return { file: null, line: parseInt(String(info).split(':')[0], 10) };
    })();

    const targetLine = Number.isFinite(parsed.line) ? Math.max(0, parsed.line - 1) : 0;

    const revealInEditor = (editor) => {
        if (!editor) return;
        const pos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
    };

    if (parsed.file) {
        const wf = vscode.workspace.workspaceFolders;
        const root = wf && wf[0] ? wf[0].uri.fsPath : null;
        const resolved = path.isAbsolute(parsed.file) ? parsed.file : (root ? path.join(root, parsed.file) : parsed.file);
        const uri = vscode.Uri.file(resolved);
        vscode.workspace.openTextDocument(uri)
            .then((doc) => vscode.window.showTextDocument(doc, { preview: false }))
            .then(revealInEditor, () => { /* ignore */ });
        return;
    }

    revealInEditor(vscode.window.activeTextEditor);
}

/* -------------------- CHAT HTML -------------------- */

function getChatHtml() {
    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root{color-scheme:light dark;--bg:var(--vscode-editor-background);--fg:var(--vscode-editor-foreground);--muted:var(--vscode-descriptionForeground);--border:var(--vscode-panel-border);--input-bg:var(--vscode-input-background);--input-fg:var(--vscode-input-foreground);--button-bg:var(--vscode-button-background);--button-fg:var(--vscode-button-foreground);--button-hover:var(--vscode-button-hoverBackground);--bubble:var(--vscode-editorWidget-background);--bubble-border:var(--vscode-editorWidget-border);--row-hover:var(--vscode-list-hoverBackground);--link:var(--vscode-textLink-foreground)}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
#shell{height:100vh;display:flex;flex-direction:column}
#topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:0 14px;border-bottom:1px solid var(--border);background:var(--vscode-sideBar-background)}
.brand{display:flex;align-items:center;gap:9px;font-weight:600;min-width:0}
.mark{width:22px;height:22px;display:grid;place-items:center;border:1px solid var(--border);border-radius:6px;color:var(--link);background:var(--vscode-editor-background);font-size:12px;font-weight:700;flex:0 0 auto}
.subtle{color:var(--muted);font-size:11px;white-space:nowrap}
#messages{flex:1;overflow:auto;padding:18px 16px 20px}
.turn{display:flex;gap:10px;margin:0 auto 16px;max-width:920px;width:100%}
.turn.user{justify-content:flex-end}
.avatar{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border-radius:6px;border:1px solid var(--border);color:var(--muted);background:var(--vscode-editorWidget-background);font-size:11px;font-weight:700}
.user .avatar{display:none}
.bubble{max-width:min(760px,82%);padding:10px 12px;border:1px solid var(--bubble-border,var(--border));border-radius:8px;background:var(--bubble);line-height:1.45;overflow-wrap:anywhere;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.user .bubble{background:var(--button-bg);color:var(--button-fg);border-color:transparent}
.assistant .bubble{min-width:min(620px,100%)}
.plain{white-space:pre-wrap}
.results{display:flex;flex-direction:column;gap:7px}
.result{width:100%;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;padding:9px 10px;border:1px solid var(--border);border-radius:6px;background:var(--vscode-editor-background);color:var(--fg);cursor:pointer;text-align:left;font:inherit}
.result:hover{background:var(--row-hover)}
.result:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:2px}
.file{font-family:var(--vscode-editor-font-family);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.symbol{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.line{grid-row:1 / span 2;grid-column:2;font-family:var(--vscode-editor-font-family);font-size:11px;color:var(--link);border:1px solid var(--border);border-radius:999px;padding:2px 7px;white-space:nowrap}
#typing{display:none}
#typing.active{display:flex}
.dots{display:flex;align-items:center;gap:4px;height:20px}
.dots span{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:pulse 1.1s infinite ease-in-out}
.dots span:nth-child(2){animation-delay:.15s}
.dots span:nth-child(3){animation-delay:.3s}
@keyframes pulse{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
#composer{display:flex;gap:8px;padding:12px 14px;border-top:1px solid var(--border);background:var(--vscode-sideBar-background)}
#input{flex:1;min-width:0;height:34px;border:1px solid var(--vscode-input-border,transparent);border-radius:6px;padding:0 11px;color:var(--input-fg);background:var(--input-bg);font:inherit}
#input:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:0}
#send{height:34px;min-width:68px;border:0;border-radius:6px;padding:0 13px;color:var(--button-fg);background:var(--button-bg);font:inherit;cursor:pointer}
#send:hover{background:var(--button-hover)}
#send:disabled,#input:disabled{opacity:.65;cursor:default}
@media(max-width:560px){#messages{padding:14px 10px 16px}.bubble{max-width:88%}.assistant .bubble{min-width:0}.result{grid-template-columns:1fr}.line{grid-row:auto;grid-column:auto;justify-self:start}.subtle{display:none}}
</style>
</head>
<body>
<div id="shell">
<header id="topbar">
<div class="brand"><span class="mark">R</span><span>RAG Chat</span></div>
<div class="subtle">Python workspace search</div>
</header>
<main id="messages"></main>
<div id="typing" class="turn assistant">
<div class="avatar">AI</div>
<div class="bubble"><div class="dots"><span></span><span></span><span></span></div></div>
</div>
<div id="composer">
<input id="input" placeholder="Ask about your codebase" />
<button id="send">Send</button>
</div>
</div>
<script>
const vscode = acquireVsCodeApi();
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const send = document.getElementById('send');
const typing = document.getElementById('typing');
let busy = false;

function parseJumpItems(text){
    const items=[];
    if(!text) return items;

    // Prefer file:line-range:(Symbol)
    const fileLineRe = /(^|\\s)([^\\n]+?):(\\d+)(?:-(\\d+))?:\\s*\\(([^)]+)\\)/g;
    let m;
    while((m=fileLineRe.exec(text))!==null){
        const range = m[4] ? (m[3] + '-' + m[4]) : m[3];
        items.push({ file: m[2].trim(), line: parseInt(m[3],10), range, symbol: m[5], label: (m[2].trim() + ':' + range + ': (' + m[5] + ')') });
    }

    // Also support line:(Symbol) (no file)
    const lineOnlyRe = /(^|\\s)(\\d+):\\s*\\(([^)]+)\\)/g;
    while((m=lineOnlyRe.exec(text))!==null){
        items.push({ file: null, line: parseInt(m[2],10), range: m[2], symbol: m[3], label: (m[2] + ': (' + m[3] + ')') });
    }

    // De-dupe
    const seen = new Set();
    return items.filter(it=>{
        const k = (String(it.file || '') + '|' + String(it.line) + '|' + String(it.label));
        if(seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

function scrollBottom(){
    messages.scrollTop=messages.scrollHeight;
}

function setBusy(next){
    busy = next;
    input.disabled = next;
    send.disabled = next;
    send.textContent = next ? 'Searching' : 'Send';
    typing.classList.toggle('active', next);
    scrollBottom();
}

function add(role,text){
    const turn=document.createElement('div');
    turn.className='turn '+role;

    const avatar=document.createElement('div');
    avatar.className='avatar';
    avatar.textContent = role === 'assistant' ? 'AI' : 'ME';

    const bubble=document.createElement('div');
    bubble.className='bubble';

    if(role==='assistant'){
        const items = parseJumpItems(text);
        if(items.length){
            const wrap=document.createElement('div');
            wrap.className='results';
            items.forEach(it=>{
                const row=document.createElement('button');
                row.className='result';
                row.type='button';
                row.addEventListener('click',()=>{
                    vscode.postMessage({ type:'jump', file: it.file, line: it.line, text: it.label });
                });

                const file=document.createElement('div');
                file.className='file';
                file.textContent = it.file || 'Active editor';

                const symbol=document.createElement('div');
                symbol.className='symbol';
                symbol.textContent = it.symbol;

                const line=document.createElement('div');
                line.className='line';
                line.textContent = 'L' + it.range;

                row.appendChild(file);
                row.appendChild(symbol);
                row.appendChild(line);
                wrap.appendChild(row);
            });
            bubble.appendChild(wrap);
        } else {
            const plain=document.createElement('div');
            plain.className='plain';
            plain.textContent = text || 'No matching Python symbols found.';
            bubble.appendChild(plain);
        }
    } else {
        bubble.textContent=text;
    }

    turn.appendChild(avatar);
    turn.appendChild(bubble);
    messages.appendChild(turn);
    scrollBottom();
}

window.addEventListener('message',e=>{
  const m=e.data;
  if(m.type==='history') m.history.forEach(x=>add(x.role,x.text));
  if(m.type==='message') {
    if(m.message.role==='assistant') setBusy(false);
    add(m.message.role,m.message.text);
  }
});

send.onclick=()=>{
  if(busy) return;
  const t=input.value.trim();
  if(!t) return;
  vscode.postMessage({type:'query',text:t});
  input.value='';
  setBusy(true);
};

input.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();send.click();}
});

vscode.postMessage({type:'ready'});
</script>
</body>
</html>`;
}

/* -------------------- SIDEBAR -------------------- */

class RagActionsProvider {
    getTreeItem(item) {
        return item;
    }

    getChildren() {
        return [
            this.createAction('Ask code questions', 'krrishcoder.openChat', 'comment-discussion'),
            this.createAction('Search code', 'krrishcoder.searchCode', 'search'),
            this.createAction('Rebuild index', 'krrishcoder.rebuildIndex', 'refresh'),
        ];
    }

    createAction(label, command, icon) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.command = { command, title: label };
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
}

class RagChatProvider {
    constructor(context) {
        this.context = context;
        this.view = null;
    }

    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        const wf = vscode.workspace.workspaceFolders;
        const folder = wf?.[0]?.uri.fsPath;
        const key = folder ? `chat:${folder}` : null;
        const history = key ? this.context.workspaceState.get(key, []) : [];

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'ready') {
                webviewView.webview.postMessage({ type: 'history', history });
                return;
            }

            if (msg.type === 'jump') {
                jumpToLine(msg);
                return;
            }

            if (msg.type === 'query') {
                if (!key) {
                    webviewView.webview.postMessage({
                        type: 'message',
                        message: { role: 'assistant', text: 'Open a folder first.' },
                    });
                    return;
                }

                const user = { role: 'user', text: msg.text };
                history.push(user);
                await this.context.workspaceState.update(key, history);
                webviewView.webview.postMessage({ type: 'message', message: user });

                runPython(msg.text, (err, lines) => {
                    const text = err ? err.message : lines.join('\n');
                    const bot = { role: 'assistant', text };
                    history.push(bot);
                    this.context.workspaceState.update(key, history);
                    webviewView.webview.postMessage({ type: 'message', message: bot });
                });
            }
        });

        webviewView.webview.html = getChatHtml();
    }

    show() {
        if (this.view) {
            this.view.show?.();
            return;
        }

        vscode.commands.executeCommand('krrishcoder.chat.focus');
    }
}

/* -------------------- ACTIVATE -------------------- */

function activate(context) {
    outputChannel = vscode.window.createOutputChannel('RAG Search');
    context.subscriptions.push(outputChannel);
    ensurePythonDependencies().catch((err) => {
        outputChannel.appendLine(err.message);
        vscode.window.showWarningMessage(err.message);
    });

    const chatProvider = new RagChatProvider(context);
    const chatView = vscode.window.registerWebviewViewProvider(
        'krrishcoder.chat',
        chatProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );

    const openChat = vscode.commands.registerCommand('krrishcoder.openChat', () => {
        const wf = vscode.workspace.workspaceFolders;
        if (!wf) return vscode.window.showErrorMessage('Open a folder first');
        chatProvider.show();
    });

    const searchCmd = vscode.commands.registerCommand('krrishcoder.searchCode', async () => {
        const qp = vscode.window.createQuickPick();
        qp.placeholder = 'Search code';
        qp.show();

        qp.onDidChangeValue(v => {
            if (!v) return;
            runPython(v, (_, lines) => {
                qp.items = (lines || []).map(l => ({ label: l }));
            });
        });

        qp.onDidAccept(() => {
            if (qp.selectedItems[0]) jumpToLine(qp.selectedItems[0].label);
            qp.hide();
        });
    });

    const rebuildCmd = vscode.commands.registerCommand('krrishcoder.rebuildIndex', async () => {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'RAG Search: rebuilding Python code index',
                cancellable: false,
            },
            () => new Promise((resolve) => {
                rebuildIndex((err) => {
                    if (err) vscode.window.showErrorMessage(err.message);
                    else vscode.window.showInformationMessage('RAG Search index rebuilt.');
                    resolve();
                });
            })
        );
    });

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = '$(comment-discussion) RAG Chat';
    statusItem.tooltip = 'Ask questions about your Python codebase';
    statusItem.command = 'krrishcoder.openChat';
    statusItem.show();

    const actionsProvider = new RagActionsProvider();
    const actionsView = vscode.window.registerTreeDataProvider('krrishcoder.actions', actionsProvider);

    context.subscriptions.push(openChat, searchCmd, rebuildCmd, statusItem, actionsView, chatView);
}

function deactivate() {}

module.exports = { activate, deactivate };
