// ==================== State ====================
let currentUser = null; // null = guest
let currentResults = null;
let currentTab = null;
let rawOutputs = {};

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupTheme();
    setupInputTabs();
    setupUpload();
    setupOptions();
    setupAuth();
    setupSettings();
    setupActions();
    setupMobile();
    setupChat();
    setupFullChat();
    setupMerge();
    setupTour();
    setupExpand();
});

// ==================== Theme ====================
function setupTheme() {
    const saved = localStorage.getItem('studylens-theme') || 'dark';
    applyTheme(saved);
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('studylens-theme', next);
    });
}

function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme !== 'dark');
    document.getElementById('theme-label').textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    const icon = document.getElementById('theme-icon');
    icon.innerHTML = theme === 'dark'
        ? '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
        : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
}

// ==================== Auth ====================
async function checkAuth() {
    try {
        const resp = await fetch('/api/me');
        const data = await resp.json();
        if (data.logged_in) {
            currentUser = data;
            showLoggedInUI();
        } else {
            currentUser = null;
            showGuestUI();
        }
    } catch {
        currentUser = null;
        showGuestUI();
    }
    // Always show generator — auth is optional
    showView('generator-view');
    loadHistory();
}

function showLoggedInUI() {
    document.getElementById('username-display').textContent = currentUser.username;
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('auth-prompt').classList.add('hidden');
}

function showGuestUI() {
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('auth-prompt').classList.remove('hidden');
}

function setupAuth() {
    // Auth tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => {
                t.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
                t.classList.add('text-gray-500', 'dark:text-gray-400');
            });
            tab.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            tab.classList.remove('text-gray-500', 'dark:text-gray-400');
            const isLogin = tab.dataset.auth === 'login';
            document.getElementById('login-form').classList.toggle('hidden', !isLogin);
            document.getElementById('register-form').classList.toggle('hidden', isLogin);
        });
    });

    document.getElementById('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        const err = document.getElementById('login-error');
        err.textContent = '';
        try {
            const resp = await fetch('/api/login', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ username:document.getElementById('login-username').value, password:document.getElementById('login-password').value }),
            });
            const data = await resp.json();
            if (resp.ok) { currentUser = data; showLoggedInUI(); showView('generator-view'); loadHistory(); }
            else err.textContent = data.detail || 'Login failed';
        } catch { err.textContent = 'Connection error'; }
    });

    document.getElementById('register-form').addEventListener('submit', async e => {
        e.preventDefault();
        const err = document.getElementById('reg-error');
        err.textContent = '';
        try {
            const resp = await fetch('/api/register', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({
                    username:document.getElementById('reg-username').value,
                    email:document.getElementById('reg-email').value,
                    password:document.getElementById('reg-password').value,
                }),
            });
            const data = await resp.json();
            if (resp.ok) { currentUser = data; showLoggedInUI(); showView('generator-view'); loadHistory(); }
            else err.textContent = data.detail || 'Registration failed';
        } catch { err.textContent = 'Connection error'; }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch('/api/logout', {method:'POST'});
        currentUser = null;
        showGuestUI();
        loadHistory();
    });

    // "Login" button in sidebar for guests
    document.getElementById('goto-auth-btn')?.addEventListener('click', () => showView('auth-view'));
}

// ==================== Views ====================
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    // Close mobile sidebar
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ==================== Input Tabs ====================
function setupInputTabs() {
    document.querySelectorAll('.inp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.inp-tab').forEach(t => {
                t.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
                t.classList.add('text-gray-500', 'dark:text-gray-400');
            });
            tab.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            tab.classList.remove('text-gray-500', 'dark:text-gray-400');
            document.querySelectorAll('.inp-content').forEach(c => c.classList.add('hidden'));
            document.getElementById('inp-' + tab.dataset.inp).classList.remove('hidden');
        });
    });
}

// ==================== Upload ====================
function setupUpload() {
    const dz = document.getElementById('drop-zone');
    const fi = document.getElementById('file-input');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('!border-brand-500'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('!border-brand-500'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('!border-brand-500'); if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;showFile(e.dataTransfer.files[0]);} });
    fi.addEventListener('change', () => { if(fi.files.length) showFile(fi.files[0]); });
    document.getElementById('clear-file').addEventListener('click', () => {
        fi.value=''; document.getElementById('file-info').classList.add('hidden'); dz.classList.remove('hidden');
    });
}
function showFile(f) {
    document.getElementById('file-name').textContent = `${f.name} (${(f.size/1048576).toFixed(1)} MB)`;
    document.getElementById('file-info').classList.remove('hidden');
    document.getElementById('drop-zone').classList.add('hidden');
}

// ==================== Options ====================
function setupOptions() {
    document.querySelector('input[value="mcq"]').addEventListener('change', function(){ document.getElementById('mcq-config').classList.toggle('hidden',!this.checked); });
    document.getElementById('generate-btn').addEventListener('click', startGeneration);
    document.getElementById('new-btn').addEventListener('click', () => { showView('generator-view'); resetGenerator(); });
}
function resetGenerator() {
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('url-input').value = '';
    resetBtn();
}

// ==================== Generation ====================
function hasApiKey() {
    // Guest with own key
    if (localStorage.getItem('studylens-apikey-openai')) return true;
    if (localStorage.getItem('studylens-apikey-gemini')) return true;
    if (localStorage.getItem('studylens-apikey-anthropic')) return true;
    // Logged-in users — backend handles it (own key or default)
    if (currentUser) return true;
    // Guest without own key — backend has default key, let it through (usage limit checked server-side)
    return true; // always allow — server handles limits
}

async function startGeneration() {
    const options = [...document.querySelectorAll('input[name="option"]:checked')].map(c => c.value);
    if (!options.length) { alert('Select at least one output option.'); return; }
    const url = document.getElementById('url-input').value.trim();
    const file = document.getElementById('file-input').files[0];
    if (!url && !file) { alert('Provide a YouTube URL or upload a video.'); return; }

    // Validate YouTube URL on frontend
    if (url && !url.includes('youtube.com/') && !url.includes('youtu.be/')) {
        alert('Invalid YouTube URL. Must be a youtube.com or youtu.be link.');
        return;
    }

    // Check if AI options are selected and no key is available
    const aiOptions = options.filter(o => o !== 'transcript');
    if (aiOptions.length > 0 && !hasApiKey()) {
        alert('You need an API key to use AI features (Summary, Topics, Q&A, MCQ). Add your OpenAI key in Settings first, or select only "Transcript".');
        return;
    }

    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-loader').classList.remove('hidden');

    const form = new FormData();
    if (url) form.append('url', url);
    if (file) form.append('file', file);
    form.append('options', JSON.stringify(options));
    form.append('mcq_options', document.getElementById('mcq-num').value);

    // Send key preference: "default" or "own:openai" / "own:gemini" / "own:anthropic"
    const activeKeyPref = localStorage.getItem('studylens-active-key') || 'default';
    if (activeKeyPref.startsWith('own:')) {
        const provider = activeKeyPref.split(':')[1];
        form.append('use_own_key', '1');
        form.append('preferred_provider', provider);
        // Guest: send key from localStorage
        if (!currentUser) {
            const guestKey = localStorage.getItem(`studylens-apikey-${provider}`) || '';
            if (guestKey) form.append('api_key', guestKey);
        }
    }

    try {
        const resp = await fetch('/api/process', {method:'POST', body:form});
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail||'Failed'); }
        const data = await resp.json();
        trackProgress(data.task_id);
    } catch (err) { alert(err.message); resetBtn(); }
}

const stageLabels = {
    starting:'Starting...', downloading:'Downloading video...', extracting_audio:'Extracting audio...',
    transcribing:'Transcribing...', generating:'Generating with AI...', complete:'Done!'
};

function trackProgress(taskId) {
    document.getElementById('progress-section').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    const es = new EventSource(`/api/status/${taskId}`);
    es.onmessage = (event) => {
        const d = JSON.parse(event.data);
        if (d.error && !d.status) { es.close(); alert(d.error); resetBtn(); return; }
        document.getElementById('progress-fill').style.width = (d.progress||0)+'%';
        document.getElementById('progress-pct').textContent = (d.progress||0)+'%';
        document.getElementById('progress-stage').textContent = stageLabels[d.stage]||d.stage;
        if (d.status==='done') { es.close(); showResults(d); resetBtn(); loadHistory(); }
        if (d.status==='error') { es.close(); alert(d.error||'Error'); resetBtn(); }
    };
    es.onerror = () => es.close();
}

function resetBtn() {
    const btn = document.getElementById('generate-btn');
    btn.disabled = false;
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-loader').classList.add('hidden');
}

// ==================== Results ====================
const tabLabels = {
    transcript:'Transcript', summary_notes:'Summary Notes', main_topics:'Main Topics',
    detailed_qa:'Detailed Q&A', practice_qa:'Practice Set', mcq:'MCQ Quiz',
    exhaustive:'Everything'
};

function showResults(data) {
    rawOutputs = data.outputs || {};
    currentResults = { ...rawOutputs };
    if (data.segments?.length) currentResults._segments = data.segments;
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('progress-section').classList.add('hidden');
    buildTabs('results-tabs', 'result-body', currentResults, data.duration);
}

function buildTabs(tabContainerId, bodyId, outputs, videoDuration) {
    const tc = document.getElementById(tabContainerId);
    const keys = Object.keys(outputs).filter(k => !k.startsWith('_'));
    tc.innerHTML = '';
    if (!keys.length) { document.getElementById(bodyId).innerHTML = '<p class="text-gray-400">No results.</p>'; return; }

    const activeClass = 'px-4 py-2 text-sm font-semibold rounded-lg gradient-btn text-white whitespace-nowrap';
    const inactiveClass = 'px-4 py-2 text-sm font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white whitespace-nowrap transition-colors';

    keys.forEach((key,i) => {
        const btn = document.createElement('button');
        btn.className = i===0 ? activeClass : inactiveClass;
        const readMins = calcReadTime(outputs[key] || '');
        btn.innerHTML = `${tabLabels[key]||key} <span class="opacity-60 text-[10px] ml-0.5">${fmtDuration(readMins)}</span>`;
        btn.dataset.key = key;
        btn.addEventListener('click', () => {
            tc.querySelectorAll('button').forEach(b => { b.className = inactiveClass; });
            btn.className = activeClass;
            renderContent(bodyId, key, outputs);
        });
        tc.appendChild(btn);
    });

    // Time saved banner
    showTimeSaved(tabContainerId, outputs, videoDuration);

    renderContent(bodyId, keys[0], outputs);
}

function showTimeSaved(tabContainerId, outputs, videoDuration) {
    // Remove any existing banner for this section
    const existingId = tabContainerId + '-time-saved';
    const existing = document.getElementById(existingId);
    if (existing) existing.remove();

    if (!videoDuration || videoDuration <= 0) return;

    const videoMins = Math.ceil(videoDuration / 60);
    const keys = Object.keys(outputs).filter(k => !k.startsWith('_'));
    const totalReadMins = keys.reduce((sum, k) => sum + calcReadTime(outputs[k] || ''), 0);
    // Average read time (reading one output, not all — user reads the summary, not everything)
    const avgReadMins = Math.max(1, Math.round(totalReadMins / keys.length));
    const saved = videoMins - avgReadMins;

    if (saved <= 0) return;

    const banner = document.createElement('div');
    banner.id = existingId;
    banner.className = 'flex items-center gap-3 mt-2 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 text-sm';
    banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-emerald-500 shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span class="text-emerald-700 dark:text-emerald-300">
            <strong>${fmtDuration(videoMins)}</strong> video &rarr; <strong>${fmtDuration(avgReadMins)}</strong> avg read &mdash;
            you save ~<strong>${fmtDuration(saved)}</strong> per output
        </span>`;

    const tc = document.getElementById(tabContainerId);
    tc.parentNode.insertBefore(banner, tc.nextSibling);
}

function renderContent(bodyId, key, outputs) {
    const body = document.getElementById(bodyId);
    currentTab = key;
    if (key==='transcript' && outputs._segments?.length) {
        body.innerHTML = outputs._segments.map(s =>
            `<p class="mb-1.5"><span class="text-brand-500 font-mono text-xs font-semibold mr-1.5">[${fmtTime(s.start)}]</span>${esc(s.text)}</p>`
        ).join('');
    } else {
        body.innerHTML = renderMd(outputs[key]||'');
    }
}

function renderMd(text) {
    if (typeof marked!=='undefined') { marked.setOptions({breaks:true,gfm:true}); return marked.parse(text); }
    return esc(text).replace(/\n/g,'<br>');
}
function fmtTime(s) { return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function esc(t) { const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

// ==================== Read Time ====================
function calcReadTime(text) {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200)); // 200 wpm average
}
function fmtDuration(mins) {
    if (mins < 1) return '< 1 min';
    if (mins < 60) return mins + ' min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ==================== Copy & Download ====================
function setupActions() {
    document.getElementById('copy-btn').addEventListener('click', () => copyFrom('result-body','copy-btn'));
    document.getElementById('download-btn').addEventListener('click', () => downloadFrom('result-body'));
    document.querySelector('.hist-copy')?.addEventListener('click', () => copyFrom('history-body'));
    document.querySelector('.hist-download')?.addEventListener('click', () => downloadFrom('history-body'));
}
function copyFrom(bodyId, btnId) {
    const raw = currentTab && rawOutputs[currentTab] ? rawOutputs[currentTab] : document.getElementById(bodyId).innerText;
    navigator.clipboard.writeText(raw).then(() => {
        if (btnId) { const b=document.getElementById(btnId); const o=b.innerHTML; b.innerHTML='<span class="text-green-500 text-xs font-semibold">Copied!</span>'; setTimeout(()=>b.innerHTML=o,1500); }
    });
}
function downloadFrom(bodyId) {
    const c = currentTab && rawOutputs[currentTab] ? rawOutputs[currentTab] : document.getElementById(bodyId).innerText;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([c],{type:'text/markdown'}));
    a.download=`studylens-${currentTab||'output'}.md`; a.click(); URL.revokeObjectURL(a.href);
}

// ==================== History ====================
async function loadHistory() {
    const skeleton = document.getElementById('history-skeleton');
    if (skeleton) skeleton.classList.remove('hidden');
    const list = document.getElementById('history-list');
    if (list) list.innerHTML = '';
    try {
        const [histResp, chatResp] = await Promise.all([
            fetch('/api/history'),
            currentUser ? fetch('/api/standalone-chats') : Promise.resolve(null),
        ]);
        const histData = await histResp.json();
        const chatData = chatResp ? await chatResp.json() : {chats:[]};
        if (skeleton) skeleton.remove();
        renderHistory(histData.history||[], chatData.chats||[]);
    } catch {
        if (skeleton) skeleton.remove();
    }
}

function renderHistory(historyItems, standaloneChats) {
    const list = document.getElementById('history-list');
    if (!historyItems.length && !standaloneChats.length) {
        list.innerHTML = currentUser
            ? '<p class="text-base text-gray-400 dark:text-gray-600 text-center py-10">No history yet</p>'
            : '<p class="text-base text-gray-400 dark:text-gray-600 text-center py-10">Login to save history</p>';
        return;
    }

    // Merge both into one timeline sorted by date
    const all = [];
    historyItems.forEach(h => all.push({...h, _type:'study'}));
    standaloneChats.forEach(c => all.push({...c, _type:'chat'}));
    all.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    const studyIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-brand-500"><path d="M8 5v14l11-7z"/></svg>';
    const chatIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-emerald-500"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';

    list.innerHTML = all.map(item => {
        const date = new Date(item.created_at).toLocaleDateString('en',{month:'short',day:'numeric'});
        const isStudy = item._type === 'study';
        const title = item.title || (isStudy && item.source_url?.includes('v=') ? item.source_url.split('v=').pop().slice(0,14) : 'Chat');
        const icon = isStudy ? studyIcon : chatIcon;
        const dataAttr = isStudy ? `data-study-id="${item.id}"` : `data-chat-id="${item.id}"`;
        return `<div class="hi-row relative group flex items-center gap-2.5 px-3 py-3 rounded-lg cursor-pointer text-base text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 transition-colors mb-0.5" ${dataAttr} data-title="${esc(title)}" data-type="${item._type}">
            ${icon}
            <span class="truncate flex-1">${esc(title)}</span>
            <span class="text-xs text-gray-400 dark:text-gray-600 ml-1 shrink-0">${date}</span>
            <button class="hi-menu ml-1 shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
        </div>`;
    }).join('');

    // Click row to open
    list.querySelectorAll('.hi-row').forEach(el => {
        el.addEventListener('click', e => {
            if (e.target.closest('.hi-menu')) return;
            closeAllMenus();
            if (el.dataset.type === 'study') {
                openHistory(+el.dataset.studyId);
            } else {
                // Open standalone chat
                const chat = standaloneChats.find(c => c.id == el.dataset.chatId);
                if (chat) openExistingFullChat(chat);
            }
        });
    });

    // Three-dot menu
    list.querySelectorAll('.hi-menu').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const row = btn.closest('.hi-row');
            const id = row.dataset.studyId || row.dataset.chatId;
            const title = row.dataset.title;
            const type = row.dataset.type;
            toggleMenu(btn, id, title, type);
        });
    });
}

// Close any open dropdown menus
function closeAllMenus() {
    document.querySelectorAll('.hi-dropdown').forEach(m => m.remove());
}

function toggleMenu(btn, id, title, type) {
    // If menu already open for this button, close it
    const existing = btn.parentElement.querySelector('.hi-dropdown');
    if (existing) { existing.remove(); return; }

    closeAllMenus();

    const menu = document.createElement('div');
    menu.className = 'hi-dropdown absolute right-2 top-full mt-1 z-50 glass-card rounded-xl shadow-lg py-1.5 min-w-[160px]';
    menu.innerHTML = `
        <button class="menu-rename flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Rename
        </button>
        <button class="menu-delete flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
        </button>
    `;
    btn.parentElement.appendChild(menu);

    // Rename action
    menu.querySelector('.menu-rename').addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllMenus();
        const newTitle = prompt('Rename this item:', title);
        if (newTitle !== null && newTitle.trim() && newTitle.trim() !== title) {
            const endpoint = type === 'study' ? `/api/history/${id}` : `/api/standalone-chats/${id}`;
            await fetch(endpoint, {
                method: 'PATCH',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({title: newTitle.trim()})
            });
            loadHistory();
        }
    });

    // Delete action with confirm
    menu.querySelector('.menu-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllMenus();
        if (confirm('Are you sure you want to delete "' + title + '"? This cannot be undone.')) {
            const endpoint = type === 'study' ? `/api/history/${id}` : `/api/standalone-chats/${id}`;
            await fetch(endpoint, {method:'DELETE'});
            loadHistory();
        }
    });

    // Close menu when clicking anywhere else
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(ev) {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

let currentHistoryId = null;
let currentHistoryData = null;

const ALL_OUTPUT_TYPES = {
    transcript: 'Transcript', summary_notes: 'Summary', main_topics: 'Topics',
    detailed_qa: 'Q&A', practice_qa: 'Practice', mcq: 'MCQ', exhaustive: 'Everything'
};

async function openHistory(id) {
    showView('history-view');
    const bodySkeleton = document.getElementById('history-body-skeleton');
    const tabsSkeleton = document.getElementById('history-tabs-skeleton');
    if (bodySkeleton) bodySkeleton.classList.remove('hidden');
    if (tabsSkeleton) tabsSkeleton.classList.remove('hidden');
    try {
        const resp = await fetch(`/api/history/${id}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (bodySkeleton) bodySkeleton.remove();
        if (tabsSkeleton) tabsSkeleton.remove();
        currentHistoryId = id;
        currentHistoryData = data;
        document.getElementById('history-title').textContent = data.title || data.source_url || 'Video';
        const outputs = data.outputs||{};
        if (data.transcript && !outputs.transcript) outputs.transcript = data.transcript;
        if (data.segments?.length) outputs._segments = data.segments;
        rawOutputs = outputs;
        currentResults = outputs;
        buildTabs('history-tabs','history-body', outputs, data.duration);

        // Handle merged vs single session display
        const mergeBadge = document.getElementById('history-merge-badge');
        const sourceVideos = document.getElementById('history-source-videos');

        if (data.source_type === 'merge') {
            // Show merge badge
            let meta = {};
            try { meta = typeof data.source_url === 'string' ? JSON.parse(data.source_url) : {}; } catch {}
            const srcTitles = meta.source_titles || [];
            const srcUrls = meta.source_urls || [];
            const count = srcTitles.length || meta.source_ids?.length || 0;

            mergeBadge.classList.remove('hidden');
            document.getElementById('merge-badge-text').textContent =
                `Merged from ${count} session${count !== 1 ? 's' : ''}`;

            // Show source videos if any have YouTube URLs
            const ytSources = srcUrls.map((url, i) => ({url, title: srcTitles[i] || `Video ${i+1}`})).filter(s => s.url && (s.url.includes('youtube.com') || s.url.includes('youtu.be')));

            if (ytSources.length) {
                sourceVideos.classList.remove('hidden');
                document.getElementById('source-videos-label').textContent = `Source Videos (${ytSources.length})`;
                document.getElementById('source-videos-list').innerHTML = ytSources.map(s => {
                    let videoId = '';
                    try { const u = new URL(s.url); videoId = u.searchParams.get('v') || u.pathname.split('/').pop(); } catch {}
                    if (!videoId || videoId.length < 5) return '';
                    return `<div class="rounded-xl overflow-hidden border border-gray-200/40 dark:border-white/[0.06]">
                        <div class="px-4 py-2 bg-gray-50/50 dark:bg-white/[0.02] text-xs font-medium text-gray-600 dark:text-gray-400 truncate">${esc(s.title)}</div>
                        <iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" class="bg-black"></iframe>
                    </div>`;
                }).join('');
            } else {
                sourceVideos.classList.add('hidden');
            }

            // Hide single video embed for merged sessions
            document.getElementById('history-video').classList.add('hidden');
        } else {
            mergeBadge.classList.add('hidden');
            sourceVideos.classList.add('hidden');
            showYouTubeEmbed(data.source_url);
        }

        // Show chat FAB
        document.getElementById('chat-fab').classList.remove('hidden');
        // Load saved chats
        loadChatsForHistory(id);
        // Show "Generate More" if transcript exists and some types are missing
        showGenerateMore(data, outputs);
        // Re-bind expand button (since it's a new DOM state)
        setupExpandForHistory();
    } catch {
        if (bodySkeleton) bodySkeleton.remove();
        if (tabsSkeleton) tabsSkeleton.remove();
    }
}

function setupExpandForHistory() {
    const btn = document.getElementById('hist-expand-btn');
    if (btn) {
        // Remove old listener by replacing element
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            const sourceEl = document.getElementById('history-body');
            if (sourceEl) openFullscreenReader(sourceEl.innerHTML);
        });
    }
}

function showGenerateMore(data, existingOutputs) {
    const bar = document.getElementById('generate-more-bar');
    const optionsDiv = document.getElementById('generate-more-options');

    // Only show if transcript is available (so we can regenerate)
    if (!data.transcript) { bar.classList.add('hidden'); return; }

    // Find which types are NOT yet generated
    const existing = Object.keys(existingOutputs).filter(k => !k.startsWith('_'));
    const missing = Object.keys(ALL_OUTPUT_TYPES).filter(k => !existing.includes(k));

    if (!missing.length) { bar.classList.add('hidden'); return; }

    bar.classList.remove('hidden');
    optionsDiv.innerHTML = missing.map(key =>
        `<label class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-white dark:bg-gray-900 cursor-pointer hover:border-brand-400 transition-colors text-xs">
            <input type="checkbox" value="${key}" class="gm-check accent-brand-500 w-3.5 h-3.5">
            <span class="text-gray-700 dark:text-gray-300">${ALL_OUTPUT_TYPES[key]}</span>
        </label>`
    ).join('');

    // Bind the Go button
    const goBtn = document.getElementById('generate-more-go');
    const newGoBtn = goBtn.cloneNode(true);
    goBtn.parentNode.replaceChild(newGoBtn, goBtn);
    newGoBtn.addEventListener('click', () => doGenerateMore(data.id));
}

async function doGenerateMore(historyId) {
    const checked = [...document.querySelectorAll('.gm-check:checked')].map(c => c.value);
    if (!checked.length) { alert('Select at least one option'); return; }

    const btn = document.getElementById('generate-more-go');
    btn.disabled = true;
    btn.querySelector('.gm-text').classList.add('hidden');
    btn.querySelector('.gm-loader').classList.remove('hidden');

    // Disable checkboxes while generating
    document.querySelectorAll('.gm-check').forEach(c => c.disabled = true);

    function resetGenerateMoreBtn() {
        const b = document.getElementById('generate-more-go');
        if (b) {
            b.disabled = false;
            b.querySelector('.gm-text').classList.remove('hidden');
            b.querySelector('.gm-loader').classList.add('hidden');
        }
        document.querySelectorAll('.gm-check').forEach(c => c.disabled = false);
    }

    try {
        const resp = await fetch(`/api/history/${historyId}/generate-more`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ options: checked, mcq_options: 4 }),
        });
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || 'Failed'); }
        const data = await resp.json();
        // Track progress then reload
        const es = new EventSource(`/api/status/${data.task_id}`);
        es.onmessage = (event) => {
            const d = JSON.parse(event.data);
            if (d.error && !d.status) { es.close(); alert(d.error); resetGenerateMoreBtn(); return; }
            if (d.status === 'done') {
                es.close();
                openHistory(historyId); // Reload to show new outputs
            }
            if (d.status === 'error') {
                es.close();
                alert(d.error || 'Error');
                resetGenerateMoreBtn();
            }
        };
        es.onerror = () => { es.close(); resetGenerateMoreBtn(); };
    } catch (err) {
        alert(err.message);
        resetGenerateMoreBtn();
    }
}
document.getElementById('history-back')?.addEventListener('click', () => {
    showView('generator-view');
    document.getElementById('chat-fab').classList.add('hidden');
    closeChatPanel();
    currentHistoryId = null;
    currentHistoryData = null;
});

// ==================== Full-Screen Chat ====================
let fullchatId = null;
let fullchatMessages = [];

function setupFullChat() {
    document.getElementById('fullchat-btn').addEventListener('click', () => openNewFullChat());
    document.getElementById('fullchat-back').addEventListener('click', () => showView('generator-view'));
    document.getElementById('fullchat-send').addEventListener('click', sendFullChatMessage);
    document.getElementById('fullchat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFullChatMessage(); }
    });
}

function openNewFullChat() {
    fullchatId = null;
    fullchatMessages = [];
    showView('fullchat-view');
    document.getElementById('fullchat-messages').innerHTML = `
        <div class="text-center py-12">
            <div class="w-14 h-14 rounded-2xl gradient-btn flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <p class="text-lg font-medium text-gray-700 dark:text-gray-300">Study Chat</p>
            <p class="text-base text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">Reference a study session above, or just chat freely.</p>
        </div>`;
    populateRefDropdown();
    document.getElementById('fullchat-input').value = '';
    document.getElementById('fullchat-input').focus();
}

function openExistingFullChat(chat) {
    fullchatId = chat.id;
    fullchatMessages = chat.messages || [];
    showView('fullchat-view');
    populateRefDropdown(chat.history_id);
    renderFullChatMessages(fullchatMessages);
    document.getElementById('fullchat-input').focus();
}

async function populateRefDropdown(selectedId) {
    const sel = document.getElementById('fullchat-ref');
    sel.innerHTML = '<option value="">No reference — general chat</option>';
    try {
        const resp = await fetch('/api/history');
        const data = await resp.json();
        (data.history || []).forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.title || item.source_url || 'Video';
            if (selectedId && item.id == selectedId) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch {}
}

async function sendFullChatMessage() {
    const input = document.getElementById('fullchat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    const btn = document.getElementById('fullchat-send');
    btn.disabled = true;

    fullchatMessages.push({role: 'user', content: msg});
    renderFullChatMessages(fullchatMessages, true);

    try {
        const body = { message: msg };
        const refId = document.getElementById('fullchat-ref').value;
        if (refId) body.history_id = refId;
        if (fullchatId) body.chat_id = fullchatId;

        const resp = await fetch('/api/standalone-chat', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(body),
        });
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || 'Failed'); }
        const data = await resp.json();
        fullchatId = data.chat_id;
        fullchatMessages = data.messages;
        renderFullChatMessages(fullchatMessages);
        loadHistory(); // refresh sidebar to show new chat
    } catch (err) {
        fullchatMessages.push({role:'assistant', content: `Error: ${err.message}`});
        renderFullChatMessages(fullchatMessages);
    }
    btn.disabled = false;
    input.focus();
}

function renderFullChatMessages(messages, loading = false) {
    const container = document.getElementById('fullchat-messages');
    let html = messages.map(m => {
        if (m.role === 'user') {
            return `<div class="flex justify-end"><div class="msg-user px-5 py-3 max-w-[80%] text-base">${esc(m.content)}</div></div>`;
        } else {
            return `<div class="flex justify-start"><div class="msg-ai bg-gray-100 dark:bg-gray-800 px-5 py-3 max-w-[80%] text-base prose dark:text-gray-200">${renderMd(m.content)}</div></div>`;
        }
    }).join('');
    if (loading) {
        html += `<div class="flex justify-start"><div class="msg-ai bg-gray-100 dark:bg-gray-800 px-5 py-3 text-base text-gray-400">
            <span class="inline-block w-2 h-2 bg-brand-500 rounded-full animate-bounce mr-1"></span>
            <span class="inline-block w-2 h-2 bg-brand-500 rounded-full animate-bounce mr-1" style="animation-delay:0.15s"></span>
            <span class="inline-block w-2 h-2 bg-brand-500 rounded-full animate-bounce" style="animation-delay:0.3s"></span>
        </div></div>`;
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

// ==================== Settings ====================
function setupSettings() {
    document.getElementById('settings-btn').addEventListener('click', () => { showView('settings-view'); loadSettingsKeys(); });
    document.getElementById('settings-back').addEventListener('click', () => showView('generator-view'));

    document.getElementById('key-save').addEventListener('click', async () => {
        const provider = document.getElementById('key-provider').value;
        const key = document.getElementById('key-input').value.trim();
        if (!key) return;

        if (currentUser) {
            // Logged in: save to DB
            await fetch('/api/keys', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider, api_key:key}) });
        } else {
            // Guest: save to localStorage
            localStorage.setItem(`studylens-apikey-${provider}`, key);
        }
        document.getElementById('key-input').value = '';
        loadSettingsKeys();
    });
}

async function loadSettingsKeys() {
    const settingsSkeleton = document.getElementById('settings-skeleton');
    const c = document.getElementById('saved-keys');
    let ownProviders = [];

    if (currentUser) {
        try {
            const resp = await fetch('/api/keys');
            const keysData = await resp.json();
            const keys = keysData.keys || {};
            ownProviders = Object.keys(keys);
            if (!ownProviders.length) {
                c.innerHTML = '<p class="text-xs text-gray-400 dark:text-gray-500">No own API keys saved yet.</p>';
            } else {
                c.innerHTML = Object.entries(keys).map(([p,k]) =>
                    `<div class="flex items-center justify-between px-4 py-3 glass-input rounded-xl text-sm">
                        <span class="font-semibold text-brand-500 capitalize">${p}</span>
                        <span class="text-gray-400 font-mono text-xs">${k}</span>
                        <button onclick="deleteKey('${p}')" class="text-red-400 hover:text-red-500 text-xs font-medium">Remove</button>
                    </div>`
                ).join('');
            }
        } catch {}
    } else {
        const providers = ['openai','gemini','anthropic'];
        ownProviders = providers.filter(p => localStorage.getItem(`studylens-apikey-${p}`));
        if (ownProviders.length) {
            c.innerHTML = ownProviders.map(p => {
                const k = localStorage.getItem(`studylens-apikey-${p}`);
                const masked = k.length > 12 ? k.slice(0,8)+'...'+k.slice(-4) : '***';
                return `<div class="flex items-center justify-between px-4 py-3 glass-input rounded-xl text-sm">
                    <span class="font-semibold text-brand-500 capitalize">${p}</span>
                    <span class="text-gray-400 font-mono text-xs">${masked}</span>
                    <button onclick="deleteKey('${p}')" class="text-red-400 hover:text-red-500 text-xs font-medium">Remove</button>
                </div>`;
            }).join('');
        } else {
            c.innerHTML = '';
        }
    }

    if (settingsSkeleton) settingsSkeleton.remove();

    // Build key selector (remove any existing one first)
    const existingSelector = c.querySelector('.key-selector-section');
    if (existingSelector) existingSelector.remove();

    const activeKey = localStorage.getItem('studylens-active-key') || 'default';
    const providerLabels = {openai:'OpenAI',gemini:'Google Gemini',anthropic:'Anthropic'};

    let optionsHtml = `<option value="default" ${activeKey==='default'?'selected':''}>Default (StudyLens) — Free, limited daily</option>`;
    ownProviders.forEach(p => {
        const val = 'own:' + p;
        const sel = activeKey === val ? 'selected' : '';
        optionsHtml += `<option value="${val}" ${sel}>${providerLabels[p]||p} (My Key) — Unlimited</option>`;
    });

    const selectorHtml = `
    <div class="key-selector-section mt-4 pt-4 border-t border-gray-200/60 dark:border-white/[0.06]">
        <h4 class="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Use for AI generation</h4>
        <select id="active-key-select" class="w-full px-4 py-3 rounded-xl glass-input text-base focus:outline-none focus:ring-2 focus:ring-brand-500">
            ${optionsHtml}
        </select>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-3">Need more free quota? Contact <a href="mailto:hello@tusharkhatri.in" class="text-brand-500 hover:underline">hello@tusharkhatri.in</a></p>
    </div>`;
    c.insertAdjacentHTML('beforeend', selectorHtml);

    document.getElementById('active-key-select').addEventListener('change', (e) => {
        localStorage.setItem('studylens-active-key', e.target.value);
    });
}

window.deleteKey = async (p) => {
    if (currentUser) {
        await fetch(`/api/keys/${p}`, {method:'DELETE'});
    } else {
        localStorage.removeItem(`studylens-apikey-${p}`);
    }
    loadSettingsKeys();
};

// ==================== Mobile ====================
function setupMobile() {
    document.getElementById('mobile-menu').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('-translate-x-full');
        document.getElementById('sidebar-overlay').classList.toggle('hidden');
    });
}

// ==================== Chat Panel ====================
let currentChatId = null;
let currentChatMessages = [];
let selectedTextForChat = '';

function setupChat() {
    // FAB opens general chat
    document.getElementById('chat-fab').addEventListener('click', () => {
        selectedTextForChat = '';
        openChatPanel('Ask anything about this content');
    });

    // Close
    document.getElementById('chat-close').addEventListener('click', closeChatPanel);

    // Send message
    document.getElementById('chat-send').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    // Text selection → tooltip
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('mousedown', e => {
        if (!e.target.closest('#sel-tooltip')) {
            document.getElementById('sel-tooltip').classList.add('hidden');
        }
    });

    // Tooltip click → open chat with selected text
    document.getElementById('sel-tooltip').addEventListener('click', () => {
        document.getElementById('sel-tooltip').classList.add('hidden');
        openChatPanel(`Ask about: "${selectedTextForChat.slice(0,60)}..."`);
    });
}

function handleTextSelection() {
    const sel = window.getSelection();
    const text = sel.toString().trim();
    const tooltip = document.getElementById('sel-tooltip');

    // Only show tooltip if text selected inside history-body or result-body
    if (text.length > 5 && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const isInReader = container.closest?.('#history-body') || container.parentElement?.closest?.('#history-body') ||
                           container.closest?.('#result-body') || container.parentElement?.closest?.('#result-body');
        if (isInReader && currentHistoryId) {
            selectedTextForChat = text.slice(0, 500);
            const rect = range.getBoundingClientRect();
            tooltip.style.top = (rect.top - 45) + 'px';
            tooltip.style.left = (rect.left + rect.width / 2 - 80) + 'px';
            tooltip.classList.remove('hidden');
            return;
        }
    }
}

function openChatPanel(contextLabel) {
    currentChatId = null;
    currentChatMessages = [];
    const panel = document.getElementById('chat-panel');
    panel.classList.remove('translate-x-full');
    document.getElementById('chat-context-label').textContent = contextLabel || '';
    document.getElementById('chat-messages').innerHTML = `
        <div class="text-center py-8">
            <div class="w-12 h-12 rounded-full gradient-btn flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <p class="text-base font-medium text-gray-700 dark:text-gray-300">Ask anything</p>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">I have context of your study material</p>
        </div>`;
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-input').focus();

    // Show/hide selected text preview
    const preview = document.getElementById('chat-selected-preview');
    if (selectedTextForChat) {
        preview.classList.remove('hidden');
        document.getElementById('chat-selected-text').textContent = selectedTextForChat;
    } else {
        preview.classList.add('hidden');
    }
}

function closeChatPanel() {
    document.getElementById('chat-panel').classList.add('translate-x-full');
}

function openExistingChat(chatData) {
    currentChatId = chatData.id;
    currentChatMessages = chatData.messages || [];
    selectedTextForChat = chatData.selected_text || '';
    const panel = document.getElementById('chat-panel');
    panel.classList.remove('translate-x-full');
    document.getElementById('chat-context-label').textContent = selectedTextForChat ? `About: "${selectedTextForChat.slice(0,50)}..."` : 'Chat';

    const preview = document.getElementById('chat-selected-preview');
    if (selectedTextForChat) {
        preview.classList.remove('hidden');
        document.getElementById('chat-selected-text').textContent = selectedTextForChat;
    } else {
        preview.classList.add('hidden');
    }

    renderChatMessages(currentChatMessages);
    document.getElementById('chat-input').focus();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const sendBtn = document.getElementById('chat-send');
    sendBtn.disabled = true;

    // Show user message immediately
    currentChatMessages.push({role: 'user', content: msg});
    renderChatMessages(currentChatMessages, true); // true = show loading

    try {
        let resp;
        if (currentChatId) {
            // Continue existing chat
            resp = await fetch(`/api/chats/${currentChatId}/message`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({message: msg}),
            });
        } else {
            // New chat
            resp = await fetch(`/api/history/${currentHistoryId}/chats`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({message: msg, selected_text: selectedTextForChat}),
            });
        }

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Failed');
        }

        const data = await resp.json();
        if (data.chat_id) currentChatId = data.chat_id;
        currentChatMessages = data.messages;
        renderChatMessages(currentChatMessages);
        loadChatsForHistory(currentHistoryId);
    } catch (err) {
        currentChatMessages.push({role:'assistant', content: `Error: ${err.message}`});
        renderChatMessages(currentChatMessages);
    }
    sendBtn.disabled = false;
    input.focus();
}

function renderChatMessages(messages, showLoading = false) {
    const container = document.getElementById('chat-messages');
    let html = messages.map(m => {
        if (m.role === 'user') {
            return `<div class="flex justify-end"><div class="msg-user px-4 py-3 max-w-[85%] text-sm">${esc(m.content)}</div></div>`;
        } else {
            return `<div class="flex justify-start"><div class="msg-ai bg-gray-100 dark:bg-gray-800 px-4 py-3 max-w-[85%] text-sm prose dark:text-gray-200">${renderMd(m.content)}</div></div>`;
        }
    }).join('');

    if (showLoading) {
        html += `<div class="flex justify-start"><div class="msg-ai bg-gray-100 dark:bg-gray-800 px-4 py-3 text-sm text-gray-400">
            <span class="inline-block w-2 h-2 bg-brand-500 rounded-full animate-bounce mr-1"></span>
            <span class="inline-block w-2 h-2 bg-brand-500 rounded-full animate-bounce mr-1" style="animation-delay:0.15s"></span>
            <span class="inline-block w-2 h-2 bg-brand-500 rounded-full animate-bounce" style="animation-delay:0.3s"></span>
        </div></div>`;
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

// ==================== Saved Chats for History ====================
async function loadChatsForHistory(historyId) {
    if (!currentUser) return;
    try {
        const resp = await fetch(`/api/history/${historyId}/chats`);
        if (!resp.ok) return;
        const data = await resp.json();
        const chats = data.chats || [];
        const section = document.getElementById('history-chats');
        const list = document.getElementById('history-chats-list');

        if (!chats.length) { section.classList.add('hidden'); return; }

        section.classList.remove('hidden');
        list.innerHTML = chats.map(c => {
            const firstMsg = c.messages?.[0]?.content || 'Chat';
            const preview = c.selected_text ? c.selected_text.slice(0,30) : firstMsg.slice(0,30);
            const count = Math.floor((c.messages?.length || 0) / 2);
            return `<div class="group inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors text-sm" data-chatid="${c.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-brand-500 shrink-0"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span class="text-gray-700 dark:text-gray-300 truncate max-w-[150px]">${esc(preview)}...</span>
                <span class="text-xs text-gray-400">${count}Q</span>
                <button class="del-chat opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all" data-chatid="${c.id}">&times;</button>
            </div>`;
        }).join('');

        // Open saved chat
        list.querySelectorAll('[data-chatid]:not(.del-chat)').forEach(el => {
            el.addEventListener('click', e => {
                if (e.target.closest('.del-chat')) return;
                const chatId = +el.dataset.chatid;
                const chat = chats.find(c => c.id === chatId);
                if (chat) openExistingChat(chat);
            });
        });

        // Delete saved chat
        list.querySelectorAll('.del-chat').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                if (confirm('Delete this chat?')) {
                    await fetch(`/api/chats/${btn.dataset.chatid}`, {method:'DELETE'});
                    loadChatsForHistory(historyId);
                }
            });
        });
    } catch {}
}

// ==================== Fullscreen Reader ====================
let fsZoom = 100;
const FS_ZOOM_STEP = 10;
const FS_ZOOM_MIN = 60;
const FS_ZOOM_MAX = 200;

function setupExpand() {
    // Expand button on results page
    document.querySelectorAll('.expand-reader-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sourceId = btn.dataset.source;
            const sourceEl = document.getElementById(sourceId);
            if (!sourceEl) return;
            openFullscreenReader(sourceEl.innerHTML);
        });
    });

    document.getElementById('fs-close').addEventListener('click', closeFullscreenReader);
    document.getElementById('fs-copy').addEventListener('click', () => {
        const body = document.getElementById('fs-body');
        navigator.clipboard.writeText(body.innerText).then(() => {
            const btn = document.getElementById('fs-copy');
            const orig = btn.innerHTML;
            btn.innerHTML = '<span class="text-green-500 font-semibold text-sm">Copied!</span>';
            setTimeout(() => btn.innerHTML = orig, 1500);
        });
    });

    // Zoom controls
    document.getElementById('fs-zoom-in').addEventListener('click', () => setFsZoom(fsZoom + FS_ZOOM_STEP));
    document.getElementById('fs-zoom-out').addEventListener('click', () => setFsZoom(fsZoom - FS_ZOOM_STEP));

    // Keyboard shortcuts in fullscreen
    document.addEventListener('keydown', e => {
        if (document.getElementById('fs-reader').classList.contains('hidden')) return;
        if (e.key === 'Escape') closeFullscreenReader();
        if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); setFsZoom(fsZoom + FS_ZOOM_STEP); }
        if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setFsZoom(fsZoom - FS_ZOOM_STEP); }
        if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setFsZoom(100); }
    });
}

function setFsZoom(val) {
    fsZoom = Math.max(FS_ZOOM_MIN, Math.min(FS_ZOOM_MAX, val));
    document.getElementById('fs-zoom-label').textContent = fsZoom + '%';

    const body = document.getElementById('fs-body');
    const ratio = fsZoom / 100;

    // Scale font size
    body.style.fontSize = (ratio * 1.1) + 'rem';

    // Scale max-width — more zoom = wider content, less padding feel
    // At 100% = max-w-4xl (896px), at 200% = full width, at 60% = narrower
    const maxW = Math.min(896 * ratio * 1.2, window.innerWidth - 32);
    body.style.maxWidth = maxW + 'px';

    // Scale padding — more zoom = less padding (content fills screen)
    const pad = Math.max(16, Math.round(64 / ratio));
    body.style.paddingLeft = pad + 'px';
    body.style.paddingRight = pad + 'px';

    // Disable buttons at limits
    document.getElementById('fs-zoom-out').disabled = fsZoom <= FS_ZOOM_MIN;
    document.getElementById('fs-zoom-in').disabled = fsZoom >= FS_ZOOM_MAX;
    document.getElementById('fs-zoom-out').classList.toggle('opacity-30', fsZoom <= FS_ZOOM_MIN);
    document.getElementById('fs-zoom-in').classList.toggle('opacity-30', fsZoom >= FS_ZOOM_MAX);
}

function openFullscreenReader(html) {
    const reader = document.getElementById('fs-reader');
    const body = document.getElementById('fs-body');
    const title = document.getElementById('fs-title');

    const activeTab = currentTab ? (({
        transcript:'Transcript', summary_notes:'Summary Notes', main_topics:'Main Topics',
        detailed_qa:'Detailed Q&A', practice_qa:'Practice Set', mcq:'MCQ Quiz', exhaustive:'Everything'
    })[currentTab] || 'Reading Mode') : 'Reading Mode';
    const readMins = currentTab && rawOutputs[currentTab] ? calcReadTime(rawOutputs[currentTab]) : 0;
    title.innerHTML = activeTab + (readMins ? ` <span class="text-sm font-normal text-gray-400 dark:text-gray-500 ml-2">${fmtDuration(readMins)} read</span>` : '');

    body.innerHTML = html;
    // Keep zoom from previous session
    setFsZoom(fsZoom);
    reader.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeFullscreenReader() {
    document.getElementById('fs-reader').classList.add('hidden');
    document.body.style.overflow = '';
}

// ==================== YouTube Embed ====================
function showYouTubeEmbed(sourceUrl) {
    const container = document.getElementById('history-video');
    const iframe = document.getElementById('history-video-iframe');
    if (!sourceUrl) { container.classList.add('hidden'); return; }

    // Extract video ID from URL
    let videoId = '';
    try {
        const url = new URL(sourceUrl);
        videoId = url.searchParams.get('v') || url.pathname.split('/').pop();
    } catch { /* ignore */ }

    if (videoId && videoId.length > 5) {
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

// ==================== Merge Sessions ====================
let mergeMode = 'combine';

function setupMerge() {
    document.getElementById('merge-btn').addEventListener('click', openMergeModal);
    document.getElementById('merge-close').addEventListener('click', () => document.getElementById('merge-modal').classList.add('hidden'));
    document.getElementById('merge-go').addEventListener('click', doMerge);

    // Mode toggle
    document.querySelectorAll('.merge-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            mergeMode = btn.dataset.mode;
            document.querySelectorAll('.merge-mode-btn').forEach(b => {
                b.className = b.dataset.mode === mergeMode
                    ? 'merge-mode-btn flex-1 px-4 py-2.5 rounded-xl border border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 text-sm font-semibold transition-all'
                    : 'merge-mode-btn flex-1 px-4 py-2.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 text-sm font-medium transition-all hover:border-brand-400';
            });
            // Update button text
            const goText = document.querySelector('#merge-go .merge-text');
            goText.textContent = mergeMode === 'combine' ? 'Combine Sessions' : 'Merge & Generate';
        });
    });

    // Close on backdrop click
    document.getElementById('merge-modal').addEventListener('click', e => {
        if (e.target.id === 'merge-modal') document.getElementById('merge-modal').classList.add('hidden');
    });
}

async function openMergeModal() {
    document.getElementById('merge-modal').classList.remove('hidden');
    const list = document.getElementById('merge-list');
    list.innerHTML = '<p class="text-sm text-gray-400">Loading...</p>';

    try {
        const resp = await fetch('/api/history');
        const data = await resp.json();
        const items = data.history || [];
        if (!items.length) {
            list.innerHTML = '<p class="text-sm text-gray-400">No study sessions yet. Generate some first!</p>';
            return;
        }
        list.innerHTML = items.map(item => {
            const title = item.title || 'Video';
            const dur = item.duration ? ` · ${fmtDuration(Math.ceil(item.duration / 60))}` : '';
            const typeLabel = item.source_type === 'merge' ? 'Merged' : item.source_type === 'youtube' ? 'YouTube' : 'Upload';
            return `<label class="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.03] hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-500/5 cursor-pointer transition-all">
                <input type="checkbox" value="${item.id}" class="merge-check accent-brand-500 w-4 h-4 shrink-0">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">${esc(title)}</span>
                <span class="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">${typeLabel}${dur}</span>
            </label>`;
        }).join('');
    } catch {}
}

async function doMerge() {
    const ids = [...document.querySelectorAll('.merge-check:checked')].map(c => +c.value);
    if (ids.length < 2) { alert('Select at least 2 sessions'); return; }

    const options = [...document.querySelectorAll('#merge-options input:checked')].map(c => c.value);
    if (!options.length) { alert('Select at least one output option'); return; }

    const btn = document.getElementById('merge-go');
    btn.disabled = true;
    btn.querySelector('.merge-text').classList.add('hidden');
    btn.querySelector('.merge-loader').classList.remove('hidden');

    try {
        const resp = await fetch('/api/merge', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                history_ids: ids,
                options: options,
                title: document.getElementById('merge-title').value.trim(),
                mcq_options: 4,
                mode: mergeMode,
            }),
        });
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || 'Failed'); }
        const data = await resp.json();

        document.getElementById('merge-modal').classList.add('hidden');

        if (data.mode === 'combine') {
            // No async task — data is ready, go straight to history item
            await loadHistory();
            openHistory(data.history_id);
        } else {
            // Regenerate mode — track async progress
            showView('generator-view');
            document.getElementById('progress-section').classList.remove('hidden');
            trackProgress(data.task_id);
        }
    } catch (err) {
        alert(err.message);
    }
    btn.disabled = false;
    btn.querySelector('.merge-text').classList.remove('hidden');
    btn.querySelector('.merge-loader').classList.add('hidden');
}

// ==================== Onboarding Tour ====================
const tourSteps = [
    {
        title: 'Welcome to StudyLens!',
        text: 'I\'m Owlbert, your study buddy! Let me show you around. This app turns any video into study material — notes, quizzes, Q&A, and more.',
        target: null
    },
    {
        title: 'Paste a YouTube URL',
        text: 'Drop any YouTube video link here and pick what you need — summary notes, MCQs, detailed Q&A, or the full works!',
        target: '#url-input'
    },
    {
        title: 'Pick your output',
        text: 'Choose one or more options. "Everything" gives you an exhaustive breakdown of the entire video. Great for exam prep!',
        target: '.options-grid'
    },
    {
        title: 'Merge Sessions',
        text: 'Studied multiple videos? Merge them into one combined study guide! Perfect for revision before exams.',
        target: '#merge-btn'
    },
    {
        title: 'AI Chat',
        text: 'Got questions? Open AI Chat to ask anything. You can reference any study session for context — no need to leave the app!',
        target: '#fullchat-btn'
    },
    {
        title: 'Select & Ask',
        text: 'While reading your notes, select any text and a "Ask AI" tooltip appears. Ask follow-up questions right there!',
        target: null
    },
    {
        title: 'You\'re all set!',
        text: 'Your study sessions are saved in the sidebar. You can rename, delete, or open them anytime. Happy studying!',
        target: '#history-list'
    }
];

let tourIndex = 0;

function setupTour() {
    // Show tour for first-time users
    if (!localStorage.getItem('studylens-toured')) {
        setTimeout(() => startTour(), 800);
    }
    document.getElementById('tour-skip').addEventListener('click', endTour);
    document.getElementById('tour-next').addEventListener('click', nextTourStep);
}

function startTour() {
    tourIndex = 0;
    document.getElementById('tour-overlay').classList.remove('hidden');
    renderTourStep();
}

function renderTourStep() {
    const step = tourSteps[tourIndex];
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-text').textContent = step.text;
    document.getElementById('tour-step-label').textContent = `${tourIndex + 1} of ${tourSteps.length}`;
    document.getElementById('tour-next').textContent = tourIndex === tourSteps.length - 1 ? 'Get Started!' : 'Next';

    const highlight = document.getElementById('tour-highlight');
    const card = document.getElementById('tour-card');

    if (step.target) {
        const el = document.querySelector(step.target);
        if (el) {
            const rect = el.getBoundingClientRect();
            highlight.style.display = 'block';
            highlight.style.top = (rect.top - 6) + 'px';
            highlight.style.left = (rect.left - 6) + 'px';
            highlight.style.width = (rect.width + 12) + 'px';
            highlight.style.height = (rect.height + 12) + 'px';

            // Position card near the target
            const cardY = rect.bottom + 20;
            card.style.top = Math.min(cardY, window.innerHeight - 250) + 'px';
            card.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 400)) + 'px';
            card.style.transform = 'none';
        } else {
            highlight.style.display = 'none';
            card.style.top = '50%'; card.style.left = '50%'; card.style.transform = 'translate(-50%,-50%)';
        }
    } else {
        highlight.style.display = 'none';
        card.style.top = '50%'; card.style.left = '50%'; card.style.transform = 'translate(-50%,-50%)';
    }
}

function nextTourStep() {
    tourIndex++;
    if (tourIndex >= tourSteps.length) { endTour(); return; }
    renderTourStep();
}

function endTour() {
    document.getElementById('tour-overlay').classList.add('hidden');
    localStorage.setItem('studylens-toured', '1');
}

// All setup calls are in the single DOMContentLoaded listener at the top of this file.
