/* ============================================================
   JRN Events — AI Proxy Server
   server/server.js

   Sits between chatbot.js (frontend) and OpenAI API.
   Receives { message, history, state } → returns { reply, extracted, suggestions }

   Start:  node server/server.js
   Dev:    npm run dev  (nodemon, auto-restarts on save)
   ============================================================ */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });

const express = require('express');
const cors    = require('cors');
const OpenAI  = require('openai');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── OpenAI client ─────────────────────────────────────────────
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `
You are the JRN Events chatbot — a warm, celebratory assistant for
JRN Events, South Florida's premier event decoration company.

YOUR JOB: Collect these fields through natural conversation:
event_type, ritual_style, decor_events, bundle_quote, event_date,
guest_size, venue_details, wedding_planner, pinterest_link,
event_style, decor_elements, decor_budget, name, email, phone,
preferred_contact

RULES:
- Ask one topic at a time
- Be warm and celebratory
- When you collect a field, append: DATA:{"fieldname":"value"}
- When offering bounded choices, append: SUGGESTIONS:[opt1]|[opt2]|[opt3]
- Show suggestions for: event_type, ritual_style, event_style, decor_events
- Never show suggestions for: name, date, guest count, budget, email, phone

SUGGESTION VALUES:
- event_type: Wedding, Birthday Party, Corporate Event, Other
- ritual_style: South Indian, North Indian, Christian, Western, Other
- event_style: Traditional & Royal, Modern & Minimalist, Bright & Festive, Undecided
- decor_events: Vidhi, Pithi, Haldi/Holuad, Mehndi/Henna, Grah Shanthi, Sangeet, Wedding, Reception
`.trim();

// ══════════════════════════════════════════════════════════════
// HELPERS — Parse AI response
// ══════════════════════════════════════════════════════════════

/**
 * Extract all DATA:{...} markers from the raw AI reply.
 * Returns a flat object of { field: value, ... }
 */
function parseDataMarkers(text) {
    const data    = {};
    const pattern = /DATA:(\{[^}]+\})/g;
    let   match;

    while ((match = pattern.exec(text)) !== null) {
        try {
            const obj = JSON.parse(match[1]);
            Object.assign(data, obj);
        } catch (e) {
            console.warn('[JRN AI] Could not parse DATA marker:', match[1]);
        }
    }
    return data;
}

/**
 * Extract suggestion chip labels from a SUGGESTIONS: line.
 * Returns an array of strings e.g. ['Wedding', 'Birthday Party', 'Corporate Event']
 */
function parseSuggestions(text) {
    const match = text.match(/SUGGESTIONS:\s*(.+)/);
    if (!match) return [];

    return match[1]
        .split('|')
        .map(s => s.trim().replace(/^\[|\]$/g, '').trim())
        .filter(Boolean);
}

/**
 * Strip DATA: markers and the SUGGESTIONS: line from the reply
 * so users only see the conversational text.
 */
function cleanReply(text) {
    return text
        .replace(/DATA:\{[^}]+\}/g, '')    // remove DATA:{...} markers
        .replace(/SUGGESTIONS:\s*.+/g, '') // remove SUGGESTIONS: line
        .replace(/\n{3,}/g, '\n\n')        // collapse extra blank lines
        .trim();
}

// ══════════════════════════════════════════════════════════════
// ROUTE — POST /ai-chat
// ══════════════════════════════════════════════════════════════
/*
 * Request body:  { message, history, state }
 *   message  — current user message string
 *   history  — array of { role, content } prior turns
 *   state    — current CRM state object (for context, not sent to OpenAI)
 *
 * Response:      { reply, extracted, suggestions }
 *   reply        — clean text to display in chat
 *   extracted    — CRM fields parsed from this turn
 *   suggestions  — chip labels array (may be empty)
 */
app.post('/ai-chat', async (req, res) => {
    // ── Log every incoming request ────────────────────────────
    console.log('\n[JRN AI] ── Incoming request ─────────────────────');
    console.log('  message :', req.body.message || '(empty — greeting)');
    console.log('  history :', (req.body.history || []).length, 'turns');
    console.log('─────────────────────────────────────────────────');

    try {
        const { message = '', history = [] } = req.body;

        // Keep only the last 10 turns for cost control
        const trimmedHistory = history.slice(-10);

        // Build messages array for OpenAI
        const openaiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...trimmedHistory,
            ...(message ? [{ role: 'user', content: message }] : []),
        ];

        const completion = await openai.chat.completions.create({
            model:       'gpt-4o-mini',
            messages:    openaiMessages,
            max_tokens:  400,
            temperature: 0.7,
        });

        const rawReply = completion.choices[0].message.content || '';

        const extracted    = parseDataMarkers(rawReply);
        const suggestions  = parseSuggestions(rawReply);
        const reply        = cleanReply(rawReply);

        console.log('[JRN AI] Reply     :', reply.slice(0, 80) + (reply.length > 80 ? '…' : ''));
        if (Object.keys(extracted).length) {
            console.log('[JRN AI] Extracted :', extracted);
        }
        if (suggestions.length) {
            console.log('[JRN AI] Chips     :', suggestions);
        }

        res.json({ reply, extracted, suggestions });

    } catch (err) {
        console.error('[JRN AI] Error:', err.message);

        res.status(500).json({
            error:       'AI service unavailable',
            reply:       "I'm having a little trouble on my end — please try again in a moment! 🙏",
            extracted:   {},
            suggestions: [],
        });
    }
});

// ══════════════════════════════════════════════════════════════
// ROUTE — POST /mock-submit  (local CRM stand-in)
// ══════════════════════════════════════════════════════════════
app.post('/mock-submit', (req, res) => {
    console.log('\n[JRN Mock CRM] ── Lead received ──────────────────');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('──────────────────────────────────────────────────\n');

    const sessionToken = req.body.session_token || ('mock_' + Date.now());
    res.json({ success: true, session_token: sessionToken });
});

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    const key = process.env.OPENAI_API_KEY || '';
    const keyPreview = key
        ? `${key.slice(0, 8)}...${key.slice(-4)} ✅`
        : '❌ NOT FOUND — check your .env file';

    console.log(`\n✅  JRN Events AI Proxy is running`);
    console.log(`    POST http://localhost:${PORT}/ai-chat      → OpenAI GPT-4o-mini`);
    console.log(`    POST http://localhost:${PORT}/mock-submit  → Mock CRM (logs to console)`);
    console.log(`\n    API Key loaded: ${keyPreview}\n`);
});
