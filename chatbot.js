/* ============================================================
   JRN Events Chatbot Widget – chatbot.js
   AI-powered conversation engine (replaces decision tree)
   ============================================================ */

(function () {
    'use strict';

    // ── Config ───────────────────────────────────────────────────
    const AI_ENDPOINT = 'http://localhost:3001/ai-chat';    // dev
    // const AI_ENDPOINT = '/chatbot/ai-chat.php';          // production

    const SUBMIT_URL          = window.JRN_SUBMIT_URL    || 'chatbot/submit';
    const BRAND_LOGO          = window.JRN_BRAND_LOGO    || '';
    const FULL_CATALOGUE_LINK = window.JRN_CATALOGUE_URL || 'catalog';

    // ── Conversation history sent to AI proxy ────────────────────
    const conversationHistory = [];

    // ══════════════════════════════════════════════════════════════
    // STATE
    // ──────
    // Fields are set to undefined by default (not null, not []).
    // saveToServer() strips out undefined fields before sending,
    // so the server only ever receives fields that have been
    // explicitly answered by the user.
    //
    // This is the core fix: services and budget are NEVER sent
    // to the server until the user actually answers those questions.
    // ══════════════════════════════════════════════════════════════
    const state = {
        session_token:     undefined,
        event_type:        undefined,
        ritual_style:      undefined,
        decor_events:      undefined,
        bundle_quote:      undefined,
        event_date:        undefined,
        guest_size:        undefined,
        venue_details:     undefined,
        wedding_planner:   undefined,
        pinterest_link:    undefined,
        event_style:       undefined,
        decor_elements:    undefined,
        decor_budget:      undefined,
        services:          undefined,
        budget:            undefined,
        name:              undefined,
        email:             undefined,
        phone:             undefined,
        preferred_contact: undefined,
        status:            undefined,
    };

    // ── DOM refs (set in initChatbot) ────────────────────────────
    let $messages, $inputArea, $textInput, $sendBtn;

    // ══════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════

    function scrollBottom() {
        setTimeout(function () {
            if ($messages) {
                $messages.scrollTo({ top: $messages.scrollHeight, behavior: 'smooth' });
            }
        }, 50);
    }

    // ── 1. appendMessage ─────────────────────────────────────────
    function appendMessage(role, html) {
        var el = document.createElement('div');
        el.className = 'jrn-bubble jrn-' + role;
        el.innerHTML = html;
        $messages.appendChild(el);
        scrollBottom();
        return el;
    }

    // ── 2. Typing indicator ───────────────────────────────────────
    function showTyping() {
        hideTyping();
        var el = document.createElement('div');
        el.id        = 'jrn-typing';
        el.className = 'jrn-bubble jrn-bot jrn-typing';
        el.innerHTML = '<span><i></i><i></i><i></i></span>';
        $messages.appendChild(el);
        scrollBottom();
    }

    function hideTyping() {
        var el = document.getElementById('jrn-typing');
        if (el) el.remove();
    }

    // ── 3. renderSuggestions ──────────────────────────────────────
    function renderSuggestions(suggestions) {
        // Remove existing suggestion container if present
        var existing = document.getElementById('jrn-suggestions');
        if (existing) existing.remove();

        if (!suggestions || suggestions.length === 0) return;

        var container = document.createElement('div');
        container.id        = 'jrn-suggestions';
        container.className = 'jrn-suggestions';

        suggestions.forEach(function (label) {
            var btn       = document.createElement('button');
            btn.className = 'jrn-suggestion-chip';
            btn.textContent = label;
            btn.addEventListener('click', function () {
                // Remove the container first so chips disappear before reply
                container.remove();
                sendMessage(label);
            });
            container.appendChild(btn);
        });

        // Insert above the input area
        $inputArea.parentNode.insertBefore(container, $inputArea);
        scrollBottom();
    }

    // ── 4. sendMessage ────────────────────────────────────────────
    async function sendMessage(text) {
        text = (text || '').trim();
        if (!text) return;

        // Clear input field
        if ($textInput) $textInput.value = '';

        // Clear old chips
        renderSuggestions([]);

        // Show user bubble
        appendMessage('user', escapeHtml(text));

        // Add to conversation history
        conversationHistory.push({ role: 'user', content: text });

        // Show typing indicator
        showTyping();

        // Disable send button while waiting
        if ($sendBtn) $sendBtn.disabled = true;

        try {
            const response = await fetch(AI_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    message: text,
                    history: conversationHistory.slice(-10),
                    state:   state,
                }),
            });

            const data = await response.json();

            hideTyping();

            // Show bot reply — renderMarkdown handles escaping + formatting
            const reply = data.reply || "I'm sorry, I couldn't get a response. Please try again!";
            appendMessage('bot', renderMarkdown(reply));

            // Add assistant reply to history
            conversationHistory.push({ role: 'assistant', content: reply });

            // Persist extracted fields to state and save to CRM
            if (data.extracted && Object.keys(data.extracted).length > 0) {
                Object.assign(state, data.extracted);
                saveToServer({});
            }

            // Render suggestion chips
            renderSuggestions(data.suggestions || []);

        } catch (err) {
            hideTyping();
            console.error('[JRN] AI fetch error:', err);
            appendMessage('bot', "I'm having a little trouble on my end — please try again in a moment! 🙏");
        } finally {
            if ($sendBtn) $sendBtn.disabled = false;
            if ($textInput) $textInput.focus();
        }
    }

    // ── saveToServer ──────────────────────────────────────────────
    /*
     * KEY FIX:
     * Before sending, we build a clean payload that contains ONLY
     * fields where state[key] !== undefined.
     * This means services and budget are never sent to the server
     * until they are explicitly set by the user answering that step.
     * The server therefore never receives null/empty for those fields
     * and cannot accidentally overwrite them.
     */
    function saveToServer(extra) {
        extra = extra || {};

        // Build payload: only include fields that have been set (not undefined)
        const payload = { session_token: state.session_token || '' };

        const keys = [
            'event_type','ritual_style','decor_events','bundle_quote',
            'event_date','guest_size','venue_details','wedding_planner',
            'pinterest_link','event_style','decor_elements','decor_budget',
            'services','budget','name','email','phone','preferred_contact','status'
        ];

        keys.forEach(function(k) {
            if (state[k] !== undefined) {
                payload[k] = state[k];
            }
        });

        // Merge extras (e.g. {status:'complete'})
        Object.keys(extra).forEach(function(k) {
            payload[k] = extra[k];
        });

        console.log('[JRN] saveToServer payload:', JSON.stringify(payload));

        fetch(SUBMIT_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        })
        .then(function(r) { return r.text(); })
        .then(function(text) {
            try {
                const d = JSON.parse(text);
                console.log('[JRN] Server response:', d);
                if (d.success && d.session_token) {
                    state.session_token = d.session_token;
                } else if (!d.success) {
                    console.error('[JRN] DB save failed:', d.error || d);
                }
            } catch(e) {
                console.error('[JRN] Invalid JSON:', text);
            }
        })
        .catch(function(err) { console.error('[JRN] Fetch error:', err); });
    }

    // ── Utility: escape HTML to prevent XSS ──────────────────────
    function escapeHtml(text) {
        return text
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#039;');
    }

    // ── Utility: render bot reply markdown as clean HTML ─────────
    // Handles **bold**, list items (- item), and paragraph spacing.
    // Always escapes HTML first so user-influenced content stays safe.
    function renderMarkdown(text) {
        // 1. Escape HTML for safety
        var safe = escapeHtml(text);

        // 2. Normalise inline list items the AI sometimes writes on one line:
        //    "consider: - **A** (desc) - **B** (desc)"
        //    Push each "- " onto its own line so the list parser picks them up.
        safe = safe.replace(/ - (?=\*\*|[A-Z])/g, '\n- ');

        // 3. Render **bold**
        safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

        // 4. Walk lines and build structured HTML
        var lines      = safe.split('\n');
        var chunks     = [];
        var listItems  = [];

        function flushList() {
            if (listItems.length) {
                chunks.push(
                    '<ul class="jrn-md-list"><li>' +
                    listItems.join('</li><li>') +
                    '</li></ul>'
                );
                listItems = [];
            }
        }

        lines.forEach(function (line) {
            var t = line.trim();
            if (!t) return;
            if (t.startsWith('- ')) {
                listItems.push(t.slice(2));
            } else {
                flushList();
                chunks.push('<p>' + t + '</p>');
            }
        });
        flushList();

        return chunks.join('');
    }

    // ══════════════════════════════════════════════════════════════
    // 5. initChatbot
    // ══════════════════════════════════════════════════════════════
    function initChatbot() {
        // Cache DOM refs
        $messages  = document.getElementById('jrn-messages');
        $inputArea = document.getElementById('jrn-input-area');
        $textInput = document.getElementById('jrn-text-input');
        $sendBtn   = document.getElementById('jrn-send-btn');

        if (!$messages || !$inputArea || !$textInput || !$sendBtn) {
            console.warn('[JRN] Chatbot DOM elements not found — aborting init.');
            return;
        }

        // Hide legacy decision-tree options, show text input
        var $opts = document.getElementById('jrn-current-opts');
        if ($opts) $opts.style.display = 'none';
        $inputArea.style.display = 'flex';

        // Wire send button
        $sendBtn.addEventListener('click', function () {
            sendMessage($textInput.value);
        });

        // Wire Enter key (Shift+Enter adds a newline)
        $textInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage($textInput.value);
            }
        });

        // Opening greeting after a short delay
        setTimeout(function () {
            appendMessage(
                'bot',
                "Hi! Welcome to JRN Events — South Florida's celebration experts! 🎉" +
                "<br>What special moment are we planning today?"
            );

            // Initial suggestion chips
            renderSuggestions(['Wedding', 'Birthday Party', 'Corporate Event', 'Other']);
        }, 600);
    }

    // ── Bootstrap ─────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatbot);
    } else {
        initChatbot();
    }

})();
