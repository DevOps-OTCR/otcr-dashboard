# OTCR slide standards

The standards a deck review checks against. Each one has a status, and the status sets how a finding is worded. Where OTCR has not settled a point, section 6 gives the interim rule to apply.

## How much weight each standard carries

| Status | Meaning | How to word a finding |
|---|---|---|
| **Confirmed** | Read from the OTCR template layout, or stated in OTCR's Slide Design Training | "OTCR's template sets..." or "OTCR's Slide Design Training says..." |
| **Observed** | Measured in OTCR decks, but not stated anywhere as a rule | "OTCR decks use..." |
| **Default** | Generic consulting convention, not OTCR-specific | "below the default of..." |

Use OTCR's own names for the parts of a slide: **running title**, **strapline**, **content**, **key takeaways**.

## 1. Anatomy of an OTCR slide (Confirmed: Slide Design Training)

The training says formatting a slide correctly from top to bottom is essential to OTCR standards, and names four parts:

| Part | Position | Rule |
|---|---|---|
| Running title | Top, in the navy bar | A sentence that describes the main takeaway of the slide. Not a topic label |
| Strapline | Top, in the light-blue band under the title | A fuller explanation of the takeaway in the running title. Avoid "OTCR did..." phrasing: it is about the finding, not the team's activity |
| Content | Middle | The body of the slide |
| Key takeaways | Bottom | A summary of the main takeaways from the slide. See section 6 before reporting it missing |

## 2. Template geometry (Confirmed: template layout)

From the layout `2_Title and Content` (the "updated Sp24 deck" in the training). Inches on a 13.33 x 7.5 in slide.

| # | Element | Value |
|---|---|---|
| 1 | Slide size | 13.33 x 7.5 in (16:9) |
| 2 | Title bar | Solid #003361, full width, from the top edge to 0.80 in |
| 3 | Running title | Arial Bold 20pt, white, left-aligned, vertically centred in the bar. Text starts 0.23 in from the left edge and must stop short of the logo |
| 4 | Logo | White OTCR Consulting logo in the title bar at left 12.07 in, top 0.16 in, 0.98 x 0.42 in |
| 5 | Strapline band | Solid #D5ECFF, full width, 0.80 to 1.53 in, with a #003361 rule along its bottom edge |
| 6 | Strapline text | Arial 14pt regular, black, left-aligned |
| 7 | Slide number | Arial Bold 12pt, black, bottom right (placeholder at left 12.66 in, top 6.93 in) |
| 8 | Source line | Bottom-left placeholder at left 0.03 in, top 7.07 in, 4.43 in wide |
| 9 | Fonts | Arial for headings and body |
| 10 | Theme colours | Navy #003361, teal #006262, light teal #86C7CC, periwinkle #7A7AD4, grey #BFBFBF, dark grey #808080, black text, white background; strapline band #D5ECFF; link colour #009999 |

Positions and fonts can only be checked when the input includes layout data or a rendered view. Otherwise list these rows under "Not checked".

## 3. Written rules (Confirmed: Slide Design Training)

| # | Rule | Where it is checked |
|---|---|---|
| 11 | Cite every meaningful, non-obvious fact. OTCR's research training says to cite in the speaker notes, with a link and an annotation saying what is being cited; the Slide Design Training also allows the citation on the slide | Basic. A missing on-slide source is only a finding if the notes have no citation either; in a PDF the notes cannot be seen, so say so. A notes citation that is a bare link is a Low finding |
| 12 | Everything should be aligned; misaligned elements distract from the content | Basic |
| 13 | Bold important words or concepts, sparingly | Basic |
| 14 | Be concise and frugal with text; use whitespace; do not fill every inch of the slide | Basic (density) |
| 15 | Information flows by importance from top left to bottom right | Basic and advanced |
| 16 | Structure by the pyramid approach: conclusion, then explanation, then supporting data. Data supports the conclusion, not the other way round | Advanced |
| 17 | The deck tells one coherent story: the problem, the solution, the benefits of the solution | Advanced |
| 18 | Simplify: cut unnecessary information and move data to an appendix. Complexity is not an excuse | Advanced |
| 19 | Tailor slides to the client and the audience (a CFO, a CPO and a middle manager need different decks) | Advanced |
| 20 | Think of a slide as a table: rows and columns of mutually exclusive, collectively exhaustive information | Advanced |
| 21 | Review priority: content first, then structure, then design | Both: design findings never outrank content findings |

## 4. Observed in OTCR decks, not stated as rules

| # | Observation |
|---|---|
| 22 | Body text is mostly 12 to 14pt; nothing below 10pt |
| 23 | Running titles fit on one line (79 characters at most) |
| 24 | Most slides carry 60 to 110 words; the densest about 135 |
| 25 | Source lines read "Sources: ..." or "Screenshot source: ...", set at 10pt |
| 26 | Running titles and straplines are in sentence case with no full stop |
| 27 | Callout boxes: white box, thin coloured border, coloured tab label at top left |
| 28 | Section divider: empty title bar with logo, section name centred in Arial Bold about 28pt |
| 29 | Closing slide: "Questions?" in a periwinkle bar |
| 30 | Code and terminal blocks use Courier New |

## 5. Generic defaults (not OTCR-specific)

Text contrast 4.5:1, or 3:1 for large text (WCAG 2.1 AA). At most 6 bullets per slide. Charts: axes titled with units, no default series names, values readable. One bullet style with consistent end punctuation. Same figure, same value, on every slide.

## 6. Unsettled points: interim rules

OTCR has not settled these. Word any finding that rests on one as a recommendation ("consider..."), never as a breach.

| Point | Interim rule |
|---|---|
| Key takeaways | The current template has no place for them. Recommend one where a dense slide leaves the reader to work out the point; never report its absence as a breach |
| Minimum text size, word limit | Use the observed values in section 4 (10pt; about 135 words), worded as "OTCR decks use..." |
| Capitalisation and punctuation | Flag inconsistency within the deck only, not a choice of style |
| Number, currency and date formats | Flag inconsistency within the deck only |
| Where sources go | Speaker notes or an on-slide source line are both acceptable (rule 11) |
| Strapline indent | Accept anything from 0.13 to 0.25 in; flag only if it varies between slides |
| Chart and table styling | Apply the generic defaults in section 5 only |
| Client logo, confidentiality line, date, project name | Do not report their absence |
| Agenda, executive summary, section dividers | Do not report their absence. An appendix for supporting data is recommended (rule 18) |
| Which accent colour for what | Flag only colours outside the theme, or one colour used with two meanings |
| Formatting and grammar beyond this file | Apply generic conventions, worded as "by general convention..." |
