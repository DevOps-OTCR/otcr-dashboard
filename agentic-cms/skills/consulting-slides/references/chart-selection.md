# Chart and Exhibit Selection

The exhibit exists to make one claim undeniable. If the reader needs the title to understand the chart, the chart is wrong.

Choose by **message type**, not by data shape.

---

## 1. Message → exhibit

| Message | Exhibit | Why | Avoid |
|---|---|---|---|
| Rank these | Horizontal bar, sorted by value | Rank reads top-down | Vertical bars with rotated labels |
| Compare a few categories | Horizontal or vertical bar, sorted | Length is the most accurate encoding | Pie, donut |
| Change over time, few series | Line | Continuity | Area with 3+ series |
| Change over time, few periods | Column | Discrete periods | Line for 2 points |
| Composition, one point in time | Stacked bar (≤5 segments) | Parts of a whole | Pie with >5 slices |
| What drove the change | Waterfall / bridge | Shows contribution | Clustered bars |
| Two variables | Scatter, label outliers | Reveals relationship | Two bar charts side by side |
| Distribution | Histogram / box | Shows spread | Mean only |
| Market build | Nested boxes or funnel, with definitions | Makes the funnel explicit | One large number |
| Segment attractiveness | 2×2, axes defined and directional | Forces criteria | Unlabelled quadrants |
| Options vs criteria | Criteria × options table | Comparison is discrete | Prose |
| Sequence | Gantt / chevron roadmap | Time and dependency | Bullet list of phases |
| Risk | Likelihood × impact matrix + triggers | Prioritises | Unranked list |
| Process | Flow, ≤7 boxes | Comprehension limit | Screenshots of tools |
| Concentration | Pareto | Shows the vital few | Unsorted bar |

---

## 2. When a table beats a chart

Use a table when:

- Fewer than ~8 data points and the reader needs exact values.
- Multiple units or mixed metrics.
- The comparison is categorical and non-numeric (criteria, ownership).
- A chart would require more than one sentence of explanation.

Use a chart when the **shape** of the data carries the message.

---

## 3. Axis and label rules

| Rule | Detail |
|---|---|
| Bar charts start at zero | Truncating the axis exaggerates differences |
| Line charts may truncate | Only if the variation matters, and it is labelled |
| Label units on the axis | "€m", "% of firms", "index 2020=100" |
| No dual axes | Two scales invite false correlation; split into two panels |
| Sort meaningfully | By value, not alphabetically, unless order is the point |
| Direct-label series | Removes the legend eye-movement |
| ≤5 series per chart | Beyond that, small multiples |
| Explain the metric | A footnote defining the measure, not just the source |

---

## 4. Annotation

An exhibit without an annotation makes the reader do the work.

| Element | Purpose |
|---|---|
| **Callout** | The one point the eye should hit ("mid-market clusters here") |
| **Reference line** | Budget threshold, industry average, prior year |
| **Range band** | Uncertainty around an estimate |
| **Footnote** | Definition, exclusions, method |

One callout per exhibit. Two callouts mean two exhibits, or one unclear message.

---

## 5. Colour and emphasis

- One accent colour for the point; grey for context.
- Never rely on colour alone to carry meaning (accessibility).
- Highlight the category being discussed; mute the rest.
- Consistency across the deck: same colour = same segment, everywhere.
- No gradients, 3D, shadows, or decorative fills.

---

## 6. Source lines

Every exhibit carries:

```
Source: <publisher>, <data period> (S4); <second publisher> (S7). Note: <definition/exclusion>.
```

| Bad | Good |
|---|---|
| "Source: Company data" | "Source: Vendor price pages, Oct 2026 (S4–S9); list price, excludes implementation" |
| "Source: Industry report" | "Source: [ILLUSTRATIVE] Analyst estimate, FY2025 (S2); method not disclosed" |
| No source | Never acceptable |

If the number is derived, say so: `OTCR analysis of S4–S9`.

---

## 7. Exhibit hygiene checklist

- [ ] The title states the claim, not the metric
- [ ] The chart type matches the message (§1)
- [ ] Axes labelled with units
- [ ] Bars start at zero
- [ ] Sorted meaningfully
- [ ] ≤5 series
- [ ] One callout
- [ ] One accent colour
- [ ] Source line with S-ID and period
- [ ] Metric defined in a footnote
- [ ] No fabricated value filling a gap — `[DATA NEEDED]` instead
- [ ] Legible at presentation size

---

## 8. Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Pie with 7 slices | Angle comparison is inaccurate |
| 3D anything | Distorts magnitude |
| Dual-axis correlation | Implies causation from scaling |
| Truncated bar axis | Manufactures a difference |
| Rainbow palette | No hierarchy |
| Every series labelled | Visual noise |
| Chart of one number | Use a stat callout instead |
| Chart that restates the title | Redundant |
| Screenshot of a spreadsheet | Unreadable, unverifiable |
| Waterfall with unexplained "other" | Hides the actual driver |
