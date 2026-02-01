const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

let outputChannel;
const chatPanels = new Map();

/* -------------------- PYTHON -------------------- */

function findPythonExecutable() {
    return new Promise((resolve) => {
        const candidates = ['python3', 'python'];
        let i = 0;
        const tryNext = () => {
            if (i >= candidates.length) return resolve(null);
            exec(`${candidates[i]} --version`, (err) => {
                if (!err) return resolve(candidates[i]);
                i++;
                tryNext();
            });
        };
        tryNext();
    });
}

function runPython(query, callback) {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf) return callback(new Error('No workspace open'));

    const folder = wf[0].uri.fsPath;
    const script = path.join(__dirname, 'script.py');

    findPythonExecutable().then((py) => {
        if (!py) return callback(new Error('Python not found'));

        exec(`"${py}" "${script}" "${query}" "${folder}"`, (err, stdout, stderr) => {
            if (err) return callback(err);

            // log timing info if present
            const timing = (stderr || '').split('\n').find(l => l.startsWith('#timing-details:'));
            if (timing && outputChannel) outputChannel.appendLine(timing);

            const lines = stdout.trim() ? stdout.trim().split('\n') : [];
            callback(null, lines);
        });
    });
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
<style>
body{font-family:sans-serif;margin:0;display:flex;flex-direction:column;height:100vh}
#messages{flex:1;overflow:auto;padding:12px}
.msg{padding:8px 12px;margin-bottom:8px;border-radius:8px;max-width:80%}
.user{background:#007acc;color:#fff;margin-left:auto}
.assistant{background:#eee}
.assistant ul{margin:6px 0 0 18px;padding:0}
.assistant li{cursor:pointer;line-height:1.6}
.assistant li:hover{text-decoration:underline}
#composer{display:flex;border-top:1px solid #ddd;padding:8px}
#input{flex:1}
</style>
</head>
<body>
<div id="messages"></div>
<div id="composer">
<input id="input" placeholder="Ask about code..." />
<button id="send">Send</button>
</div>
<script>
const vscode = acquireVsCodeApi();
const messages = document.getElementById('messages');
const input = document.getElementById('input');

function parseJumpItems(text){
    const items=[];
    if(!text) return items;

    // Prefer file:line:(Symbol)
    const fileLineRe = /(^|\s)([^\s]+?):(\d+):\s*\(([^)]+)\)/g;
    let m;
    while((m=fileLineRe.exec(text))!==null){
        items.push({ file: m[2], line: parseInt(m[3],10), label: (m[2] + ':' + m[3] + ': (' + m[4] + ')') });
    }

    // Also support line:(Symbol) (no file)
    const lineOnlyRe = /(^|\s)(\d+):\s*\(([^)]+)\)/g;
    while((m=lineOnlyRe.exec(text))!==null){
        items.push({ file: null, line: parseInt(m[2],10), label: (m[2] + ': (' + m[3] + ')') });
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

function add(role,text){
    const d=document.createElement('div');
    d.className='msg '+role;

    if(role==='assistant'){
        const items = parseJumpItems(text);
        if(items.length){
            const ul=document.createElement('ul');
            items.forEach(it=>{
                const li=document.createElement('li');
                li.textContent = it.label;
                li.addEventListener('click',()=>{
                    vscode.postMessage({ type:'jump', file: it.file, line: it.line, text: it.label });
                });
                ul.appendChild(li);
            });
            d.appendChild(ul);
        } else {
            d.textContent = text;
        }
    } else {
        d.textContent=text;
    }

    messages.appendChild(d);
    messages.scrollTop=messages.scrollHeight;
}

window.addEventListener('message',e=>{
  const m=e.data;
  if(m.type==='history') m.history.forEach(x=>add(x.role,x.text));
  if(m.type==='message') add(m.message.role,m.message.text);
});

document.getElementById('send').onclick=()=>{
  const t=input.value.trim();
  if(!t) return;
  vscode.postMessage({type:'query',text:t});
  input.value='';
};

input.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();document.getElementById('send').click();}
});

vscode.postMessage({type:'ready'});
</script>
</body>
</html>`;
}

/* -------------------- ACTIVATE -------------------- */

function activate(context) {
    outputChannel = vscode.window.createOutputChannel('RAG Search');
    context.subscriptions.push(outputChannel);

    const openChat = vscode.commands.registerCommand('krrishcoder.openChat', () => {
        const wf = vscode.workspace.workspaceFolders;
        if (!wf) return vscode.window.showErrorMessage('Open a folder first');

        const folder = wf[0].uri.fsPath;
        if (chatPanels.has(folder)) return chatPanels.get(folder).reveal();

        const panel = vscode.window.createWebviewPanel(
            'ragChat',
            'RAG Chat',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const key = `chat:${folder}`;
        const history = context.workspaceState.get(key, []);

        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'ready') {
                panel.webview.postMessage({ type: 'history', history });
                return;
            }

            if (msg.type === 'jump') {
                jumpToLine(msg);
                return;
            }

            if (msg.type === 'query') {
                const user = { role: 'user', text: msg.text };
                history.push(user);
                await context.workspaceState.update(key, history);
                panel.webview.postMessage({ type: 'message', message: user });

                runPython(msg.text, (err, lines) => {
                    const text = err ? err.message : lines.join('\n');
                    const bot = { role: 'assistant', text };
                    history.push(bot);
                    context.workspaceState.update(key, history);
                    panel.webview.postMessage({ type: 'message', message: bot });
                });
            }
        });

        panel.webview.html = getChatHtml();
        panel.onDidDispose(() => chatPanels.delete(folder));
        chatPanels.set(folder, panel);
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

    context.subscriptions.push(openChat, searchCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
