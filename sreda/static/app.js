/* СРЕДА — frontend v2
   3D HUD + chat + voice + system + self-dev approval flow + image upload.
*/

(() => {
    'use strict';

    const socket = io({ transports: ['websocket', 'polling'] });

    // ───────── DOM ─────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const chatForm = $('#chat-form');
    const chatInput = $('#message-input');
    const chatMessages = $('#chat-messages');
    const typingIndicator = $('#typing-indicator');
    const engineStatus = $('#engine-status');
    const holoCore = $('#holo-core');
    const chatSub = $('#chat-sub');

    const btnVoice = $('#btn-voice');
    const btnTtsToggle = $('#btn-tts-toggle');
    const btnUpload = $('#btn-upload');
    const uploadInput = $('#upload-input');
    const btnBriefing = $('#btn-briefing');
    const btnNotifications = $('#btn-notifications');
    const notifBadge = $('#notif-badge');
    const notifDrawer = $('#notif-drawer');
    const notifList = $('#notif-list');
    const notifClose = $('#notif-close');

    const noteModal = $('#note-modal');
    const reminderModal = $('#reminder-modal');

    const railTabs = $$('.rail-tab');
    const tabPanes = $$('.tab-pane');
    const periodButtons = $$('.seg-btn');

    let currentPeriod = 'day';
    let ttsEnabled = localStorage.getItem('sreda-tts') === '1';
    updateTtsButton();

    // ───────── Live 3D background canvas ─────────
    (function initBackground() {
        const canvas = $('#bg-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W = 0, H = 0, dpr = Math.max(1, window.devicePixelRatio || 1);

        const stars = [];
        const STAR_COUNT = 160;
        function resetStars() {
            stars.length = 0;
            for (let i = 0; i < STAR_COUNT; i++) {
                stars.push({
                    x: (Math.random() - 0.5) * 2,
                    y: (Math.random() - 0.5) * 2,
                    z: Math.random(),
                    s: Math.random() * 0.6 + 0.4,
                });
            }
        }
        function resize() {
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = Math.floor(W * dpr);
            canvas.height = Math.floor(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize();
        resetStars();
        window.addEventListener('resize', resize);

        let mouseX = 0, mouseY = 0;
        window.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / W - 0.5) * 2;
            mouseY = (e.clientY / H - 0.5) * 2;
        });

        let t0 = performance.now();
        function frame(t) {
            const dt = Math.min(0.05, (t - t0) / 1000);
            t0 = t;
            const time = t / 1000;

            ctx.fillStyle = 'rgba(2, 5, 11, 0.55)';
            ctx.fillRect(0, 0, W, H);

            // perspective grid receding into depth
            const cx = W / 2 + mouseX * 30;
            const cy = H * 0.62 + mouseY * 14;
            const horizon = H * 0.42;
            ctx.strokeStyle = 'rgba(76, 214, 255, 0.085)';
            ctx.lineWidth = 1;
            // horizontal lines (z-axis layers)
            for (let i = 0; i < 14; i++) {
                const k = (i + (time * 0.18) % 1) / 14;
                const y = horizon + Math.pow(k, 1.7) * (H - horizon);
                const alpha = 0.04 + (1 - k) * 0.12;
                ctx.strokeStyle = `rgba(76, 214, 255, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(W, y);
                ctx.stroke();
            }
            // radial lines
            const radials = 22;
            for (let i = 0; i <= radials; i++) {
                const ang = (i / radials - 0.5) * Math.PI * 0.95;
                const x2 = cx + Math.tan(ang) * (H - horizon) * 1.6;
                ctx.strokeStyle = `rgba(76, 214, 255, 0.06)`;
                ctx.beginPath();
                ctx.moveTo(cx, horizon);
                ctx.lineTo(x2, H + 60);
                ctx.stroke();
            }

            // starfield with parallax depth
            for (const st of stars) {
                st.z -= dt * 0.04;
                if (st.z <= 0) {
                    st.z = 1;
                    st.x = (Math.random() - 0.5) * 2;
                    st.y = (Math.random() - 0.5) * 2;
                }
                const px = (st.x / st.z) * W * 0.5 + W / 2 + mouseX * 60 * (1 - st.z);
                const py = (st.y / st.z) * H * 0.5 + H / 2 + mouseY * 30 * (1 - st.z);
                if (px < 0 || px > W || py < 0 || py > H) continue;
                const size = (1.4 - st.z) * 1.6 * st.s;
                const alpha = (1 - st.z) * 0.85;
                ctx.fillStyle = `rgba(160, 230, 255, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(px, py, Math.max(0.3, size), 0, Math.PI * 2);
                ctx.fill();
            }

            // subtle horizon glow
            const grad = ctx.createLinearGradient(0, horizon - 80, 0, horizon + 80);
            grad.addColorStop(0, 'rgba(76, 214, 255, 0)');
            grad.addColorStop(0.5, 'rgba(76, 214, 255, 0.06)');
            grad.addColorStop(1, 'rgba(76, 214, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, horizon - 80, W, 160);

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    })();

    // ───────── Mobile tabs ─────────
    const mTabs = $$('.mtab');
    const hudShell = document.querySelector('.hud-shell');
    function applyMTab(name) {
        hudShell.dataset.mtab = name;
        mTabs.forEach(t => t.classList.toggle('active', t.dataset.mtab === name));
    }
    mTabs.forEach(t => t.addEventListener('click', () => applyMTab(t.dataset.mtab)));
    applyMTab('chat');

    // ───────── Helpers ─────────
    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function formatText(s) {
        const escaped = escapeHtml(s);
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }
    function timeStr(d = new Date()) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    function fmtUptime(seconds) {
        if (!seconds || seconds < 0) return '—';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}д ${h}ч`;
        if (h > 0) return `${h}ч ${m}м`;
        return `${m} мин`;
    }
    function scrollChatBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ───────── Chat ─────────
    function appendMessage(role, text, actions = [], opts = {}) {
        const { animate = false, imageUrl = null, patch = null } = opts;
        const wrap = document.createElement('div');
        wrap.className = `msg msg-${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = role === 'user' ? 'В' : 'С';

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        const textEl = document.createElement('div');
        textEl.className = 'msg-text';
        bubble.appendChild(textEl);

        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        meta.innerHTML = `<span>${role === 'user' ? 'Влад' : 'Среда'}</span><time>${timeStr()}</time>`;
        bubble.appendChild(meta);

        if (imageUrl) {
            const img = document.createElement('img');
            img.className = 'msg-image';
            img.src = imageUrl;
            img.alt = 'attachment';
            bubble.appendChild(img);
        }

        if (actions && actions.length) {
            const actBlock = document.createElement('div');
            actBlock.className = 'msg-actions';
            actions.forEach(a => {
                const item = document.createElement('div');
                item.className = 'msg-action';
                item.textContent = a;
                actBlock.appendChild(item);

                // Detect screenshot path within action result
                const m = /\/static\/(pc_screen|phone_screen)[\w-]*\.png\?t=\d+/.exec(a);
                if (m) {
                    const img = document.createElement('img');
                    img.className = 'msg-image';
                    img.src = m[0];
                    img.alt = 'screenshot';
                    actBlock.appendChild(img);
                }
            });
            bubble.appendChild(actBlock);
        }

        if (patch) {
            bubble.appendChild(renderPatchCard(patch));
        }

        wrap.appendChild(avatar);
        wrap.appendChild(bubble);
        chatMessages.appendChild(wrap);
        scrollChatBottom();

        if (animate && role === 'assistant') {
            typewriter(textEl, text);
            if (ttsEnabled) speak(text);
        } else {
            textEl.innerHTML = formatText(text);
        }
    }

    function renderPatchCard(patch) {
        const card = document.createElement('div');
        card.className = 'patch-card';
        card.innerHTML = `
            <h5>Предложение изменения: ${escapeHtml(patch.file)}</h5>
            <div style="font-size:12px;color:var(--text-soft);margin-bottom:6px">${escapeHtml(patch.reason || '')}</div>
            <pre>${escapeHtml(patch.diff || patch.new_content || '')}</pre>
            <div class="patch-actions">
                <button class="primary-btn" data-patch-approve="${patch.id}">Применить</button>
                <button class="ghost-btn danger" data-patch-discard="${patch.id}">Отклонить</button>
            </div>
        `;
        return card;
    }

    document.body.addEventListener('click', (e) => {
        const approve = e.target.closest('[data-patch-approve]');
        const discard = e.target.closest('[data-patch-discard]');
        if (approve) {
            const id = approve.dataset.patchApprove;
            approve.disabled = true; approve.textContent = 'Применяю…';
            socket.emit('patch_decision', { id, action: 'apply' });
        }
        if (discard) {
            const id = discard.dataset.patchDiscard;
            discard.disabled = true; discard.textContent = 'Отклоняю…';
            socket.emit('patch_decision', { id, action: 'discard' });
        }
    });

    function typewriter(el, text) {
        let i = 0;
        function step() {
            el.innerHTML = formatText(text.slice(0, i));
            scrollChatBottom();
            if (i >= text.length) return;
            i++;
            const c = text[i - 1];
            const delay = c === ' ' ? 4 : c === '.' || c === ',' ? 35 : 10;
            setTimeout(step, delay);
        }
        step();
    }

    function setThinking(on) {
        if (on) {
            typingIndicator.hidden = false;
            holoCore && holoCore.classList.add('thinking');
            chatSub.textContent = 'думаю…';
        } else {
            typingIndicator.hidden = true;
            holoCore && holoCore.classList.remove('thinking');
            chatSub.textContent = 'Готова помочь, Влад';
        }
    }

    function updateEngine(label) {
        const text = label || 'Mistral';
        engineStatus.textContent = text;
        engineStatus.style.color = /ollama/i.test(text) ? 'var(--gold-soft)'
            : /error|none/i.test(text) ? 'var(--red)' : 'var(--gold)';
    }

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });

    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        appendMessage('user', text);
        socket.emit('user_message', { message: text });
        chatInput.value = '';
    }

    // Quick prompt buttons
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quick]');
        if (btn) {
            chatInput.value = btn.dataset.quick;
            chatInput.focus();
        }
    });

    // ───────── Image upload ─────────
    if (btnUpload && uploadInput) {
        btnUpload.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('image', file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.status === 'ok' && data.url) {
                    appendMessage('user', chatInput.value.trim() || `(прикрепил картинку ${file.name})`, [], { imageUrl: data.url });
                    socket.emit('user_message', { message: chatInput.value.trim() || `Посмотри картинку: ${data.url}`, image_url: data.url });
                    chatInput.value = '';
                } else {
                    alert(data.message || 'Не удалось загрузить.');
                }
            } catch (err) {
                alert('Ошибка загрузки: ' + err.message);
            } finally {
                uploadInput.value = '';
            }
        });
    }

    // ───────── Socket events ─────────
    socket.on('chat_history', (history) => {
        if (!history || !history.length) return;
        chatMessages.innerHTML = '';
        history.forEach(m => appendMessage(m.role === 'user' ? 'user' : 'assistant', m.content, []));
    });

    socket.on('msg_status', (data) => {
        if (data && data.status === 'typing') setThinking(true);
    });

    socket.on('assistant_message', (data) => {
        setThinking(false);
        updateEngine(data.engine || 'Mistral');
        appendMessage('assistant', data.reply || '', data.actions || [], {
            animate: true,
            patch: data.patch || null,
        });
    });

    socket.on('patch_resolved', (data) => {
        appendMessage('assistant', data.message || '', [], { animate: true });
        loadSelfModules();
    });

    socket.on('reminder_fired', (rem) => {
        notify('Напоминание', rem.text);
        loadNotifications();
        loadReminders();
        if (ttsEnabled) speak('Напоминание. ' + rem.text);
    });

    // ───────── System polling ─────────
    function setRing(circleSel, valSel, value) {
        const circle = document.querySelector(circleSel);
        const valEl = document.querySelector(valSel);
        const v = Math.max(0, Math.min(100, Number(value) || 0));
        const circumference = 263.9;
        if (circle) circle.style.strokeDashoffset = String(circumference - (circumference * v / 100));
        if (valEl) valEl.textContent = `${Math.round(v)}%`;
    }

    function refreshSystem() {
        fetch('/api/system').then(r => r.json()).then(s => {
            $('#m-cpu').textContent = `${Math.round(s.cpu_percent)}%`;
            $('#m-ram').textContent = `${s.ram_used_gb}/${s.ram_total_gb} ГБ`;
            $('#m-disk').textContent = `${s.disk_percent}%`;
            $('#m-time').textContent = s.time;
            $('#m-date').textContent = s.date;

            setRing('.ring-cpu', '#ring-cpu-val', s.cpu_percent);
            setRing('.ring-ram', '#ring-ram-val', s.ram_percent);
            setRing('.ring-disk', '#ring-disk-val', s.disk_percent);

            $('#sys-ip').textContent = s.local_ip;
            $('#sys-host').textContent = s.hostname;
            $('#sys-uptime').textContent = fmtUptime(s.uptime_seconds);
            if (s.battery) {
                $('#kv-battery').hidden = false;
                $('#sys-battery').textContent = `${s.battery.percent}% ${s.battery.plugged ? '⚡' : ''}`;
            } else {
                $('#kv-battery').hidden = true;
            }
        }).catch(() => {});
    }
    refreshSystem();
    setInterval(refreshSystem, 5000);
    $('#btn-refresh-system')?.addEventListener('click', refreshSystem);

    // ───────── Weather ─────────
    function refreshWeather() {
        fetch('/api/briefing').then(r => r.json()).then(b => {
            if (b.weather) $('#weather-now').textContent = b.weather;
        }).catch(() => {});
    }
    refreshWeather();
    setInterval(refreshWeather, 60_000 * 15);

    // ───────── Facts / patterns ─────────
    function loadFacts() {
        const box = $('#facts-list');
        fetch('/api/facts').then(r => r.json()).then(data => {
            if (!data || !data.length) {
                box.innerHTML = '<p class="empty">Память пока пуста. Расскажи о себе.</p>';
                return;
            }
            box.innerHTML = '';
            data.forEach(f => {
                const card = document.createElement('div');
                card.className = 'fact';
                card.innerHTML = `
                    <span class="fact-key">${escapeHtml(f.key)}</span>
                    <span class="fact-val">${escapeHtml(f.value)}</span>
                    <button class="fact-del" title="Забыть">×</button>
                `;
                card.querySelector('.fact-del').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Забыть факт "${f.key}"?`)) {
                        fetch('/api/facts/delete', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: f.key })
                        }).then(() => loadFacts());
                    }
                });
                card.addEventListener('click', () => {
                    chatInput.value = `Учитывай факт: ${f.key} — ${f.value}`;
                    chatInput.focus();
                });
                box.appendChild(card);
            });
        });
    }

    function loadPatterns() {
        const box = $('#patterns-list');
        fetch('/api/patterns').then(r => r.json()).then(data => {
            if (!data || !data.length) {
                box.innerHTML = '<p class="empty">Накапливаю наблюдения…</p>';
                return;
            }
            box.innerHTML = '';
            data.forEach(p => {
                const card = document.createElement('div');
                card.className = 'pattern';
                const conf = Math.round((p.confidence || 0) * 100);
                card.innerHTML = `
                    <div class="pattern-body">${escapeHtml(p.description)}</div>
                    <div class="pattern-meta">
                        <span>уверенность ${conf}%</span>
                        <button class="pattern-toggle ${p.active ? 'active' : ''}" data-id="${p.id}" data-active="${p.active ? 0 : 1}">
                            ${p.active ? 'Активна' : 'Включить'}
                        </button>
                    </div>
                `;
                card.querySelector('.pattern-toggle').addEventListener('click', () => {
                    const btn = card.querySelector('.pattern-toggle');
                    fetch('/api/patterns/toggle', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: Number(btn.dataset.id), active: Number(btn.dataset.active) })
                    }).then(() => loadPatterns());
                });
                box.appendChild(card);
            });
        });
    }

    // ───────── Notes ─────────
    function loadNotes(query = '') {
        const box = $('#notes-list');
        fetch(`/api/notes${query ? `?q=${encodeURIComponent(query)}` : ''}`).then(r => r.json()).then(data => {
            if (!data || !data.length) {
                box.innerHTML = '<p class="empty">Заметок ещё нет.</p>';
                return;
            }
            box.innerHTML = '';
            data.forEach(n => {
                const card = document.createElement('div');
                card.className = 'note';
                const date = new Date(n.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                card.innerHTML = `
                    <span class="note-title">${escapeHtml(n.title || 'Без заголовка')}</span>
                    <span class="note-body">${escapeHtml(n.body || '')}</span>
                    <span class="note-meta">${date}${n.tags ? ' · ' + escapeHtml(n.tags) : ''}</span>
                    <button class="note-del" title="Удалить">×</button>
                `;
                card.querySelector('.note-del').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Удалить заметку "${n.title}"?`)) {
                        fetch(`/api/notes/${n.id}`, { method: 'DELETE' }).then(() => loadNotes($('#notes-search').value));
                    }
                });
                card.addEventListener('click', () => {
                    chatInput.value = `Найди в моих заметках: ${n.title}`;
                    chatInput.focus();
                });
                box.appendChild(card);
            });
        });
    }
    $('#btn-new-note')?.addEventListener('click', () => {
        $('#note-title').value = '';
        $('#note-body').value = '';
        $('#note-tags').value = '';
        noteModal.hidden = false;
    });
    $('#note-save')?.addEventListener('click', () => {
        const payload = {
            title: $('#note-title').value.trim() || 'Без заголовка',
            body: $('#note-body').value.trim(),
            tags: $('#note-tags').value.trim(),
        };
        fetch('/api/notes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(() => {
            noteModal.hidden = true;
            loadNotes();
        });
    });
    $('#notes-search')?.addEventListener('input', (e) => {
        loadNotes(e.target.value);
    });

    // ───────── Reminders ─────────
    function loadReminders() {
        const box = $('#reminders-list');
        fetch('/api/reminders').then(r => r.json()).then(data => {
            if (!data || !data.length) {
                box.innerHTML = '<p class="empty">Активных напоминаний нет.</p>';
                return;
            }
            box.innerHTML = '';
            data.forEach(r => {
                const card = document.createElement('div');
                card.className = 'reminder';
                const when = new Date(r.fire_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                card.innerHTML = `
                    <span class="reminder-when">${when}</span>
                    <span class="reminder-text">${escapeHtml(r.text)}</span>
                    <button class="reminder-del" title="Удалить">×</button>
                `;
                card.querySelector('.reminder-del').addEventListener('click', () => {
                    fetch(`/api/reminders/${r.id}`, { method: 'DELETE' }).then(() => loadReminders());
                });
                box.appendChild(card);
            });
        });
    }
    $('#btn-new-reminder')?.addEventListener('click', () => {
        $('#reminder-text').value = '';
        $('#reminder-when').value = '';
        reminderModal.hidden = false;
    });
    $('#reminder-save')?.addEventListener('click', () => {
        const payload = {
            text: $('#reminder-text').value.trim(),
            relative: $('#reminder-when').value.trim(),
        };
        if (!payload.text || !payload.relative) {
            alert('Заполни текст и время.');
            return;
        }
        fetch('/api/reminders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json()).then(res => {
            if (res.status === 'ok') {
                reminderModal.hidden = true;
                loadReminders();
            } else {
                alert(res.message || 'Не получилось.');
            }
        });
    });

    // ───────── Self-dev (own code) ─────────
    function loadSelfModules() {
        const box = $('#self-modules');
        if (!box) return;
        fetch('/api/self/modules').then(r => r.json()).then(data => {
            if (!data || !data.modules || !data.modules.length) {
                box.innerHTML = '<p class="empty">Не смогла прочитать свой код.</p>';
                return;
            }
            box.innerHTML = '';
            data.modules.forEach(m => {
                const item = document.createElement('div');
                item.className = 'code-item';
                item.innerHTML = `
                    <div>
                        <div class="code-item-name">${escapeHtml(m.path)}</div>
                        <div class="code-item-desc">${escapeHtml(m.description)}</div>
                    </div>
                    <span class="code-item-size">${m.lines} стр.</span>
                `;
                item.addEventListener('click', () => {
                    chatInput.value = `Покажи код модуля ${m.path} — кратко опиши что он делает`;
                    chatInput.focus();
                });
                box.appendChild(item);
            });
        }).catch(() => {
            box.innerHTML = '<p class="empty">Ошибка загрузки модулей.</p>';
        });
    }
    $('#btn-refresh-self')?.addEventListener('click', loadSelfModules);

    // ───────── Logs ─────────
    function loadLogs() {
        const box = $('#logs-list');
        fetch('/api/logs').then(r => r.json()).then(data => {
            if (!data || !data.length) {
                box.innerHTML = '<p class="empty">Журнал пуст.</p>';
                return;
            }
            box.innerHTML = '';
            data.forEach(log => {
                const card = document.createElement('div');
                card.className = 'log';
                const statusCls = log.status.includes('success') ? 'success' : 'failed';
                const statusLbl = log.status.includes('success') ? 'OK' : 'FAIL';
                const date = new Date(log.timestamp).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                card.innerHTML = `
                    <div class="log-head">
                        <span class="log-name">${escapeHtml(log.action_name)}</span>
                        <span class="log-status ${statusCls}">${statusLbl}</span>
                    </div>
                    <div class="log-details">${escapeHtml(log.details || '')}</div>
                    <span class="log-time">${date}</span>
                `;
                box.appendChild(card);
            });
        });
    }
    $('#btn-refresh-logs')?.addEventListener('click', loadLogs);

    // ───────── Reports ─────────
    function loadReports(period) {
        fetch(`/api/reports/${period}`).then(r => r.json()).then(data => {
            $('#reports-summary').innerHTML = formatText(data.summary || '');
            const apps = Object.entries(data.apps || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const max = apps.reduce((m, [, v]) => Math.max(m, v), 1);
            $('#reports-apps').innerHTML = apps.map(([n, v]) => `
                <div class="bar">
                    <span class="bar-name">${escapeHtml(n)}</span>
                    <span class="bar-meta">${v} м</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(100 * v / max)}%"></div></div>
                </div>
            `).join('');
        }).catch(() => {});
    }
    periodButtons.forEach(b => b.addEventListener('click', () => {
        currentPeriod = b.dataset.period;
        periodButtons.forEach(x => x.classList.toggle('active', x === b));
        loadReports(currentPeriod);
    }));

    // ───────── Tabs (right rail) ─────────
    railTabs.forEach(t => {
        t.addEventListener('click', () => {
            railTabs.forEach(x => x.classList.toggle('active', x === t));
            const target = t.dataset.tab;
            tabPanes.forEach(p => p.hidden = p.dataset.pane !== target);
            if (target === 'notes') loadNotes();
            if (target === 'reminders') loadReminders();
            if (target === 'logs') loadLogs();
            if (target === 'memory') { loadFacts(); loadPatterns(); }
            if (target === 'self') loadSelfModules();
        });
    });

    // ───────── Notifications ─────────
    function loadNotifications() {
        fetch('/api/notifications').then(r => r.json()).then(data => {
            const unseen = (data || []).filter(n => !n.seen).length;
            if (unseen > 0) {
                notifBadge.hidden = false;
                notifBadge.textContent = unseen;
            } else {
                notifBadge.hidden = true;
            }
            if (!notifDrawer.hidden) {
                renderNotifications(data || []);
            }
        });
    }
    function renderNotifications(items) {
        if (!items.length) {
            notifList.innerHTML = '<p class="empty">Уведомлений нет.</p>';
            return;
        }
        notifList.innerHTML = '';
        items.forEach(n => {
            const card = document.createElement('div');
            card.className = `notif ${n.seen ? '' : 'unseen'}`;
            const date = new Date(n.timestamp).toLocaleString('ru-RU');
            card.innerHTML = `
                <div class="notif-title">${escapeHtml(n.title)}</div>
                <div class="notif-body">${escapeHtml(n.body)}</div>
                <div class="notif-time">${date}</div>
            `;
            notifList.appendChild(card);
        });
    }
    btnNotifications.addEventListener('click', () => {
        notifDrawer.hidden = !notifDrawer.hidden;
        if (!notifDrawer.hidden) {
            fetch('/api/notifications').then(r => r.json()).then(renderNotifications);
            fetch('/api/notifications/seen', { method: 'POST' }).then(() => loadNotifications());
        }
    });
    notifClose.addEventListener('click', () => { notifDrawer.hidden = true; });

    function notify(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body }); } catch (e) { /* noop */ }
        }
    }
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }

    // ───────── Briefing ─────────
    btnBriefing.addEventListener('click', () => {
        chatInput.value = 'Дай мне полный бриф: погода, состояние ПК, что я делал сегодня, какие напоминания на сегодня.';
        chatInput.focus();
    });

    // ───────── Modal close ─────────
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('[data-close]')) {
            const modal = e.target.closest('.modal');
            if (modal) modal.hidden = true;
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            $$('.modal').forEach(m => m.hidden = true);
            notifDrawer.hidden = true;
        }
    });

    // ───────── Voice input ─────────
    let recognizer = null;
    let recognizing = false;
    function getRecognizer() {
        if (recognizer) return recognizer;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return null;
        const r = new SR();
        r.lang = 'ru-RU';
        r.continuous = false;
        r.interimResults = true;
        r.onresult = (e) => {
            let txt = '';
            for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
            chatInput.value = txt;
        };
        r.onerror = () => stopVoice();
        r.onend = () => stopVoice();
        recognizer = r;
        return r;
    }
    function startVoice() {
        const r = getRecognizer();
        if (!r) { alert('В этом браузере нет распознавания речи. Открой Среду в Chrome (Edge/Yandex).'); return; }
        try {
            r.start();
            recognizing = true;
            btnVoice.classList.add('recording');
        } catch (e) {
            console.warn(e);
        }
    }
    function stopVoice() {
        recognizing = false;
        btnVoice.classList.remove('recording');
        if (chatInput.value.trim()) sendMessage();
    }
    btnVoice.addEventListener('click', () => {
        if (recognizing) {
            recognizer && recognizer.stop();
        } else {
            startVoice();
        }
    });

    // ───────── TTS ─────────
    function updateTtsButton() {
        if (!btnTtsToggle) return;
        btnTtsToggle.classList.toggle('tts-off', !ttsEnabled);
        btnTtsToggle.title = ttsEnabled ? 'Озвучивание ВКЛ' : 'Озвучивание ВЫКЛ';
    }
    function speak(text) {
        if (!('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'ru-RU';
            utter.rate = 1.02;
            utter.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const ru = voices.find(v => /ru/i.test(v.lang));
            if (ru) utter.voice = ru;
            window.speechSynthesis.speak(utter);
        } catch (e) { /* noop */ }
    }
    btnTtsToggle.addEventListener('click', () => {
        ttsEnabled = !ttsEnabled;
        localStorage.setItem('sreda-tts', ttsEnabled ? '1' : '0');
        updateTtsButton();
        if (ttsEnabled) speak('Голос включён');
    });

    // ───────── Initial load ─────────
    loadFacts();
    loadPatterns();
    loadReports(currentPeriod);
    loadNotifications();
    setInterval(loadNotifications, 30_000);

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => { /* trigger */ };
        window.speechSynthesis.getVoices();
    }

})();
