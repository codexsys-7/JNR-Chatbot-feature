/**
 * test-server.js — Quick local test for the AI proxy
 * Run: node test-server.js
 * (Make sure server is running first: npm run dev)
 */

(async () => {
    const res = await fetch('http://localhost:3001/ai-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            message: 'Hi, I want to plan a wedding',
            history: [],
            state:   {}
        })
    });

    const data = await res.json();

    console.log('\n─── JRN AI Test Response ───────────────────────────');
    console.log('reply      :', data.reply);
    console.log('extracted  :', data.extracted);
    console.log('suggestions:', data.suggestions);
    console.log('────────────────────────────────────────────────────\n');
})();
