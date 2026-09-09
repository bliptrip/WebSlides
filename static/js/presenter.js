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

  /**
   * The slides, in slide order.
   *
   * NOT the same as DOM order: WebSlides physically moves elements around
   * inside #webslides as you navigate (transitionToSlide_ calls
   * moveAfterLast() on the slide you are leaving and moveBeforeFirst() on the
   * one you are entering). So reading deck.children gives an order that drifts
   * the moment anyone changes slide, and anything indexed off it — notes,
   * titles, budgets, section boundaries — silently points at the wrong slide.
   *
   * ws.slides is built once at init and keeps each Slide's true index, so use
   * that whenever it exists. The DOM fallback is only for the flattening pass,
   * which runs before WebSlides is constructed and therefore before any
   * reordering can have happened.
   */
  function sections() {
    if (window.ws && window.ws.slides && window.ws.slides.length) {
      return window.ws.slides.map(function (s) { return s.el; });
    }
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
    // Build steps and full-bleed image slides often carry no heading at all.
    // This deck names nearly every slide, so fall back to that — "ch3-
    // regression-cv-title" tells you far more in a jump list than "(no heading)".
    var named = s.getAttribute('slide_name');
    if (named) return named;
    var alt = s.querySelector('img[alt]');
    if (alt && alt.getAttribute('alt')) return '🖼 ' + alt.getAttribute('alt').slice(0, 80);
    if (s.querySelector('video')) return '▶ video slide';
    return '(untitled)';
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

  // WebSlides' Zoom plugin clones the entire deck into #webslides-zoomed at
  // construction time to build its grid overview ("-" key). The clone carries
  // copies of every <aside class="notes">, so hiding notes only under
  // #webslides would put your speaker notes on the projector the moment anyone
  // opens the overview. Both roots, everywhere notes are hidden.
  var HIDE_NOTES_CSS =
    '#webslides aside.notes, #webslides .notes,' +
    '#webslides-zoomed aside.notes, #webslides-zoomed .notes' +
    ' { display: none !important; }';

  function initAudience(ws) {
    var st = document.createElement('style');
    st.textContent =
      HIDE_NOTES_CSS +
      '#ws-blackout { position: fixed; inset: 0; background: #000; z-index: 2147483000;' +
      '  display: none; }' +
      '#ws-blackout.on { display: block; }';
    document.head.appendChild(st);

    // The same clone duplicates the background <video> elements, keeping their
    // autoplay attribute (the Video plugin only disarms the ones in the live
    // deck). Left alone, opening the overview starts every video at once.
    var zoomVideos = document.querySelectorAll('#webslides-zoomed video');
    Array.prototype.forEach.call(zoomVideos, function (v) {
      v.removeAttribute('autoplay');
      v.muted = true;
      try { v.pause(); } catch (e) {}
    });

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

    buildNav(ws);
  }

  /* ================================================== IN-DECK NAV + HEADER TOC
     Replaces the d3 block that shipped with this deck (which never worked —
     d3 was referenced but never loaded, so it threw on every page load).

     Three link forms, all resolved to real slide indices at load:
       <a class="slide-name" slide_name="ch3-title">   the deck's own convention
       <a data-slide-to="24">                          by number
       <a data-section-to="Ch. III">                   first slide of a section

     Put them on an agenda slide and it becomes a clickable table of contents.  */

  function buildNav(ws) {
    var els = sections();
    var SEC = buildSections();

    var byName = {}, dupes = [];
    els.forEach(function (s, i) {
      var n = s.getAttribute('slide_name');
      if (!n) return;
      if (byName[n] === undefined) byName[n] = i; else dupes.push(n);
    });
    if (dupes.length) {
      console.warn('[presenter.js] duplicate slide_name values (first wins): ' +
        dupes.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '));
    }

    function sectionStart(query) {
      var q = String(query).toLowerCase();
      for (var k = 0; k < SEC.runs.length; k++) {
        if (SEC.runs[k].name.toLowerCase().indexOf(q) !== -1) return SEC.runs[k].start;
      }
      return -1;
    }

    function wire(a, index) {
      if (index < 0 || index >= els.length) {
        a.classList.add('ws-nav-unresolved');
        return false;
      }
      a.setAttribute('href', '#slide=' + (index + 1));   // real link: copyable, focusable
      a.addEventListener('click', function (e) {
        e.preventDefault();
        ws.goToSlide(index);
      });
      return true;
    }

    var unresolved = [];
    Array.prototype.forEach.call(document.querySelectorAll('a.slide-name[slide_name]'), function (a) {
      var n = a.getAttribute('slide_name');
      if (!wire(a, byName[n] === undefined ? -1 : byName[n])) unresolved.push('slide_name=' + n);
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[data-slide-to]'), function (a) {
      if (!wire(a, parseInt(a.getAttribute('data-slide-to'), 10) - 1)) {
        unresolved.push('data-slide-to=' + a.getAttribute('data-slide-to'));
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[data-section-to]'), function (a) {
      if (!wire(a, sectionStart(a.getAttribute('data-section-to')))) {
        unresolved.push('data-section-to=' + a.getAttribute('data-section-to'));
      }
    });
    if (unresolved.length) {
      console.warn('[presenter.js] nav links that match no slide: ' + unresolved.join(', '));
    }

    buildHeader(ws, SEC, byName);
  }

  /**
   * A header bar listing the deck's sections. Hidden by default — it slides in
   * when the pointer nears the top of the screen, so it is there when you want
   * it and off the projector when you don't.
   * WS_PRESENTER.header: 'auto' (default) | 'always' | 'off'.
   */
  function buildHeader(ws, SEC, byName) {
    var mode = CFG.header || 'auto';
    if (mode === 'off') return;
    if (!SEC.runs.length && byName.toc === undefined) return;   // nothing to list

    var st = document.createElement('style');
    st.textContent = [
      // webslides.css ships `header[role=banner] { opacity: 0 }` (its own
      // reveal-on-hover header). Ours is shown and hidden by transform, so the
      // opacity has to be taken back or the bar is present, hoverable and
      // completely invisible. Same for its padding and white background.
      '#ws-toc { position: fixed; top: 0; left: 0; right: 0; z-index: 900;',
      '  opacity: 1; margin: 0; padding: 0; min-height: 0;',
      '  background: rgba(16,19,26,.94); border-bottom: 1px solid rgba(255,255,255,.12);',
      '  font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  transform: translateY(-102%); transition: transform .18s ease;',
      '  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }',
      '#ws-toc.on { transform: translateY(0); }',
      '#ws-toc ul { display: flex; flex-wrap: wrap; align-items: center; gap: 2px;',
      '  margin: 0; padding: 7px 14px; list-style: none; }',
      '#ws-toc li { margin: 0; }',
      '#ws-toc a { display: block; padding: 7px 13px; border-radius: 6px; text-decoration: none;',
      '  color: #c3ccdd; white-space: nowrap; font-size: 13px; line-height: 1; }',
      '#ws-toc a:hover { background: rgba(255,255,255,.10); color: #fff; }',
      '#ws-toc a.here { background: rgba(91,141,239,.28); color: #fff; font-weight: 600; }',
      '#ws-toc .ws-toc-home { color: #8f9bb3; font-size: 15px; }',
      '#ws-toc .ws-toc-hint { margin-left: auto; color: #6f7b95; font-size: 11px;',
      '  padding-right: 6px; }',
      '#ws-toc-edge { position: fixed; top: 0; left: 0; right: 0; height: 8px; z-index: 899; }'
    ].join('\n');
    document.head.appendChild(st);

    var header = document.createElement('header');
    header.id = 'ws-toc';
    header.setAttribute('role', 'banner');
    var ul = document.createElement('ul');
    header.appendChild(ul);

    function add(label, index, cls) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.textContent = label;
      if (cls) a.className = cls;
      a.href = '#slide=' + (index + 1);
      a.setAttribute('data-slide-index', index);
      a.addEventListener('click', function (e) { e.preventDefault(); ws.goToSlide(index); });
      li.appendChild(a);
      ul.appendChild(li);
      return a;
    }

    // The original header icon pointed at slide_name="toc". Use that slide if
    // the deck has one, otherwise send it to the top.
    add('⌂', byName.toc !== undefined ? byName.toc : 0, 'ws-toc-home');
    SEC.runs.forEach(function (r) { add(r.name, r.start); });

    var hint = document.createElement('span');
    hint.className = 'ws-toc-hint';
    hint.textContent = 'h to pin  ·  - for the slide grid';
    ul.appendChild(hint);

    document.body.insertBefore(header, document.body.firstChild);

    // Highlight whichever section you are in.
    function mark() {
      var run = buildSections().of[ws.currentSlideI_];
      Array.prototype.forEach.call(ul.querySelectorAll('a'), function (a) {
        var idx = parseInt(a.getAttribute('data-slide-index'), 10);
        a.classList.toggle('here', !!run && idx === run.start && !a.classList.contains('ws-toc-home'));
      });
    }
    ws.el.addEventListener('ws:slide-change', mark);
    mark();

    if (mode === 'always') { header.classList.add('on'); return; }

    var pinned = false;
    function show() { header.classList.add('on'); }
    function hide() { if (!pinned) header.classList.remove('on'); }

    document.addEventListener('mousemove', function (e) {
      if (e.clientY <= 6) show();
      else if (e.clientY > header.offsetHeight + 40) hide();
    });
    header.addEventListener('mouseleave', hide);

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault(); e.stopImmediatePropagation();
        pinned = !pinned;
        header.classList.toggle('on', pinned);
      }
    }, true);
  }

  /* ============================================================= MIRROR MODE
     A second copy of the deck, in an iframe inside the presenter window, used
     purely as a live "next slide" thumbnail. It never drives anything.      */

  function initMirror(ws) {
    var st = document.createElement('style');
    st.textContent =
      HIDE_NOTES_CSS +
      '#navigation, .navigation, #counter, .counter { display: none !important; }' +
      '#webslides-zoomed { display: none !important; }' +   // no grid in a thumbnail
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
    '.wsp-jumpbox.on { display: block; }',

    /* ---- outline / jump list ---- */
    '#wsp-outline { position: fixed; inset: 0; background: rgba(11,13,18,.97); z-index: 50;',
    '  display: none; grid-template-rows: auto 1fr auto; }',
    '#wsp-outline.on { display: grid; }',
    '#wsp-ol-head { padding: 18px 26px 12px; border-bottom: 1px solid #2b3140; }',
    '#wsp-ol-search { width: 100%; box-sizing: border-box; background: #161a23; color: #fff;',
    '  border: 1px solid #3a4356; border-radius: 8px; padding: 12px 16px; font-size: 20px;',
    '  font-family: inherit; outline: none; }',
    '#wsp-ol-search:focus { border-color: #5b8def; }',
    '#wsp-ol-search::placeholder { color: #5c6884; }',
    '#wsp-ol-list { overflow-y: auto; padding: 8px 0 16px; }',
    '.wsp-ol-sect { position: sticky; top: 0; background: #0b0d12; padding: 14px 26px 6px;',
    '  font-size: 11px; letter-spacing: .16em; text-transform: uppercase; font-weight: 700;',
    '  color: #7d89a3; display: flex; gap: 10px; align-items: baseline; }',
    '.wsp-ol-sect b { color: #cbd5e8; font-size: 13px; letter-spacing: .04em;',
    '  text-transform: none; }',
    '.wsp-ol-row { display: flex; gap: 14px; align-items: baseline; padding: 7px 26px;',
    '  cursor: pointer; border-left: 3px solid transparent; }',
    '.wsp-ol-row .n { color: #6f7b95; font-variant-numeric: tabular-nums; min-width: 30px;',
    '  text-align: right; font-size: 14px; }',
    '.wsp-ol-row .t { color: #d7deeb; font-size: 17px; flex: 1; overflow: hidden;',
    '  text-overflow: ellipsis; white-space: nowrap; }',
    '.wsp-ol-row .b { color: #6f7b95; font-size: 12px; font-variant-numeric: tabular-nums; }',
    '.wsp-ol-row.sel { background: #1d2534; border-left-color: #5b8def; }',
    '.wsp-ol-row.sel .t { color: #fff; }',
    '.wsp-ol-row.here .n { color: #86e0a8; font-weight: 700; }',
    '.wsp-ol-row.here .t { color: #86e0a8; }',
    '.wsp-ol-row .dot { color: #4d5872; font-size: 11px; }',
    '#wsp-ol-foot { padding: 10px 26px; border-top: 1px solid #2b3140; font-size: 12px;',
    '  color: #6f7b95; display: flex; gap: 18px; }',
    '#wsp-ol-foot b { color: #aab5cc; }',
    '#wsp-ol-empty { padding: 40px 26px; color: #5c6884; font-style: italic; }'
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
        '<span><b>o</b> outline</span>' +
      '</div>' +
      '<div class="wsp-jumpbox"></div>' +
      '<div id="wsp-outline">' +
        '<div id="wsp-ol-head">' +
          '<input id="wsp-ol-search" type="text" autocomplete="off" spellcheck="false"' +
          ' placeholder="Jump to a slide — type part of a title or section">' +
        '</div>' +
        '<div id="wsp-ol-list"></div>' +
        '<div id="wsp-ol-foot">' +
          '<span><b>&uarr; &darr;</b> choose</span>' +
          '<span><b>&crarr;</b> go</span>' +
          '<span><b>esc</b> close</span>' +
          '<span id="wsp-ol-count"></span>' +
        '</div>' +
      '</div>';
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
      if (olOpen) renderOutline($olSearch.value);   // keep the "you are here" mark true
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

    /* ---- outline / jump list ------------------------------------------------
       Q&A is where this earns its place: someone asks about the LMI and you
       need slide 24 without arrowing through twenty slides in front of them. */
    var $outline = root.querySelector('#wsp-outline');
    var $olSearch = root.querySelector('#wsp-ol-search');
    var $olList = root.querySelector('#wsp-ol-list');
    var $olCount = root.querySelector('#wsp-ol-count');
    var olOpen = false, olRows = [], olSel = 0;

    // One entry per slide, built once.
    var olModel = (function () {
      var m = [];
      for (var i = 0; i < total; i++) {
        var run = SEC.of[i];
        m.push({
          i: i,
          title: titleFor(i),
          section: run ? run.name : '',
          hasNotes: !!notesFor(i),
          hay: ((i + 1) + ' ' + titleFor(i) + ' ' + (run ? run.name : '')).toLowerCase()
        });
      }
      return m;
    })();

    function renderOutline(query) {
      var terms = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
      var matches = olModel.filter(function (r) {
        return terms.every(function (t) { return r.hay.indexOf(t) !== -1; });
      });

      $olList.innerHTML = '';
      olRows = [];
      if (!matches.length) {
        $olList.innerHTML = '<div id="wsp-ol-empty">Nothing matches that.</div>';
        $olCount.textContent = '';
        return;
      }

      var lastSection = null;
      matches.forEach(function (r) {
        if (r.section !== lastSection) {
          lastSection = r.section;
          var h = document.createElement('div');
          h.className = 'wsp-ol-sect';
          h.innerHTML = r.section
            ? 'section &nbsp;<b>' + escapeHtml(r.section) + '</b>'
            : '<b>ungrouped</b>';
          $olList.appendChild(h);
        }
        var row = document.createElement('div');
        row.className = 'wsp-ol-row' + (r.i === cur ? ' here' : '');
        row.innerHTML =
          '<span class="n">' + (r.i + 1) + '</span>' +
          '<span class="t">' + escapeHtml(r.title) + '</span>' +
          (r.hasNotes ? '<span class="dot" title="has speaker notes">&#9679;</span>' : '') +
          '<span class="b">' + fmt(planned[r.i]) + '</span>';
        row.addEventListener('click', function () { closeOutline(); navTo(r.i); });
        $olList.appendChild(row);
        olRows.push({ el: row, i: r.i });
      });

      $olCount.textContent = matches.length + ' of ' + total + ' slides';
      // Start on the slide you are on when unfiltered, otherwise the first hit.
      var startAt = 0;
      if (!terms.length) {
        olRows.forEach(function (r, k) { if (r.i === cur) startAt = k; });
      }
      setSel(startAt, true);
    }

    function setSel(k, jumpScroll) {
      if (!olRows.length) return;
      olSel = Math.max(0, Math.min(olRows.length - 1, k));
      olRows.forEach(function (r, idx) { r.el.classList.toggle('sel', idx === olSel); });
      var el = olRows[olSel].el;
      if (el.scrollIntoView) {
        el.scrollIntoView({ block: jumpScroll ? 'center' : 'nearest' });
      }
    }

    function openOutline() {
      olOpen = true;
      $outline.classList.add('on');
      $olSearch.value = '';
      renderOutline('');
      $olSearch.focus();
    }

    function closeOutline() {
      olOpen = false;
      $outline.classList.remove('on');
      $olSearch.blur();
    }

    $olSearch.addEventListener('input', function () { renderOutline($olSearch.value); });

    function escapeHtml(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
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

      // While the outline is open it owns the keyboard, except for plain typing,
      // which has to reach the search box.
      if (olOpen) {
        if (k === 'Escape' || k === 'o' && e.target !== $olSearch) {
          e.preventDefault(); e.stopImmediatePropagation(); closeOutline();
        } else if (k === 'ArrowDown') {
          e.preventDefault(); e.stopImmediatePropagation(); setSel(olSel + 1);
        } else if (k === 'ArrowUp') {
          e.preventDefault(); e.stopImmediatePropagation(); setSel(olSel - 1);
        } else if (k === 'PageDown') {
          e.preventDefault(); e.stopImmediatePropagation(); setSel(olSel + 8);
        } else if (k === 'PageUp') {
          e.preventDefault(); e.stopImmediatePropagation(); setSel(olSel - 8);
        } else if (k === 'Enter') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (olRows.length) { var t = olRows[olSel].i; closeOutline(); navTo(t); }
        } else {
          // let the character reach the input, but keep WebSlides out of it
          e.stopImmediatePropagation();
        }
        return;
      }

      var handled = true;

      if (k === 'o' || k === 'O') {
        openOutline();
      } else if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') {
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
