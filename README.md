# JRN Events — AI Chatbot

Upgrading the existing static decision-tree chatbot on [jrnevents.com](https://jrnevents.com) into a dynamic, AI-powered conversational chatbot using GPT-4o-mini.

---

## Description

The chatbot understands plain English, asks questions naturally one at a time, suggests clickable options for bounded choices, and silently extracts structured lead data into the existing CRM backend — with zero changes to the backend.

---

## Local Setup

**1. Clone the repo**
```bash
git clone https://github.com/YOUR_USERNAME/jrn-chatbot.git
cd jrn-chatbot
```

**2. Install dependencies**
```bash
npm install
```

**3. Add your API key**
```bash
cp .env.example .env
```
Then open `.env` and replace `your_openai_key_here` with your real OpenAI API key.

**4. Start the AI proxy server**
```bash
npm run dev
```
Server runs at `http://localhost:3001`

**5. Open the test page**

Open `index.html` using the **Live Server** extension in VS Code (runs on port 5500).

---

## How to Test

- Click the chat bubble in the bottom-right corner
- Type a message or click a suggestion chip
- Check the terminal — extracted lead data logs on every `saveToServer()` call
- Check browser DevTools → Network tab for POST calls to `/mock-submit`

---

## Project Structure

```
jrn-chatbot/
├── chatbot.js          ← AI conversation engine (replaces decision tree)
├── chatbot.css         ← Widget styles
├── widget.js           ← Widget loader (unchanged)
├── index.html          ← Local test harness
├── server/
│   └── server.js       ← Node.js/Express AI proxy (calls OpenAI)
├── .env                ← Your API key (never commit)
├── .env.example        ← Safe template (commit this)
└── README.md
```

---

## Switch to Production

In `chatbot.js`, change:
```js
const AI_ENDPOINT = 'http://localhost:3001/ai-chat';   // local
const AI_ENDPOINT = '/chatbot/ai-chat.php';             // production
```
