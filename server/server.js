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

CORE RULES:
- Ask one topic at a time
- Be warm and celebratory
- When you collect a field, append: DATA:{"fieldname":"value"}
- When offering bounded choices, append: SUGGESTIONS:[opt1]|[opt2]|[opt3]
- Show suggestions for: event_type, ritual_style, event_style, decor_events
- Never show suggestions for: name, date, guest count, budget, email, phone

NEVER RE-ASK COLLECTED FIELDS:
- A section labeled "FIELDS ALREADY COLLECTED" will appear before each message
- Never ask for any field listed there — it is already answered
- Do not re-confirm, re-summarise, or circle back to those fields
- Pick up from the next uncollected field in the list above

TOPIC PERSISTENCE:
- If the user goes off-topic or asks a side question, answer it briefly and warmly
- Then immediately return to the exact field you were collecting before the deviation
- Use a natural transition like "Now, back to your event — ..."
- Never restart the conversation from the beginning after a tangent

OPTION DISPLAY RULE:
- When presenting bounded choices, ALWAYS list every option as a bullet point inside the message
  text, then append the SUGGESTIONS: chip line underneath
- Never say "here are the options:" and then omit the list — the user must see the options in
  the message itself, not only as chips at the bottom of the screen
- Keep each description concise — one short phrase per option

IMPLICIT FIELD EXTRACTION:
- If the user's opening message clearly implies a field value, extract it with DATA:{} immediately
  without asking for it again later
- Examples:
    "western white wedding"   → DATA:{"event_type":"Wedding"} DATA:{"ritual_style":"Western"}
    "south indian wedding"    → DATA:{"event_type":"Wedding"} DATA:{"ritual_style":"South Indian"}
    "church wedding"          → DATA:{"event_type":"Wedding"} DATA:{"ritual_style":"Christian"}
    "birthday party for mom"  → DATA:{"event_type":"Birthday Party"}
- Always honour explicit corrections — if the user says "no, western not south indian",
  immediately update ritual_style to Western and never show South Asian ceremony events again

DECOR EVENTS — CONTEXT RULE (CRITICAL):
- decor_events options MUST match the user's ritual_style
- For South Indian or North Indian weddings:
    Offer: Vidhi, Pithi, Haldi/Holuad, Mehndi/Henna, Grah Shanthi, Sangeet, Wedding, Reception
- For Western, Christian, or Other weddings:
    Offer ONLY: Wedding, Reception
    NEVER mention Vidhi, Pithi, Haldi, Mehndi, Grah Shanthi, or Sangeet — these are South Asian
    ceremonies and are completely irrelevant for Western or Christian celebrations
- If ritual_style is unknown, ask for it before asking about decor_events

DECOR EVENTS — MULTI-SELECT RULE (CRITICAL):
- decor_events is a MULTI-SELECT field — users typically celebrate more than one event
- After the user names one event, always respond with that selection acknowledged, then ask:
  "Are there any other events you'll be celebrating, or is that everything?"
- Keep showing the remaining options as chips until the user says they are done
- Only once the user confirms they are finished, store the full comma-separated list:
  DATA:{"decor_events":"Wedding,Reception"}
- Do NOT move to the next field (event_style, decor_budget, etc.) until the user
  explicitly says they are done selecting events

SUGGESTION VALUES AND DESCRIPTIONS:
- event_type:
    Wedding (celebrating your union with loved ones)
    Birthday Party (milestone celebrations — sweet 16, 50th, quinceañera, etc.)
    Corporate Event (galas, award nights, brand activations, conferences)
    Other (anniversaries, baby showers, engagements, and more)

- ritual_style:
    South Indian (silk sarees, kolam, elaborate multi-day rituals)
    North Indian (vibrant baraat, fire rituals, heavy floral mandaps)
    Christian (elegant, cross-focused ceremony with classic florals)
    Western (modern, romantic, non-denominational celebration)
    Other (mixed cultures, fusion ceremonies, or something unique)

- event_style:
    Traditional & Royal (rich fabrics, majestic florals, regal gold tones)
    Modern & Minimalist (clean lines, subtle tones, sleek contemporary décor)
    Bright & Festive (bold colors, playful energy, maximum celebration vibes)
    Undecided (share your vibe and we'll guide you to the perfect look)

- decor_events:
    South Indian / North Indian → SUGGESTIONS:[Vidhi]|[Pithi]|[Haldi/Holuad]|[Mehndi/Henna]|[Grah Shanthi]|[Sangeet]|[Wedding]|[Reception]
    Western / Christian / Other → SUGGESTIONS:[Wedding]|[Reception]
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
        .replace(/DATA:\{[^}]+\}/g, '')               // remove DATA:{...} markers
        .replace(/SUGGESTIONS:\s*.+/g, '')             // remove SUGGESTIONS: line
        .replace(/FIELDS ALREADY COLLECTED:[\s\S]*/gi, '') // strip any leaked state context
        .replace(/\n{3,}/g, '\n\n')                    // collapse extra blank lines
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
        const { message = '', history = [], state = {} } = req.body;

        // Keep only the last 10 turns for cost control
        const trimmedHistory = history.slice(-10);

        // Build messages array for OpenAI
        const openaiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...trimmedHistory,
        ];

        // Inject already-collected fields as fresh context right before the new message.
        // This is the key fix for "AI re-asks already answered questions" — the AI always
        // knows the current state regardless of how much history has been trimmed.
        const collectedEntries = Object.entries(state)
            .filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'session_token')
            .map(([k, v]) => `  ${k}: "${v}"`)
            .join('\n');

        if (collectedEntries) {
            openaiMessages.push({
                role:    'system',
                content: `FIELDS ALREADY COLLECTED — do NOT ask for these again:\n${collectedEntries}`,
            });
        }

        if (message) {
            openaiMessages.push({ role: 'user', content: message });
        }

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
