# Campus Wholesale Sizing — Research Brief (Week 3)

**Decision this informs:** whether to open a campus wholesale channel for Harbor Lane Coffee, and at what build capacity.

**Scope:** UIUC dining + independent campus cafés; lb/week; 2-year horizon. Out: retail, non-campus foodservice, retail-packaged.

## Data tables to find

| Sub-question | Table/source to find |
|---|---|
| 1. UIUC dining coffee demand | UIUC Housing/Dining annual report or bid/RFP docs: coffee purchases (lb), contract volumes, vendor list |
| 2. Independent campus café count | Champaign-Urbana health dept. food-service permits; Yelp/Google count reconciled to permits |
| 3. Per-café demand | Cafe POS proxies (reviews as volume proxy), comparable shop benchmarks, national per-outlet lb/week averages |
| 4. Current suppliers/pricing | Distributor price pages (Sysco/US Foods), local roaster price lists |
| 5. Capacity to serve | *Internal:* client price list + capacity (CMS) |

## Sub-question plan

| SQ | Method | Source class | Falsifier |
|---|---|---|---|
| 1 UIUC volume | FOIA/public records request; RFP award docs | Official/regulator | Contract goes to national distributor with volume floor |
| 2 Café universe | Permit list, dedupe chains | Official | Campus area defines <20 independent outlets |
| 3 Per-café lb/wk | Benchmark + 3–5 shop interviews | Primary/estimate | Shops use <5 lb/wk → SOM too small |
| 4 Price position | Compare distributor vs client list | Company primary | Client price > distributor by >20% |
| 5 Margin | Client cost vs achievable price | Internal + S4 | Margin < hurdle → no-go |

## Sources to open and check

1. UIUC Dining procurement/RFP portal — coffee volume, contract term `[UNVERIFIED: open and check]`
2. Champaign-Urbana Public Health District food permits — café count `[UNVERIFIED]`
3. 3–5 café owner interviews — actual lb/week, switch willingness

## Ledger

| ID | Claim | Type | Source | Data date | Confidence |
|---|---|---|---|---|---|
| S1 | UIUC dining coffee volume (lb/yr) | FACT | UIUC procurement docs | TBD | Medium |
| S2 | # independent campus cafés | FACT | CU health permits | TBD | High |
| S3 | Client list price + capacity | FACT | CMS internal | 2026 | High |
| I1 | Campus SOM (lb/wk) | ESTIMATE | S1,S2,S3 | — | Low |
| I2 | Gross margin at achievable price | ESTIMATE | S3,S4 | — | Low |

**Pricing demand:** `[DATA NEEDED: distributor price premium vs client list — decides if client wins on price or must differentiate — 3 distributor quotes]`

**Verify first:** that UIUC Dining publishes actual coffee volumes, and that permit data yields a clean independent-café count. Without both, I1 stays `Low`.
