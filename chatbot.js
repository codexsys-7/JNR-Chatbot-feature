/* ============================================================
   JRN Events Chatbot Widget – chatbot.js
   ============================================================ */

(function () {
    'use strict';

    const SUBMIT_URL          = window.JRN_SUBMIT_URL        || 'chatbot/submit';
    const BRAND_LOGO          = window.JRN_BRAND_LOGO        || '';
    const DELAY_SHORT         = 600;
    const DELAY_MED           = 1100;
    const FULL_CATALOGUE_LINK = window.JRN_CATALOGUE_URL     || 'catalog';

    /*
     * STATE
     * ─────
     * Fields are set to undefined by default (not null, not []).
     * saveToServer() strips out undefined fields before sending,
     * so the server only ever receives fields that have been
     * explicitly answered by the user.
     *
     * This is the core fix: services and budget are NEVER sent
     * to the server until the user actually answers those questions.
     */
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

    let step = 0;

    let $toggle, $window, $messages, $inputArea, $textInput, $sendBtn, $progressBar;

    // ── Helpers ─────────────────────────────────────────────────

    function scrollBottom() {
        setTimeout(() => {
            if ($messages) {
                $messages.scrollTop = $messages.scrollHeight;
                $messages.scrollTo({ top: $messages.scrollHeight, behavior: 'smooth' });
            }
        }, 50);
    }

    function setProgress(pct) {
        if ($progressBar) $progressBar.style.width = pct + '%';
    }

    function showTyping() {
        hideTyping();
        const el = document.createElement('div');
        el.className = 'jrn-bubble jrn-bot jrn-typing';
        el.id = 'jrn-typing-ind';
        el.innerHTML = '<span><i></i><i></i><i></i></span>';
        $messages.appendChild(el);
        scrollBottom();
    }

    function hideTyping() {
        const el = document.getElementById('jrn-typing-ind');
        if (el) el.remove();
    }

    function addBotMessage(html, delay) {
        delay = delay || 0;
        return new Promise(function(resolve) {
            setTimeout(function() {
                hideTyping();
                const el = document.createElement('div');
                el.className = 'jrn-bubble jrn-bot';
                el.innerHTML = html;
                $messages.appendChild(el);
                scrollBottom();
                resolve(el);
            }, delay);
        });
    }

    function addUserBubble(text) {
        const el = document.createElement('div');
        el.className = 'jrn-bubble jrn-user';
        el.textContent = text;
        $messages.appendChild(el);
        scrollBottom();
    }

    function addOptions(options, onSelect, multi) {
        multi = multi || false;
        removeOptions();

        const wrap = document.createElement('div');
        wrap.className = 'jrn-options';
        wrap.id = 'jrn-current-opts';

        const selected = new Set();

        options.forEach(function(opt) {
            const btn      = document.createElement('button');
            const labelStr = opt.label || opt;
            const valueStr = opt.value || labelStr;

            btn.className = 'jrn-opt' + (multi ? ' multi' : '');

            if (multi) {
                btn.innerHTML = '<span class="chk">☐</span> ' + labelStr;
            } else {
                btn.textContent = labelStr;
            }

            btn.onclick = function() {
                if (multi) {
                    if (selected.has(valueStr)) {
                        selected.delete(valueStr);
                        btn.classList.remove('selected');
                        btn.innerHTML = '<span class="chk">☐</span> ' + labelStr;
                    } else {
                        selected.add(valueStr);
                        btn.classList.add('selected');
                        btn.innerHTML = '<span class="chk">☑</span> ' + labelStr;
                    }
                } else {
                    wrap.querySelectorAll('.jrn-opt').forEach(function(b) { b.classList.remove('selected'); });
                    btn.classList.add('selected');
                    setTimeout(function() { onSelect(valueStr, labelStr); }, 200);
                }
            };

            wrap.appendChild(btn);
        });

        if (multi) {
            const done = document.createElement('button');
            done.className = 'jrn-opt';
            done.textContent = 'Done';
            done.style.background  = 'linear-gradient(135deg,#8B5E0A,#AC7820)';
            done.style.color       = '#fff';
            done.style.borderColor = '#8B5E0A';
            done.onclick = function() {
                if (selected.size === 0) selected.add('Not Sure — Guide Me');
                onSelect(Array.from(selected), Array.from(selected).join(', '));
            };
            wrap.appendChild(done);
        }

        $messages.appendChild(wrap);
        scrollBottom();
        return wrap;
    }

    function removeOptions() {
        const el = document.getElementById('jrn-current-opts');
        if (el) el.remove();
    }

    function showInput(placeholder) {
        $textInput.placeholder = placeholder || 'Type here…';
        $textInput.value = '';
        $textInput.style.height = 'auto';
        $inputArea.style.display = 'flex';
        $messages.style.paddingBottom = '80px';
        setTimeout(function() { $textInput.focus(); }, 50);
    }

    function hideInput() {
        if ($inputArea) $inputArea.style.display = 'none';
        if ($messages)  $messages.style.paddingBottom = '20px';
    }

    function formatDateDisplay(dateStr) {
        const parts = dateStr.split('-');
        return parts[1] + '/' + parts[2] + '/' + parts[0];
    }

    function showDatePicker(onSelect) {
        hideInput();
        removeOptions();

        const wrap = document.createElement('div');
        wrap.className = 'jrn-options';
        wrap.id = 'jrn-current-opts';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems    = 'flex-start';
        wrap.style.gap           = '8px';

        const inp = document.createElement('input');
        inp.type = 'date';
        inp.id   = 'jrn-date-input';
        inp.min  = new Date().toISOString().split('T')[0];
        inp.style.cssText = 'padding:10px;border-radius:8px;border:1px solid #ccc;font-family:inherit;width:100%;max-width:250px;';

        const btn = document.createElement('button');
        btn.className   = 'jrn-opt';
        btn.textContent = 'Confirm Date';
        btn.style.cssText = 'width:100%;max-width:250px;';

        btn.onclick = function() {
            const d = inp.value;
            if (!d) {
                inp.style.borderColor = '#c0392b';
                setTimeout(function() { inp.style.borderColor = '#ccc'; }, 1000);
                return;
            }
            onSelect(d, formatDateDisplay(d));
        };

        wrap.appendChild(inp);
        wrap.appendChild(btn);
        $messages.appendChild(wrap);
        scrollBottom();
    }

    function isValidEmail(email) {
        return /^(?!.*\.\.)([A-Za-z0-9]+[A-Za-z0-9._%+-]*)@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(email);
    }

    // ── saveToServer ─────────────────────────────────────────────
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

    // ══════════════════════════════════════════════════════════════
    // STEP 1 — Choose flow
    // ══════════════════════════════════════════════════════════════

    function startStep1() {
        step = 1;
        setProgress(5);
        hideInput();
        showTyping();

        addBotMessage('<strong>Hi! Welcome to JRN Events</strong> — South Florida\'s celebration experts!<br>What special moment are we planning today?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Wedding' },
                { label: 'Other Occasions' }
            ], function(val, label) {
                removeOptions();
                state.event_type = label;
                addUserBubble(label);
                saveToServer();
                if (label === 'Wedding') {
                    startWedding2();
                } else {
                    startOther2();
                }
            });
        });
    }

    // ══════════════════════════════════════════════════════════════
    // WEDDING FLOW  (steps 2–14)
    // services → step 13
    // budget   → step 14
    // ══════════════════════════════════════════════════════════════

    function startWedding2() {
        step = 2;
        setProgress(15);
        showTyping();
        addBotMessage('What is your ritual style?', DELAY_MED).then(function() {
            addOptions([
                { label: 'South Indian' },
                { label: 'North Indian' },
                { label: 'Bengali' },
                { label: 'Muslim' },
                { label: 'Christian' },
                { label: 'Punjabi' },
                { label: 'Sri Lankan' },
                { label: 'Type My Own', value: 'custom' }
            ], function(val, label) {
                removeOptions();
                if (val === 'custom') { showInput('Type your ritual style'); return; }
                state.ritual_style = label;
                addUserBubble(label);
                saveToServer();
                startWedding3();
            });
        });
    }

    function startWedding3() {
        step = 3;
        setProgress(22);
        showTyping();
        addBotMessage('Which of these events do you need decor for? Check all that apply.', DELAY_MED).then(function() {
            addOptions([
                { label: 'Vidhi' }, { label: 'Pithi' }, { label: 'Haldi / Holuad' },
                { label: 'Grah Shanthi' }, { label: 'Mehndi (Henna)' },
                { label: 'Sangeet' }, { label: 'Wedding' }, { label: 'Reception' }
            ], function(selected) {
                removeOptions();
                state.decor_events = Array.isArray(selected) ? selected : [selected];
                addUserBubble(state.decor_events.join(', '));
                saveToServer();
                startWedding4();
            }, true);
        });
    }

    function startWedding4() {
        step = 4;
        setProgress(29);
        showTyping();
        addBotMessage('Most couples book us for the Big 3: Sangeet, Wedding, and Reception.<br>Would you like a bundle quote for all three?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Yes' }, { label: 'No' }, { label: 'Maybe later' }
            ], function(val, label) {
                removeOptions();
                state.bundle_quote = label;
                addUserBubble(label);
                saveToServer();
                startWedding5();
            });
        });
    }

    function startWedding5() {
        step = 5;
        setProgress(36);
        showTyping();
        addBotMessage('Beautiful! What is the exact or estimated date(s) for your event?', DELAY_MED).then(function() {
            showDatePicker(function(rawDate, displayDate) {
                removeOptions();
                state.event_date = rawDate;
                addUserBubble(displayDate);
                saveToServer();
                startWedding6();
            });
        });
    }

    function startWedding6() {
        step = 6;
        setProgress(43);
        showTyping();
        addBotMessage('Estimated Guest Count?', DELAY_MED).then(function() { showInput('Number of guests'); });
    }

    function startWedding7() {
        step = 7;
        setProgress(50);
        showTyping();
        addBotMessage('Have you secured a venue yet? If so, what is the name and city?', DELAY_MED).then(function() { showInput('e.g. The Breakers, Palm Beach'); });
    }

    function startWedding8() {
        step = 8;
        setProgress(55);
        showTyping();
        addBotMessage('Are you working with a Wedding Planner? If so, who?', DELAY_MED).then(function() { showInput('Planner name or "No"'); });
    }

    function startWedding9() {
        step = 9;
        setProgress(60);
        showTyping();
        addBotMessage('Do you have a Pinterest board or inspiration link to share?', DELAY_MED).then(function() { showInput('Link or "Not yet"'); });
    }

    function startWedding10() {
        step = 10;
        setProgress(65);
        showTyping();
        addBotMessage('How would you describe the vibe or aesthetic you are going for?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Traditional & Royal' }, { label: 'Modern & Minimalist' },
                { label: 'Bright & Festive' },    { label: 'Undecided' }
            ], function(val, label) {
                removeOptions();
                state.event_style = label;
                addUserBubble(label);
                saveToServer();
                startWedding11();
            });
        });
    }

    function startWedding11() {
        step = 11;
        setProgress(70);
        showTyping();
        addBotMessage('Which main decor elements do you know you\'ll need?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Mandap/Stage' }, { label: 'Centerpieces' },
                { label: 'Entrance Decor' }, { label: 'Fresh Florals' },
                { label: 'Mix of Fresh & Silk Florals (Non-Touch Areas)' },
                { label: 'Silk Florals only' }
            ], function(selected) {
                removeOptions();
                state.decor_elements = Array.isArray(selected) ? selected : [selected];
                addUserBubble(state.decor_elements.join(', '));
                saveToServer();
                showTyping();
                addBotMessage('Need a full overview of our items? <a href="' + FULL_CATALOGUE_LINK + '" target="_blank" style="color:#8B5E0A;text-decoration:underline;font-weight:bold;">Click here to view our Full Catalogue</a>.', DELAY_MED).then(function() {
                    startWedding12();
                });
            }, true);
        });
    }

    function startWedding12() {
        step = 12;
        setProgress(75);
        showTyping();
        addBotMessage('What is your comfortable investment range for decor?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Under $10k' }, { label: '$10k - $25k' },
                { label: '$25k - $50k' }, { label: '$50k+' }
            ], function(val, label) {
                removeOptions();
                state.decor_budget = label;
                addUserBubble(label);
                saveToServer();
                startWedding13();
            });
        });
    }

    // ── Step 13: services (WEDDING) ───────────────────────────────
    function startWedding13() {
        step = 13;
        setProgress(83);
        showTyping();
        addBotMessage('Do you need help with any additional services for your wedding? Select all that apply.', DELAY_MED).then(function() {
            addOptions([
                { label: 'Full Planning' },
                { label: 'Day Co-ordination' },
                { label: 'Venue Selection' },
                { label: 'DJ / MC' },
                { label: 'Photo & Video' },
                { label: 'Catering Coordination' },
                { label: 'Artists / Special Performers' },
                { label: 'Photo Booth' }
            ], function(selected) {
                removeOptions();
                // Set services — now it is defined, not undefined
                state.services = Array.isArray(selected) ? selected : [selected];
                addUserBubble(state.services.join(', '));
                console.log('[JRN] Wedding services set:', state.services);
                saveToServer();
                startWedding14();
            }, true);
        });
    }

    // ── Step 14: overall budget (WEDDING) ─────────────────────────
    function startWedding14() {
        step = 14;
        setProgress(92);
        showTyping();
        addBotMessage('What is your overall budget range for the entire wedding?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Under $10k' },
                { label: '$10k – $25,000' },
                { label: '$25,000 – $50,000' },
                { label: '$50,000+' },
                { label: 'Prefer to discuss later' }
            ], function(val, label) {
                removeOptions();
                // Set budget — now it is defined, not undefined
                state.budget = label;
                addUserBubble(label);
                console.log('[JRN] Wedding budget set:', state.budget);
                saveToServer();
                startForm('You\'re all set! Please share your contact details so our team can send over your personalized proposal.');
            });
        });
    }

    // ══════════════════════════════════════════════════════════════
    // OTHER OCCASIONS FLOW  (steps 20–26)
    // services → step 25
    // budget   → step 26
    // ══════════════════════════════════════════════════════════════

    function startOther2() {
        step = 20;
        setProgress(15);
        showTyping();
        addBotMessage('Namaste! We are excited to help. To start, what\'s the big occasion?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Anniversary' }, { label: 'Kids Birthday' },
                { label: 'Baby shower' }, { label: 'Sweet 16' },
                { label: 'Arangetram' }, { label: 'Graduation' },
                { label: 'Housewarming' }, { label: 'Milestone Birthdays' },
                { label: 'Retirement' }, { label: 'Gala\'s' },
                { label: 'Social Gathering' }
            ], function(val, label) {
                removeOptions();
                state.event_type = label;
                addUserBubble(label);
                saveToServer();
                startOther3();
            });
        });
    }

    function startOther3() {
        step = 21;
        setProgress(26);
        showTyping();
        addBotMessage('Beautiful! And when is the celebration?', DELAY_MED).then(function() {
            showDatePicker(function(rawDate, displayDate) {
                removeOptions();
                state.event_date = rawDate;
                addUserBubble(displayDate);
                saveToServer();
                startOther4();
            });
        });
    }

    function startOther4() {
        step = 22;
        setProgress(37);
        showTyping();
        addBotMessage('Got it. Roughly how many guests are expected?', DELAY_MED).then(function() { showInput('Guest count'); });
    }

    function startOther5() {
        step = 23;
        setProgress(48);
        showTyping();
        addBotMessage('Location of the event?', DELAY_MED).then(function() { showInput('City or Venue name'); });
    }

    function startOther6() {
        step = 24;
        setProgress(59);
        showTyping();
        addBotMessage('Do you have a specific budget range in mind for the decor?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Under $2500' }, { label: '$2500 – $7,000' },
                { label: '$7,000 – $15,000' }, { label: '$20,000+' },
                { label: 'Prefer to discuss later' }
            ], function(val, label) {
                removeOptions();
                state.decor_budget = label;
                addUserBubble(label);
                saveToServer();
                showTyping();
                addBotMessage('Need a full overview of our items? <a href="' + FULL_CATALOGUE_LINK + '" target="_blank" style="color:#8B5E0A;text-decoration:underline;font-weight:bold;">Click here to view our Full Catalogue</a>.', DELAY_MED).then(function() {
                    startOther7();
                });
            });
        });
    }

    // ── Step 25: services (OTHER) ─────────────────────────────────
    function startOther7() {
        step = 25;
        setProgress(70);
        showTyping();
        addBotMessage('Do you need help with any of the following services? Select all that apply.', DELAY_MED).then(function() {
            addOptions([
                { label: 'Full Planning' }, { label: 'Day Co-ordination' },
                { label: 'Venue Selection' }, { label: 'DJ / MC' },
                { label: 'Photo & Video' }, { label: 'Catering Coordination' },
                { label: 'Artists / Special Performers' }, { label: 'Photo Booth' }
            ], function(selected) {
                removeOptions();
                state.services = Array.isArray(selected) ? selected : [selected];
                addUserBubble(state.services.join(', '));
                console.log('[JRN] Other services set:', state.services);
                saveToServer();
                startOther8();
            }, true);
        });
    }

    // ── Step 26: budget (OTHER) ───────────────────────────────────
    function startOther8() {
        step = 26;
        setProgress(82);
        showTyping();
        addBotMessage('Do you have a specific budget range for the entire event?', DELAY_MED).then(function() {
            addOptions([
                { label: 'Under $10k' }, { label: '$10k – $25,000' },
                { label: '$25,000+' }, { label: 'Prefer to discuss later' }
            ], function(val, label) {
                removeOptions();
                state.budget = label;
                addUserBubble(label);
                console.log('[JRN] Other budget set:', state.budget);
                saveToServer();
                startForm('Perfect. Drop your contact details and our team will send over a customized quote.');
            });
        });
    }

    // ══════════════════════════════════════════════════════════════
    // SHARED FINAL FORM
    // ══════════════════════════════════════════════════════════════

    function startForm(message) {
        step = 100;
        setProgress(100);
        hideInput();
        removeOptions();
        showTyping();

        addBotMessage(message, DELAY_MED).then(function() {
            const form = document.createElement('div');
            form.className = 'jrn-form-group';
            form.innerHTML =
                '<div class="jrn-form-field"><label>Name</label>' +
                '<input type="text" id="jrn-f-name" placeholder="e.g. Priya Sharma"></div>' +
                '<div class="jrn-form-field"><label>Email</label>' +
                '<input type="email" id="jrn-f-email" placeholder="you@example.com"></div>' +
                '<div class="jrn-form-field"><label>Phone</label>' +
                '<div style="display:flex;align-items:center;border:1px solid #ddd;border-radius:10px;overflow:hidden;background:#fff;">' +
                '<span style="padding:12px 10px;background:#f7f7f7;border-right:1px solid #ddd;color:#555;font-weight:600;">+1</span>' +
                '<input type="tel" id="jrn-f-phone" placeholder="Phone Number" style="border:none;outline:none;flex:1;padding:12px 10px;background:transparent;"></div></div>' +
                '<div class="jrn-form-field"><label>Preferred Contact</label>' +
                '<div class="jrn-pref-btns">' +
                '<button class="jrn-pref-btn selected" data-val="Email" type="button">Email</button>' +
                '<button class="jrn-pref-btn" data-val="Text" type="button">Text</button>' +
                '<button class="jrn-pref-btn" data-val="Call" type="button">Call</button>' +
                '</div></div>' +
                '<button class="jrn-submit-btn" id="jrn-final-submit" type="button">Submit Details</button>';

            $messages.appendChild(form);
            scrollBottom();

            let selectedPref = 'Email';

            form.querySelectorAll('.jrn-pref-btn').forEach(function(btn) {
                btn.onclick = function() {
                    form.querySelectorAll('.jrn-pref-btn').forEach(function(b) { b.classList.remove('selected'); });
                    btn.classList.add('selected');
                    selectedPref = btn.dataset.val;
                };
            });

            const nameEl  = document.getElementById('jrn-f-name');
            const emailEl = document.getElementById('jrn-f-email');
            const phoneEl = document.getElementById('jrn-f-phone');

            nameEl.addEventListener('input',  function() { nameEl.style.borderColor  = ''; });
            emailEl.addEventListener('input', function() { emailEl.style.borderColor = ''; emailEl.placeholder = 'you@example.com'; });
            phoneEl.addEventListener('input', function() { phoneEl.value = phoneEl.value.replace(/[^\d\s\-().]/g, ''); });

            document.getElementById('jrn-final-submit').onclick = function() {
                const name       = nameEl.value.trim();
                const email      = emailEl.value.trim();
                const rawPhone   = phoneEl.value.trim();
                const cleanPhone = rawPhone.replace(/[^\d]/g, '');
                const phone      = cleanPhone ? '+1 ' + cleanPhone : '';
                let   hasError   = false;

                if (!name) { nameEl.style.borderColor = '#c0392b'; hasError = true; }
                if (!email || !isValidEmail(email)) {
                    emailEl.style.borderColor = '#c0392b';
                    emailEl.placeholder = 'Please enter a valid email (e.g. you@example.com)';
                    emailEl.value = '';
                    hasError = true;
                }
                if (hasError) return;

                form.remove();

                state.name              = name;
                state.email             = email;
                state.phone             = phone;
                state.preferred_contact = selectedPref;
                state.status            = 'complete';

                addUserBubble(name + ' · ' + email);

                // Final save — at this point services and budget are
                // already in state (set in steps 13/14 or 25/26)
                // so they will be included in this payload automatically.
                console.log('[JRN] Final state before submit:', JSON.stringify(state));
                saveToServer();
                finishStep();
            };
        });
    }

    function finishStep() {
        step = 101;
        hideInput();
        removeOptions();
        showTyping();

        addBotMessage('<strong>Got it!</strong><br><br>Our events team will craft ideas around your vision and reach out within 24 hours.<br><br>Excited to create something unforgettable!', DELAY_MED).then(function() {
            showTyping();
            addBotMessage('<div style="text-align:center;padding:8px 0"><div style="font-weight:700;color:#8B5E0A;margin-top:4px">Thank you, ' + ((state.name || 'there').split(' ')[0]) + '!</div></div>', DELAY_MED);
        });
    }

    // ── Text input handler ────────────────────────────────────────

    function handleGenericSubmit() {
        const val = $textInput.value.trim();
        if (!val) return;

        if (step >= 100) {
            addUserBubble(val);
            addBotMessage('Please complete the form above!');
            $textInput.value = '';
            return;
        }

        // Guest count validation
        if (step === 6 || step === 22) {
            const num = Number(val);
            if (!Number.isInteger(num) || num <= 0) {
                $textInput.value = '';
                showTyping();
                addBotMessage('Please enter the number of guests as a whole number (e.g. 150).', DELAY_SHORT).then(function() {
                    showInput('Number of guests');
                });
                return;
            }
        }

        addUserBubble(val);
        removeOptions();
        hideInput();
        $textInput.value        = '';
        $textInput.style.height = 'auto';

        if      (step === 2)  { state.ritual_style    = val; saveToServer(); startWedding3(); }
        else if (step === 6)  { state.guest_size      = val; saveToServer(); startWedding7(); }
        else if (step === 7)  { state.venue_details   = val; saveToServer(); startWedding8(); }
        else if (step === 8)  { state.wedding_planner = val; saveToServer(); startWedding9(); }
        else if (step === 9)  { state.pinterest_link  = val; saveToServer(); startWedding10(); }
        else if (step === 22) { state.guest_size      = val; saveToServer(); startOther5(); }
        else if (step === 23) { state.venue_details   = val; saveToServer(); startOther6(); }
    }

    // ── Build DOM ─────────────────────────────────────────────────

    function buildDOM() {
        if (!document.getElementById('jrn-css')) {
            const baseURL = window.JRN_BASE_URL || 'jrn_chatbot/';
            const link    = document.createElement('link');
            link.id       = 'jrn-css';
            link.rel      = 'stylesheet';
            link.href     = baseURL + 'chatbot.css';
            document.head.appendChild(link);
        }

        $toggle = document.createElement('button');
        $toggle.id = 'jrn-toggle';
        $toggle.setAttribute('aria-label', 'Open JRN Events Chatbot');
        $toggle.innerHTML =
            '<svg class="ico-chat" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>' +
            '<svg class="ico-close" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>';

        $window = document.createElement('div');
        $window.id = 'jrn-window';
        $window.style.opacity       = '0';
        $window.style.pointerEvents = 'none';
        $window.style.visibility    = 'hidden';
        $window.setAttribute('role', 'dialog');
        $window.setAttribute('aria-label', 'JRN Events Chatbot');

        const logoHTML = BRAND_LOGO
            ? '<img src="' + BRAND_LOGO + '" alt="JRN Logo" style="max-height:48px;width:auto;object-fit:contain;display:block;" loading="eager">'
            : '<div style="background:#fff;padding:4px 10px;border-radius:8px;font-size:.85rem;font-weight:700;color:#8B5E0A;letter-spacing:1px">JRN Events</div>';

        $window.innerHTML =
            '<div id="jrn-header"><div class="brand">' + logoHTML + '</div>' +
            '<div id="jrn-progress-wrap"><div id="jrn-progress-bar" style="width:0%"></div></div></div>' +
            '<div id="jrn-messages"></div>' +
            '<div id="jrn-input-area">' +
            '<textarea id="jrn-text-input" rows="1" placeholder="Type here…"></textarea>' +
            '<button id="jrn-send-btn" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg></button>' +
            '</div>';

        const $overlay    = document.createElement('div');
        $overlay.id       = 'jrn-modal-overlay';

        $toggle.style.opacity    = '0';
        $toggle.style.transition = 'opacity 0.5s ease';

        document.body.appendChild($toggle);
        document.body.appendChild($window);
        document.body.appendChild($overlay);

        $messages    = document.getElementById('jrn-messages');
        $inputArea   = document.getElementById('jrn-input-area');
        $textInput   = document.getElementById('jrn-text-input');
        $sendBtn     = document.getElementById('jrn-send-btn');
        $progressBar = document.getElementById('jrn-progress-bar');

        $sendBtn.onclick = handleGenericSubmit;

        $textInput.onkeydown = function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenericSubmit(); }
        };

        $textInput.addEventListener('input', function() {
            $textInput.style.height = 'auto';
            $textInput.style.height = Math.min($textInput.scrollHeight, 100) + 'px';
        });

        $toggle.addEventListener('click', function() {
            const open = !$window.classList.contains('visible');
            $toggle.classList.toggle('open', open);
            $window.classList.toggle('visible', open);

            if (open) {
                $window.style.visibility    = 'visible';
                $window.style.opacity       = '1';
                $window.style.pointerEvents = 'all';
                if (step === 0) startStep1();
                scrollBottom();
            } else {
                $window.style.opacity       = '0';
                $window.style.pointerEvents = 'none';
                setTimeout(function() {
                    if (!$window.classList.contains('visible')) $window.style.visibility = 'hidden';
                }, 300);
            }
        });

        setTimeout(function() { $toggle.style.opacity = '1'; }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildDOM);
    } else {
        buildDOM();
    }

})();