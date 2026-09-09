# presenter.js — presenter view for your WebSlides decks

WebSlides 1.5 has no speaker view. This adds one, plus optional per-slide and
per-section countdown timers. Single file, no build step, no dependencies.
WebSlides itself is not modified.

## Install

1. `static/js/presenter.js`
2. In your deck's HTML — **order matters**:

```html
<script src="../static/js/webslides.js"></script>

<script>window.WS_PRESENTER = { targetMinutes: 45 };</script>
<script src="../static/js/presenter.js"></script>
<script>window.ws = new WebSlides({navigateOnScroll: false});</script>
```

`presenter.js` must load **before** `new WebSlides(...)`. WebSlides deletes every
child of `#webslides` that is not a `<section>` — including the `<ws-section>`
grouping element below, *and the slides inside it*. presenter.js flattens those
wrappers the instant it runs, so it has to run first. (Notes and per-slide
timings survive either order; only `<ws-section>` needs this. If it does load
late, it says so in the console.)

## Serve it over http, not file://

```bash
cd Maule_2025_08_24_Thesis_Seminar
python3 -m http.server 8000
# http://localhost:8000/presentation/presentation.html
```

`file://` mostly works — there is a postMessage fallback — but the live
next-slide preview and the mermaid diagrams both need a real origin.

---

## Markup

Everything below is optional. A countdown only appears when a budget exists for
it, so you can time the ten slides you know run long and leave the rest alone.

### Speaker notes

Hidden from the audience automatically; no CSS change needed.

```html
<section>
  ... slide content ...
  <aside class="notes">
    <p><strong>One number on this slide:</strong> R² = 0.95.</p>
    <ul>
      <li>Say why CV matters: a phenotype that moves with drone angle is not a phenotype.</li>
      <li><em>Do not read the table.</em></li>
    </ul>
  </aside>
</section>
```

`<strong>` renders white; `<em>` renders amber — use `<em>` for stage directions
you want to catch your eye ("slow down", "pause for the video").

### A per-slide budget → the SLIDE countdown

```html
<section data-minutes="1.5">
```

### A group of slides → the SECTION countdown

The wrapper form. `<ws-section>` is not a real slide, it disappears before
WebSlides sees it, and it can be nested nowhere — just wrap consecutive slides:

```html
<article id="webslides">
  <section>...</section>

  <ws-section name="Ch. III — UAV phenomics and the LMI" minutes="11">
    <section>...</section>
    <section data-minutes="2.5">...</section>
    <section>...</section>
  </ws-section>

  <section>...</section>   <!-- outside the group again -->
</article>
```

The attribute form does the same thing without a wrapper. It starts a run that
carries forward until the next `data-section`; `data-section=""` ends the run:

```html
<section data-section="Ch. III — UAV phenomics" data-section-minutes="11">
<section>   <!-- still in Ch. III -->
<section data-section="">   <!-- back to no section -->
```

Use the wrapper when you are writing the deck (it reads better and you cannot
forget to close it); use the attribute form when you want to group slides
without re-indenting them, or when you cannot control script order.

You can mix the two. A `<ws-section>` always wins for its own slides and ends
any attribute-run in progress.

---

## Running the talk

1. Open the deck, press **p**. The presenter window opens.
2. Drag the *original* window to the projector, click it, press **f**.
3. Drive everything from the presenter window.

| Key | |
|---|---|
| `→` `space` `PgDn` | next slide |
| `←` `PgUp` | previous |
| `12` then `Enter` | jump to slide 12 |
| `Home` / `End` | first / last |
| `t` | start / pause the timer |
| `r` | reset everything |
| `s` | reset just this slide's countdown (re-run a slide while rehearsing) |
| `b` | black the audience screen |
| `f` | fullscreen — press on the *audience* window |

The clock starts by itself the first time you leave slide 1.

## Reading the header

```
4 / 74   Ch. III — UAV phenomics   slide 2 of 10 in this section      10:41 AM

┌ THIS SLIDE ┐ ┌ SECTION LEFT ┐ ┌ TALK ──────────────────────────────┐
│    0:47    │ │     8:12     │ │  12:30 / 45:00                     │
│  of 1:30   │ │   of 11:00   │ │  ▓▓▓▓▓▓░░░░░░░  +2:26 ahead        │
└────────────┘ └──────────────┘ └────────────────────────────────────┘
```

- **This slide** and **Section left** count *down*. Green, then amber under 25 %
  left, then red and negative (`−1:20`, "over") when you blow the budget. Each
  box hides itself entirely if that slide or section has no budget.
- Section time accrues per slide and is summed over the section, so jumping
  back to re-explain a slide charges the section correctly.
- **+2:26 ahead / −1:40 behind** compares elapsed time against where your
  budgets say you should be by this slide. Inside ±30 s it just says "on time".
  This is the number to glance at.
- Budgets cascade: an explicit `data-minutes` wins; slides in a section without
  one split whatever that section has left; anything ungrouped splits the talk.
  So putting minutes on your seven blocks alone gives sensible pacing everywhere.

The side panel warns you when the next slide opens a new section, so a block
transition never arrives unannounced.

## While rehearsing

In the presenter window's console, `wsTimings()` returns where the time actually
went — slide number, section, title, spent, budget. Run it after a practice pass
to find the slide that ate four minutes.

## If the next-slide preview sticks

It shouldn't any more, but the failure mode is worth knowing. The preview is a
second copy of the deck in an iframe, driven by `wsPreviewGoTo()`. WebSlides'
own `goToSlide()` silently does nothing while its internal `isMoving` flag is
set, and that flag is only cleared from a transition/animation callback — one
that can fail to fire in a scaled-down, unfocused iframe. When that happened the
preview froze on whichever slide it was showing, usually the first, with no
error anywhere.

Two things now prevent it: transitions and animations are disabled inside the
mirror, and `isMoving` is cleared before every preview call. On top of that,
each preview request is verified and retried; if the preview genuinely cannot be
moved, an amber line appears under it — `preview stuck on slide N (wanted M)` —
rather than the panel quietly showing you the wrong slide.

## The built-in grid overview ("-")

WebSlides ships one, enabled by default (`showIndex` defaults to true — you do
not pass it). It is not documented in the README that came with the library.

| Key | |
|---|---|
| `-` | open the grid: every slide as a numbered thumbnail, the one you are on highlighted |
| click a tile | jump to that slide and close the grid |
| `+` or `Esc` | close without moving |

The Hash plugin also keeps `#slide=N` in the URL as you navigate, so any anchor
`<a href="#slide=24">` jumps to slide 24 — that is all a table-of-contents slide
needs to be.

**Note the clone.** The overview is built by cloning the whole deck into
`#webslides-zoomed` at construction time, so the deck holds two copies of every
slide in the DOM from the moment it loads. Two consequences this file handles
for you: speaker notes are hidden in *both* roots (the clone carries copies of
every `<aside class="notes">`, and hiding them only under `#webslides` would put
your notes on the projector the instant anyone pressed `-`), and the cloned
background videos are disarmed (they keep their `autoplay` attribute, so opening
the overview would start all four at once).

## Jumping around: the outline (`o`)

In the presenter window, **`o`** opens a full-window jump list. This is for Q&A —
when someone asks about the LMI and you need slide 24 without arrowing through
twenty slides in front of the room.

- Slides are grouped under their section headings, numbered, with each slide's
  budget on the right and a dot marking the ones that have speaker notes.
- It opens on the slide you are currently showing.
- **Type to filter** — matches slide titles, section names and slide numbers.
  Typing never reaches the deck, so the room sees nothing.
- `↑` `↓` choose, `Enter` goes, `Esc` closes without moving. Clicking a row works too.

Slides with no heading fall back to their `slide_name`, so build steps show as
`ch3-regression-cv-title` rather than a row of "(no heading)".

## Linking between slides, and the header TOC

The deck's original `slide-name` anchor scheme now works — it is handled in
plain JS inside `presenter.js`. (The `<script>` block that used to do this
called `d3.selectAll` but d3 was never loaded, so it threw on every page load
and no link was ever wired. That block has been deleted.)

Three link forms, resolved to real slide indices at load. Put them on an agenda
slide and it becomes a clickable table of contents:

```html
<a class="slide-name" slide_name="ch3-title">Chapter III</a>   <!-- the deck's own convention -->
<a data-slide-to="24">Straight to slide 24</a>                 <!-- by number -->
<a data-section-to="Ch. III">UAV phenomics</a>                 <!-- first slide of a section -->
```

Each gets a real `href="#slide=N"` (so it is copyable and focusable) plus a
click handler. A link that matches no slide gets no href, is marked
`.ws-nav-unresolved`, and is named in a console warning — it will not silently
do nothing.

**The header bar** is generated from your `<ws-section>` groups: one link per
section, plus a `⌂` home link. It is hidden by default and slides in when the
pointer reaches the top edge of the screen, so it stays off the projector until
you want it. `h` pins it open. The section you are in is highlighted.

Set `window.WS_PRESENTER = { header: 'always' }` to leave it visible, or
`{ header: 'off' }` to suppress it.

## One thing to know if you extend this deck

**WebSlides physically reorders the DOM as you navigate.** `transitionToSlide_`
calls `moveAfterLast()` on the slide you are leaving and `moveBeforeFirst()` on
the one you are entering, so after the first slide change the order of
`#webslides > section` no longer matches slide order. Any code that indexes
slides by DOM position — "the 4th section" — starts pointing at the wrong slide,
silently. Use `ws.slides[i].el`, which keeps each slide's true index, or the
`section-N` ids. This caused a real bug here: the header TOC highlighted the
wrong section after any navigation.

## Two grid-view display bugs, fixed

Both are WebSlides bugs, not deck problems, and both show up as "the slide is
shifted off the top of the screen" or "the screen is blank white".

**1. The deck's internal scroll leaked between slides.** `webslides.css` gives
`#webslides` its own scroll container (`height:100vh; overflow-y:scroll`), and
several slides in this deck have content taller than the viewport. Scroll one of
those — a stray trackpad flick will do it — and WebSlides never resets it:
`transitionToSlide_` calls `scrollTo(0,0)` on the *window*, not on the deck
element. The offset then survived every later slide change, so each subsequent
slide rendered shifted up by it, with blank space below. It looked like a grid
bug because the usual way in is scrolling the grid to find a slide and having
macOS momentum scrolling carry into the deck as the grid closes — which is also
why a longer scroll produced a bigger offset.

Now: the deck's scroll is reset on every slide change and pinned to zero for
900 ms afterwards, which absorbs the momentum. A slide that is genuinely taller
than the window can still be scrolled deliberately; it just cannot contaminate
the next slide.

**2. Interrupting the grid teardown blanked the screen.** `zoomIn()` disables the
deck on a 50 ms timer and `zoomOut()` restores everything on a 400 ms one.
Toggle the grid twice inside that window and the timers interleave: the older
teardown lands after the newer open has started, then the open re-disables the
deck. What is left is `#webslides` with `.disabled` (`position:fixed; z-index:0`)
sitting behind a grid that is parked off-screen but still flagged `.in` — a blank
screen that still behaves as though the grid were open, which is exactly the
"it thinks it's still in grid view" symptom.

Now: the teardown is synchronous, so there is nothing to interleave, and a
sanity check repairs any leftover state on the next slide change. The only thing
lost is a 400 ms fade.

### Worth checking before the talk

`wsOverflowingSlides()` in the console lists slides whose content is taller than
the window, with how many pixels fall below the fold:

```js
> wsOverflowingSlides()
[{slide: 14, title: "...", contentHeight: 1219, viewport: 760, cutOff: 459}, …]
```

Those slides have content the room cannot see without scrolling. That is a
layout issue in the slides themselves, not something this file can fix — but on
a projector with a different aspect ratio than your laptop, the list will differ,
so run it once on the actual display.

## Known pre-existing issues in the thesis deck (not from this change)

- Mermaid, Font Awesome and Google Fonts all load from CDNs. Bad seminar-room
  wi-fi means blank flowcharts and missing icons. Vendor them locally.
- The `<video>` tags have `autoplay` but not `muted`. The WebSlides video plugin
  plays them on slide entry so it works, but `muted playsinline` makes it robust
  against Chrome's autoplay policy.
