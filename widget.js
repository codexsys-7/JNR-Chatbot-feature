/**
 * JRN Events – Chatbot Widget Injector (CI3 version)
 *
 * Embed on any page:
 * <script src="https://yourdomain.com/assets/js/widget.js" defer></script>
 *
 * You can pre-set window.JRN_SUBMIT_URL etc. before this script loads,
 * otherwise it auto-derives URLs from the site root.
 */
(function () {
    // 1. Detect this script's src to derive site root
    //    e.g. https://example.com/JRN_Chatbot/assets/js/widget.js
    //      -> siteRoot = https://example.com/JRN_Chatbot/
    var scripts    = document.getElementsByTagName('script');
    var currentSrc = scripts[scripts.length - 1].src;
    var parts      = currentSrc.split('/');
    // Strip 'widget.js', 'js', 'assets'  (3 path segments)
    parts.splice(-3);
    var siteRoot   = parts.join('/') + '/';
    var assetsBase = siteRoot + 'assets/';

    if (!siteRoot || siteRoot === '/') {
        siteRoot   = '/';
        assetsBase = '/assets/';
    }

    // 2. Set global config (only if not already set by the host page)
    if (!window.JRN_BASE_URL)        window.JRN_BASE_URL        = assetsBase;
    if (!window.JRN_SUBMIT_URL)      window.JRN_SUBMIT_URL      = siteRoot + 'chatbot/submit';
    if (!window.JRN_CHAT_VISION_URL) window.JRN_CHAT_VISION_URL = siteRoot + 'chatbot/chat_vision';
    if (!window.JRN_GET_PDFS_URL)    window.JRN_GET_PDFS_URL    = siteRoot + 'chatbot/get_pdfs';
    if (!window.JRN_EXCEL_URL)       window.JRN_EXCEL_URL       = siteRoot + 'download/excel';
    if (!window.JRN_BRAND_LOGO)      window.JRN_BRAND_LOGO      = siteRoot + 'logo.png';
    if (!window.JRN_CATALOGUE_URL)   window.JRN_CATALOGUE_URL   = siteRoot + 'catalogue';

    // 3. Inject CSS
    var css  = document.createElement('link');
    css.rel  = 'stylesheet';
    css.href = assetsBase + 'css/chatbot.css';
    document.head.appendChild(css);

    // 4. Inject main chatbot JS
    var js   = document.createElement('script');
    js.src   = assetsBase + 'js/chatbot.js';
    js.defer = true;
    document.body.appendChild(js);

    console.log('JRN Events Chatbot initialized from: ' + siteRoot);
})();
