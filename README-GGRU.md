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

Carried over from the thesis deck, still labelled and safe to delete:

- three `<aside class="notes">` blocks marked "Sample note"
- an attribute-form section `"Opening (sample)"` on slides 1–3
- a `<ws-section name="Chapter II — Meta-QTL (sample)" minutes="9">` over slides 4–8

They are live examples of the markup; delete them as you replace those slides.

Still to do, in the order the seminar plan recommends:

1. Write block F (vision for GGRU) — 7 slides, from scratch
2. Tighten block D (Ch. III UAV phenomics + LMI) — the centrepiece
3. Trim block C (Ch. II meta-QTL) to 8 slides
4. Wrap each block in a `<ws-section>` with its minute budget (plan §2)
5. Vendor mermaid / Font Awesome / Google Fonts locally — no CDN on the day
6. Add `muted playsinline` to the four `<video>` tags
7. Export a PDF backup deck
