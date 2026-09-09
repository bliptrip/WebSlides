/*!
 * presenter.js — a presenter view for WebSlides 1.5
 * ---------------------------------------------------------------------------
 * Drop-in. No build step, no dependencies. WebSlides itself is not modified.
 *
 * IMPORTANT — load this BEFORE the WebSlides constructor:
 *
 *     <script src="../static/js/presenter.js"></script>
 *     <script>window.ws = new WebSlides({navigateOnScroll: false});</script>
 *
 * WebSlides deletes every child of #webslides that is not a <section>, so the
 * <ws-section> grouping element below has to be flattened away before it runs.
 * This script does that the moment it executes. (Speaker notes and per-slide
 * timings work in either order; only <ws-section> needs this.)
 *
 * ---------------------------------------------------------------------------
 * MARKUP
 *
 *   Speaker notes — hidden from the audience automatically:
 *     <section>
 *       ...
 *       <aside class="notes"><p>Say this.</p></aside>
 *     </section>
 *
 *   Per-slide budget — drives the SLIDE countdown:
 *     <section data-minutes="1.5">
 *
 *   A named group of slides — drives the SECTION countdown:
 *     <ws-section name="Ch. III — UAV phenomics" minutes="11">
 *       <section>...</section>
 *       <section data-minutes="2">...</section>
 *     </ws-section>
 *
 *   Equivalent, without the wrapper (order-independent, cannot be clobbered).
 *   The run continues until the next data-section; data-section="" ends it:
 *     <section data-section="Ch. III — UAV phenomics" data-section-minutes="11">
 *
 * Every timing attribute is optional. A countdown only appears when a budget
 * exists for it.
 *
 * Config, set before this script:
 *     <script>window.WS_PRESENTER = { targetMinutes: 45 };</script>
 */
(function () {
  'use strict';

  var CFG = window.WS_PRESENTER || {};
  var TARGET_MIN = CFG.targetMinutes || 45;
  var CHANNEL = CFG.channel || 'ws-presenter';

  var params = new URLSearchParams(window.location.search);
  var MODE =
    params.get('presenter') === '1' ? 'presenter' :
    params.get('mirror') === '1' ? 'mirror' : 'audience';

  /* ======================================================== SECTION GROUPING
     Runs first, synchronously, before WebSlides can strip the wrappers.     */

  function flattenGroups() {
    var deck = document.getElementById('webslides');
    if (!deck) return 0;
    var groups = deck.querySelectorAll('ws-section, section-group, .ws-section');
    var n = 0;

    Array.prototype.forEach.call(groups, function (g) {
      var name = g.getAttribute('name') || g.getAttribute('data-name') ||
                 g.getAttribute('title') || '';
      var mins = g.getAttribute('minutes') || g.getAttribute('data-minutes') || '';
      var kids = Array.prototype.filter.call(g.children, function (c) {
        return c.tagName === 'SECTION';
      });
      kids.forEach(function (s) {
        // Stamped per-slide, so the grouping survives the wrapper's removal.
        s.setAttribute('data-ws-group', name);
        if (mins) s.setAttribute('data-ws-group-minutes', mins);
        g.parentNode.insertBefore(s, g);
      });
      g.parentNode.removeChild(g);
      n++;
    });
    return n;
  }

  var flattened = flattenGroups();
  if (flattened && window.ws && window.ws.initialised) {
    console.warn('[presenter.js] Found <ws-section> wrappers but WebSlides had ' +
      'already initialised — their slides were most likely dropped. Move the ' +
      'presenter.js <script> tag ABOVE "new WebSlides(...)".');
  }

  /* ---------------------------------------------------------------- transport
     Two redundant paths so this works over http:// AND file:// :
       - BroadcastChannel (same-origin, http/https)
       - direct window.postMessage between opener / child / iframe
     Messages carry an id and are deduplicated on receipt.                   */

  var bc = null;
  try { bc = new BroadcastChannel(CHANNEL); } catch (e) { /* file:// or old browser */ }
  var peers = [];
  var seq = 0;

  function addPeer(w) { if (w && peers.indexOf(w) === -1) peers.push(w); }

  function send(msg, only) {
    msg.__ws = CHANNEL;
    if (!msg.__id) msg.__id = Math.random().toString(36).slice(2, 8) + (++seq);
    if (only) { try { only.postMessage(msg, '*'); } catch (e) {} return; }
    if (bc) { try { bc.postMessage(msg); } catch (e) {} }
    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage(msg, '*'); } catch (e) {}
    }
    peers.forEach(function (w) {
      if (w && !w.closed) { try { w.postMessage(msg, '*'); } catch (e) {} }
    });
  }

  function receive(handler) {
    var seen = Object.create(null), order = [];
    function once(data, src) {
      if (!data) return;
      if (data.__id) {
        if (seen[data.__id]) return;
        seen[data.__id] = 1;
        order.push(data.__id);
        if (order.length > 400) delete seen[order.shift()];
      }
      handler(data, src);
    }
    if (bc) bc.addEventListener('message', function (e) { once(e.data, null); });
    window.addEventListener('message', function (e) {
      if (e.data && e.data.__ws === CHANNEL) once(e.data, e.source);
    });
  }

  /* ------------------------------------------------------------------ helpers */

  function ready(fn) {
    var tries = 0;
    (function poll() {
      if (window.ws && window.ws.slides && window.ws.slides.length) return fn(window.ws);
      if (++tries > 200) return;              // ~10 s then give up quietly
      setTimeout(poll, 50);
    })();
  }

  function sections() {
    var deck = document.getElementById('webslides');
    return deck ? Array.prototype.slice.call(deck.children).filter(function (el) {
      return el.tagName === 'SECTION';
    }) : [];
  }

  function notesFor(i) {
    var s = sections()[i];
    if (!s) return '';
    var n = s.querySelector('aside.notes, .notes');
    return n ? n.innerHTML : '';
  }

  function titleFor(i) {
    var s = sections()[i];
    if (!s) return '';
    // First heading with actual text — skips icon-only headings, which this
    // deck uses for decoration.
    var hs = s.querySelectorAll('h1, h2, h3, h4, .text-landing, .text-subtitle, figcaption');
    for (var k = 0; k < hs.length; k++) {
      var t = hs[k].textContent.trim().replace(/\s+/g, ' ');
      if (t) return t.slice(0, 90);
    }
    var alt = s.querySelector('img[alt]');
    if (alt && alt.getAttribute('alt')) return '🖼 ' + alt.getAttribute('alt').slice(0, 80);
    if (s.querySelector('video')) return '▶ video slide';
    return '(no heading)';
  }

  function minutesFor(i) {
    var s = sections()[i];
    var v = s && parseFloat(s.getAttribute('data-minutes'));
    return (v && v > 0) ? v : null;
  }

  /**
   * Resolve every slide to the section run it belongs to.
   * <ws-section> stamps win per slide; data-section starts a run that carries
   * forward until the next data-section (empty string ends the run).
   * @return {{runs: Array, of: Array}} runs, plus slide index -> run (or null)
   */
  function buildSections() {
    var els = sections();
    var carried = null;         // run started by data-section
    var resolved = [];

    els.forEach(function (s) {
      var g = s.getAttribute('data-ws-group');
      if (g !== null) {
        // A <ws-section> is self-delimiting: it also ends any data-section run
        // that was in progress, so slides after the wrapper are unsectioned.
        carried = null;
        var gm = parseFloat(s.getAttribute('data-ws-group-minutes'));
        resolved.push(g === '' ? null : { name: g, minutes: gm > 0 ? gm : null });
        return;
      }
      var d = s.getAttribute('data-section');
      if (d !== null) {
        if (d === '') carried = null;
        else {
          var dm = parseFloat(s.getAttribute('data-section-minutes'));
          carried = { name: d, minutes: dm > 0 ? dm : null };
        }
      }
      resolved.push(carried);
    });

    // Collapse consecutive slides with the same name+budget into one run.
    var runs = [], of = [];
    resolved.forEach(function (r, i) {
      var last = runs[runs.length - 1];
      if (r && last && last.name === r.name && last.minutes === r.minutes) {
        last.end = i;
      } else if (r) {
        runs.push({ name: r.name, minutes: r.minutes, start: i, end: i });
      }
      of[i] = r ? runs[runs.length - 1] : null;
    });
    return { runs: runs, of: of };
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtSigned(sec) {
    return (sec < 0 ? '−' : '+') + fmt(Math.abs(sec));
  }

  // A countdown: negative remaining reads as "1:20 over".
  function fmtCountdown(sec) {
    return sec < 0 ? '−' + fmt(-sec) : fmt(sec);
  }

  /* =========================================================== AUDIENCE MODE */

  function initAudience(ws) {
    var st = document.createElement('style');
    st.textContent =
      '#webslides aside.notes, #webslides .notes { display: none !important; }' +
      '#ws-blackout { position: fixed; inset: 0; background: #000; z-index: 2147483000;' +
      '  display: none; }' +
      '#ws-blackout.on { display: block; }';
    document.head.appendChild(st);

    var black = document.createElement('div');
    black.id = 'ws-blackout';
    document.body.appendChild(black);

    var presenterWin = null;

    function state() {
      return { type: 'slide', i: ws.currentSlideI_, total: ws.slides.length };
    }

    ws.el.addEventListener('ws:slide-change', function (e) {
      send({ type: 'slide', i: e.detail.currentSlide0, total: ws.slides.length });
    });

    receive(function (msg, src) {
      addPeer(src);
      switch (msg.type) {
        case 'hello':    send(state(), src || undefined); break;
        case 'goto':     ws.goToSlide(Math.max(0, Math.min(ws.slides.length - 1, msg.i))); break;
        case 'blackout': black.classList.toggle('on', !!msg.on); break;
      }
    });

    function openPresenter() {
      if (presenterWin && !presenterWin.closed) { presenterWin.focus(); return; }
      var url = window.location.pathname + '?presenter=1';
      presenterWin = window.open(url, 'ws-presenter',
        'width=1360,height=860,menubar=no,toolbar=no,location=no');
      if (!presenterWin) {
        alert('Presenter view was blocked by the pop-up blocker.\n' +
              'Allow pop-ups for this page and press "p" again.');
        return;
      }
      addPeer(presenterWin);
    }

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === 'p') {
        e.preventDefault(); e.stopImmediatePropagation();
        openPresenter();
      } else if (k === 'b') {
        e.preventDefault(); e.stopImmediatePropagation();
        var on = !black.classList.contains('on');
        black.classList.toggle('on', on);
        send({ type: 'blackout', on: on });
      } else if (k === 'f') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      }
    }, true);

    window.addEventListener('beforeunload', function () {
      if (presenterWin && !presenterWin.closed) presenterWin.close();
    });

    send(state());
    window.wsPresenterOpen = openPresenter;
  }

  /* ============================================================= MIRROR MODE
     A second copy of the deck, in an iframe inside the presenter window, used
     purely as a live "next slide" thumbnail. It never drives anything.      */

  function initMirror(ws) {
    var st = document.createElement('style');
    st.textContent =
      '#webslides aside.notes, #webslides .notes { display: none !important; }' +
      '#navigation, .navigation, #counter, .counter { display: none !important; }' +
      'html, body { overflow: hidden !important; cursor: none; }' +
      // No transitions in the thumbnail. WebSlides only clears its `isMoving`
      // flag from the transition/animation callback, and goToSlide silently
      // no-ops while that flag is set — so a transition that never completes
      // in this scaled-down, often-unfocused iframe would freeze the preview
      // on whatever slide it was showing. Nothing here is watched closely
      // enough to want animation anyway.
      '#webslides, #webslides * { transition: none !important; animation: none !important; }';
    document.head.appendChild(st);

    function goTo(i) {
      i = Math.max(0, Math.min(ws.slides.length - 1, i | 0));
      ws.isMoving = false;          // never let a stalled transition wedge us
      ws.goToSlide(i);
      return ws.currentSlideI_;
    }

    // Same-origin fast path: the presenter calls this directly, so the preview
    // does not depend on message delivery at all.
    window.wsPreviewGoTo = goTo;
    window.wsPreviewAt = function () { return ws.currentSlideI_; };

    // Cross-origin / file:// fallback.
    receive(function (msg) {
      if (msg.type === 'preview') goTo(msg.i);
    });
    send({ type: 'mirror-ready' });
  }

  /* ========================================================== PRESENTER MODE */

  var PRESENTER_CSS = [
    '#webslides, #navigation, .navigation, #counter, .counter { display: none !important; }',
    'html, body { margin: 0; height: 100%; background: #12141a; overflow: hidden; }',
    '#wsp { position: fixed; inset: 0; display: grid;',
    '  grid-template-rows: auto 1fr 34px; font: 16px/1.5 -apple-system, BlinkMacSystemFont,',
    '  "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edf5; }',

    /* ---- header ---- */
    '#wsp-head { background: #1b1f29; border-bottom: 1px solid #2b3140; padding: 10px 20px 12px; }',
    '#wsp-crumb { display: flex; align-items: baseline; gap: 14px; margin-bottom: 10px;',
    '  min-height: 22px; }',
    '#wsp-crumb .num { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }',
    '#wsp-crumb .num small { font-size: 13px; font-weight: 400; color: #8f9bb3; }',
    '#wsp-sect { font-size: 15px; font-weight: 600; color: #cbd5e8; padding: 2px 12px;',
    '  border-radius: 999px; background: #232a38; }',
    '#wsp-sect.none { display: none; }',
    '#wsp-sectpos { font-size: 13px; color: #7d89a3; font-variant-numeric: tabular-nums; }',
    '#wsp-wall { margin-left: auto; font-size: 14px; color: #8f9bb3;',
    '  font-variant-numeric: tabular-nums; }',

    '#wsp-clocks { display: flex; gap: 12px; align-items: stretch; }',
    '.wsp-clock { flex: 0 0 auto; min-width: 132px; background: #161a23; border: 1px solid #2b3140;',
    '  border-radius: 8px; padding: 7px 14px 8px; }',
    '.wsp-clock.hidden { display: none; }',
    '.wsp-clock .cap { font-size: 10px; letter-spacing: .16em; text-transform: uppercase;',
    '  color: #6f7b95; font-weight: 700; }',
    '.wsp-clock .big { font-size: 30px; font-weight: 700; line-height: 1.12;',
    '  font-variant-numeric: tabular-nums; }',
    '.wsp-clock .sub { font-size: 12px; color: #7d89a3; font-variant-numeric: tabular-nums; }',
    '.wsp-clock.ok    .big { color: #86e0a8; }',
    '.wsp-clock.warn  .big { color: #ffd479; }',
    '.wsp-clock.over  .big { color: #ff8f8f; }',
    '.wsp-clock.over  { border-color: #5a2b2b; background: #211519; }',
    '.wsp-clock.idle  .big { color: #8f9bb3; }',
    '#wsp-talk { flex: 1 1 auto; min-width: 210px; }',
    '#wsp-talk .big { color: #e9edf5; }',
    '#wsp-talk.paused .big { color: #8f9bb3; }',
    '#wsp-bar { height: 6px; border-radius: 3px; background: #2b3140; overflow: hidden;',
    '  margin: 6px 0 4px; }',
    '#wsp-bar i { display: block; height: 100%; width: 0; background: #5b8def; transition: width .3s; }',
    '#wsp-pace { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;',
    '  color: #8fb8ff; }',
    '#wsp-pace.behind { color: #ff9c9c; }',
    '#wsp-pace.ahead { color: #86e0a8; }',

    /* ---- body ---- */
    '#wsp-body { display: grid; grid-template-columns: 1fr 40%; min-height: 0; }',
    '#wsp-notes { padding: 22px 28px; overflow-y: auto; }',
    '.lbl { font-size: 11px; letter-spacing: .16em; text-transform: uppercase;',
    '  color: #7d89a3; margin: 0 0 10px; font-weight: 700; }',
    '#wsp-title { font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 16px;',
    '  padding-bottom: 14px; border-bottom: 1px solid #2b3140; }',
    '#wsp-notes-body { font-size: 21px; line-height: 1.62; color: #d7deeb; }',
    '#wsp-notes-body p { margin: 0 0 .9em; }',
    '#wsp-notes-body ul, #wsp-notes-body ol { margin: 0 0 .9em; padding-left: 1.3em; }',
    '#wsp-notes-body li { margin: 0 0 .35em; }',
    '#wsp-notes-body strong, #wsp-notes-body b { color: #fff; }',
    '#wsp-notes-body em { color: #ffd479; font-style: normal; }',
    '#wsp-notes-body .empty { color: #5c6884; font-style: italic; font-size: 18px; }',
    '#wsp-side { border-left: 1px solid #2b3140; display: grid;',
    '  grid-template-rows: auto 1fr; min-height: 0; background: #171a22; }',
    '#wsp-nextwrap { padding: 16px 18px 10px; }',
    '#wsp-stage { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 8px;',
    '  overflow: hidden; background: #000; border: 1px solid #2b3140; }',
    // max-width:none is essential — webslides.css caps every iframe at 100%,
    // which would squash the scaled-down mirror.
    '#wsp-stage iframe { position: absolute; top: 0; left: 0; border: 0;',
    '  transform-origin: 0 0; max-width: none !important; min-width: 0 !important;',
    '  max-height: none !important; }',
    '#wsp-stage .fallback { position: absolute; inset: 0; display: flex; align-items: center;',
    '  justify-content: center; text-align: center; padding: 18px; color: #8f9bb3;',
    '  font-size: 15px; line-height: 1.5; }',
    '#wsp-newsect { margin: 10px 0 0; font-size: 13px; font-weight: 700; color: #8fb8ff; }',
    '#wsp-newsect.hidden { display: none; }',
    '#wsp-prevnote { margin: 8px 0 0; font-size: 12px; font-weight: 700; color: #ff9c9c; }',
    '#wsp-prevnote.hidden { display: none; }',
    '#wsp-nextnotes { padding: 8px 18px 18px; overflow-y: auto; min-height: 0;',
    '  font-size: 15px; line-height: 1.55; color: #98a3ba; }',
    '#wsp-nextnotes p { margin: 0 0 .7em; }',

    /* ---- footer ---- */
    '#wsp-foot { display: flex; align-items: center; gap: 16px; padding: 0 18px;',
    '  background: #1b1f29; border-top: 1px solid #2b3140; font-size: 12px; color: #6f7b95; }',
    '#wsp-foot b { color: #aab5cc; font-weight: 600; }',
    '.wsp-jumpbox { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%);',
    '  background: #1b1f29; border: 1px solid #3a4356; border-radius: 10px; padding: 18px 26px;',
    '  font-size: 34px; font-weight: 700; letter-spacing: 2px; color: #fff; display: none; }',
    '.wsp-jumpbox.on { display: block; }'
  ].join('\n');

  function initPresenter(ws) {
    document.title = 'Presenter view';

    var st = document.createElement('style');
    st.textContent = PRESENTER_CSS;
    document.head.appendChild(st);

    var total = ws.slides.length;
    var SEC = buildSections();

    var root = document.createElement('div');
    root.id = 'wsp';
    root.innerHTML =
      '<div id="wsp-head">' +
        '<div id="wsp-crumb">' +
          '<span class="num"><span id="wsp-n">1</span><small>&nbsp;/&nbsp;<span id="wsp-t"></span></small></span>' +
          '<span id="wsp-sect" class="none"></span>' +
          '<span id="wsp-sectpos"></span>' +
          '<span id="wsp-wall"></span>' +
        '</div>' +
        '<div id="wsp-clocks">' +
          '<div class="wsp-clock hidden" id="wsp-slide">' +
            '<div class="cap">This slide</div>' +
            '<div class="big">0:00</div>' +
            '<div class="sub"></div>' +
          '</div>' +
          '<div class="wsp-clock hidden" id="wsp-section">' +
            '<div class="cap">Section left</div>' +
            '<div class="big">0:00</div>' +
            '<div class="sub"></div>' +
          '</div>' +
          '<div class="wsp-clock" id="wsp-talk">' +
            '<div class="cap">Talk</div>' +
            '<div class="big">0:00 / ' + TARGET_MIN + ':00</div>' +
            '<div id="wsp-bar"><i></i></div>' +
            '<div id="wsp-pace">on time</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="wsp-body">' +
        '<div id="wsp-notes">' +
          '<p class="lbl">Speaker notes</p>' +
          '<h2 id="wsp-title"></h2>' +
          '<div id="wsp-notes-body"></div>' +
        '</div>' +
        '<div id="wsp-side">' +
          '<div id="wsp-nextwrap">' +
            '<p class="lbl">Next slide &mdash; <span id="wsp-nexttitle"></span></p>' +
            '<div id="wsp-stage"><div class="fallback">loading preview&hellip;</div></div>' +
            '<p id="wsp-newsect" class="hidden"></p>' +
            '<p id="wsp-prevnote" class="hidden"></p>' +
          '</div>' +
          '<div id="wsp-nextnotes"></div>' +
        '</div>' +
      '</div>' +
      '<div id="wsp-foot">' +
        '<span><b>&larr; &rarr;</b> navigate</span>' +
        '<span><b>space</b> next</span>' +
        '<span><b>t</b> start/pause</span>' +
        '<span><b>r</b> reset all</span>' +
        '<span><b>s</b> reset this slide</span>' +
        '<span><b>b</b> black screen</span>' +
        '<span><b>0-9 &crarr;</b> jump</span>' +
      '</div>' +
      '<div class="wsp-jumpbox"></div>';
    document.body.appendChild(root);

    var $ = function (sel) { return root.querySelector(sel); };
    var $n = $('#wsp-n'), $t = $('#wsp-t'), $wall = $('#wsp-wall');
    var $sect = $('#wsp-sect'), $sectpos = $('#wsp-sectpos');
    var $slideBox = $('#wsp-slide'), $sectBox = $('#wsp-section'), $talkBox = $('#wsp-talk');
    var $bar = $('#wsp-bar i'), $pace = $('#wsp-pace');
    var $title = $('#wsp-title'), $notes = $('#wsp-notes-body');
    var $nextTitle = $('#wsp-nexttitle'), $nextNotes = $('#wsp-nextnotes');
    var $newSect = $('#wsp-newsect'), $stage = $('#wsp-stage'), $jump = $('.wsp-jumpbox');

    $t.textContent = total;

    /* ---- live preview iframe (mirror mode) --------------------------------- */
    var mirror = null, mirrorReady = false, fitMirror = function () {};
    (function buildMirror() {
      var f = document.createElement('iframe');
      f.src = window.location.pathname + '?mirror=1';
      f.setAttribute('scrolling', 'no');
      f.setAttribute('tabindex', '-1');
      $stage.appendChild(f);
      mirror = f;
      addPeer(f.contentWindow);

      function fit() {
        var w = $stage.clientWidth, h = $stage.clientHeight;
        if (!w || !h) return;
        var vw = 1440, vh = Math.round(1440 * h / w);   // fixed logical width
        f.style.width = vw + 'px';
        f.style.height = vh + 'px';
        f.style.transform = 'scale(' + (w / vw) + ')';
      }
      fitMirror = fit;
      f.addEventListener('load', function () {
        addPeer(f.contentWindow);
        fit();
        setTimeout(function () { pushPreview(cur + 1); }, 300);
      });
      window.addEventListener('resize', fit);
      // `load` can fire after the mirror announces itself, and the panel is
      // resizable, so keep the scale in sync with the box.
      if (window.ResizeObserver) new ResizeObserver(fit).observe($stage);
      var settle = setInterval(fit, 400);
      setTimeout(function () { clearInterval(settle); }, 6000);

      setTimeout(function () {
        if (!mirrorReady) {
          var fb = $stage.querySelector('.fallback');
          if (fb) fb.textContent = 'Live preview unavailable — using the text summary below. ' +
            '(Serve the deck over http:// rather than opening the file directly.)';
        }
      }, 6000);
    })();

    /* Drive the preview, then confirm it actually landed and retry if not.
       The mirror can miss a request while it is still booting, and a message
       is not an acknowledgement, so this verifies rather than assumes. */
    var previewWant = -1, previewTries = 0, previewTimer = null;

    function mirrorAt() {
      try {
        var w = mirror && mirror.contentWindow;
        return (w && w.wsPreviewAt) ? w.wsPreviewAt() : null;   // null = can't tell
      } catch (e) { return null; }                              // cross-origin
    }

    function pushPreview(i) {
      if (!mirror) return;
      previewWant = i;
      previewTries = 0;
      clearTimeout(previewTimer);
      attemptPreview();
    }

    function attemptPreview() {
      var w = mirror && mirror.contentWindow;
      if (!w) return;
      var landed = false;
      try {
        if (w.wsPreviewGoTo) { w.wsPreviewGoTo(previewWant); landed = true; }
      } catch (e) { /* cross-origin (file://) — fall through to postMessage */ }
      if (!landed) send({ type: 'preview', i: previewWant }, w);

      // Verify shortly after; back off a few times before giving up.
      previewTries++;
      clearTimeout(previewTimer);
      if (previewTries <= 6) {
        previewTimer = setTimeout(function () {
          var at = mirrorAt();
          if (at === null) { setPreviewNote(''); return; }   // can't verify; assume fine
          if (at === previewWant) { setPreviewNote(''); return; }
          attemptPreview();
        }, 120 * previewTries);
      } else {
        var at2 = mirrorAt();
        if (at2 !== null && at2 !== previewWant) {
          setPreviewNote('preview stuck on slide ' + (at2 + 1) +
                         ' (wanted ' + (previewWant + 1) + ')');
        }
      }
    }

    function setPreviewNote(text) {
      var el = document.getElementById('wsp-prevnote');
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('hidden', !text);
    }

    /* ---- planned budget per slide ------------------------------------------
       Explicit data-minutes wins. Slides inside a section with a budget split
       whatever that section has left. Everything else splits the talk.       */
    var planned = (function () {
      var per = new Array(total), i;
      for (i = 0; i < total; i++) {
        var m = minutesFor(i);
        per[i] = m != null ? m * 60 : null;
      }
      SEC.runs.forEach(function (r) {
        if (!r.minutes) return;
        var used = 0, free = 0;
        for (var k = r.start; k <= r.end; k++) {
          if (per[k] != null) used += per[k]; else free++;
        }
        if (free > 0) {
          var each = Math.max(0, r.minutes * 60 - used) / free;
          for (var j = r.start; j <= r.end; j++) if (per[j] == null) per[j] = each;
        }
      });
      var u = 0, f = 0;
      for (i = 0; i < total; i++) { if (per[i] != null) u += per[i]; else f++; }
      var ea = f > 0 ? Math.max(0, TARGET_MIN * 60 - u) / f : 0;
      for (i = 0; i < total; i++) if (per[i] == null) per[i] = ea;
      return per;
    })();

    function plannedSecondsTo(i) {
      var s = 0;
      for (var k = 0; k < i && k < total; k++) s += planned[k];
      return s;
    }

    /* ---- timers -------------------------------------------------------------
       Elapsed is derived from wall-clock timestamps rather than accumulated
       per frame, so it stays correct while this window is unfocused — which it
       will be, since the focused window is the fullscreen deck on the projector.
       Per-slide time is accrued into slideTime[] so section totals survive
       jumping backwards and revisiting slides.                               */
    var running = false, accum = 0, startedAt = null;
    var slideTime = new Array(total), lastAccrual = Date.now();
    for (var z = 0; z < total; z++) slideTime[z] = 0;

    function elapsedNow() {
      return accum + (running && startedAt != null ? (Date.now() - startedAt) / 1000 : 0);
    }
    function accrue() {
      var now = Date.now();
      var dt = (now - lastAccrual) / 1000;
      lastAccrual = now;
      if (running && dt > 0 && dt < 3600) slideTime[cur] = (slideTime[cur] || 0) + dt;
    }
    function startTimer() { if (!running) { running = true; startedAt = Date.now(); lastAccrual = Date.now(); } }
    function pauseTimer() { if (running) { accrue(); accum = elapsedNow(); running = false; startedAt = null; } }
    function resetAll() {
      accrue(); accum = 0; running = false; startedAt = null;
      for (var i = 0; i < total; i++) slideTime[i] = 0;
      lastAccrual = Date.now();
    }

    function sectionSpent(run) {
      var s = 0;
      for (var k = run.start; k <= run.end; k++) s += slideTime[k] || 0;
      return s;
    }

    // Shared styling rule for both countdowns.
    function paintCountdown(box, remaining, budget) {
      var cls = 'wsp-clock';
      if (remaining < 0) cls += ' over';
      else if (budget > 0 && remaining / budget <= 0.25) cls += ' warn';
      else cls += ' ok';
      if (!running) cls += ' idle';
      box.className = cls;
    }

    function tick() {
      accrue();
      var elapsed = elapsedNow();

      $wall.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // --- talk
      $talkBox.querySelector('.big').textContent = fmt(elapsed) + ' / ' + TARGET_MIN + ':00';
      $talkBox.classList.toggle('paused', !running);
      $bar.style.width = Math.min(100, (elapsed / (TARGET_MIN * 60)) * 100) + '%';
      var delta = plannedSecondsTo(cur) - elapsed;
      $pace.textContent = Math.abs(delta) < 30 ? 'on time'
        : fmtSigned(delta) + (delta > 0 ? ' ahead' : ' behind');
      $pace.className = Math.abs(delta) < 30 ? '' : (delta > 0 ? 'ahead' : 'behind');

      // --- this slide (only when the slide declares a budget)
      var sb = minutesFor(cur);
      if (sb != null) {
        var srem = sb * 60 - (slideTime[cur] || 0);
        $slideBox.querySelector('.big').textContent = fmtCountdown(srem);
        $slideBox.querySelector('.sub').textContent =
          (srem < 0 ? 'over ' : 'of ') + fmt(sb * 60);
        paintCountdown($slideBox, srem, sb * 60);
        $slideBox.classList.remove('hidden');
      } else {
        $slideBox.classList.add('hidden');
      }

      // --- section (only when the run declares a budget)
      var run = SEC.of[cur];
      if (run && run.minutes) {
        var rem = run.minutes * 60 - sectionSpent(run);
        $sectBox.querySelector('.big').textContent = fmtCountdown(rem);
        $sectBox.querySelector('.sub').textContent =
          (rem < 0 ? 'over ' : 'of ') + fmt(run.minutes * 60);
        paintCountdown($sectBox, rem, run.minutes * 60);
        $sectBox.classList.remove('hidden');
      } else {
        $sectBox.classList.add('hidden');
      }
    }

    /* ---- rendering --------------------------------------------------------- */
    var cur = 0;

    function render(i) {
      cur = i;
      $n.textContent = i + 1;
      $title.textContent = titleFor(i);
      $notes.innerHTML = notesFor(i) || '<p class="empty">No notes on this slide.</p>';

      var run = SEC.of[i];
      if (run) {
        $sect.textContent = run.name;
        $sect.classList.remove('none');
        $sectpos.textContent = 'slide ' + (i - run.start + 1) + ' of ' +
          (run.end - run.start + 1) + ' in this section';
      } else {
        $sect.classList.add('none');
        $sectpos.textContent = '';
      }

      var hasNext = i + 1 < total;
      $nextTitle.textContent = hasNext ? titleFor(i + 1) : 'end of deck';
      var nn = hasNext ? notesFor(i + 1) : '';
      $nextNotes.innerHTML = nn ? '<p class="lbl">Coming up</p>' + nn : '';

      var nextRun = hasNext ? SEC.of[i + 1] : null;
      if (nextRun && nextRun !== run) {
        $newSect.textContent = '▸ starts a new section: ' + nextRun.name +
          (nextRun.minutes ? '  (' + nextRun.minutes + ' min)' : '');
        $newSect.classList.remove('hidden');
      } else {
        $newSect.classList.add('hidden');
      }

      if (hasNext) pushPreview(i + 1);
    }

    /* ---- input -------------------------------------------------------------
       Navigation is always sent as an ABSOLUTE slide index, never "next".
       A relative command that gets dropped or duplicated desyncs the two
       windows permanently; an absolute one is idempotent and self-correcting. */
    var pending = 0;

    function nav(delta) { navTo(pending + delta); }
    function navTo(i) {
      pending = Math.max(0, Math.min(total - 1, i));
      send({ type: 'goto', i: pending });
    }

    var jumpBuf = '', jumpTimer = null;
    function showJump() {
      $jump.textContent = jumpBuf || '';
      $jump.classList.toggle('on', !!jumpBuf);
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(function () { jumpBuf = ''; $jump.classList.remove('on'); }, 2500);
    }

    var blackedOut = false;

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      var handled = true;

      if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') {
        if (k === 'Enter' && jumpBuf) {
          var target = parseInt(jumpBuf, 10) - 1;
          jumpBuf = ''; showJump();
          if (!isNaN(target)) navTo(target);
        } else {
          nav(1);
        }
      } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') {
        nav(-1);
      } else if (k === 'Home') {
        navTo(0);
      } else if (k === 'End') {
        navTo(total - 1);
      } else if (k >= '0' && k <= '9') {
        jumpBuf += k; showJump();
      } else if (k === 't' || k === 'T') {
        if (running) pauseTimer(); else startTimer();
        tick();
      } else if (k === 'r' || k === 'R') {
        resetAll(); tick();
      } else if (k === 's' || k === 'S') {
        accrue(); slideTime[cur] = 0; tick();     // re-run this slide's countdown
      } else if (k === 'b' || k === 'B') {
        blackedOut = !blackedOut;
        send({ type: 'blackout', on: blackedOut });
        document.body.style.opacity = blackedOut ? '0.55' : '1';
      } else {
        handled = false;
      }

      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    /* ---- wire up ----------------------------------------------------------- */
    receive(function (msg) {
      if (msg.type === 'slide') {
        accrue();                       // close out the slide we are leaving
        if (!running && accum === 0 && msg.i > 0) startTimer();
        pending = msg.i;                // the deck is the source of truth
        render(msg.i);
        tick();
      } else if (msg.type === 'mirror-ready') {
        mirrorReady = true;
        var fb = $stage.querySelector('.fallback');
        if (fb) fb.remove();
        fitMirror();
        pushPreview(cur + 1);
      }
    });

    render(0);
    send({ type: 'hello' });
    setTimeout(function () { send({ type: 'hello' }); }, 500);
    tick();
    setInterval(tick, 250);

    window.addEventListener('beforeunload', function () {
      if (blackedOut) send({ type: 'blackout', on: false });
    });

    // Handy in the console while rehearsing: where the time actually went.
    window.wsTimings = function () {
      return slideTime.map(function (t, i) {
        var r = SEC.of[i];
        return { slide: i + 1, section: r ? r.name : '', title: titleFor(i),
                 spent: fmt(t), budget: fmt(planned[i]) };
      });
    };
  }

  /* ------------------------------------------------------------------ bootstrap */

  ready(function (ws) {
    if (MODE === 'presenter') initPresenter(ws);
    else if (MODE === 'mirror') initMirror(ws);
    else initAudience(ws);
  });
})();
