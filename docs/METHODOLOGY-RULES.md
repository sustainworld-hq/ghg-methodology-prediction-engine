# Methodology Rules — Source Analysis

What the two GHG Protocol documents on file actually authorise, and where each
rule in `assets/decision-tables.js` comes from.

**Generated** from the rule data by `tools/build-rules-doc.js`. Do not edit by hand.

**Documents read**

| Document | Pages | Status |
| --- | --- | --- |
| GHG Protocol Corporate Accounting and Reporting Standard, Revised Edition (2004) | 116 | Read in full |
| GHG Protocol Policy and Action Standard (2014) | 192 | Read in full |

**Headline:** of 31 methods in the engine,
**21 are evidenced** by these two documents and **10 are not**.
The gap is not an error in the tables — it is that the documents governing most
Scope 3 methods were not among the files supplied.

---

## 1. What each document actually covers

### Corporate Standard — directly relevant

This is the document that governs the engine. Chapter 6, *Identifying and
Calculating GHG Emissions*, is the operative text.

**Source categories (p.43).** The standard names exactly four Scope 1 source
categories: *stationary combustion, mobile combustion, process emissions,
fugitive emissions*. The engine's four Scope 1 tables map one-to-one onto these.

**The calculation hierarchy (p.44).** The standard sets out three approaches in
descending order of accuracy:

> Direct measurement of GHG emissions by monitoring concentration and flow rate
> is not common. More often, emissions may be calculated based on a **mass
> balance or stoichiometric basis** specific to a facility or process. However,
> the most common approach for calculating GHG emissions is through the
> application of **documented emission factors**.

and refers to the IPCC's *"hierarchy of calculation approaches and techniques
ranging from the application of generic emission factors to direct monitoring."*

**Typical data by scope (p.44).**

| Scope | What the standard expects | Engine method |
| --- | --- | --- |
| 1 | "purchased quantities of commercial fuels ... using published emission factors" | Fuel-based |
| 2 | "metered electricity consumption and supplier-specific, local grid, or other published emission factors" | Location-based / Supplier-specific |
| 3 | "activity data such as fuel use or passenger miles" | Fuel-based / Distance-based |

**Scope 3 activities (p.31).** An *indicative list* only — extraction and
production of purchased materials and fuels; transport-related activities;
employee business travel; commuting; transportation of sold products and waste;
electricity-related activities not in Scope 2; leased assets, franchises and
outsourced activities; use of sold products; waste disposal. Note what is
**absent**: capital goods, processing of sold products, and investments.

### Policy and Action Standard — not directly relevant

This document is about estimating the GHG effect of **government policies**, at
national, subnational or municipal level. It says so itself (p.9):

> This standard ... details a general process that users should follow when
> conducting an assessment, but **it does not prescribe specific calculation
> methodologies, tools, or data sources**.

It cannot authorise an activity-level method, and nothing in the engine should
cite it as the reason a rule exists. Two things do transfer, and both are
principles rather than methods:

1. **Accuracy tiering (Table 8.5, p.85).** Three levels, ordered by data source:
   *international default values* → *national average values* →
   *jurisdiction- or source-specific data*. This is the same ladder the engine
   calls Proxy → Secondary → Primary.
2. **Activity-data families (Table 8.6, p.87).** Litres of fuel, kWh of
   electricity, kg of material, km travelled, hours operated, m² occupied, kg of
   waste. Six of these seven map onto method families already in the engine.

---

## 2. The basis for priority ordering

This is the single most important finding, because rule *order* is what the
engine actually does. Both documents state the same principle independently.

**Corporate Standard, p.44:**

> Companies should use the **most accurate calculation approach available** to
> them and that is appropriate for their reporting context.

> In most cases, if **source- or facility-specific emission factors are
> available, they are preferable** to more generic or general emission factors.

**Policy and Action Standard, p.85:**

> In general, users should follow the **most accurate approach that is
> feasible**. ... more source-specific data often yield more accurate results
> than default data.

The engine's core behaviour — try rules top-down, take the first whose inputs
are present, never fall back to a rougher method when a better one qualifies —
is a direct implementation of that sentence. Every table is ordered
source-specific first, monetary proxy last.

The one thing neither document supplies is the ordering *within* a category —
for example whether fuel-based outranks distance-based for an owned vehicle.
That comes from the GHG Protocol calculation tools, which are not held.

---

## 3. Method families and their evidence

| Method | Data tier | Evidenced by | On what basis |
| --- | --- | --- | --- |
| **Distance-based** | Primary | Corporate Standard p.44 | Scope 3 "calculated from activity data such as fuel use or passenger miles". |
| **Fuel-based** | Primary | Corporate Standard p.44 | Scope 1 "calculated based on the purchased quantities of commercial fuels ... using published emission factors". |
| **Energy-content-based** | Primary | Corporate Standard p.44 | Fuel use data with default carbon content coefficients or periodic fuel sampling. |
| **Spend-based** | Proxy | _Scope 3 Technical Guidance_ — **not held** | Neither document held supports a monetary proxy. Spend-based methods come from the Scope 3 Technical Guidance. |
| **Spend-based (EEIO)** | Proxy | _Scope 3 Technical Guidance_ — **not held** | EEIO screening is a Scope 3 Technical Guidance method, absent from both documents held. |
| **Location-based** | Primary | Corporate Standard p.44 | Scope 2 from metered consumption and "local grid, or other published emission factors". |
| **Market-based** | Primary | _Scope 2 Guidance_ — **not held** | Corporate Standard p.44 admits "supplier-specific" factors, but the market-based method and dual reporting come from the 2015 Scope 2 Guidance, which is not held. |
| **Weight-distance** | Primary | _Scope 3 Technical Guidance_ — **not held** | The Corporate Standard names transport of purchased goods (p.31) but gives no tonne-kilometre method. |
| **Vehicle-distance** | Primary | Policy and Action Standard Table 8.6, p.87 | Activity data "kilometers of distance traveled" against a per-km factor. |
| **Supplier-specific** | Primary | Corporate Standard p.44 | "If source- or facility-specific emission factors are available, they are preferable to more generic or general emission factors." |
| **Average-data (mass)** | Secondary | Policy and Action Standard Table 8.6, p.87 | Activity data "kilograms of material consumed". |
| **Average-data** | Secondary | Policy and Action Standard Table 8.5, p.85 | Intermediate accuracy level: national average values. |
| **Waste-type-specific** | Primary | Policy and Action Standard Table 8.6, p.87 | Activity data "kilograms of waste generated". |
| **Treatment-specific** | Secondary | Policy and Action Standard Table 8.6, p.87 | Same activity data with an average-composition factor. |
| **Material-balance** | Primary | Corporate Standard p.44 | "Emissions may be calculated based on a mass balance or stoichiometric basis specific to a facility or process." |
| **Screening (leak-rate)** | Secondary | Corporate Standard p.43 | Fugitive emissions is a named Scope 1 source category; HFC use in refrigeration is a listed cross-sector calculation tool (p.44). |
| **Simplified screening** | Proxy | Policy and Action Standard Table 8.5, p.85 | Lowest accuracy level: international default values. |
| **Process mass-balance** | Primary | Corporate Standard p.44 | Mass-balance basis. Process emissions is a named Scope 1 source category (p.43). |
| **Stoichiometric (input-based)** | Primary | Corporate Standard p.44 | Stoichiometric basis, same sentence. |
| **Upstream fuel (well-to-tank)** | Primary | Corporate Standard p.31 | "Extraction, production, and transportation of fuels consumed in the generation of electricity." |
| **T&D loss-based** | Primary | Corporate Standard p.31 | "Generation of electricity that is consumed in a T&D system (reported by end-user)." |
| **Night-based (average data)** | Secondary | _Scope 3 Technical Guidance_ — **not held** | Accommodation averages are not in either document held. |
| **Floor-area based** | Secondary | Policy and Action Standard Table 8.6, p.87 | Activity data "square meters of area occupied". |
| **Asset-specific** | Primary | Corporate Standard p.31 | Leased assets, franchises and outsourced activities are named Scope 3 activities. |
| **Volume-based** | Primary | Corporate Standard p.43 | Fugitive emissions from wastewater treatment is a named source; water in the value chain follows the Scope 3 indicative list (p.31). |
| **Direct use-phase** | Primary | _Scope 3 Standard_ — **not held** | Corporate Standard names "use of sold products and services" (p.31) but prescribes no method. |
| **Use-phase fuel-based** | Primary | _Scope 3 Standard_ — **not held** | As above. |
| **Site-specific processing** | Primary | _Scope 3 Standard_ — **not held** | Processing of sold products is not named in either document held. |
| **Investment-specific** | Primary | _Scope 3 Standard_ — **not held** | Investments do not appear in the Corporate Standard Scope 3 list (p.31). PCAF is the working reference. |
| **Economic allocation** | Secondary | _Scope 3 Standard_ — **not held** | As above. |
| **Insufficient Data** | — | Corporate Standard p.44 | The standard requires the most accurate approach available to the company. It nowhere authorises a default when no approach applies. |

---

## 4. The complete rule set

23 activities, 70 rules, as the engine evaluates them.

### Scope 1

#### Stationary Combustion

`SC-RULES v1.0` · Direct — stationary · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `SC-R1` | Fuel Quantity + Fuel Type | Fuel-based | Primary | Corporate Standard p.44 |
| 2 | `SC-R2` | Energy + Fuel Type | Energy-content-based | Primary | Corporate Standard p.44 |
| 3 | `SC-R3` | Spend + Currency + Fuel Type | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Mobile Combustion — Owned Fleet

`MC-RULES v1.1` · Direct — mobile · 4 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `MC-R1` | Fuel Quantity + Fuel Type | Fuel-based | Primary | Corporate Standard p.44 |
| 2 | `MC-R2` | Distance + Mode + Fuel Type | Distance-based | Primary | Corporate Standard p.44 |
| 3 | `MC-R3` | Distance + Mode | Vehicle-distance | Primary | Policy and Action Standard Table 8.6, p.87 |
| 4 | `MC-R4` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Fugitive Emissions — Refrigerants

`FG-RULES v1.0` · Direct — fugitive · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `FG-R1` | Refrigerant + Recharge Qty | Material-balance | Primary | Corporate Standard p.44 |
| 2 | `FG-R2` | Refrigerant + Charge Capacity + Leak Rate | Screening (leak-rate) | Secondary | Corporate Standard p.43 |
| 3 | `FG-R3` | Refrigerant + Equipment Units + Equipment Type | Simplified screening | Proxy | Policy and Action Standard Table 8.5, p.85 |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Industrial Process Emissions

`PR-RULES v1.0` · Direct — process · 2 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `PR-R1` | Process Type + Material Input | Stoichiometric (input-based) | Primary | Corporate Standard p.44 |
| 2 | `PR-R2` | Process Type + Process Output | Process mass-balance | Primary | Corporate Standard p.44 |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

### Scope 2

#### Purchased Electricity

`PE-RULES v1.0` · Indirect — energy · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `PE-R1` | Energy + Grid Region | Location-based | Primary | Corporate Standard p.44 |
| 2 | `PE-R2` | Energy + Contractual Instrument | Market-based | Primary | _Scope 2 Guidance_ — **not held** |
| 3 | `PE-R3` | Spend + Currency + Country | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Purchased Steam, Heat & Cooling

`PS-RULES v1.0` · Indirect — energy · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `PS-R1` | Energy + Supplier Rate | Supplier-specific | Primary | Corporate Standard p.44 |
| 2 | `PS-R2` | Energy + Grid Region | Location-based | Primary | Corporate Standard p.44 |
| 3 | `PS-R3` | Spend + Currency + Country | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

### Scope 3

#### Purchased Goods & Services

`PG-RULES v1.2` · Category 1 · 4 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `PG-R1` | Supplier Data + Quantity | Supplier-specific | Primary | Corporate Standard p.44 |
| 2 | `PG-R2` | Quantity + Material | Average-data (mass) | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `PG-R3` | Spend + Currency + Sector | Spend-based (EEIO) | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| 4 | `PG-R4` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Capital Goods

`CG-RULES v1.0` · Category 2 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `CG-R1` | Supplier Data + Quantity | Supplier-specific | Primary | Corporate Standard p.44 |
| 2 | `CG-R2` | Quantity + Material | Average-data (mass) | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `CG-R3` | Spend + Currency + Sector | Spend-based (EEIO) | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Fuel & Energy-Related Activities

`FE-RULES v1.0` · Category 3 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `FE-R1` | Fuel Quantity + Fuel Type | Upstream fuel (well-to-tank) | Primary | Corporate Standard p.31 |
| 2 | `FE-R2` | Energy + Grid Region | T&D loss-based | Primary | Corporate Standard p.31 |
| 3 | `FE-R3` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Upstream Transportation & Distribution

`UT-RULES v1.1` · Category 4 · 4 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `UT-R1` | Weight + Distance + Mode | Weight-distance | Primary | _Scope 3 Technical Guidance_ — **not held** |
| 2 | `UT-R2` | Fuel Quantity + Fuel Type | Fuel-based | Primary | Corporate Standard p.44 |
| 3 | `UT-R3` | Distance + Mode | Vehicle-distance | Primary | Policy and Action Standard Table 8.6, p.87 |
| 4 | `UT-R4` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Waste Generated in Operations

`WS-RULES v1.0` · Category 5 · 4 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `WS-R1` | Waste Quantity + Waste Type + Treatment | Waste-type-specific | Primary | Policy and Action Standard Table 8.6, p.87 |
| 2 | `WS-R2` | Waste Quantity + Treatment | Treatment-specific | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `WS-R3` | Employees + Country | Average-data | Secondary | Policy and Action Standard Table 8.5, p.85 |
| 4 | `WS-R4` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Business Travel

`BT-RULES v1.0` · Category 6 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `BT-R1` | Distance + Mode | Distance-based | Primary | Corporate Standard p.44 |
| 2 | `BT-R2` | Fuel Quantity + Fuel Type | Fuel-based | Primary | Corporate Standard p.44 |
| 3 | `BT-R3` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Hotel Stays & Accommodation

`HS-RULES v1.0` · Category 6 · 2 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `HS-R1` | Nights + Country | Night-based (average data) | Secondary | _Scope 3 Technical Guidance_ — **not held** |
| 2 | `HS-R2` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Employee Commuting

`EC-RULES v1.0` · Category 7 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `EC-R1` | Distance + Mode _(+ Working Days optional)_ | Distance-based | Primary | Corporate Standard p.44 |
| 2 | `EC-R2` | Fuel Quantity + Fuel Type | Fuel-based | Primary | Corporate Standard p.44 |
| 3 | `EC-R3` | Employees + Country | Average-data | Secondary | Policy and Action Standard Table 8.5, p.85 |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Upstream Leased Assets

`UL-RULES v1.0` · Category 8 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `UL-R1` | Energy + Grid Region | Asset-specific | Primary | Corporate Standard p.31 |
| 2 | `UL-R2` | Floor Area + Asset Type | Floor-area based | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `UL-R3` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Downstream Transportation & Distribution

`DT-RULES v1.0` · Category 9 · 4 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `DT-R1` | Weight + Distance + Mode | Weight-distance | Primary | _Scope 3 Technical Guidance_ — **not held** |
| 2 | `DT-R2` | Fuel Quantity + Fuel Type | Fuel-based | Primary | Corporate Standard p.44 |
| 3 | `DT-R3` | Distance + Mode | Vehicle-distance | Primary | Policy and Action Standard Table 8.6, p.87 |
| 4 | `DT-R4` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Processing of Sold Products

`PS10-RULES v1.0` · Category 10 · 2 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `PS10-R1` | Processing Energy + Grid Region | Site-specific processing | Primary | _Scope 3 Standard_ — **not held** |
| 2 | `PS10-R2` | Quantity + Material | Average-data | Secondary | Policy and Action Standard Table 8.5, p.85 |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Use of Sold Products

`US-RULES v1.0` · Category 11 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `US-R1` | Units Sold + Energy / Use + Lifetime Uses + Grid Region | Direct use-phase | Primary | _Scope 3 Standard_ — **not held** |
| 2 | `US-R2` | Units Sold + Fuel Quantity + Fuel Type | Use-phase fuel-based | Primary | _Scope 3 Standard_ — **not held** |
| 3 | `US-R3` | Units Sold + Product Type | Average-data | Secondary | Policy and Action Standard Table 8.5, p.85 |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### End-of-Life Treatment of Sold Products

`EL-RULES v1.0` · Category 12 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `EL-R1` | Quantity + Material + Treatment | Waste-type-specific | Primary | Policy and Action Standard Table 8.6, p.87 |
| 2 | `EL-R2` | Quantity + Treatment | Treatment-specific | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `EL-R3` | Units Sold + Product Type | Average-data | Secondary | Policy and Action Standard Table 8.5, p.85 |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Downstream Leased Assets

`DL-RULES v1.0` · Category 13 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `DL-R1` | Energy + Grid Region | Asset-specific | Primary | Corporate Standard p.31 |
| 2 | `DL-R2` | Floor Area + Asset Type | Floor-area based | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `DL-R3` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Franchises

`FR-RULES v1.0` · Category 14 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `FR-R1` | Energy + Grid Region | Asset-specific | Primary | Corporate Standard p.31 |
| 2 | `FR-R2` | Floor Area + Franchise Type | Floor-area based | Secondary | Policy and Action Standard Table 8.6, p.87 |
| 3 | `FR-R3` | Spend + Currency | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Investments

`IN-RULES v1.0` · Category 15 · 3 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `IN-R1` | Investee Emissions + Ownership Share | Investment-specific | Primary | _Scope 3 Standard_ — **not held** |
| 2 | `IN-R2` | Investment Value + Investee Revenue + Sector | Economic allocation | Secondary | _Scope 3 Standard_ — **not held** |
| 3 | `IN-R3` | Investment Value + Sector | Spend-based (EEIO) | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |

#### Water Supply & Wastewater

`WT-RULES v1.0` · Category 1 · 2 rules

| Order | Rule | Required inputs | Method | Tier | Evidenced by |
| --- | --- | --- | --- | --- | --- |
| 1 | `WT-R1` | Water Volume + Water Service | Volume-based | Primary | Corporate Standard p.43 |
| 2 | `WT-R2` | Spend + Currency + Country | Spend-based | Proxy | _Scope 3 Technical Guidance_ — **not held** |
| — | — | _no valid match_ | **Insufficient Data** | — | Corporate Standard p.44 |


---

## 5. What these two documents do not cover

Each of these is a real gap. The rules exist and are defensible, but this repo
cannot currently evidence them from the files supplied.

| Missing document | What depends on it |
| --- | --- |
| **Scope 3 Standard (2011)** | The fifteen numbered Scope 3 categories. The engine labels categories `Category 1`…`Category 15`; the Corporate Standard's p.31 list is indicative and unnumbered, and omits capital goods, processing of sold products and investments entirely. |
| **Scope 3 Technical Guidance (2013)** | Every spend-based and EEIO method, the tonne-kilometre freight method, and accommodation night averages — 4 methods in total. |
| **Scope 2 Guidance (2015)** | Location-based / market-based dual reporting. The Corporate Standard (2004) predates it and treats RECs as an offsetting matter (p.61), not as a parallel accounting method. The engine's `PE-RULES` ordering — location-based at priority 1, market-based at 2 — is **not** supported by anything read here. |
| **GHG Protocol calculation tools** | Rule ordering within a category, and the refrigerant screening approaches. |
| **PCAF Standard** | Categories 15 investment methods and the data-quality scores referenced in the rule notes. |

### Correction to make

`REGISTRY.standard` currently reads *"GHG Protocol Corporate Standard + Scope 3
Standard (2011)"*. Only the first of those has been read. Either obtain the
Scope 3 Standard or narrow the claim.

---

## 6. Recommended change: operating-hours method

Policy and Action Standard Table 8.6 (p.87) lists *"hours of time operated"*
against *"kg SF6 emitted per hour of time operated"* as a standard activity-data
family. The engine has no equivalent, and it is a real gap for standby
generators, process refrigeration and leased equipment, where run-hours are
often the only meter available.

This would add a rule, which changes predictions, so it is **not** applied. To
adopt it, add to `FIELDS`:

```js
operatingHours: {
  label: 'Operating Hours', short: 'Operating Hours', kind: 'number', placeholder: '0',
  dict: 'Run-hours of the equipment in the period. Supports the operating-hours method.'
}
```

to `METHODOLOGIES`:

```js
HOURS_BASED: { name: 'Operating-hours based', tier: 'Secondary', confidence: 'Medium',
               blurb: 'Applies a per-hour factor to metered equipment run-time.' }
```

and a rule below the fuel-based rule in `stationaryCombustion`:

```js
{ requires: ['operatingHours', 'fuelType'], methodology: 'HOURS_BASED',
  note: 'Run-hours where no fuel meter exists. PAS Table 8.6, p.87.' }
```

---

*Rule set v1.4.0. Regenerate with `node tools/build-rules-doc.js`.*
