# GGRU Vitis Seminar — working deck

Forked 9 Sep 2026 from `Maule_2025_08_24_Thesis_Seminar/`, carrying every change
made to that deck. The thesis seminar is untouched and remains the reference
copy. The plan this deck is being built to is `claude/GGRU_Seminar_Plan.md` in
the Claude project; the tooling notes are in `claude/GGRU_Seminar_Tooling.md`.

## Running it

```bash
cd Maule_2026_09_GGRUVitisSeminar
python3 -m http.server 8000
# http://localhost:8000/presentation/presentation.html
```

Serve it — do not open the file directly. The mermaid diagrams and the presenter
view's live preview both need a real origin.

`p` opens the presenter view · `o` its outline · `-` the slide grid ·
`f` fullscreen · `b` black the audience screen · `h` pins the header TOC.
Everything else is in `PRESENTER-README.md`.

## Pre-flight, every time

1. **⌘0 in both windows.** Firefox zoom is per-site and sticky. At 133% the deck
   goes from 5 overflowing slides to 10.
2. **Pavilion 32 set to 1920×1080** (System Settings → Displays → Scaled). Same
   overflow as native 1440p, 33% larger text for viewers.
3. **`wsOverflowingSlides()`** in the console — content below the fold is
   invisible to the room. Trim what it lists.
4. Fullscreen on the Pavilion, share **Screen** in Teams (not Window — macOS
   fullscreen windows share unreliably). Presenter view stays on the MacBook.

## State of this fork

**9 Sep 2026 (late): second pass.** Quote moved off the "My path" slide into its
notes (five phrasings to choose from); Patterson-lab years 2014–2015; chapter labels
replaced by publication status (published / under review / in preparation) on the map
slide, section names and dividers; **Clare et al. 2026 (The Plant Genome) added as a
Block C slide** ("From QTL to a community genotyping platform") — Block C is now 10
slides / 8.5 min; all main-line white slides switched to the dark theme with figures on
white panels (`.figure-white`), so no more white flashes in transitions; video and
cover-photo overlays lightened (`.embed.background.ddark` .1→.3, `.dark` .2→.4,
cover-photo `.background.ddark` .1→.2, `.dark` .2→.32) — figure-based dividers keep
the defaults so text stays readable over them. Backup slides untouched (still white).

**9 Sep 2026 (evening): restructured to the seminar plan.** `presentation/presentation.html`
now follows `prep/01_GGRU_Seminar_Plan.md` §3 slide for slide. The pre-restructure
file is kept as `presentation/presentation.html.bak-before-ggru-scaffold`; the deck
is also a git checkout, so `git diff` shows every change.

- **45 main slides in seven `<ws-section>` blocks** with the plan's minute budgets
  (A 3 · B 4 · C 9 · D 11 · E 7 · F 9 · G 2 = 45), plus per-slide `data-minutes`.
  Press `p` for the presenter view; the section countdowns are live.
- **33 backup slides** in a final `Backup — Q&A` section (no budget): every thesis
  slide that was cut from the main line, plus the CNJ02 2018/2019 plot grids, the
  data-hierarchy figure and the RF fit-by-date figure from the manuscript. Press `o`
  to jump to any of them during questions.
- **Speaker notes on every main slide**, written from the plan (§3, §5, §7): the one
  number to say, the person in the room it is aimed at, and the grape translation.
  The Questions slide's notes hold the §7 short answers.
- **New slides (scaffolded, real content, ready to edit):** My path · The map for
  this talk · Why a grape audience should care · The frost problem (sprinkler photo)
  · Heritabilities + correlations (combined) · What counts as a stable QTL · Results
  (big numbers) · Why this matters to a breeder · The biology in one slide ·
  Experimental design (manuscript fig. 1) · Pipeline · Model comparison (manuscript
  figs. 4 + 6) · Predictor importance (fig. 5) · LMI concept (inline SVG sketch) ·
  Predicted progression by quantile (fig. 8) · Visual validation (fig. 11) ·
  Distributions + BLUPs · 11 QTL · Candidate genes · What a breeder does with this ·
  all seven Block F vision slides · Summary.
- **Manuscript figures** copied (downscaled) to `static/images/ch3/manuscript/`.
- All four `<video>` tags now carry `muted playsinline`.
- Deck-specific CSS for the new slides lives in a `<style>` block in the `<head>`
  (`.map-table`, `.unit-map`, `.card-dark`, `.fit-img`, `.numbers`, …).
- The sample notes / sample sections from the fork are gone.

### 10 Sep — Clare et al. 2026 / rhAmpSeq tether

- `ch2-flexseq` bullets rewritten to point at germplasm characterization and disease
  resistance (accessory-gene representation, fruit-rot 1→4 QTL, trio/identity check);
  left column widened to `flex:1.9` so it fits at 1080p. Speaker notes carry the
  Cadle-Davidson connection (rhAmpSeq→KASP tiering ≈ Flex-Seq→DArTag), the
  "never compare 91.9% to 99.8%" guardrail, and the resolved a-priori-targets TODO:
  Table S2 is the `Zalapa_QTL_30OCT24` sheet (CNJ02/CNJ04/GRYG QTL-peak SNPs),
  160 supplied → 112 pilot → 36 final.
- Aim 3 first bullet now names fixed, transferable markers as the precondition.
- New backup slide `backup-rhampseq-flexseq` (right after the Backup title): 6-row
  rhAmpSeq vs Flex-Seq table, `.cmp-table` CSS added to the head `<style>`.
- Map slide citation punctuation tidied.
- Verified headless (1920×1080): 79 real slides (80 incl. the Quick-Guide comment),
  `wsOverflowingSlides()` back to only the four 7-px video slides.
- Pre-edit copy: `presentation/presentation.html.bak-before-flexseq-edits`.

### 10 Sep — slide 11 (`plot-traits-pics`) overflow fix

- The three trait panels sized themselves from each image's natural height, so the
  panels ended ragged and the section grew past 100vh at anything under ~1080 px of
  viewport height (833 px tall in an 810 px window — i.e. exactly the 133%-zoom case
  the pre-flight warns about). `object-fit:cover` also cropped the Derived-Traits
  schematic's left and right edges, clipping the "Composite Chimera" column header.
- The three columns now share one `.trait-panels .figbox` height
  (`calc(100vh - 33rem)`, capped at `68vh`), so the panels align and the slide fits
  inside 100vh at 1920×1080, 1440×810, 1280×720, 1152×648, 1024×768 and 960×600.
  The two photographs keep `object-fit:cover`; the schematic is `contain` on a
  `.figure-white` ground, so nothing is cropped and the letterbox is invisible.
  `slide-top` dropped (the panels now fill the frame, so centring balances it).
- CSS lives in the head `<style>` under `--- three trait panels ---`.
- Pre-edit copy: `presentation/presentation.html.bak-before-slide11-fix`.

### TODOs left in the deck (grep `TODO:` — they are amber in the presenter notes)

1. **Meta-QTL tally**: the Results and Takeaways slides say **22** cross-study
   meta-QTL (plan/paper); the thesis seminar said 92 (29 multi-trait / 63
   single-trait). Both thesis summary slides are in Backup. Pick one.
2. LMI slide: the diagram is a hand-drawn SVG concept sketch — swap in the real
   decay-curve figure if you have it, or check the sketch's curve shapes.
3. "How" slide: confirm which data standard/database the unit actually uses
   (Breeding Insight / BrAPI? GRIN-Global?) before naming it.
4. Confirm the Londo 5.8 days/°C figure + citation, Workmaster & Palta year,
   Patterson-lab years, flight-date count (8), committee names/affiliations.
5. Frost slide: one grower number (frost nights/yr, water, or $) if you have it.
6. Heritabilities + correlations: if illegible side by side, fall back to the two
   full-bleed originals in Backup.
7. Acks: the "thanks to the committee" footer sits under a shrunk acks image —
   check at 1080p.

### Verified (headless Chromium, 1920×1080)

78 slides load, `<ws-section>` wrappers flatten, no missing local images, no page
errors, presenter view + outline work, `wsOverflowingSlides()` reports only the four
video slides (7 px, same as before). Google Fonts / Font Awesome / mermaid were
blocked in that sandbox, so text metrics there used fallback fonts — re-run
`wsOverflowingSlides()` in Firefox on the Pavilion at ⌘0.

Still to do, in the order the seminar plan recommends:

1. Rehearse twice with a timer (`p`, then `t`); trim what runs long
2. Resolve the TODOs above (the meta-QTL tally first)
3. Vendor mermaid / Font Awesome / Google Fonts locally — no CDN on the day
4. Apply the 2.4rem body-text rule (tooling notes) and re-run `wsOverflowingSlides()`
5. Export a PDF backup deck
