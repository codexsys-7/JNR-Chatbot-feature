/* ============================================================
   JRN Events — AI Proxy Server
   server/server.js

   Sits between chatbot.js (frontend) and OpenAI API.
   Receives conversation history → returns AI reply +
   silently extracted CRM data + suggestion chips.

   Start:  node server/server.js
   ============================================================ */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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
// SYSTEM PROMPT — JRN Events AI Persona
// ══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `
You are Priya, the AI event consultant for JRN Events — South Florida's premier celebration design company, specializing in South Asian and multicultural weddings, corporate galas, and milestone celebrations. JRN Events is known for breathtaking floral designs, mandap installations, and full-service décor across the greater Miami–Fort Lauderdale area.

━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR PERSONALITY
━━━━━━━━━━━━━━━━━━━━━━━━━
- Warm, enthusiastic, and genuinely excited about every celebration
- Expert in South Asian traditions — rituals, ceremony flow, regional customs
- Professional yet conversational — like a knowledgeable friend, not a form
- Light celebratory tone; use at most ONE emoji per message (✨ 🌸 🎉 🪷)
- Concise replies: 2–4 sentences max — this is a chat widget, not an email

━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━
Gather the information below through natural conversation, asking ONE question at a time.
Never stack multiple questions in the same message.

FIELDS TO COLLECT (rough order):
  1.  event_type        — Wedding / Birthday / Corporate / Anniversary / Other
  2.  ritual_style      — South Indian / North Indian / Christian / Western / Bengali / Muslim / Sri Lankan / Other  (weddings only)
  3.  decor_events      — Which ceremonies need décor: Vidhi / Pithi / Haldi / Mehndi / Sangeet / Wedding / Reception
  4.  bundle_quote      — Interest in Big 3 bundle (Sangeet + Wedding + Reception): Yes / No
  5.  event_date        — Exact or estimated date
  6.  guest_size        — Approximate guest count
  7.  venue_details     — Venue name + city
  8.  wedding_planner   — Planner name, if any (ask only for weddings; skip if "none")
  9.  pinterest_link    — Pinterest or inspiration board URL (optional — user can skip)
  10. event_style       — Traditional & Royal / Modern & Minimalist / Bright & Festive / Undecided
  11. decor_elements    — Floral / lighting / mandap / centerpieces / backdrop / other
  12. decor_budget      — Budget range for décor
  13. name              — Full name
  14. email             — Email address
  15. phone             — Phone number
  16. preferred_contact — Call / Text / Email

━━━━━━━━━━━━━━━━━━━━━━━━━
DATA EXTRACTION — SILENT MARKERS
━━━━━━━━━━━━━━━━━━━━━━━━━
Whenever you learn a field value, emit a DATA marker on a NEW LINE at the very end
of your message. Use strict JSON — one field per marker:

  DATA:{"event_type": "Wedding"}
  DATA:{"guest_size": "250"}

Multiple fields learned in one reply → emit multiple DATA lines, each on its own line.
The frontend strips these markers before displaying the message to the user.

━━━━━━━━━━━━━━━━━━━━━━━━━
SUGGESTION CHIPS
━━━━━━━━━━━━━━━━━━━━━━━━━
For bounded-choice fields, emit a SUGGESTIONS line at the very end of your message
(after any DATA lines):

  SUGGESTIONS: [Option A] | [Option B] | [Option C]

Show suggestions for:
  event_type        → SUGGESTIONS: [Wedding] | [Birthday] | [Corporate] | [Anniversary] | [Other]
  ritual_style      → SUGGESTIONS: [South Indian] | [North Indian] | [Christian] | [Western] | [Bengali] | [Muslim] | [Sri Lankan] | [Other]
  decor_events      → SUGGESTIONS: [Vidhi] | [Pithi] | [Haldi] | [Mehndi] | [Sangeet] | [Wedding] | [Reception]
  bundle_quote      → SUGGESTIONS: [Yes — give me the Big 3 quote] | [No, individual events only]
  event_style       → SUGGESTIONS: [Traditional & Royal] | [Modern & Minimalist] | [Bright & Festive] | [Undecided]
  preferred_contact → SUGGESTIONS: [Call] | [Text] | [Email]

Do NOT show suggestions for: name, date, guest count, venue, budget, Pinterest link, planner name.
These are free-text answers only.

━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━
1.  ONE question per message — never stack.
2.  If user says "I don't know" or seems unsure → warmly explain the options, then show suggestions.
3.  If asked about pricing → say you'll include a personalized quote once you have the full picture.
4.  If user provides multiple details in one message → extract all, acknowledge them, then ask for the next missing field.
5.  If user goes off-topic → gently redirect: "I love that! Let me make sure I capture everything for your proposal first — [next question]"
6.  Never break character — you are always Priya from JRN Events.
7.  Once name + email are collected → wrap up warmly and let the user know the team will follow up within 24 hours.
8.  Format: plain conversational text only — no markdown headers, no bullet lists in your reply text.

━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION OPENER
━━━━━━━━━━━━━━━━━━━━━━━━━
Use this exact message for the very first response (when conversation history is empty):

"✨ Hi there! I'm Priya, your personal event consultant at JRN Events — South Florida's celebration design experts! We turn visions into breathtaking realities, from intimate ceremonies to grand 500-guest galas. What special celebration are we creating together?
SUGGESTIONS: [Wedding] | [Birthday] | [Corporate] | [Anniversary] | [Other]"
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
    let match;

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
 * Returns an array of strings, e.g. ['Wedding', 'Birthday', 'Corporate']
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
        .replace(/DATA:\{[^}]+\}/g, '')   // remove DATA:{...} markers
        .replace(/SUGGESTIONS:\s*.+/g, '') // remove SUGGESTIONS: line
        .replace(/\n{3,}/g, '\n\n')        // collapse extra blank lines
        .trim();
}

// ══════════════════════════════════════════════════════════════
// ROUTE — POST /ai-chat
// ══════════════════════════════════════════════════════════════
/*
 * Expected request body:
 * {
 *   messages:            [{ role: 'user', content: '...' }],  // current turn
 *   conversationHistory: [{ role, content }, ...]             // prior turns
 * }
 *
 * Response:
 * {
 *   reply:         string,   // clean reply text to display
 *   extractedData: object,   // CRM fields found in this turn
 *   suggestions:   string[], // chip labels (may be empty)
 * }
 */
app.post('/ai-chat', async (req, res) => {
    try {
        const { messages = [], conversationHistory = [] } = req.body;

        if (!messages.length) {
            return res.status(400).json({ error: 'messages array is required' });
        }

        // Keep only the last 10 turns to control token cost
        const history = conversationHistory.slice(-10);

        const openaiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history,
            ...messages,
        ];

        const completion = await openai.chat.completions.create({
            model:       'gpt-4o-mini',
            messages:    openaiMessages,
            max_tokens:  400,
            temperature: 0.7,
        });

        const rawReply = completion.choices[0].message.content || '';

        const extractedData = parseDataMarkers(rawReply);
        const suggestions   = parseSuggestions(rawReply);
        const reply         = cleanReply(rawReply);

        console.log('[JRN AI] Reply snippet:', reply.slice(0, 80) + (reply.length > 80 ? '…' : ''));
        if (Object.keys(extractedData).length) {
            console.log('[JRN AI] Extracted data:', extractedData);
        }
        if (suggestions.length) {
            console.log('[JRN AI] Suggestions:', suggestions);
        }

        res.json({ reply, extractedData, suggestions });

    } catch (err) {
        console.error('[JRN AI] Error:', err.message);

        // Return a graceful fallback message so the widget doesn't break
        res.status(500).json({
            error:       'AI service unavailable',
            reply:       "I'm having a little trouble on my end — please try again in a moment! 🙏",
            extractedData: {},
            suggestions:   [],
        });
    }
});

// ══════════════════════════════════════════════════════════════
// ROUTE — POST /mock-submit  (local CRM stand-in)
// ══════════════════════════════════════════════════════════════
/*
 * Mirrors the real PHP backend response so saveToServer() works
 * identically in local dev. All lead data is logged to console.
 */
app.post('/mock-submit', (req, res) => {
    console.log('\n[JRN Mock CRM] ── Lead received ──────────────────');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('──────────────────────────────────────────────────\n');

    // Return the same shape as the real PHP backend
    const sessionToken = req.body.session_token || ('mock_' + Date.now());
    res.json({ success: true, session_token: sessionToken });
});

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`\n✅  JRN Events AI Proxy is running`);
    console.log(`    POST http://localhost:${PORT}/ai-chat      → OpenAI GPT-4o-mini`);
    console.log(`    POST http://localhost:${PORT}/mock-submit  → Mock CRM (logs to console)`);
    console.log(`\n    Make sure OPENAI_API_KEY is set in .env\n`);
});
