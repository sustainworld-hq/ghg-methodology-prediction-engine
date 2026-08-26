/* ==========================================================================
   SustainGHG - Governed Decision Table Library
   --------------------------------------------------------------------------
   This file is DATA, not logic. It is the artefact a methodology governance
   board reviews, versions and approves. The engine in app.js reads it and
   does nothing that is not written here - no defaults, no inference.

   Structure
     FIELDS         field dictionary: every input the engine can read
     METHODOLOGIES  the closed set of outcomes the engine may predict
     CATEGORIES     one governed decision table per activity category
     SCENARIOS      pre-loaded activity records for demonstration
   ========================================================================== */

const REGISTRY = {
  version: 'v1.4.0',
  approved: '2026-04-18',
  owner: 'GHG Methodology Governance Board',
  /* Only the Corporate Standard has actually been read against these tables.
     See docs/METHODOLOGY-RULES.md for what is and is not evidenced. */
  standard: 'GHG Protocol Corporate Standard (2004), read. Scope 3 / Scope 2 guidance not yet verified.'
};

/* ------------------------------------------------------------- 1. FIELDS -- */
/* short  : label used inside decision-table rules
   kind   : number | text | select
   unitOf : id of the companion unit field rendered beside it
   dim    : unit dimension, checked during validation
   dict   : plain-English definition shown in the Field Dictionary          */

const FIELDS = {
  /* --- context ---------------------------------------------------------- */
  activityCategory: {
    label: 'Activity Category', short: 'Category', kind: 'select', context: true,
    dict: 'Selects which governed decision table the engine loads. Drives everything downstream.'
  },
  activityType: {
    label: 'Activity Type / Template', short: 'Template', kind: 'select', context: true,
    dict: 'Data-entry template within a category. Narrows the expected inputs; does not change rule priority.'
  },
  reportingYear: {
    label: 'Reporting Year', short: 'Year', kind: 'select', context: true,
    options: ['2021', '2022', '2023', '2024', '2025', '2026', '2027'],
    dict: 'Inventory year the record belongs to. Must fall inside the open reporting window.'
  },
  country: {
    label: 'Country', short: 'Country', kind: 'select', context: true,
    options: ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore',
              'United Arab Emirates', 'Australia', 'Japan', 'Brazil', 'Other / Global'],
    dict: 'Geography of the activity. Used by rules that require a country-resolved dataset.'
  },
  region: {
    label: 'Region / State', short: 'Region', kind: 'text', context: true,
    placeholder: 'e.g. Tamil Nadu',
    dict: 'Sub-national location. Informational unless a rule names it explicitly.'
  },

  /* --- distance --------------------------------------------------------- */
  distance: {
    label: 'Distance', short: 'Distance', kind: 'number', unitOf: 'distanceUnit', placeholder: '0',
    dict: 'Measured or booked travel distance for the activity.'
  },
  distanceUnit: {
    label: 'Distance Unit', short: 'Distance Unit', kind: 'select', dim: 'distance',
    options: ['km', 'passenger.km', 'tonne.km', 'vehicle.km', 'miles'],
    dict: 'Unit of the distance value. Must be a distance dimension.'
  },
  mode: {
    label: 'Mode', short: 'Mode', kind: 'select',
    options: ['Air — Short Haul (<1,600 km)', 'Air — Medium Haul', 'Air — Long Haul (>3,700 km)',
              'Rail — Intercity', 'Rail — Metro / Suburban', 'Road — Car (Petrol)', 'Road — Car (Diesel)',
              'Road — Car (Battery Electric)', 'Road — Taxi', 'Road — Bus / Coach',
              'Road — Two-wheeler', 'Sea — Ferry'],
    dict: 'Transport mode. Determines which distance-based dataset family applies.'
  },

  /* --- fuel ------------------------------------------------------------- */
  fuelQuantity: {
    label: 'Fuel Quantity', short: 'Fuel Quantity', kind: 'number', unitOf: 'fuelUnit', placeholder: '0',
    dict: 'Volume or mass of fuel purchased or combusted in the period.'
  },
  fuelUnit: {
    label: 'Fuel Unit', short: 'Fuel Unit', kind: 'select', dim: 'fuel',
    options: ['litre', 'kg', 'm³', 'GJ', 'gallon (US)'],
    dict: 'Unit of the fuel quantity. Must be a volume, mass or energy dimension.'
  },
  fuelType: {
    label: 'Fuel Type', short: 'Fuel Type', kind: 'select',
    options: ['Diesel', 'Petrol / Gasoline', 'CNG', 'LPG', 'Jet Kerosene (Jet A-1)', 'Aviation Gasoline',
              'Natural Gas', 'Coal — Bituminous', 'Furnace Oil / HFO', 'Biodiesel (B20)', 'Ethanol (E10)'],
    dict: 'Fuel product combusted. Without it a fuel quantity cannot be resolved to a methodology.'
  },

  /* --- energy ----------------------------------------------------------- */
  energyConsumption: {
    label: 'Energy Consumption', short: 'Energy', kind: 'number', unitOf: 'energyUnit', placeholder: '0',
    dict: 'Metered energy delivered to the reporting boundary.'
  },
  energyUnit: {
    label: 'Energy Unit', short: 'Energy Unit', kind: 'select', dim: 'energy',
    options: ['kWh', 'MWh', 'GJ', 'MMBtu'],
    dict: 'Unit of the energy value. Must be an energy dimension.'
  },
  gridRegion: {
    label: 'Grid Region', short: 'Grid Region', kind: 'select',
    options: ['Southern Region (SR)', 'Northern Region (NR)', 'Western Region (WR)',
              'Eastern Region (ER)', 'North-Eastern Region (NER)', 'All India (National Grid)',
              'UK — National Grid', 'US — WECC', 'US — RFC', 'EU — ENTSO-E', 'Other'],
    dict: 'Grid balancing area the electricity was drawn from. Required by every location-based rule.'
  },
  contractualInstrument: {
    label: 'Contractual Instrument', short: 'Contractual Instrument', kind: 'select',
    options: ['I-REC (India)', 'REC (United States)', 'Guarantee of Origin (EU)', 'PPA — Physical',
              'PPA — Virtual', 'Supplier green tariff', 'Residual mix (no instrument claimed)'],
    dict: 'Energy attribute certificate or contract backing the electricity claim. Required by every market-based rule.'
  },

  /* --- financial -------------------------------------------------------- */
  spend: {
    label: 'Spend', short: 'Spend', kind: 'number', unitOf: 'currency', placeholder: '0',
    dict: 'Procurement value of the activity, net of taxes. Lowest-priority input in every table that accepts it.'
  },
  currency: {
    label: 'Currency', short: 'Currency', kind: 'select', dim: 'currency',
    options: ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'JPY', 'BRL'],
    dict: 'ISO currency of the spend value. A spend without a currency cannot be matched.'
  },
  sectorCode: {
    label: 'EEIO Sector', short: 'Sector', kind: 'select',
    options: ['Air transport', 'Land transport & pipelines', 'Accommodation & food service',
              'Machinery & equipment mfg', 'Basic metals', 'Chemicals & chemical products',
              'Construction', 'Professional services', 'Food & beverage mfg',
              'IT & telecom services', 'Financial services'],
    dict: 'Environmentally-extended input-output sector used to interpret a spend value.'
  },

  /* --- freight ---------------------------------------------------------- */
  freightMass: {
    label: 'Shipment Weight', short: 'Weight', kind: 'number', unitOf: 'massUnit', placeholder: '0',
    dict: 'Gross mass of goods moved. Combined with distance it yields tonne-kilometres.'
  },
  massUnit: {
    label: 'Weight Unit', short: 'Weight Unit', kind: 'select', dim: 'mass',
    options: ['kg', 'tonne', 'lb'],
    dict: 'Unit of a mass value. Must be a mass dimension.'
  },

  /* --- commuting & accommodation ---------------------------------------- */
  employeeCount: {
    label: 'Employee Count', short: 'Employees', kind: 'number', placeholder: '0',
    dict: 'Headcount in scope for the activity. Supports average-data rules only.'
  },
  workingDays: {
    label: 'Working Days', short: 'Working Days', kind: 'number', placeholder: '0',
    dict: 'Commuting days in the period. Optional refinement on distance-based commuting.'
  },
  nights: {
    label: 'Room Nights', short: 'Nights', kind: 'number', placeholder: '0',
    dict: 'Occupied room nights. Primary input for accommodation average-data rules.'
  },

  /* --- waste & water ---------------------------------------------------- */
  wasteQuantity: {
    label: 'Waste Quantity', short: 'Waste Quantity', kind: 'number', unitOf: 'wasteUnit', placeholder: '0',
    dict: 'Mass or volume of waste transferred off site.'
  },
  wasteUnit: {
    label: 'Waste Unit', short: 'Waste Unit', kind: 'select', dim: 'mass',
    options: ['kg', 'tonne', 'm³'],
    dict: 'Unit of the waste quantity.'
  },
  wasteType: {
    label: 'Waste Type', short: 'Waste Type', kind: 'select',
    options: ['Mixed municipal waste', 'Paper & cardboard', 'Plastics (mixed)', 'Food & organic',
              'Metals', 'Glass', 'WEEE / e-waste', 'Hazardous chemical',
              'Construction & demolition', 'Wastewater sludge'],
    dict: 'Waste stream composition. Required for the waste-type-specific methodology.'
  },
  treatmentMethod: {
    label: 'Treatment Method', short: 'Treatment', kind: 'select',
    options: ['Landfill', 'Recycling (closed-loop)', 'Recycling (open-loop)', 'Composting',
              'Anaerobic digestion', 'Incineration — with energy recovery',
              'Incineration — no energy recovery', 'Wastewater treatment'],
    dict: 'Disposal or recovery route applied to the waste stream.'
  },
  waterVolume: {
    label: 'Water Volume', short: 'Water Volume', kind: 'number', unitOf: 'waterUnit', placeholder: '0',
    dict: 'Volume of water supplied to or discharged from the boundary.'
  },
  waterUnit: {
    label: 'Water Unit', short: 'Water Unit', kind: 'select', dim: 'volume',
    options: ['m³', 'kL', 'litre'],
    dict: 'Unit of the water volume.'
  },
  waterService: {
    label: 'Water Service', short: 'Water Service', kind: 'select',
    options: ['Supply only', 'Treatment only', 'Supply + Treatment'],
    dict: 'Which municipal service the volume relates to. Supply and treatment carry different datasets.'
  },

  /* --- refrigerants & process ------------------------------------------- */
  refrigerantType: {
    label: 'Refrigerant Type', short: 'Refrigerant', kind: 'select',
    options: ['R-410A', 'R-134a', 'R-32', 'R-404A', 'R-407C', 'R-22 (HCFC)',
              'R-744 (CO₂)', 'R-717 (Ammonia)'],
    dict: 'Refrigerant gas in the equipment. Required by every fugitive-emission rule.'
  },
  refrigerantRecharge: {
    label: 'Quantity Recharged (kg)', short: 'Recharge Qty', kind: 'number', placeholder: '0',
    dict: 'Refrigerant added during servicing in the period. The observed term in a material balance.'
  },
  equipmentCharge: {
    label: 'Equipment Charge Capacity (kg)', short: 'Charge Capacity', kind: 'number', placeholder: '0',
    dict: 'Nameplate refrigerant charge of the installed equipment.'
  },
  leakRate: {
    label: 'Assumed Leak Rate (%)', short: 'Leak Rate', kind: 'number', placeholder: '0',
    dict: 'Governed annual leakage assumption for the equipment class, 0-100%.'
  },
  equipmentUnits: {
    label: 'Units of Equipment', short: 'Equipment Units', kind: 'number', placeholder: '0',
    dict: 'Count of installed units. Supports the simplified screening rule only.'
  },
  equipmentType: {
    label: 'Equipment Type', short: 'Equipment Type', kind: 'select',
    options: ['Split AC', 'Chiller — centrifugal', 'VRF system', 'Cold storage',
              'Vehicle air-conditioning', 'Process refrigeration'],
    dict: 'Equipment class, used to select a governed default leak rate.'
  },
  processOutput: {
    label: 'Process Output (tonne)', short: 'Process Output', kind: 'number', placeholder: '0',
    dict: 'Mass of product leaving the industrial process in the period.'
  },
  processInput: {
    label: 'Raw Material Input (tonne)', short: 'Material Input', kind: 'number', placeholder: '0',
    dict: 'Mass of carbonate or feedstock entering the process.'
  },
  processType: {
    label: 'Process Type', short: 'Process Type', kind: 'select',
    options: ['Cement — clinker production', 'Lime production', 'Ammonia production',
              'Iron & steel — BF/BOF', 'Aluminium smelting (PFC)', 'Glass production',
              'Nitric acid production'],
    dict: 'Industrial process generating non-combustion emissions.'
  },

  /* --- value chain ------------------------------------------------------ */
  supplierData: {
    label: 'Supplier Data', short: 'Supplier Data', kind: 'select',
    options: ['Verified supplier product footprint (PCF)', 'Unverified supplier product footprint',
              'Supplier Scope 1+2 with allocation'],
    dict: 'Primary data received from the supplier. Outranks every generic dataset when present.'
  },
  materialMass: {
    label: 'Quantity Purchased', short: 'Quantity', kind: 'number', unitOf: 'massUnit', placeholder: '0',
    dict: 'Physical quantity of goods purchased, in mass units.'
  },
  materialType: {
    label: 'Material / Product Type', short: 'Material', kind: 'select',
    options: ['Steel — primary', 'Steel — recycled', 'Aluminium', 'Cement', 'Plastic — PET',
              'Plastic — HDPE', 'Paper & pulp', 'Cotton textile', 'Glass', 'Copper',
              'Electronics assembly', 'Chemicals — generic'],
    dict: 'Material classification used to resolve a mass-based average dataset.'
  },
  floorArea: {
    label: 'Floor Area', short: 'Floor Area', kind: 'number', unitOf: 'floorAreaUnit', placeholder: '0',
    dict: 'Gross internal area of the asset. Supports floor-area average-data rules.'
  },
  floorAreaUnit: {
    label: 'Area Unit', short: 'Area Unit', kind: 'select', dim: 'area',
    options: ['m²', 'sq.ft'],
    dict: 'Unit of the floor area.'
  },
  assetType: {
    label: 'Asset Type', short: 'Asset Type', kind: 'select',
    options: ['Office', 'Warehouse', 'Retail', 'Data centre', 'Manufacturing plant', 'Vehicle fleet'],
    dict: 'Class of leased or operated asset.'
  },
  franchiseType: {
    label: 'Franchise Type', short: 'Franchise Type', kind: 'select',
    options: ['Retail outlet', 'Restaurant / QSR', 'Hotel', 'Service centre'],
    dict: 'Class of franchised operation.'
  },
  unitsSold: {
    label: 'Units Sold', short: 'Units Sold', kind: 'number', placeholder: '0',
    dict: 'Count of products sold in the reporting period.'
  },
  energyPerUse: {
    label: 'Energy per Use (kWh)', short: 'Energy / Use', kind: 'number', placeholder: '0',
    dict: 'Measured energy drawn by the product in one use cycle.'
  },
  usesPerLifetime: {
    label: 'Uses per Lifetime', short: 'Lifetime Uses', kind: 'number', placeholder: '0',
    dict: 'Governed assumption for total use cycles over the product lifetime.'
  },
  productType: {
    label: 'Product Type', short: 'Product Type', kind: 'select',
    options: ['Domestic appliance', 'Industrial equipment', 'Consumer electronics',
              'Vehicle', 'Packaging', 'Building material'],
    dict: 'Product class, used to resolve average use-phase or end-of-life datasets.'
  },
  processingEnergy: {
    label: 'Downstream Processing Energy (kWh)', short: 'Processing Energy', kind: 'number', placeholder: '0',
    dict: 'Energy consumed by the customer to process the intermediate product sold.'
  },
  steamSource: {
    label: 'Supplier Emission Rate', short: 'Supplier Rate', kind: 'select',
    options: ['Supplier-published emission rate', 'Metered supplier data', 'Default grid / heat factor'],
    dict: 'Basis on which the steam, heat or cooling supplier reports its emission intensity.'
  },
  investmentValue: {
    label: 'Investment Value', short: 'Investment Value', kind: 'number', unitOf: 'currency', placeholder: '0',
    dict: 'Carrying value of the equity or debt investment.'
  },
  ownershipShare: {
    label: 'Ownership Share (%)', short: 'Ownership Share', kind: 'number', placeholder: '0',
    dict: 'Reporting company share of the investee, 0-100%.'
  },
  investeeEmissions: {
    label: 'Investee Emissions (tCO₂e)', short: 'Investee Emissions', kind: 'number', placeholder: '0',
    dict: 'Reported Scope 1+2 of the investee. The only primary-data input for Category 15.'
  },
  investeeRevenue: {
    label: 'Investee Revenue', short: 'Investee Revenue', kind: 'number', unitOf: 'currency', placeholder: '0',
    dict: 'Investee turnover, used to allocate sector-average intensity.'
  }
};

/* ---------------------------------------------------- 2. METHODOLOGIES --- */
/* tier drives confidence. There is no fourth option and no "best guess".   */

const METHODOLOGIES = {
  DIST_BASED:     { name: 'Distance-based',              tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies a mode-specific factor to measured distance.' },
  FUEL_BASED:     { name: 'Fuel-based',                  tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies a fuel-specific factor to metered fuel quantity.' },
  ENERGY_CONTENT: { name: 'Energy-content-based',        tier: 'Primary',   confidence: 'High',
                    blurb: 'Converts fuel to energy content before applying a factor.' },
  SPEND_BASED:    { name: 'Spend-based',                 tier: 'Proxy',     confidence: 'Low',
                    blurb: 'Applies a monetary intensity to procurement value. Screening quality only.' },
  EEIO:           { name: 'Spend-based (EEIO)',          tier: 'Proxy',     confidence: 'Low',
                    blurb: 'Applies an input-output sector intensity to spend.' },
  LOC_BASED:      { name: 'Location-based',              tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies the average grid intensity of the balancing area.' },
  MKT_BASED:      { name: 'Market-based',                tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies the intensity of the contractual instrument claimed.' },
  WT_DIST:        { name: 'Weight-distance',             tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies a tonne-kilometre factor to mass moved over distance.' },
  VEH_DIST:       { name: 'Vehicle-distance',            tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies a vehicle-kilometre factor where load is unknown.' },
  SUPPLIER_SPEC:  { name: 'Supplier-specific',           tier: 'Primary',   confidence: 'High',
                    blurb: 'Uses primary data reported by the supplier for the purchased item.' },
  AVG_MASS:       { name: 'Average-data (mass)',         tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Applies a material cradle-to-gate factor to physical quantity.' },
  AVG_DATA:       { name: 'Average-data',                tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Applies a governed average intensity to a physical activity driver.' },
  WASTE_TYPE:     { name: 'Waste-type-specific',         tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies a factor resolved from both waste stream and treatment route.' },
  WASTE_TREAT:    { name: 'Treatment-specific',          tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Applies an average-composition factor for the treatment route.' },
  MAT_BALANCE:    { name: 'Material-balance',            tier: 'Primary',   confidence: 'High',
                    blurb: 'Derives fugitive loss from refrigerant actually recharged.' },
  SCREEN_LEAK:    { name: 'Screening (leak-rate)',       tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Applies a governed leak rate to installed charge.' },
  SCREEN_SIMPLE:  { name: 'Simplified screening',        tier: 'Proxy',     confidence: 'Low',
                    blurb: 'Applies a default charge and leak rate per equipment unit.' },
  PROC_MASS:      { name: 'Process mass-balance',        tier: 'Primary',   confidence: 'High',
                    blurb: 'Derives process emissions from output mass and process chemistry.' },
  PROC_STOICH:    { name: 'Stoichiometric (input-based)', tier: 'Primary',  confidence: 'High',
                    blurb: 'Derives process emissions from carbonate or feedstock input.' },
  WTT_FUEL:       { name: 'Upstream fuel (well-to-tank)', tier: 'Primary',  confidence: 'High',
                    blurb: 'Applies an upstream extraction and refining factor to fuel purchased.' },
  TD_LOSS:        { name: 'T&D loss-based',              tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies grid transmission and distribution loss rates to energy imported.' },
  NIGHT_BASED:    { name: 'Night-based (average data)',  tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Applies a country average per occupied room night.' },
  FLOOR_AREA:     { name: 'Floor-area based',            tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Applies an asset-class intensity per unit floor area.' },
  ASSET_SPEC:     { name: 'Asset-specific',              tier: 'Primary',   confidence: 'High',
                    blurb: 'Uses metered energy for the specific asset.' },
  VOL_WATER:      { name: 'Volume-based',                tier: 'Primary',   confidence: 'High',
                    blurb: 'Applies supply or treatment factors to metered water volume.' },
  USE_DIRECT:     { name: 'Direct use-phase',            tier: 'Primary',   confidence: 'High',
                    blurb: 'Models lifetime energy of sold products against a grid intensity.' },
  USE_FUEL:       { name: 'Use-phase fuel-based',        tier: 'Primary',   confidence: 'High',
                    blurb: 'Models lifetime fuel combustion of sold products.' },
  SITE_PROC:      { name: 'Site-specific processing',    tier: 'Primary',   confidence: 'High',
                    blurb: 'Uses customer-reported energy to process the intermediate product.' },
  INVEST_SPEC:    { name: 'Investment-specific',         tier: 'Primary',   confidence: 'High',
                    blurb: 'Allocates reported investee emissions by ownership share.' },
  ECON_ALLOC:     { name: 'Economic allocation',         tier: 'Secondary', confidence: 'Medium',
                    blurb: 'Allocates sector-average intensity by revenue share.' },
  INSUFFICIENT:   { name: 'Insufficient Data',           tier: '—',         confidence: 'None',
                    blurb: 'No governed rule was satisfied. The engine stops rather than assume.' }
};

/* ------------------------------------------------------- 3. CATEGORIES --- */
/* Rules are evaluated strictly in priority order. First satisfied rule wins.
   `requires` is an AND list of field ids. `optional` refines but never gates. */

const CATEGORIES = [
  /* ============================ SCOPE 1 ================================= */
  {
    id: 'stationaryCombustion', label: 'Stationary Combustion',
    scope: 'Scope 1', ghgCat: 'Direct — stationary', table: 'SC-RULES', tableVersion: 'v1.0',
    templates: ['Boiler / Furnace', 'Diesel Generator', 'Process Heater', 'Cooking / Kitchen'],
    fields: ['fuelQuantity', 'fuelType', 'energyConsumption', 'spend'],
    rules: [
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'FUEL_BASED',
        note: 'Metered fuel purchase is the preferred basis for all stationary sources.' },
      { requires: ['energyConsumption', 'fuelType'], methodology: 'ENERGY_CONTENT',
        note: 'Used where the site meters delivered energy rather than fuel volume.' },
      { requires: ['spend', 'currency', 'fuelType'], methodology: 'SPEND_BASED',
        note: 'Screening only. Fuel price volatility makes this unsuitable for disclosure.' }
    ]
  },
  {
    id: 'mobileCombustion', label: 'Mobile Combustion — Owned Fleet',
    scope: 'Scope 1', ghgCat: 'Direct — mobile', table: 'MC-RULES', tableVersion: 'v1.1',
    templates: ['Company Car', 'Light Commercial Vehicle', 'Heavy Goods Vehicle', 'Owned Aircraft', 'Marine Vessel'],
    fields: ['fuelQuantity', 'fuelType', 'distance', 'mode', 'spend'],
    fieldOptions: {
      mode: ['Road — Car (Petrol)', 'Road — Car (Diesel)', 'Road — Car (Battery Electric)',
             'Road — LGV (<3.5t)', 'Road — HGV (>7.5t)', 'Road — Two-wheeler',
             'Air — Owned Aircraft', 'Sea — Owned Vessel']
    },
    rules: [
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'FUEL_BASED',
        note: 'Fuel card and bunker records outrank odometer data for owned assets.' },
      { requires: ['distance', 'mode', 'fuelType'], methodology: 'DIST_BASED',
        note: 'Odometer distance with a known powertrain.' },
      { requires: ['distance', 'mode'], methodology: 'VEH_DIST',
        note: 'Average-vehicle factor where the fuel type is unrecorded.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Fuel spend fallback. Flag for data-quality improvement.' }
    ]
  },
  {
    id: 'fugitiveRefrigerants', label: 'Fugitive Emissions — Refrigerants',
    scope: 'Scope 1', ghgCat: 'Direct — fugitive', table: 'FG-RULES', tableVersion: 'v1.0',
    templates: ['Building HVAC', 'Cold Chain', 'Vehicle Air-conditioning', 'Process Refrigeration'],
    fields: ['refrigerantType', 'refrigerantRecharge', 'equipmentCharge', 'leakRate', 'equipmentUnits', 'equipmentType'],
    rules: [
      { requires: ['refrigerantType', 'refrigerantRecharge'], methodology: 'MAT_BALANCE',
        note: 'Service records showing gas actually added are the highest-quality basis.' },
      { requires: ['refrigerantType', 'equipmentCharge', 'leakRate'], methodology: 'SCREEN_LEAK',
        note: 'Installed charge with a governed leak-rate assumption.' },
      { requires: ['refrigerantType', 'equipmentUnits', 'equipmentType'], methodology: 'SCREEN_SIMPLE',
        note: 'Unit count only. Both charge and leak rate come from governed defaults.' }
    ]
  },
  {
    id: 'processEmissions', label: 'Industrial Process Emissions',
    scope: 'Scope 1', ghgCat: 'Direct — process', table: 'PR-RULES', tableVersion: 'v1.0',
    templates: ['Cement Kiln', 'Lime Kiln', 'Ammonia Plant', 'Steel — BF/BOF', 'Aluminium Smelter'],
    fields: ['processType', 'processOutput', 'processInput', 'spend'],
    rules: [
      { requires: ['processType', 'processInput'], methodology: 'PROC_STOICH',
        note: 'Carbonate input is measured directly and converts stoichiometrically.' },
      { requires: ['processType', 'processOutput'], methodology: 'PROC_MASS',
        note: 'Output mass with a governed clinker or product factor.' }
    ]
  },

  /* ============================ SCOPE 2 ================================= */
  {
    id: 'purchasedElectricity', label: 'Purchased Electricity',
    scope: 'Scope 2', ghgCat: 'Indirect — energy', table: 'PE-RULES', tableVersion: 'v1.0',
    templates: ['Grid Import — Office', 'Grid Import — Plant', 'EV Charging', 'Data Centre Draw'],
    fields: ['energyConsumption', 'gridRegion', 'contractualInstrument', 'spend'],
    rules: [
      { requires: ['energyConsumption', 'gridRegion'], methodology: 'LOC_BASED',
        note: 'Dual reporting requires a location-based figure whenever grid region is known.' },
      { requires: ['energyConsumption', 'contractualInstrument'], methodology: 'MKT_BASED',
        note: 'Applied when an attribute certificate or contract is evidenced.' },
      { requires: ['spend', 'currency', 'country'], methodology: 'SPEND_BASED',
        note: 'Tariff-derived estimate. Permitted only for unmetered minor sites.' }
    ]
  },
  {
    id: 'purchasedSteam', label: 'Purchased Steam, Heat & Cooling',
    scope: 'Scope 2', ghgCat: 'Indirect — energy', table: 'PS-RULES', tableVersion: 'v1.0',
    templates: ['District Heating', 'District Cooling', 'Purchased Steam', 'Chilled Water'],
    fields: ['energyConsumption', 'steamSource', 'gridRegion', 'spend'],
    rules: [
      { requires: ['energyConsumption', 'steamSource'], methodology: 'SUPPLIER_SPEC',
        note: 'Supplier-published intensity is preferred wherever the utility discloses one.' },
      { requires: ['energyConsumption', 'gridRegion'], methodology: 'LOC_BASED',
        note: 'Regional default heat or cooling factor.' },
      { requires: ['spend', 'currency', 'country'], methodology: 'SPEND_BASED',
        note: 'Screening estimate from utility invoices.' }
    ]
  },

  /* ============================ SCOPE 3 ================================= */
  {
    id: 'purchasedGoods', label: 'Purchased Goods & Services',
    scope: 'Scope 3', ghgCat: 'Category 1', table: 'PG-RULES', tableVersion: 'v1.2',
    templates: ['Raw Materials', 'Components', 'Packaging', 'Professional Services', 'IT Services'],
    fields: ['supplierData', 'materialMass', 'materialType', 'spend', 'sectorCode'],
    rules: [
      { requires: ['supplierData', 'materialMass'], methodology: 'SUPPLIER_SPEC',
        note: 'A supplier product footprint outranks every generic dataset.' },
      { requires: ['materialMass', 'materialType'], methodology: 'AVG_MASS',
        note: 'Cradle-to-gate material factor applied to purchased quantity.' },
      { requires: ['spend', 'currency', 'sectorCode'], methodology: 'EEIO',
        note: 'Input-output screening. Expect wide uncertainty bands.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Un-sectored spend. Lowest-quality permitted outcome in this table.' }
    ]
  },
  {
    id: 'capitalGoods', label: 'Capital Goods',
    scope: 'Scope 3', ghgCat: 'Category 2', table: 'CG-RULES', tableVersion: 'v1.0',
    templates: ['Plant & Machinery', 'Buildings', 'Vehicles', 'IT Hardware'],
    fields: ['supplierData', 'materialMass', 'materialType', 'spend', 'sectorCode'],
    rules: [
      { requires: ['supplierData', 'materialMass'], methodology: 'SUPPLIER_SPEC',
        note: 'Manufacturer-issued footprint for the asset acquired.' },
      { requires: ['materialMass', 'materialType'], methodology: 'AVG_MASS',
        note: 'Mass-based factor for the dominant construction material.' },
      { requires: ['spend', 'currency', 'sectorCode'], methodology: 'EEIO',
        note: 'Capitalised value screened against a sector intensity. Not amortised.' }
    ]
  },
  {
    id: 'fera', label: 'Fuel & Energy-Related Activities',
    scope: 'Scope 3', ghgCat: 'Category 3', table: 'FE-RULES', tableVersion: 'v1.0',
    templates: ['Upstream Fuel (WTT)', 'T&D Losses', 'Generation of Purchased Electricity'],
    fields: ['fuelQuantity', 'fuelType', 'energyConsumption', 'gridRegion', 'spend'],
    rules: [
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'WTT_FUEL',
        note: 'Upstream burden of fuels already reported in Scope 1.' },
      { requires: ['energyConsumption', 'gridRegion'], methodology: 'TD_LOSS',
        note: 'Grid losses on electricity already reported in Scope 2.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Screening only; upstream intensity varies sharply by fuel.' }
    ]
  },
  {
    id: 'upstreamTransport', label: 'Upstream Transportation & Distribution',
    scope: 'Scope 3', ghgCat: 'Category 4', table: 'UT-RULES', tableVersion: 'v1.1',
    templates: ['Inbound Freight', 'Third-party Warehousing', 'Courier & Parcel', 'Ocean Freight'],
    fields: ['freightMass', 'distance', 'mode', 'fuelQuantity', 'fuelType', 'spend'],
    fieldOptions: {
      mode: ['Road — LGV (<3.5t)', 'Road — HGV (>7.5t)', 'Rail — Freight',
             'Sea — Container Ship', 'Air — Freight', 'Inland Waterway'],
      distanceUnit: ['km', 'tonne.km', 'vehicle.km', 'miles']
    },
    rules: [
      { requires: ['freightMass', 'distance', 'mode'], methodology: 'WT_DIST',
        note: 'Tonne-kilometre is the reference method for all freight movements.' },
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'FUEL_BASED',
        note: 'Applies where the carrier discloses fuel consumed on your consignments.' },
      { requires: ['distance', 'mode'], methodology: 'VEH_DIST',
        note: 'Vehicle-kilometre factor where consignment weight is unrecorded.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Freight invoice value. Screening only.' }
    ]
  },
  {
    id: 'wasteOperations', label: 'Waste Generated in Operations',
    scope: 'Scope 3', ghgCat: 'Category 5', table: 'WS-RULES', tableVersion: 'v1.0',
    templates: ['General Waste', 'Recycling Stream', 'Hazardous Waste', 'Wastewater'],
    fields: ['wasteQuantity', 'wasteType', 'treatmentMethod', 'employeeCount', 'spend'],
    rules: [
      { requires: ['wasteQuantity', 'wasteType', 'treatmentMethod'], methodology: 'WASTE_TYPE',
        note: 'Weighbridge tickets naming both stream and route.' },
      { requires: ['wasteQuantity', 'treatmentMethod'], methodology: 'WASTE_TREAT',
        note: 'Average-composition factor for the disposal route.' },
      { requires: ['employeeCount', 'country'], methodology: 'AVG_DATA',
        note: 'Per-employee waste generation default. Use only where no tickets exist.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Waste contractor invoice value.' }
    ]
  },
  {
    id: 'businessTravel', label: 'Business Travel',
    scope: 'Scope 3', ghgCat: 'Category 6', table: 'BT-RULES', tableVersion: 'v1.0',
    templates: ['Air Travel', 'Rail Travel', 'Road Travel', 'Company Vehicle', 'Taxi & Ride-hail'],
    fields: ['distance', 'mode', 'fuelQuantity', 'fuelType', 'spend'],
    rules: [
      { requires: ['distance', 'mode'], methodology: 'DIST_BASED',
        note: 'Itinerary distance from the travel management company is the reference method.' },
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'FUEL_BASED',
        note: 'Applies to grey-fleet and company vehicles reimbursed on fuel.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Expense-system fallback where no itinerary is captured.' }
    ]
  },
  {
    id: 'hotelStay', label: 'Hotel Stays & Accommodation',
    scope: 'Scope 3', ghgCat: 'Category 6', table: 'HS-RULES', tableVersion: 'v1.0',
    templates: ['Hotel Night', 'Serviced Apartment', 'Conference Venue'],
    fields: ['nights', 'spend'],
    rules: [
      { requires: ['nights', 'country'], methodology: 'NIGHT_BASED',
        note: 'Country average per occupied room night, the standard accommodation method.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Room spend where night counts are not captured.' }
    ]
  },
  {
    id: 'employeeCommuting', label: 'Employee Commuting',
    scope: 'Scope 3', ghgCat: 'Category 7', table: 'EC-RULES', tableVersion: 'v1.0',
    templates: ['Commute Survey', 'Shuttle Service', 'Remote Working'],
    fields: ['distance', 'mode', 'workingDays', 'fuelQuantity', 'fuelType', 'employeeCount'],
    rules: [
      { requires: ['distance', 'mode'], optional: ['workingDays'], methodology: 'DIST_BASED',
        note: 'Survey distance by mode. Working days scale the annual total.' },
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'FUEL_BASED',
        note: 'Applies to company-operated shuttles with fuel records.' },
      { requires: ['employeeCount', 'country'], methodology: 'AVG_DATA',
        note: 'National commuting average per employee where no survey was run.' }
    ]
  },
  {
    id: 'upstreamLeased', label: 'Upstream Leased Assets',
    scope: 'Scope 3', ghgCat: 'Category 8', table: 'UL-RULES', tableVersion: 'v1.0',
    templates: ['Leased Office', 'Leased Warehouse', 'Leased Vehicle'],
    fields: ['energyConsumption', 'gridRegion', 'floorArea', 'assetType', 'spend'],
    rules: [
      { requires: ['energyConsumption', 'gridRegion'], methodology: 'ASSET_SPEC',
        note: 'Sub-metered consumption for the leased space.' },
      { requires: ['floorArea', 'assetType'], methodology: 'FLOOR_AREA',
        note: 'Asset-class intensity per square metre where no sub-meter exists.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Lease payments as a last-resort driver.' }
    ]
  },
  {
    id: 'downstreamTransport', label: 'Downstream Transportation & Distribution',
    scope: 'Scope 3', ghgCat: 'Category 9', table: 'DT-RULES', tableVersion: 'v1.0',
    templates: ['Outbound Freight', 'Retail Distribution', 'Last-mile Delivery'],
    fields: ['freightMass', 'distance', 'mode', 'fuelQuantity', 'fuelType', 'spend'],
    fieldOptions: {
      mode: ['Road — LGV (<3.5t)', 'Road — HGV (>7.5t)', 'Rail — Freight',
             'Sea — Container Ship', 'Air — Freight', 'Inland Waterway'],
      distanceUnit: ['km', 'tonne.km', 'vehicle.km', 'miles']
    },
    rules: [
      { requires: ['freightMass', 'distance', 'mode'], methodology: 'WT_DIST',
        note: 'Tonne-kilometre from despatch records.' },
      { requires: ['fuelQuantity', 'fuelType'], methodology: 'FUEL_BASED',
        note: 'Carrier-disclosed fuel for your consignments.' },
      { requires: ['distance', 'mode'], methodology: 'VEH_DIST',
        note: 'Vehicle-kilometre where despatch weight is unrecorded.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Outbound logistics spend. Screening only.' }
    ]
  },
  {
    id: 'processingSold', label: 'Processing of Sold Products',
    scope: 'Scope 3', ghgCat: 'Category 10', table: 'PS10-RULES', tableVersion: 'v1.0',
    templates: ['Intermediate Product', 'Bulk Chemical', 'Semi-finished Component'],
    fields: ['processingEnergy', 'gridRegion', 'materialMass', 'materialType'],
    rules: [
      { requires: ['processingEnergy', 'gridRegion'], methodology: 'SITE_PROC',
        note: 'Customer-reported processing energy. Requires a data-sharing agreement.' },
      { requires: ['materialMass', 'materialType'], methodology: 'AVG_DATA',
        note: 'Sector-average processing intensity per tonne sold.' }
    ]
  },
  {
    id: 'useOfSold', label: 'Use of Sold Products',
    scope: 'Scope 3', ghgCat: 'Category 11', table: 'US-RULES', tableVersion: 'v1.0',
    templates: ['Energy-using Product', 'Fuel-using Product', 'Feedstock / Intermediate'],
    fields: ['unitsSold', 'energyPerUse', 'usesPerLifetime', 'gridRegion', 'fuelQuantity', 'fuelType', 'productType'],
    rules: [
      { requires: ['unitsSold', 'energyPerUse', 'usesPerLifetime', 'gridRegion'], methodology: 'USE_DIRECT',
        note: 'Measured product energy against the grid of the sales market.' },
      { requires: ['unitsSold', 'fuelQuantity', 'fuelType'], methodology: 'USE_FUEL',
        note: 'Lifetime fuel combustion for fuel-burning products.' },
      { requires: ['unitsSold', 'productType'], methodology: 'AVG_DATA',
        note: 'Product-class lifetime average. Wide uncertainty; disclose the assumption.' }
    ]
  },
  {
    id: 'endOfLife', label: 'End-of-Life Treatment of Sold Products',
    scope: 'Scope 3', ghgCat: 'Category 12', table: 'EL-RULES', tableVersion: 'v1.0',
    templates: ['Packaging Disposal', 'Product Disposal', 'WEEE Take-back'],
    fields: ['materialMass', 'materialType', 'treatmentMethod', 'unitsSold', 'productType'],
    rules: [
      { requires: ['materialMass', 'materialType', 'treatmentMethod'], methodology: 'WASTE_TYPE',
        note: 'Mass by material with the expected regional disposal route.' },
      { requires: ['materialMass', 'treatmentMethod'], methodology: 'WASTE_TREAT',
        note: 'Average-composition factor for the disposal route.' },
      { requires: ['unitsSold', 'productType'], methodology: 'AVG_DATA',
        note: 'Per-unit disposal average where bill-of-materials mass is unavailable.' }
    ]
  },
  {
    id: 'downstreamLeased', label: 'Downstream Leased Assets',
    scope: 'Scope 3', ghgCat: 'Category 13', table: 'DL-RULES', tableVersion: 'v1.0',
    templates: ['Leased-out Office', 'Leased-out Equipment', 'Leased-out Vehicle'],
    fields: ['energyConsumption', 'gridRegion', 'floorArea', 'assetType', 'spend'],
    rules: [
      { requires: ['energyConsumption', 'gridRegion'], methodology: 'ASSET_SPEC',
        note: 'Metered consumption reported by the lessee.' },
      { requires: ['floorArea', 'assetType'], methodology: 'FLOOR_AREA',
        note: 'Asset-class intensity per unit area let.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Lease income as an allocation driver. Screening only.' }
    ]
  },
  {
    id: 'franchises', label: 'Franchises',
    scope: 'Scope 3', ghgCat: 'Category 14', table: 'FR-RULES', tableVersion: 'v1.0',
    templates: ['Franchised Outlet', 'Franchised Restaurant', 'Franchised Hotel'],
    fields: ['energyConsumption', 'gridRegion', 'floorArea', 'franchiseType', 'spend'],
    rules: [
      { requires: ['energyConsumption', 'gridRegion'], methodology: 'ASSET_SPEC',
        note: 'Franchisee-reported metered energy.' },
      { requires: ['floorArea', 'franchiseType'], methodology: 'FLOOR_AREA',
        note: 'Outlet-class intensity per unit area.' },
      { requires: ['spend', 'currency'], methodology: 'SPEND_BASED',
        note: 'Franchise revenue as a proxy driver.' }
    ]
  },
  {
    id: 'investments', label: 'Investments',
    scope: 'Scope 3', ghgCat: 'Category 15', table: 'IN-RULES', tableVersion: 'v1.0',
    templates: ['Equity Investment', 'Debt Investment', 'Project Finance'],
    fields: ['investeeEmissions', 'ownershipShare', 'investmentValue', 'investeeRevenue', 'sectorCode'],
    rules: [
      { requires: ['investeeEmissions', 'ownershipShare'], methodology: 'INVEST_SPEC',
        note: 'Reported investee inventory allocated by equity share. PCAF score 1-2.' },
      { requires: ['investmentValue', 'investeeRevenue', 'sectorCode'], methodology: 'ECON_ALLOC',
        note: 'Revenue-based allocation of sector intensity. PCAF score 4.' },
      { requires: ['investmentValue', 'sectorCode'], methodology: 'EEIO',
        note: 'Asset-value screening against sector intensity. PCAF score 5.' }
    ]
  },
  {
    id: 'waterWastewater', label: 'Water Supply & Wastewater',
    scope: 'Scope 3', ghgCat: 'Category 1', table: 'WT-RULES', tableVersion: 'v1.0',
    templates: ['Municipal Supply', 'Wastewater Discharge', 'Treated Effluent'],
    fields: ['waterVolume', 'waterService', 'spend'],
    rules: [
      { requires: ['waterVolume', 'waterService'], methodology: 'VOL_WATER',
        note: 'Metered volume with the service split declared.' },
      { requires: ['spend', 'currency', 'country'], methodology: 'SPEND_BASED',
        note: 'Utility invoice value where no meter reading exists.' }
    ]
  }
];

/* -------------------------------------------------------- 4. SCENARIOS --- */
/* The first six mirror the demonstration script. The remainder exercise the
   rest of the library, including one record that fails validation outright. */

const SCENARIOS = [
  {
    name: 'Air travel, distance known',
    desc: 'Itinerary from the travel desk with sector distance and haul band.',
    expect: 'Distance-based',
    values: {
      activityCategory: 'businessTravel', activityType: 'Air Travel', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      mode: 'Air — Short Haul (<1,600 km)', distance: '1200', distanceUnit: 'passenger.km'
    }
  },
  {
    name: 'Company vehicle, fuel purchased',
    desc: 'No itinerary captured, but a fuel card record exists for the trip.',
    expect: 'Fuel-based',
    values: {
      activityCategory: 'businessTravel', activityType: 'Company Vehicle', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      fuelQuantity: '500', fuelUnit: 'litre', fuelType: 'Diesel'
    }
  },
  {
    name: 'Business travel, spend only',
    desc: 'Expense claim reconciled from finance with no activity detail.',
    expect: 'Spend-based',
    values: {
      activityCategory: 'businessTravel', activityType: 'Road Travel', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      spend: '25000', currency: 'INR'
    }
  },
  {
    name: 'Electricity, grid region known',
    desc: 'Metered import with no attribute certificate claimed.',
    expect: 'Location-based',
    values: {
      activityCategory: 'purchasedElectricity', activityType: 'Grid Import — Plant', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      energyConsumption: '5000', energyUnit: 'kWh', gridRegion: 'Southern Region (SR)'
    }
  },
  {
    name: 'Electricity, I-REC contract',
    desc: 'Same volume, backed by certificates, with no grid region recorded.',
    expect: 'Market-based',
    values: {
      activityCategory: 'purchasedElectricity', activityType: 'Grid Import — Office', reportingYear: '2026',
      country: 'India', region: 'Karnataka',
      energyConsumption: '5000', energyUnit: 'kWh', contractualInstrument: 'I-REC (India)'
    }
  },
  {
    name: 'Travel record with no measures',
    desc: 'Context only. Every rule in the table fails its input test.',
    expect: 'Insufficient Data', tone: 'clay',
    values: {
      activityCategory: 'businessTravel', activityType: 'Air Travel', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu'
    }
  },
  {
    name: 'Inbound freight, weight and distance',
    desc: 'Despatch note with consignment mass and lane distance.',
    expect: 'Weight-distance',
    values: {
      activityCategory: 'upstreamTransport', activityType: 'Inbound Freight', reportingYear: '2026',
      country: 'India', region: 'Maharashtra',
      freightMass: '12', massUnit: 'tonne', distance: '640', distanceUnit: 'km',
      mode: 'Road — HGV (>7.5t)'
    }
  },
  {
    name: 'Purchased goods, supplier footprint',
    desc: 'Verified product carbon footprint received from the mill.',
    expect: 'Supplier-specific',
    values: {
      activityCategory: 'purchasedGoods', activityType: 'Raw Materials', reportingYear: '2026',
      country: 'India', region: 'Gujarat',
      supplierData: 'Verified supplier product footprint (PCF)',
      materialMass: '24', massUnit: 'tonne', materialType: 'Steel — primary',
      spend: '1850000', currency: 'INR'
    }
  },
  {
    name: 'Waste, weighbridge ticket',
    desc: 'Stream and disposal route both named on the contractor ticket.',
    expect: 'Waste-type-specific',
    values: {
      activityCategory: 'wasteOperations', activityType: 'General Waste', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      wasteQuantity: '18', wasteUnit: 'tonne', wasteType: 'Mixed municipal waste',
      treatmentMethod: 'Landfill'
    }
  },
  {
    name: 'Refrigerant recharge log',
    desc: 'Service record showing gas actually added to the chiller.',
    expect: 'Material-balance',
    values: {
      activityCategory: 'fugitiveRefrigerants', activityType: 'Building HVAC', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      refrigerantType: 'R-410A', refrigerantRecharge: '42',
      equipmentCharge: '310', equipmentType: 'Chiller — centrifugal'
    }
  },
  {
    name: 'Investment, investee reports',
    desc: 'Investee discloses Scope 1+2; equity share is on file.',
    expect: 'Investment-specific',
    values: {
      activityCategory: 'investments', activityType: 'Equity Investment', reportingYear: '2026',
      country: 'India', region: 'Maharashtra',
      investeeEmissions: '48200', ownershipShare: '18.5',
      investmentValue: '450000000', currency: 'INR', sectorCode: 'Basic metals'
    }
  },
  {
    name: 'Distance with no unit',
    desc: 'A number without a unit. Validation stops the record before matching.',
    expect: 'Validation failure', tone: 'clay',
    values: {
      activityCategory: 'businessTravel', activityType: 'Air Travel', reportingYear: '2026',
      country: 'India', region: 'Tamil Nadu',
      distance: '1200', distanceUnit: '', mode: 'Air — Short Haul (<1,600 km)'
    }
  }
];

/* ---------------------------------------------------------- 5. DERIVED --- */
/* Rule ids and priorities are assigned here so the data above stays readable
   and priorities can never drift out of sequence with the array order.      */

CATEGORIES.forEach(function (cat) {
  cat.rules.forEach(function (rule, i) {
    rule.priority = i + 1;
    rule.id = cat.table.split('-')[0] + '-R' + (i + 1);
    rule.label = rule.requires.map(function (f) { return FIELDS[f].short; }).join(' + ');
  });
});

const CATEGORY_BY_ID = {};
CATEGORIES.forEach(function (c) { CATEGORY_BY_ID[c.id] = c; });

const CORE_FIELDS = [
  'distance', 'mode', 'fuelQuantity', 'fuelType',
  'energyConsumption', 'gridRegion', 'spend', 'contractualInstrument'
];

/* ------------------------------------------------------ 6. PROVENANCE --- */
/* Where each rule family comes from. Added after the tables so the tables
   above stay readable, and so provenance can be revised without touching
   the rules themselves.

   held: true  = the source document is on file and was read directly
   held: false = the family follows this source by reputation; the document
                 has NOT been read here, so treat the citation as unverified. */

const SOURCES = {
  CORP:  { short: 'Corporate Standard', held: true,
           title: 'GHG Protocol Corporate Accounting and Reporting Standard, Revised Edition (WRI/WBCSD, 2004)' },
  PAS:   { short: 'Policy and Action Standard', held: true,
           title: 'GHG Protocol Policy and Action Standard (WRI, 2014)' },
  S3:    { short: 'Scope 3 Standard', held: false,
           title: 'GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard (2011)' },
  S3TG:  { short: 'Scope 3 Technical Guidance', held: false,
           title: 'Technical Guidance for Calculating Scope 3 Emissions (2013)' },
  S2:    { short: 'Scope 2 Guidance', held: false,
           title: 'GHG Protocol Scope 2 Guidance (2015)' },
  TOOLS: { short: 'GHG Protocol calculation tools', held: false,
           title: 'GHG Protocol cross-sector and sector-specific calculation tools' }
};

/* Page numbers are PDF page numbers in the files that were read.
   Anything pointing at a not-held source is a claim this repo cannot
   currently evidence, and is labelled as such in the interface. */
const METHODOLOGY_SOURCES = {
  FUEL_BASED:     { src: 'CORP', ref: 'p.44', note: 'Scope 1 "calculated based on the purchased quantities of commercial fuels ... using published emission factors".' },
  ENERGY_CONTENT: { src: 'CORP', ref: 'p.44', note: 'Fuel use data with default carbon content coefficients or periodic fuel sampling.' },
  DIST_BASED:     { src: 'CORP', ref: 'p.44', note: 'Scope 3 "calculated from activity data such as fuel use or passenger miles".' },
  VEH_DIST:       { src: 'PAS',  ref: 'Table 8.6, p.87', note: 'Activity data "kilometers of distance traveled" against a per-km factor.' },
  LOC_BASED:      { src: 'CORP', ref: 'p.44', note: 'Scope 2 from metered consumption and "local grid, or other published emission factors".' },
  MKT_BASED:      { src: 'S2',   ref: 'Scope 2 Guidance', note: 'Corporate Standard p.44 admits "supplier-specific" factors, but the market-based method and dual reporting come from the 2015 Scope 2 Guidance, which is not held.' },
  SUPPLIER_SPEC:  { src: 'CORP', ref: 'p.44', note: '"If source- or facility-specific emission factors are available, they are preferable to more generic or general emission factors."' },
  MAT_BALANCE:    { src: 'CORP', ref: 'p.44', note: '"Emissions may be calculated based on a mass balance or stoichiometric basis specific to a facility or process."' },
  PROC_MASS:      { src: 'CORP', ref: 'p.44', note: 'Mass-balance basis. Process emissions is a named Scope 1 source category (p.43).' },
  PROC_STOICH:    { src: 'CORP', ref: 'p.44', note: 'Stoichiometric basis, same sentence.' },
  SCREEN_LEAK:    { src: 'CORP', ref: 'p.43', note: 'Fugitive emissions is a named Scope 1 source category; HFC use in refrigeration is a listed cross-sector calculation tool (p.44).' },
  SCREEN_SIMPLE:  { src: 'PAS',  ref: 'Table 8.5, p.85', note: 'Lowest accuracy level: international default values.' },
  AVG_MASS:       { src: 'PAS',  ref: 'Table 8.6, p.87', note: 'Activity data "kilograms of material consumed".' },
  AVG_DATA:       { src: 'PAS',  ref: 'Table 8.5, p.85', note: 'Intermediate accuracy level: national average values.' },
  WASTE_TYPE:     { src: 'PAS',  ref: 'Table 8.6, p.87', note: 'Activity data "kilograms of waste generated".' },
  WASTE_TREAT:    { src: 'PAS',  ref: 'Table 8.6, p.87', note: 'Same activity data with an average-composition factor.' },
  FLOOR_AREA:     { src: 'PAS',  ref: 'Table 8.6, p.87', note: 'Activity data "square meters of area occupied".' },
  VOL_WATER:      { src: 'CORP', ref: 'p.43', note: 'Fugitive emissions from wastewater treatment is a named source; water in the value chain follows the Scope 3 indicative list (p.31).' },
  ASSET_SPEC:     { src: 'CORP', ref: 'p.31', note: 'Leased assets, franchises and outsourced activities are named Scope 3 activities.' },
  WTT_FUEL:       { src: 'CORP', ref: 'p.31', note: '"Extraction, production, and transportation of fuels consumed in the generation of electricity."' },
  TD_LOSS:        { src: 'CORP', ref: 'p.31', note: '"Generation of electricity that is consumed in a T&D system (reported by end-user)."' },
  SPEND_BASED:    { src: 'S3TG', ref: 'not held', note: 'Neither document held supports a monetary proxy. Spend-based methods come from the Scope 3 Technical Guidance.' },
  EEIO:           { src: 'S3TG', ref: 'not held', note: 'EEIO screening is a Scope 3 Technical Guidance method, absent from both documents held.' },
  WT_DIST:        { src: 'S3TG', ref: 'not held', note: 'The Corporate Standard names transport of purchased goods (p.31) but gives no tonne-kilometre method.' },
  NIGHT_BASED:    { src: 'S3TG', ref: 'not held', note: 'Accommodation averages are not in either document held.' },
  USE_DIRECT:     { src: 'S3',   ref: 'Category 11', note: 'Corporate Standard names "use of sold products and services" (p.31) but prescribes no method.' },
  USE_FUEL:       { src: 'S3',   ref: 'Category 11', note: 'As above.' },
  SITE_PROC:      { src: 'S3',   ref: 'Category 10', note: 'Processing of sold products is not named in either document held.' },
  INVEST_SPEC:    { src: 'S3',   ref: 'Category 15', note: 'Investments do not appear in the Corporate Standard Scope 3 list (p.31). PCAF is the working reference.' },
  ECON_ALLOC:     { src: 'S3',   ref: 'Category 15', note: 'As above.' },
  INSUFFICIENT:   { src: 'CORP', ref: 'p.44', note: 'The standard requires the most accurate approach available to the company. It nowhere authorises a default when no approach applies.' }
};

Object.keys(METHODOLOGY_SOURCES).forEach(function (k) {
  if (METHODOLOGIES[k]) METHODOLOGIES[k].source = METHODOLOGY_SOURCES[k];
});
