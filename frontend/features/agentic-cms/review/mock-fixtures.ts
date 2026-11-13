// DEMO DATA. Fictional client (Northwind Bikes, also used by the Group 3 skill
// examples), fictional consultants and placeholder links. Nothing here is read
// from the CMS or produced by a model. Delete with the mock client once the
// review-job API exists.

import type { ReviewFailureKind, ReviewLevel, ReviewLocation, ReviewSubmission, Severity, SubmissionFormat } from './types';

export type FixtureComment = { severity: Severity; location: ReviewLocation; issue: string; significance: string; fix: string };

export type FixtureFeedback = { overview: string; skipped: string[]; notCheckable: string[]; comments: FixtureComment[] };

/** A review the mock starts with, timed relative to when the client is created. */
export type SeedReview = {
  submissionId: string;
  submissionVersion: number;
  level: ReviewLevel;
  requestedBy: string;
  agoMs: number;
  failure?: ReviewFailureKind;
  focusNote?: string;
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const PLACEHOLDER_URL = 'https://example.com/otcr-demo/';

export function demoSubmissions(now: number): ReviewSubmission[] {
  const at = (agoMs: number) => new Date(now - agoMs).toISOString();
  return [
    {
      id: 'demo-sub-initial-slides',
      deliverableId: 'demo-del-initial-slides',
      deliverableTitle: 'Campus fleet partnerships — initial deck',
      kind: 'INITIAL_SLIDES',
      format: 'slides',
      version: 2,
      fileName: 'Northwind Campus Fleet v2.pptx',
      fileUrl: `${PLACEHOLDER_URL}northwind-campus-fleet-v2.pptx`,
      submittedAt: at(3 * HOUR),
      submitterName: 'Maya Chen',
      workstreamLabel: 'Week 6',
    },
    {
      id: 'demo-sub-initial-whitepaper',
      deliverableId: 'demo-del-initial-whitepaper',
      deliverableTitle: 'Market entry whitepaper — initial draft',
      kind: 'INITIAL_WHITEPAPER',
      format: 'document',
      version: 1,
      fileName: 'Northwind Market Entry Draft.docx',
      fileUrl: `${PLACEHOLDER_URL}northwind-market-entry-draft.docx`,
      submittedAt: at(40 * MIN),
      submitterName: 'Sam Okafor',
      workstreamLabel: 'Week 6',
    },
    {
      id: 'demo-sub-final-slides',
      deliverableId: 'demo-del-final-slides',
      deliverableTitle: 'Pricing strategy — final deck',
      kind: 'FINAL_SLIDES',
      format: 'slides',
      version: 3,
      fileName: 'Northwind Pricing Final v3.pptx',
      fileUrl: `${PLACEHOLDER_URL}northwind-pricing-final-v3.pptx`,
      submittedAt: at(2 * HOUR),
      submitterName: 'Priya Raman',
      workstreamLabel: 'Week 5',
    },
    {
      id: 'demo-sub-final-whitepaper',
      deliverableId: 'demo-del-final-whitepaper',
      deliverableTitle: 'Pricing strategy — final whitepaper',
      kind: 'FINAL_WHITEPAPER',
      format: 'document',
      version: 1,
      fileName: 'Northwind Pricing Whitepaper.docx',
      fileUrl: `${PLACEHOLDER_URL}northwind-pricing-whitepaper.docx`,
      submittedAt: at(26 * HOUR),
      submitterName: 'Jordan Patel',
      workstreamLabel: 'Week 5',
    },
  ];
}

/** Every review state is visible as soon as the tab opens. */
export const DEMO_SEED: SeedReview[] = [
  // An earlier version was reviewed; v2 has not been yet.
  { submissionId: 'demo-sub-initial-slides', submissionVersion: 1, level: 'BASIC', requestedBy: 'Alex Rivera', agoMs: 2 * 24 * HOUR },
  { submissionId: 'demo-sub-final-whitepaper', submissionVersion: 1, level: 'BASIC', requestedBy: 'Alex Rivera', agoMs: 20 * HOUR },
  { submissionId: 'demo-sub-final-slides', submissionVersion: 3, level: 'ADVANCED', requestedBy: 'Alex Rivera', agoMs: 90 * MIN, failure: 'file_access' },
  {
    submissionId: 'demo-sub-initial-whitepaper',
    submissionVersion: 1,
    level: 'ADVANCED',
    requestedBy: 'Alex Rivera',
    agoMs: 4_000,
    focusNote: 'Check the recommendations against what the client asked for on the 11/05 call.',
  },
];

export const DEMO_FEEDBACK: Record<SubmissionFormat, Record<ReviewLevel, FixtureFeedback>> = {
  slides: {
    BASIC: {
      overview:
        'The deck is close to ready on mechanics. Fix the market-size figure that differs between slides 3 and 7 and add the missing source line on slide 6; the rest is polish.',
      skipped: [],
      notCheckable: ['Speaker notes were not included, so presenter talking points were not checked.'],
      comments: [
        {
          severity: 'MATERIAL',
          location: { type: 'slide', slide: 3, title: 'Market size' },
          issue: 'The serviceable market is $4.2B on this slide but $4.0B on slide 7.',
          significance: 'Two figures for the same number make the client question every other estimate in the deck.',
          fix: 'Use one figure everywhere and note the source year beside it.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'slide', slide: 6, title: 'Fleet utilisation by campus' },
          issue: 'The chart has no source line.',
          significance: 'Unsourced exhibits cannot be checked and are likely to be challenged in the client meeting.',
          fix: 'Add the source and its S-ID under the chart, as on slide 4.',
        },
        {
          severity: 'MINOR',
          location: { type: 'slide', slide: 5, title: 'Competitive landscape' },
          issue: 'The title names a topic instead of stating a takeaway.',
          significance: 'A reader skimming the titles will not get the point this slide supports.',
          fix: 'Rewrite it as a claim, for example “Two operators hold most campus fleet contracts”.',
        },
        {
          severity: 'MINOR',
          location: { type: 'slide', slide: 8, title: 'Partnership models' },
          issue: 'Body text in the right-hand column drops to 10 pt.',
          significance: 'Text below 12 pt is hard to read when the deck is presented.',
          fix: 'Cut the column to three bullets so it fits at 14 pt.',
        },
        {
          severity: 'MINOR',
          location: { type: 'slide', slide: 10, title: 'Adoption forecast' },
          issue: 'The y-axis on the adoption chart has no label or unit.',
          significance: 'Readers cannot tell whether the chart shows riders, trips or revenue.',
          fix: 'Label the axis “Monthly active riders (thousands)”.',
        },
        {
          severity: 'MINOR',
          location: { type: 'general' },
          issue: 'The deck uses “e-bike”, “eBike” and “electric bicycle” interchangeably.',
          significance: 'Inconsistent terms read as carelessness in a client deliverable.',
          fix: 'Use “e-bike” throughout, matching the client’s own materials.',
        },
      ],
    },
    ADVANCED: {
      overview:
        'The analysis is solid, but the recommendation on slide 9 answers a different question from the one in the SOW, and the revenue model rests on an unsourced conversion rate. Resolve both before the client readout.',
      skipped: ['Slide 11'],
      notCheckable: [
        'Speaker notes were not included, so presenter talking points were not checked.',
        'No client call notes were saved for this week, so alignment was checked against the SOW and project overview only.',
      ],
      comments: [
        {
          severity: 'BLOCKING',
          location: { type: 'slide', slide: 9, title: 'Recommendation' },
          issue: 'The recommendation is a direct-to-student subscription, but the SOW scopes this engagement to university fleet partnerships.',
          significance: 'Northwind asked for a partnership strategy. A consumer recommendation answers a different question and falls outside the agreed scope.',
          fix: 'Reframe slide 9 around the partnership options, or confirm the scope change with the client lead before the readout.',
        },
        {
          severity: 'BLOCKING',
          location: { type: 'slide', slide: 7, title: 'Revenue model' },
          issue: 'The 15% referral conversion rate that drives the revenue model has no source.',
          significance: 'The business case depends on this number. If the client asks where it came from, the model loses credibility.',
          fix: 'Cite the two pilot referral agreements, or present 15% as an assumption with a range.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'general' },
          issue: 'Read in order, the slide titles do not form an argument: slides 3–6 describe the market, and no title says what Northwind should do until slide 9.',
          significance: 'The client waits until the end for the answer, and the middle of the deck reads as a data tour.',
          fix: 'State the recommendation in the executive summary on slide 2 and make the titles of slides 3–8 support it.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'slide', slide: 10, title: 'Rollout plan' },
          issue: 'The rollout plan has no decision points or kill criteria.',
          significance: 'Without them the client is approving an open-ended pilot rather than a bounded experiment.',
          fix: 'Add a go/no-go threshold at the end of the first semester.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'slide', slide: 4, title: 'Competitor pricing' },
          issue: 'Competitor pricing comes from a single 2023 blog post.',
          significance: 'One dated, secondary source is weak support for the pricing recommendation on slide 9.',
          fix: 'Add a current primary source, such as published campus rates, or flag the figure as single-source.',
        },
        {
          severity: 'MINOR',
          location: { type: 'slide', slide: 6, title: 'Fleet utilisation by campus' },
          issue: 'The student survey (n = 42, one campus) is presented as representative of all campuses.',
          significance: 'A small single-campus sample overstates confidence in demand.',
          fix: 'Show the sample size and campus on the slide and describe the result as an early signal.',
        },
      ],
    },
  },
  document: {
    BASIC: {
      overview:
        'The draft is well organised. Two figures need sources or need to match, and the executive summary is over the template length; the remaining items are formatting.',
      skipped: [],
      notCheckable: ['Appendix B is a linked spreadsheet and was not read.'],
      comments: [
        {
          severity: 'MATERIAL',
          location: { type: 'section', section: '3. Market sizing' },
          issue: 'The serviceable market is $4.2B in this section but $4.0B in the executive summary.',
          significance: 'Readers will notice the mismatch and doubt the rest of the analysis.',
          fix: 'Use one figure in both places and cite its source once.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'section', section: '3. Market sizing' },
          issue: 'Figure 2 has no caption or source.',
          significance: 'An unsourced figure cannot be checked by the client or by the PM.',
          fix: 'Add a caption with the source and its S-ID.',
        },
        {
          severity: 'MINOR',
          location: { type: 'section', section: 'Executive summary' },
          issue: 'The executive summary is about 410 words; the whitepaper template allows 250.',
          significance: 'Executives often read only this section, and a long one buries the recommendation.',
          fix: 'Cut the market background paragraph, which section 3 already covers.',
        },
        {
          severity: 'MINOR',
          location: { type: 'general' },
          issue: 'Headings mix title case and sentence case.',
          significance: 'Inconsistent headings make the document look unfinished.',
          fix: 'Use sentence case for all headings.',
        },
        {
          severity: 'MINOR',
          location: { type: 'section', section: 'References' },
          issue: 'Three web references have no access date.',
          significance: 'Web sources change; without a date the client cannot verify what was cited.',
          fix: 'Add the date each page was accessed.',
        },
      ],
    },
    ADVANCED: {
      overview:
        'The thesis is sound but arrives late, and the main growth recommendation has no mechanism. A risk the client raised on the 11/05 call is missing. Address these before the final draft.',
      skipped: ['Section “Internal pricing notes” (marked confidential)'],
      notCheckable: ['Appendix B is a linked spreadsheet and was not read.'],
      comments: [
        {
          severity: 'BLOCKING',
          location: { type: 'section', section: '5. Recommendations' },
          issue: 'Recommendation 2 (launch at 12 campuses next year) does not explain how Northwind would win those partnerships.',
          significance: 'A recommendation without a mechanism cannot be evaluated or acted on by the client.',
          fix: 'Name the partnership channel, such as campus transportation offices, and the first two target campuses.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'section', section: '6. Risks' },
          issue: 'Campus speed-limit rules for e-bikes, which the client raised on the 11/05 call, are not addressed.',
          significance: 'The client raised this risk directly; leaving it out suggests the team did not act on their input.',
          fix: 'Add a short risk paragraph naming the campuses that already restrict e-bikes.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'section', section: '3. Market sizing' },
          issue: 'The 18% annual growth figure is cited as “industry research”, but the original source is a vendor press release.',
          significance: 'Describing a vendor claim as research overstates the evidence behind the market estimate.',
          fix: 'Name the vendor as the source, or replace the figure with an independent estimate.',
        },
        {
          severity: 'MATERIAL',
          location: { type: 'section', section: 'Executive summary' },
          issue: 'The thesis, that fleet partnerships beat direct sales, is not stated until section 5.',
          significance: 'Readers of the summary alone will miss the main argument.',
          fix: 'Open the executive summary with the thesis in one sentence.',
        },
        {
          severity: 'MINOR',
          location: { type: 'section', section: '4. Competitive landscape' },
          issue: 'The first half of this section repeats the market overview from section 3.',
          significance: 'Repetition makes the document longer without adding evidence.',
          fix: 'Keep the competitor comparison and refer back to section 3 for market context.',
        },
      ],
    },
  },
};
