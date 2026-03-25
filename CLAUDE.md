# JRN Events — AI Chatbot Upgrade
## CLAUDE.md · Project Context & Build Guide

---

## 🧭 What We're Building

Upgrading the existing **static decision-tree chatbot** on [jrnevents.com](https://jrnevents.com) into a **dynamic, AI-powered conversational chatbot** that:

- Understands plain English from users
- Asks questions naturally (one topic at a time)
- Suggests clickable options when helpful (ritual style, event type, aesthetics)
- Extracts structured lead data silently and saves it to the existing CRM backend
- Requires **zero changes** to the existing backend or CRM

---

## 🗂️ Project Structure

```
jrn-chatbot/
├── chatbot.js              ← MAIN: AI conversation engine (replaces decision tree)
├── chatbot.css             ← Styles (copied from live site + chip/typing additions)
├── widget.js               ← Widget loader (copied from live site, unchanged)
├── index.html              ← Local test harness (mimics live site widget)
├── server/
│   └── server.js           ← Node.js/Express AI proxy (calls OpenAI)
├── .env                    ← API keys (never commit)
├── .env.example            ← Safe template (commit this)
├── .gitignore
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| AI Model | GPT-4o-mini | Cost-efficient, handles event FAQ well |
| AI Proxy | Node.js + Express | Runs locally on port 3001 |
| Frontend | Vanilla JS | Minimal changes to existing chatbot.js |
| Styling | Existing CSS + additions | Suggestion chips, typing indicator |
| CRM Save | Existing `saveToServer()` | Untouched — fires when AI extracts fields |
| Version Control | GitHub (private repo) | Branch: `main` → `dev` → feature branches |

---

## 🔑 Environment Variables

```
# .env (never commit)
OPENAI_API_KEY=sk-your-key-here

# In chatbot.js — switch for deploy:
const AI_ENDPOINT = 'http://localhost:3001/ai-chat';   // local dev
const AI_ENDPOINT = '/chatbot/ai-chat.php';             // production
```

---

## 📋 Data Fields Being Collected

These fields map directly to the existing CRM schema (from `saveToServer()`):

| Field | What It Captures |
|---|---|
| `event_type` | Wedding, Birthday, Corporate, etc. |
| `ritual_style` | South Indian, North Indian, Christian, etc. |
| `decor_events` | Vidhi, Pithi, Haldi, Mehndi, Sangeet, Wedding, Reception |
| `bundle_quote` | Yes/No for Big 3 bundle (Sangeet + Wedding + Reception) |
| `event_date` | Exact or estimated date |
| `guest_size` | Number of guests |
| `venue_details` | Venue name + city |
| `wedding_planner` | Planner name (if applicable) |
| `pinterest_link` | Inspiration board URL |
| `event_style` | Traditional & Royal / Modern & Minimalist / Bright & Festive / Undecided |
| `decor_elements` | Floral, lighting, mandap, centerpieces, backdrop, etc. |
| `decor_budget` | Budget range |
| `name` | Full name |
| `email` | Email address |
| `phone` | Phone number |
| `preferred_contact` | Call / Text / Email |
| `status` | Lead status (auto-set to `complete` at end) |

---

## 🤖 AI Behavior Rules (System Prompt Design)

The AI is instructed to:

1. **Converse naturally** — ask one topic at a time, never dump all questions at once
2. **Extract silently** — parse fields from user responses and emit `DATA:{...}` markers
3. **Suggest when helpful** — emit `SUGGESTIONS: [opt1] | [opt2]` for bounded choices
4. **Guide the unsure** — if user says "I don't know", explain options warmly
5. **Celebrate the moment** — warm, festive tone; acknowledge their event with genuine excitement
6. **Never break character** — stay as JRN Events assistant always

**Suggestion triggers** (show chips):
- Event type → `[Wedding] [Birthday] [Corporate] [Other]`
- Ritual style → `[South Indian] [North Indian] [Christian] [Western] [Other]`
- Event style → `[Traditional & Royal] [Modern & Minimalist] [Bright & Festive] [Undecided]`
- Decor events → `[Vidhi] [Pithi] [Haldi] [Mehndi] [Sangeet] [Wedding] [Reception]`

**No suggestions for:** name, date, guest count, venue, budget, Pinterest link (free-text only)

---

## ⚙️ Architecture — Before vs After

```
BEFORE:
User clicks button
  → chatbot.js decision tree (hardcoded responses)
  → saveToServer() → PHP backend → CRM

AFTER:
User types OR clicks chip
  → chatbot.js sends message + history to AI proxy
  → server.js calls OpenAI GPT-4o-mini
  → AI responds with reply + extracted fields + suggestions
  → chatbot.js renders reply, shows chips, calls saveToServer()
  → PHP backend → CRM (UNCHANGED)
```

---

## 🚀 Local Dev Setup

```bash
# 1. Clone repo
git clone https://github.com/YOUR_USERNAME/jrn-chatbot.git
cd jrn-chatbot

# 2. Install dependencies
npm install

# 3. Add your API key
cp .env.example .env
# Edit .env → add OPENAI_API_KEY

# 4. Start AI proxy server
node server/server.js
# → ✅ Running on http://localhost:3001

# 5. Open test page
# Open index.html in browser (use Live Server VS Code extension)
```

---

## 🐙 Git Workflow

```bash
# Branch structure
main          ← stable, client-ready code only
dev           ← integration branch
feature/*     ← individual feature work

# Daily workflow
git checkout dev
git checkout -b feature/suggestion-chips
# ... make changes ...
git add .
git commit -m "feat: add suggestion chips for ritual style"
git push origin feature/suggestion-chips
# → Open PR into dev → review → merge
```

---

## 🧪 Testing Checklist

Before sending to client, test these scenarios manually:

- [ ] User types "I want a wedding" → AI asks follow-up naturally
- [ ] User types multi-field answer ("South Indian wedding, 500 guests, March 2026") → AI extracts all three
- [ ] User clicks a suggestion chip → works same as typing
- [ ] User says "I don't know" → AI explains options, shows suggestions
- [ ] User gives an unrelated message → AI redirects gracefully
- [ ] All fields collected → `saveToServer()` fires → check CRM entry
- [ ] Network tab confirms POST to `/chatbot/` backend with correct payload
- [ ] Typing indicator appears during AI response delay
- [ ] Works on mobile (responsive)

---

## 💰 Cost Estimate (GPT-4o-mini)

| Volume | Estimated Cost |
|---|---|
| 500 conversations/month | ~$0.50 |
| 2,000 conversations/month | ~$2.00 |
| 10,000 conversations/month | ~$10.00 |

**Cost controls built in:**
- Only last 10 messages sent to API (not full history)
- `max_tokens: 400` cap on responses
- Keyword pre-filter for simple queries (future optimization)

---

## 🚢 Production Deployment

When ready to go live on `jrnevents.com`:

1. Change `AI_ENDPOINT` in `chatbot.js` from `localhost:3001` to `/chatbot/ai-chat.php`
2. Upload `ai-chat.php` to server at `/chatbot/ai-chat.php`
3. Add `OPENAI_API_KEY` to server environment (or hardcode securely in PHP — not in JS)
4. Upload updated `chatbot.js` and `chatbot.css`
5. Test on live site via browser DevTools → Network tab
6. Monitor CRM for new leads to confirm `saveToServer()` is firing correctly

---

## 📁 Files to Get From Live Site

Download these from DevTools → Sources before starting:

| File | URL |
|---|---|
| `chatbot.js` | jrnevents.com/chatbot/chatbot.js |
| `chatbot.css` | jrnevents.com/chatbot/chatbot.css |
| `widget.js` | jrnevents.com/chatbot/widget.js |

---

## 🔗 Key References

- Live site: https://jrnevents.com
- Catalog: https://jrnevents.com/catalog/login.php
- CRM leads: (internal link — check with client)
- OpenAI API: https://platform.openai.com/api-keys
- OpenAI pricing: https://openai.com/api/pricing (gpt-4o-mini)

---

*Project: JRN Events AI Chatbot · Stack: GPT-4o-mini + Node.js + Vanilla JS · Goal: Replace static decision tree with dynamic AI conversation*
