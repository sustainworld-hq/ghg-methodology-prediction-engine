/* GENERATED — published ruleset 2026.09.05.
   Do not edit. Produced by ruleset/publish.py from the governed store.
   Editing this file does not change the ruleset; it only makes the artefact
   disagree with its own hash. */

const REGISTRY = {
  "version": "2026.09.05",
  "approved": "2026-09-16T03:23:40+00:00",
  "owner": "GHG Methodology Governance Board",
  "standard": "Forked from 2026.09.04. Scope 2 electricity recorded as dual reporting: the framework requires both the location-based and market-based figures, so neither is a preference over the other."
};

const FIELDS = {
  "activityCategory": {
    "label": "Activity Category",
    "short": "Category",
    "kind": "select",
    "dict": "Selects which governed decision table the engine loads. Drives everything downstream.",
    "context": true
  },
  "activityType": {
    "label": "Activity Type / Template",
    "short": "Template",
    "kind": "select",
    "dict": "Data-entry template within a category. Narrows the expected inputs; does not change rule priority.",
    "context": true
  },
  "assetType": {
    "label": "Asset Type",
    "short": "Asset Type",
    "kind": "select",
    "dict": "Class of leased or operated asset.",
    "options": [
      "Office",
      "Warehouse",
      "Retail",
      "Data centre",
      "Manufacturing plant",
      "Vehicle fleet"
    ]
  },
  "contractualInstrument": {
    "label": "Contractual Instrument",
    "short": "Contractual Instrument",
    "kind": "select",
    "dict": "Energy attribute certificate or contract backing the electricity claim. Required by every market-based rule.",
    "options": [
      "I-REC (India)",
      "REC (United States)",
      "Guarantee of Origin (EU)",
      "PPA — Physical",
      "PPA — Virtual",
      "Supplier green tariff",
      "Residual mix (no instrument claimed)"
    ]
  },
  "country": {
    "label": "Country",
    "short": "Country",
    "kind": "select",
    "dict": "Geography of the activity. Used by rules that require a country-resolved dataset.",
    "options": [
      "India",
      "United States",
      "United Kingdom",
      "Germany",
      "Singapore",
      "United Arab Emirates",
      "Australia",
      "Japan",
      "Brazil",
      "Other / Global"
    ],
    "context": true
  },
  "currency": {
    "label": "Currency",
    "short": "Currency",
    "kind": "select",
    "dict": "ISO currency of the spend value. A spend without a currency cannot be matched.",
    "dim": "currency",
    "options": [
      "INR",
      "USD",
      "EUR",
      "GBP",
      "SGD",
      "AED",
      "AUD",
      "JPY",
      "BRL"
    ]
  },
  "distance": {
    "label": "Distance",
    "short": "Distance",
    "kind": "number",
    "dict": "Measured or booked travel distance for the activity.",
    "unitOf": "distanceUnit"
  },
  "distanceUnit": {
    "label": "Distance Unit",
    "short": "Distance Unit",
    "kind": "select",
    "dict": "Unit of the distance value. Must be a distance dimension.",
    "dim": "distance",
    "options": [
      "km",
      "passenger.km",
      "tonne.km",
      "vehicle.km",
      "miles"
    ]
  },
  "employeeCount": {
    "label": "Employee Count",
    "short": "Employees",
    "kind": "number",
    "dict": "Headcount in scope for the activity. Supports average-data rules only."
  },
  "energyConsumption": {
    "label": "Energy Consumption",
    "short": "Energy",
    "kind": "number",
    "dict": "Metered energy delivered to the reporting boundary.",
    "unitOf": "energyUnit"
  },
  "energyPerUse": {
    "label": "Energy per Use (kWh)",
    "short": "Energy / Use",
    "kind": "number",
    "dict": "Measured energy drawn by the product in one use cycle."
  },
  "energyUnit": {
    "label": "Energy Unit",
    "short": "Energy Unit",
    "kind": "select",
    "dict": "Unit of the energy value. Must be an energy dimension.",
    "dim": "energy",
    "options": [
      "kWh",
      "MWh",
      "GJ",
      "MMBtu"
    ]
  },
  "equipmentCharge": {
    "label": "Equipment Charge Capacity (kg)",
    "short": "Charge Capacity",
    "kind": "number",
    "dict": "Nameplate refrigerant charge of the installed equipment."
  },
  "equipmentType": {
    "label": "Equipment Type",
    "short": "Equipment Type",
    "kind": "select",
    "dict": "Equipment class, used to select a governed default leak rate.",
    "options": [
      "Split AC",
      "Chiller — centrifugal",
      "VRF system",
      "Cold storage",
      "Vehicle air-conditioning",
      "Process refrigeration"
    ]
  },
  "equipmentUnits": {
    "label": "Units of Equipment",
    "short": "Equipment Units",
    "kind": "number",
    "dict": "Count of installed units. Supports the simplified screening rule only."
  },
  "floorArea": {
    "label": "Floor Area",
    "short": "Floor Area",
    "kind": "number",
    "dict": "Gross internal area of the asset. Supports floor-area average-data rules.",
    "unitOf": "floorAreaUnit"
  },
  "floorAreaUnit": {
    "label": "Area Unit",
    "short": "Area Unit",
    "kind": "select",
    "dict": "Unit of the floor area.",
    "dim": "area",
    "options": [
      "m²",
      "sq.ft"
    ]
  },
  "franchiseType": {
    "label": "Franchise Type",
    "short": "Franchise Type",
    "kind": "select",
    "dict": "Class of franchised operation.",
    "options": [
      "Retail outlet",
      "Restaurant / QSR",
      "Hotel",
      "Service centre"
    ]
  },
  "freightMass": {
    "label": "Shipment Weight",
    "short": "Weight",
    "kind": "number",
    "dict": "Gross mass of goods moved. Combined with distance it yields tonne-kilometres.",
    "unitOf": "massUnit"
  },
  "fuelQuantity": {
    "label": "Fuel Quantity",
    "short": "Fuel Quantity",
    "kind": "number",
    "dict": "Volume or mass of fuel purchased or combusted in the period.",
    "unitOf": "fuelUnit"
  },
  "fuelType": {
    "label": "Fuel Type",
    "short": "Fuel Type",
    "kind": "select",
    "dict": "Fuel product combusted. Without it a fuel quantity cannot be resolved to a methodology.",
    "options": [
      "Diesel",
      "Petrol / Gasoline",
      "CNG",
      "LPG",
      "Jet Kerosene (Jet A-1)",
      "Aviation Gasoline",
      "Natural Gas",
      "Coal — Bituminous",
      "Furnace Oil / HFO",
      "Biodiesel (B20)",
      "Ethanol (E10)"
    ]
  },
  "fuelUnit": {
    "label": "Fuel Unit",
    "short": "Fuel Unit",
    "kind": "select",
    "dict": "Unit of the fuel quantity. Must be a volume, mass or energy dimension.",
    "dim": "fuel",
    "options": [
      "litre",
      "kg",
      "m³",
      "GJ",
      "gallon (US)"
    ]
  },
  "gridRegion": {
    "label": "Grid Region",
    "short": "Grid Region",
    "kind": "select",
    "dict": "Grid balancing area the electricity was drawn from. Required by every location-based rule.",
    "options": [
      "Southern Region (SR)",
      "Northern Region (NR)",
      "Western Region (WR)",
      "Eastern Region (ER)",
      "North-Eastern Region (NER)",
      "All India (National Grid)",
      "UK — National Grid",
      "US — WECC",
      "US — RFC",
      "EU — ENTSO-E",
      "Other"
    ]
  },
  "investeeEmissions": {
    "label": "Investee Emissions (tCO₂e)",
    "short": "Investee Emissions",
    "kind": "number",
    "dict": "Reported Scope 1+2 of the investee. The only primary-data input for Category 15."
  },
  "investeeRevenue": {
    "label": "Investee Revenue",
    "short": "Investee Revenue",
    "kind": "number",
    "dict": "Investee turnover, used to allocate sector-average intensity.",
    "unitOf": "currency"
  },
  "investmentValue": {
    "label": "Investment Value",
    "short": "Investment Value",
    "kind": "number",
    "dict": "Carrying value of the equity or debt investment.",
    "unitOf": "currency"
  },
  "leakRate": {
    "label": "Assumed Leak Rate (%)",
    "short": "Leak Rate",
    "kind": "number",
    "dict": "Governed annual leakage assumption for the equipment class, 0-100%."
  },
  "massUnit": {
    "label": "Weight Unit",
    "short": "Weight Unit",
    "kind": "select",
    "dict": "Unit of a mass value. Must be a mass dimension.",
    "dim": "mass",
    "options": [
      "kg",
      "tonne",
      "lb"
    ]
  },
  "materialMass": {
    "label": "Quantity Purchased",
    "short": "Quantity",
    "kind": "number",
    "dict": "Physical quantity of goods purchased, in mass units.",
    "unitOf": "massUnit"
  },
  "materialType": {
    "label": "Material / Product Type",
    "short": "Material",
    "kind": "select",
    "dict": "Material classification used to resolve a mass-based average dataset.",
    "options": [
      "Steel — primary",
      "Steel — recycled",
      "Aluminium",
      "Cement",
      "Plastic — PET",
      "Plastic — HDPE",
      "Paper & pulp",
      "Cotton textile",
      "Glass",
      "Copper",
      "Electronics assembly",
      "Chemicals — generic"
    ]
  },
  "mode": {
    "label": "Mode",
    "short": "Mode",
    "kind": "select",
    "dict": "Transport mode. Determines which distance-based dataset family applies.",
    "options": [
      "Air — Short Haul (<1,600 km)",
      "Air — Medium Haul",
      "Air — Long Haul (>3,700 km)",
      "Rail — Intercity",
      "Rail — Metro / Suburban",
      "Road — Car (Petrol)",
      "Road — Car (Diesel)",
      "Road — Car (Battery Electric)",
      "Road — Taxi",
      "Road — Bus / Coach",
      "Road — Two-wheeler",
      "Sea — Ferry"
    ]
  },
  "nights": {
    "label": "Room Nights",
    "short": "Nights",
    "kind": "number",
    "dict": "Occupied room nights. Primary input for accommodation average-data rules."
  },
  "ownershipShare": {
    "label": "Ownership Share (%)",
    "short": "Ownership Share",
    "kind": "number",
    "dict": "Reporting company share of the investee, 0-100%."
  },
  "processInput": {
    "label": "Raw Material Input (tonne)",
    "short": "Material Input",
    "kind": "number",
    "dict": "Mass of carbonate or feedstock entering the process."
  },
  "processOutput": {
    "label": "Process Output (tonne)",
    "short": "Process Output",
    "kind": "number",
    "dict": "Mass of product leaving the industrial process in the period."
  },
  "processType": {
    "label": "Process Type",
    "short": "Process Type",
    "kind": "select",
    "dict": "Industrial process generating non-combustion emissions.",
    "options": [
      "Cement — clinker production",
      "Lime production",
      "Ammonia production",
      "Iron & steel — BF/BOF",
      "Aluminium smelting (PFC)",
      "Glass production",
      "Nitric acid production"
    ]
  },
  "processingEnergy": {
    "label": "Downstream Processing Energy (kWh)",
    "short": "Processing Energy",
    "kind": "number",
    "dict": "Energy consumed by the customer to process the intermediate product sold."
  },
  "productType": {
    "label": "Product Type",
    "short": "Product Type",
    "kind": "select",
    "dict": "Product class, used to resolve average use-phase or end-of-life datasets.",
    "options": [
      "Domestic appliance",
      "Industrial equipment",
      "Consumer electronics",
      "Vehicle",
      "Packaging",
      "Building material"
    ]
  },
  "refrigerantRecharge": {
    "label": "Quantity Recharged (kg)",
    "short": "Recharge Qty",
    "kind": "number",
    "dict": "Refrigerant added during servicing in the period. The observed term in a material balance."
  },
  "refrigerantType": {
    "label": "Refrigerant Type",
    "short": "Refrigerant",
    "kind": "select",
    "dict": "Refrigerant gas in the equipment. Required by every fugitive-emission rule.",
    "options": [
      "R-410A",
      "R-134a",
      "R-32",
      "R-404A",
      "R-407C",
      "R-22 (HCFC)",
      "R-744 (CO₂)",
      "R-717 (Ammonia)"
    ]
  },
  "region": {
    "label": "Region / State",
    "short": "Region",
    "kind": "text",
    "dict": "Sub-national location. Informational unless a rule names it explicitly.",
    "context": true
  },
  "reportingYear": {
    "label": "Reporting Year",
    "short": "Year",
    "kind": "select",
    "dict": "Inventory year the record belongs to. Must fall inside the open reporting window.",
    "options": [
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
      "2027"
    ],
    "context": true
  },
  "sectorCode": {
    "label": "EEIO Sector",
    "short": "Sector",
    "kind": "select",
    "dict": "Environmentally-extended input-output sector used to interpret a spend value.",
    "options": [
      "Air transport",
      "Land transport & pipelines",
      "Accommodation & food service",
      "Machinery & equipment mfg",
      "Basic metals",
      "Chemicals & chemical products",
      "Construction",
      "Professional services",
      "Food & beverage mfg",
      "IT & telecom services",
      "Financial services"
    ]
  },
  "spend": {
    "label": "Spend",
    "short": "Spend",
    "kind": "number",
    "dict": "Procurement value of the activity, net of taxes. Lowest-priority input in every table that accepts it.",
    "unitOf": "currency"
  },
  "steamSource": {
    "label": "Supplier Emission Rate",
    "short": "Supplier Rate",
    "kind": "select",
    "dict": "Basis on which the steam, heat or cooling supplier reports its emission intensity.",
    "options": [
      "Supplier-published emission rate",
      "Metered supplier data",
      "Default grid / heat factor"
    ]
  },
  "supplierData": {
    "label": "Supplier Data",
    "short": "Supplier Data",
    "kind": "select",
    "dict": "Primary data received from the supplier. Outranks every generic dataset when present.",
    "options": [
      "Verified supplier product footprint (PCF)",
      "Unverified supplier product footprint",
      "Supplier Scope 1+2 with allocation"
    ]
  },
  "treatmentMethod": {
    "label": "Treatment Method",
    "short": "Treatment",
    "kind": "select",
    "dict": "Disposal or recovery route applied to the waste stream.",
    "options": [
      "Landfill",
      "Recycling (closed-loop)",
      "Recycling (open-loop)",
      "Composting",
      "Anaerobic digestion",
      "Incineration — with energy recovery",
      "Incineration — no energy recovery",
      "Wastewater treatment"
    ]
  },
  "unitsSold": {
    "label": "Units Sold",
    "short": "Units Sold",
    "kind": "number",
    "dict": "Count of products sold in the reporting period."
  },
  "usesPerLifetime": {
    "label": "Uses per Lifetime",
    "short": "Lifetime Uses",
    "kind": "number",
    "dict": "Governed assumption for total use cycles over the product lifetime."
  },
  "wasteQuantity": {
    "label": "Waste Quantity",
    "short": "Waste Quantity",
    "kind": "number",
    "dict": "Mass or volume of waste transferred off site.",
    "unitOf": "wasteUnit"
  },
  "wasteType": {
    "label": "Waste Type",
    "short": "Waste Type",
    "kind": "select",
    "dict": "Waste stream composition. Required for the waste-type-specific methodology.",
    "options": [
      "Mixed municipal waste",
      "Paper & cardboard",
      "Plastics (mixed)",
      "Food & organic",
      "Metals",
      "Glass",
      "WEEE / e-waste",
      "Hazardous chemical",
      "Construction & demolition",
      "Wastewater sludge"
    ]
  },
  "wasteUnit": {
    "label": "Waste Unit",
    "short": "Waste Unit",
    "kind": "select",
    "dict": "Unit of the waste quantity.",
    "dim": "mass",
    "options": [
      "kg",
      "tonne",
      "m³"
    ]
  },
  "waterService": {
    "label": "Water Service",
    "short": "Water Service",
    "kind": "select",
    "dict": "Which municipal service the volume relates to. Supply and treatment carry different datasets.",
    "options": [
      "Supply only",
      "Treatment only",
      "Supply + Treatment"
    ]
  },
  "waterUnit": {
    "label": "Water Unit",
    "short": "Water Unit",
    "kind": "select",
    "dict": "Unit of the water volume.",
    "dim": "volume",
    "options": [
      "m³",
      "kL",
      "litre"
    ]
  },
  "waterVolume": {
    "label": "Water Volume",
    "short": "Water Volume",
    "kind": "number",
    "dict": "Volume of water supplied to or discharged from the boundary.",
    "unitOf": "waterUnit"
  },
  "workingDays": {
    "label": "Working Days",
    "short": "Working Days",
    "kind": "number",
    "dict": "Commuting days in the period. Optional refinement on distance-based commuting."
  }
};

const METHODOLOGIES = {
  "ASSET_SPEC": {
    "name": "Asset-specific",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Uses metered energy for the specific asset."
  },
  "AVG_DATA": {
    "name": "Average-data",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Applies a governed average intensity to a physical activity driver."
  },
  "AVG_MASS": {
    "name": "Average-data (mass)",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Applies a material cradle-to-gate factor to physical quantity."
  },
  "DIST_BASED": {
    "name": "Distance-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies a mode-specific factor to measured distance."
  },
  "ECON_ALLOC": {
    "name": "Economic allocation",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Allocates sector-average intensity by revenue share."
  },
  "EEIO": {
    "name": "Spend-based (EEIO)",
    "tier": "Proxy",
    "confidence": "Low",
    "blurb": "Applies an input-output sector intensity to spend."
  },
  "ENERGY_CONTENT": {
    "name": "Energy-content-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Converts fuel to energy content before applying a factor."
  },
  "FLOOR_AREA": {
    "name": "Floor-area based",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Applies an asset-class intensity per unit floor area."
  },
  "FUEL_BASED": {
    "name": "Fuel-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies a fuel-specific factor to metered fuel quantity."
  },
  "INSUFFICIENT": {
    "name": "Insufficient Data",
    "tier": "—",
    "confidence": "None",
    "blurb": "No governed rule was satisfied. The engine stops rather than assume."
  },
  "INVEST_SPEC": {
    "name": "Investment-specific",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Allocates reported investee emissions by ownership share."
  },
  "LOC_BASED": {
    "name": "Location-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies the average grid intensity of the balancing area."
  },
  "MAT_BALANCE": {
    "name": "Material-balance",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Derives fugitive loss from refrigerant actually recharged."
  },
  "MKT_BASED": {
    "name": "Market-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies the intensity of the contractual instrument claimed."
  },
  "NIGHT_BASED": {
    "name": "Night-based (average data)",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Applies a country average per occupied room night."
  },
  "PROC_MASS": {
    "name": "Process mass-balance",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Derives process emissions from output mass and process chemistry."
  },
  "PROC_STOICH": {
    "name": "Stoichiometric (input-based)",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Derives process emissions from carbonate or feedstock input."
  },
  "SCREEN_LEAK": {
    "name": "Screening (leak-rate)",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Applies a governed leak rate to installed charge."
  },
  "SCREEN_SIMPLE": {
    "name": "Simplified screening",
    "tier": "Proxy",
    "confidence": "Low",
    "blurb": "Applies a default charge and leak rate per equipment unit."
  },
  "SITE_PROC": {
    "name": "Site-specific processing",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Uses customer-reported energy to process the intermediate product."
  },
  "SPEND_BASED": {
    "name": "Spend-based",
    "tier": "Proxy",
    "confidence": "Low",
    "blurb": "Applies a monetary intensity to procurement value. Screening quality only."
  },
  "SUPPLIER_SPEC": {
    "name": "Supplier-specific",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Uses primary data reported by the supplier for the purchased item."
  },
  "TD_LOSS": {
    "name": "T&D loss-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies grid transmission and distribution loss rates to energy imported."
  },
  "USE_DIRECT": {
    "name": "Direct use-phase",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Models lifetime energy of sold products against a grid intensity."
  },
  "USE_FUEL": {
    "name": "Use-phase fuel-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Models lifetime fuel combustion of sold products."
  },
  "VEH_DIST": {
    "name": "Vehicle-distance",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies a vehicle-kilometre factor where load is unknown."
  },
  "VOL_WATER": {
    "name": "Volume-based",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies supply or treatment factors to metered water volume."
  },
  "WASTE_TREAT": {
    "name": "Treatment-specific",
    "tier": "Secondary",
    "confidence": "Medium",
    "blurb": "Applies an average-composition factor for the treatment route."
  },
  "WASTE_TYPE": {
    "name": "Waste-type-specific",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies a factor resolved from both waste stream and treatment route."
  },
  "WTT_FUEL": {
    "name": "Upstream fuel (well-to-tank)",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies an upstream extraction and refining factor to fuel purchased."
  },
  "WT_DIST": {
    "name": "Weight-distance",
    "tier": "Primary",
    "confidence": "High",
    "blurb": "Applies a tonne-kilometre factor to mass moved over distance."
  }
};

const CATEGORIES = [
  {
    "id": "businessTravel",
    "category": "BUSINESS_TRAVEL",
    "label": "Business Travel",
    "scope": "Scope 3",
    "ghgCat": "Category 6",
    "table": "BUSINESS_TRAVEL",
    "tableVersion": "2026.09.05",
    "templates": [
      "Air Travel",
      "Rail Travel",
      "Road Travel",
      "Company Vehicle",
      "Taxi & Ride-hail"
    ],
    "fields": [
      "distance",
      "mode",
      "fuelQuantity",
      "fuelType",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "BUSINESS_TRAVEL__DIST_BASED__001",
        "label": "Distance + Mode",
        "requires": [
          "distance",
          "mode"
        ],
        "optional": [],
        "methodology": "DIST_BASED",
        "note": "Itinerary distance from the travel management company is the reference method.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "BUSINESS_TRAVEL__FUEL_BASED__002",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "FUEL_BASED",
        "note": "Applies to grey-fleet and company vehicles reimbursed on fuel.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "BUSINESS_TRAVEL__SPEND_BASED__003",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Expense-system fallback where no itinerary is captured.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "capitalGoods",
    "category": "CAPITAL_GOODS",
    "label": "Capital Goods",
    "scope": "Scope 3",
    "ghgCat": "Category 2",
    "table": "CAPITAL_GOODS",
    "tableVersion": "2026.09.05",
    "templates": [
      "Plant & Machinery",
      "Buildings",
      "Vehicles",
      "IT Hardware"
    ],
    "fields": [
      "supplierData",
      "materialMass",
      "materialType",
      "spend",
      "sectorCode"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "CAPITAL_GOODS__AVG_MASS__002",
        "label": "Quantity + Material",
        "requires": [
          "materialMass",
          "materialType"
        ],
        "optional": [],
        "methodology": "AVG_MASS",
        "note": "Mass-based factor for the dominant construction material.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "CAPITAL_GOODS__EEIO__003",
        "label": "Spend + Currency + Sector",
        "requires": [
          "spend",
          "currency",
          "sectorCode"
        ],
        "optional": [],
        "methodology": "EEIO",
        "note": "Capitalised value screened against a sector intensity. Not amortised.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "CAPITAL_GOODS__SUPPLIER_SPEC__001",
        "label": "Supplier Data + Quantity",
        "requires": [
          "supplierData",
          "materialMass"
        ],
        "optional": [],
        "methodology": "SUPPLIER_SPEC",
        "note": "Manufacturer-issued footprint for the asset acquired.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "downstreamLeased",
    "category": "DOWNSTREAM_LEASED",
    "label": "Downstream Leased Assets",
    "scope": "Scope 3",
    "ghgCat": "Category 13",
    "table": "DOWNSTREAM_LEASED",
    "tableVersion": "2026.09.05",
    "templates": [
      "Leased-out Office",
      "Leased-out Equipment",
      "Leased-out Vehicle"
    ],
    "fields": [
      "energyConsumption",
      "gridRegion",
      "floorArea",
      "assetType",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "DOWNSTREAM_LEASED__ASSET_SPEC__001",
        "label": "Energy + Grid Region",
        "requires": [
          "energyConsumption",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "ASSET_SPEC",
        "note": "Metered consumption reported by the lessee.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "DOWNSTREAM_LEASED__FLOOR_AREA__002",
        "label": "Floor Area + Asset Type",
        "requires": [
          "floorArea",
          "assetType"
        ],
        "optional": [],
        "methodology": "FLOOR_AREA",
        "note": "Asset-class intensity per unit area let.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "DOWNSTREAM_LEASED__SPEND_BASED__003",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Lease income as an allocation driver. Screening only.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "downstreamTransport",
    "category": "DOWNSTREAM_TRANSPORT",
    "label": "Downstream Transportation & Distribution",
    "scope": "Scope 3",
    "ghgCat": "Category 9",
    "table": "DOWNSTREAM_TRANSPORT",
    "tableVersion": "2026.09.05",
    "templates": [
      "Outbound Freight",
      "Retail Distribution",
      "Last-mile Delivery"
    ],
    "fields": [
      "freightMass",
      "distance",
      "mode",
      "fuelQuantity",
      "fuelType",
      "spend"
    ],
    "fieldOptions": {
      "mode": [
        "Road — LGV (<3.5t)",
        "Road — HGV (>7.5t)",
        "Rail — Freight",
        "Sea — Container Ship",
        "Air — Freight",
        "Inland Waterway"
      ],
      "distanceUnit": [
        "km",
        "tonne.km",
        "vehicle.km",
        "miles"
      ]
    },
    "rules": [
      {
        "priority": 1,
        "id": "DOWNSTREAM_TRANSPORT__FUEL_BASED__002",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "FUEL_BASED",
        "note": "Carrier-disclosed fuel for your consignments.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "DOWNSTREAM_TRANSPORT__VEH_DIST__003",
        "label": "Distance + Mode",
        "requires": [
          "distance",
          "mode"
        ],
        "optional": [],
        "methodology": "VEH_DIST",
        "note": "Vehicle-kilometre where despatch weight is unrecorded.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "DOWNSTREAM_TRANSPORT__WT_DIST__001",
        "label": "Weight + Distance + Mode",
        "requires": [
          "freightMass",
          "distance",
          "mode"
        ],
        "optional": [],
        "methodology": "WT_DIST",
        "note": "Tonne-kilometre from despatch records.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 4,
        "id": "DOWNSTREAM_TRANSPORT__SPEND_BASED__004",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Outbound logistics spend. Screening only.",
        "preference_rank": 4,
        "preference_basis": "EXPLICIT_STANDARD_GUIDANCE",
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "employeeCommuting",
    "category": "EMPLOYEE_COMMUTING",
    "label": "Employee Commuting",
    "scope": "Scope 3",
    "ghgCat": "Category 7",
    "table": "EMPLOYEE_COMMUTING",
    "tableVersion": "2026.09.05",
    "templates": [
      "Commute Survey",
      "Shuttle Service",
      "Remote Working"
    ],
    "fields": [
      "distance",
      "mode",
      "workingDays",
      "fuelQuantity",
      "fuelType",
      "employeeCount"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "EMPLOYEE_COMMUTING__AVG_DATA__003",
        "label": "Employees + Country",
        "requires": [
          "employeeCount",
          "country"
        ],
        "optional": [],
        "methodology": "AVG_DATA",
        "note": "National commuting average per employee where no survey was run.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "EMPLOYEE_COMMUTING__DIST_BASED__001",
        "label": "Distance + Mode",
        "requires": [
          "distance",
          "mode"
        ],
        "optional": [
          "workingDays"
        ],
        "methodology": "DIST_BASED",
        "note": "Survey distance by mode. Working days scale the annual total.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "EMPLOYEE_COMMUTING__FUEL_BASED__002",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "FUEL_BASED",
        "note": "Applies to company-operated shuttles with fuel records.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "endOfLife",
    "category": "END_OF_LIFE",
    "label": "End-of-Life Treatment of Sold Products",
    "scope": "Scope 3",
    "ghgCat": "Category 12",
    "table": "END_OF_LIFE",
    "tableVersion": "2026.09.05",
    "templates": [
      "Packaging Disposal",
      "Product Disposal",
      "WEEE Take-back"
    ],
    "fields": [
      "materialMass",
      "materialType",
      "treatmentMethod",
      "unitsSold",
      "productType"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "END_OF_LIFE__AVG_DATA__003",
        "label": "Units Sold + Product Type",
        "requires": [
          "unitsSold",
          "productType"
        ],
        "optional": [],
        "methodology": "AVG_DATA",
        "note": "Per-unit disposal average where bill-of-materials mass is unavailable.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "END_OF_LIFE__WASTE_TREAT__002",
        "label": "Quantity + Treatment",
        "requires": [
          "materialMass",
          "treatmentMethod"
        ],
        "optional": [],
        "methodology": "WASTE_TREAT",
        "note": "Average-composition factor for the disposal route.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "END_OF_LIFE__WASTE_TYPE__001",
        "label": "Quantity + Material + Treatment",
        "requires": [
          "materialMass",
          "materialType",
          "treatmentMethod"
        ],
        "optional": [],
        "methodology": "WASTE_TYPE",
        "note": "Mass by material with the expected regional disposal route.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "fera",
    "category": "FERA",
    "label": "Fuel & Energy-Related Activities",
    "scope": "Scope 3",
    "ghgCat": "Category 3",
    "table": "FERA",
    "tableVersion": "2026.09.05",
    "templates": [
      "Upstream Fuel (WTT)",
      "T&D Losses",
      "Generation of Purchased Electricity"
    ],
    "fields": [
      "fuelQuantity",
      "fuelType",
      "energyConsumption",
      "gridRegion",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "FERA__SPEND_BASED__003",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Screening only; upstream intensity varies sharply by fuel.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "FERA__TD_LOSS__002",
        "label": "Energy + Grid Region",
        "requires": [
          "energyConsumption",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "TD_LOSS",
        "note": "Grid losses on electricity already reported in Scope 2.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "FERA__WTT_FUEL__001",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "WTT_FUEL",
        "note": "Upstream burden of fuels already reported in Scope 1.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "franchises",
    "category": "FRANCHISES",
    "label": "Franchises",
    "scope": "Scope 3",
    "ghgCat": "Category 14",
    "table": "FRANCHISES",
    "tableVersion": "2026.09.05",
    "templates": [
      "Franchised Outlet",
      "Franchised Restaurant",
      "Franchised Hotel"
    ],
    "fields": [
      "energyConsumption",
      "gridRegion",
      "floorArea",
      "franchiseType",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "FRANCHISES__ASSET_SPEC__001",
        "label": "Energy + Grid Region",
        "requires": [
          "energyConsumption",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "ASSET_SPEC",
        "note": "Franchisee-reported metered energy.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "FRANCHISES__FLOOR_AREA__002",
        "label": "Floor Area + Franchise Type",
        "requires": [
          "floorArea",
          "franchiseType"
        ],
        "optional": [],
        "methodology": "FLOOR_AREA",
        "note": "Outlet-class intensity per unit area.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "FRANCHISES__SPEND_BASED__003",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Franchise revenue as a proxy driver.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "fugitiveRefrigerants",
    "category": "FUGITIVE_REFRIGERANTS",
    "label": "Fugitive Emissions — Refrigerants",
    "scope": "Scope 1",
    "ghgCat": "Direct — fugitive",
    "table": "FUGITIVE_REFRIGERANTS",
    "tableVersion": "2026.09.05",
    "templates": [
      "Building HVAC",
      "Cold Chain",
      "Vehicle Air-conditioning",
      "Process Refrigeration"
    ],
    "fields": [
      "refrigerantType",
      "refrigerantRecharge",
      "equipmentCharge",
      "leakRate",
      "equipmentUnits",
      "equipmentType"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "FUGITIVE_REFRIGERANTS__MAT_BALANCE__001",
        "label": "Refrigerant + Recharge Qty",
        "requires": [
          "refrigerantType",
          "refrigerantRecharge"
        ],
        "optional": [],
        "methodology": "MAT_BALANCE",
        "note": "Service records showing gas actually added are the highest-quality basis.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "FUGITIVE_REFRIGERANTS__SCREEN_LEAK__002",
        "label": "Refrigerant + Charge Capacity + Leak Rate",
        "requires": [
          "refrigerantType",
          "equipmentCharge",
          "leakRate"
        ],
        "optional": [],
        "methodology": "SCREEN_LEAK",
        "note": "Installed charge with a governed leak-rate assumption.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "FUGITIVE_REFRIGERANTS__SCREEN_SIMPLE__003",
        "label": "Refrigerant + Equipment Units + Equipment Type",
        "requires": [
          "refrigerantType",
          "equipmentUnits",
          "equipmentType"
        ],
        "optional": [],
        "methodology": "SCREEN_SIMPLE",
        "note": "Unit count only. Both charge and leak rate come from governed defaults.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "hotelStay",
    "category": "HOTEL_STAY",
    "label": "Hotel Stays & Accommodation",
    "scope": "Scope 3",
    "ghgCat": "Category 6",
    "table": "HOTEL_STAY",
    "tableVersion": "2026.09.05",
    "templates": [
      "Hotel Night",
      "Serviced Apartment",
      "Conference Venue"
    ],
    "fields": [
      "nights",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "HOTEL_STAY__NIGHT_BASED__001",
        "label": "Nights + Country",
        "requires": [
          "nights",
          "country"
        ],
        "optional": [],
        "methodology": "NIGHT_BASED",
        "note": "Country average per occupied room night, the standard accommodation method.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "HOTEL_STAY__SPEND_BASED__002",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Room spend where night counts are not captured.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "investments",
    "category": "INVESTMENTS",
    "label": "Investments",
    "scope": "Scope 3",
    "ghgCat": "Category 15",
    "table": "INVESTMENTS",
    "tableVersion": "2026.09.05",
    "templates": [
      "Equity Investment",
      "Debt Investment",
      "Project Finance"
    ],
    "fields": [
      "investeeEmissions",
      "ownershipShare",
      "investmentValue",
      "investeeRevenue",
      "sectorCode"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "INVESTMENTS__ECON_ALLOC__002",
        "label": "Investment Value + Investee Revenue + Sector",
        "requires": [
          "investmentValue",
          "investeeRevenue",
          "sectorCode"
        ],
        "optional": [],
        "methodology": "ECON_ALLOC",
        "note": "Revenue-based allocation of sector intensity. PCAF score 4.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "INVESTMENTS__EEIO__003",
        "label": "Investment Value + Sector",
        "requires": [
          "investmentValue",
          "sectorCode"
        ],
        "optional": [],
        "methodology": "EEIO",
        "note": "Asset-value screening against sector intensity. PCAF score 5.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "INVESTMENTS__INVEST_SPEC__001",
        "label": "Investee Emissions + Ownership Share",
        "requires": [
          "investeeEmissions",
          "ownershipShare"
        ],
        "optional": [],
        "methodology": "INVEST_SPEC",
        "note": "Reported investee inventory allocated by equity share. PCAF score 1-2.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "mobileCombustion",
    "category": "MOBILE_COMBUSTION",
    "label": "Mobile Combustion — Owned Fleet",
    "scope": "Scope 1",
    "ghgCat": "Direct — mobile",
    "table": "MOBILE_COMBUSTION",
    "tableVersion": "2026.09.05",
    "templates": [
      "Company Car",
      "Light Commercial Vehicle",
      "Heavy Goods Vehicle",
      "Owned Aircraft",
      "Marine Vessel"
    ],
    "fields": [
      "fuelQuantity",
      "fuelType",
      "distance",
      "mode",
      "spend"
    ],
    "fieldOptions": {
      "mode": [
        "Road — Car (Petrol)",
        "Road — Car (Diesel)",
        "Road — Car (Battery Electric)",
        "Road — LGV (<3.5t)",
        "Road — HGV (>7.5t)",
        "Road — Two-wheeler",
        "Air — Owned Aircraft",
        "Sea — Owned Vessel"
      ]
    },
    "rules": [
      {
        "priority": 1,
        "id": "MOBILE_COMBUSTION__DIST_BASED__002",
        "label": "Distance + Mode + Fuel Type",
        "requires": [
          "distance",
          "mode",
          "fuelType"
        ],
        "optional": [],
        "methodology": "DIST_BASED",
        "note": "Odometer distance with a known powertrain.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "MOBILE_COMBUSTION__FUEL_BASED__001",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "FUEL_BASED",
        "note": "Fuel card and bunker records outrank odometer data for owned assets.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "MOBILE_COMBUSTION__SPEND_BASED__004",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Fuel spend fallback. Flag for data-quality improvement.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 4,
        "id": "MOBILE_COMBUSTION__VEH_DIST__003",
        "label": "Distance + Mode",
        "requires": [
          "distance",
          "mode"
        ],
        "optional": [],
        "methodology": "VEH_DIST",
        "note": "Average-vehicle factor where the fuel type is unrecorded.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "processingSold",
    "category": "PROCESSING_SOLD",
    "label": "Processing of Sold Products",
    "scope": "Scope 3",
    "ghgCat": "Category 10",
    "table": "PROCESSING_SOLD",
    "tableVersion": "2026.09.05",
    "templates": [
      "Intermediate Product",
      "Bulk Chemical",
      "Semi-finished Component"
    ],
    "fields": [
      "processingEnergy",
      "gridRegion",
      "materialMass",
      "materialType"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "PROCESSING_SOLD__AVG_DATA__002",
        "label": "Quantity + Material",
        "requires": [
          "materialMass",
          "materialType"
        ],
        "optional": [],
        "methodology": "AVG_DATA",
        "note": "Sector-average processing intensity per tonne sold.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "PROCESSING_SOLD__SITE_PROC__001",
        "label": "Processing Energy + Grid Region",
        "requires": [
          "processingEnergy",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "SITE_PROC",
        "note": "Customer-reported processing energy. Requires a data-sharing agreement.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "processEmissions",
    "category": "PROCESS_EMISSIONS",
    "label": "Industrial Process Emissions",
    "scope": "Scope 1",
    "ghgCat": "Direct — process",
    "table": "PROCESS_EMISSIONS",
    "tableVersion": "2026.09.05",
    "templates": [
      "Cement Kiln",
      "Lime Kiln",
      "Ammonia Plant",
      "Steel — BF/BOF",
      "Aluminium Smelter"
    ],
    "fields": [
      "processType",
      "processOutput",
      "processInput",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "PROCESS_EMISSIONS__PROC_MASS__002",
        "label": "Process Type + Process Output",
        "requires": [
          "processType",
          "processOutput"
        ],
        "optional": [],
        "methodology": "PROC_MASS",
        "note": "Output mass with a governed clinker or product factor.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "PROCESS_EMISSIONS__PROC_STOICH__001",
        "label": "Process Type + Material Input",
        "requires": [
          "processType",
          "processInput"
        ],
        "optional": [],
        "methodology": "PROC_STOICH",
        "note": "Carbonate input is measured directly and converts stoichiometrically.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "purchasedElectricity",
    "category": "PURCHASED_ELECTRICITY",
    "label": "Purchased Electricity",
    "scope": "Scope 2",
    "ghgCat": "Indirect — energy",
    "table": "PURCHASED_ELECTRICITY",
    "tableVersion": "2026.09.05",
    "templates": [
      "Grid Import — Office",
      "Grid Import — Plant",
      "EV Charging",
      "Data Centre Draw"
    ],
    "fields": [
      "energyConsumption",
      "gridRegion",
      "contractualInstrument",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "PURCHASED_ELECTRICITY__LOC_BASED__001",
        "label": "Energy + Grid Region",
        "requires": [
          "energyConsumption",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "LOC_BASED",
        "note": "Dual reporting requires a location-based figure whenever grid region is known.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "all_of"
      },
      {
        "priority": 2,
        "id": "PURCHASED_ELECTRICITY__MKT_BASED__002",
        "label": "Energy + Contractual Instrument",
        "requires": [
          "energyConsumption",
          "contractualInstrument"
        ],
        "optional": [],
        "methodology": "MKT_BASED",
        "note": "Applied when an attribute certificate or contract is evidenced.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "all_of"
      },
      {
        "priority": 3,
        "id": "PURCHASED_ELECTRICITY__SPEND_BASED__003",
        "label": "Spend + Currency + Country",
        "requires": [
          "spend",
          "currency",
          "country"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Tariff-derived estimate. Permitted only for unmetered minor sites.",
        "preference_rank": 3,
        "preference_basis": "EXPLICIT_STANDARD_GUIDANCE",
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "purchasedGoods",
    "category": "PURCHASED_GOODS",
    "label": "Purchased Goods & Services",
    "scope": "Scope 3",
    "ghgCat": "Category 1",
    "table": "PURCHASED_GOODS",
    "tableVersion": "2026.09.05",
    "templates": [
      "Raw Materials",
      "Components",
      "Packaging",
      "Professional Services",
      "IT Services"
    ],
    "fields": [
      "supplierData",
      "materialMass",
      "materialType",
      "spend",
      "sectorCode"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "PURCHASED_GOODS__AVG_MASS__002",
        "label": "Quantity + Material",
        "requires": [
          "materialMass",
          "materialType"
        ],
        "optional": [],
        "methodology": "AVG_MASS",
        "note": "Cradle-to-gate material factor applied to purchased quantity.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "PURCHASED_GOODS__SUPPLIER_SPEC__001",
        "label": "Supplier Data + Quantity",
        "requires": [
          "supplierData",
          "materialMass"
        ],
        "optional": [],
        "methodology": "SUPPLIER_SPEC",
        "note": "A supplier product footprint outranks every generic dataset.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "PURCHASED_GOODS__EEIO__003",
        "label": "Spend + Currency + Sector",
        "requires": [
          "spend",
          "currency",
          "sectorCode"
        ],
        "optional": [],
        "methodology": "EEIO",
        "note": "Input-output screening. Expect wide uncertainty bands.",
        "preference_rank": 4,
        "preference_basis": "EXPLICIT_STANDARD_GUIDANCE",
        "applies_count": "one_of"
      },
      {
        "priority": 4,
        "id": "PURCHASED_GOODS__SPEND_BASED__004",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Un-sectored spend. Lowest-quality permitted outcome in this table.",
        "preference_rank": 4,
        "preference_basis": "EXPLICIT_STANDARD_GUIDANCE",
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "purchasedSteam",
    "category": "PURCHASED_STEAM",
    "label": "Purchased Steam, Heat & Cooling",
    "scope": "Scope 2",
    "ghgCat": "Indirect — energy",
    "table": "PURCHASED_STEAM",
    "tableVersion": "2026.09.05",
    "templates": [
      "District Heating",
      "District Cooling",
      "Purchased Steam",
      "Chilled Water"
    ],
    "fields": [
      "energyConsumption",
      "steamSource",
      "gridRegion",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "PURCHASED_STEAM__LOC_BASED__002",
        "label": "Energy + Grid Region",
        "requires": [
          "energyConsumption",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "LOC_BASED",
        "note": "Regional default heat or cooling factor.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "PURCHASED_STEAM__SPEND_BASED__003",
        "label": "Spend + Currency + Country",
        "requires": [
          "spend",
          "currency",
          "country"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Screening estimate from utility invoices.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "PURCHASED_STEAM__SUPPLIER_SPEC__001",
        "label": "Energy + Supplier Rate",
        "requires": [
          "energyConsumption",
          "steamSource"
        ],
        "optional": [],
        "methodology": "SUPPLIER_SPEC",
        "note": "Supplier-published intensity is preferred wherever the utility discloses one.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "stationaryCombustion",
    "category": "STATIONARY_COMBUSTION",
    "label": "Stationary Combustion",
    "scope": "Scope 1",
    "ghgCat": "Direct — stationary",
    "table": "STATIONARY_COMBUSTION",
    "tableVersion": "2026.09.05",
    "templates": [
      "Boiler / Furnace",
      "Diesel Generator",
      "Process Heater",
      "Cooking / Kitchen"
    ],
    "fields": [
      "fuelQuantity",
      "fuelType",
      "energyConsumption",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "STATIONARY_COMBUSTION__ENERGY_CONTENT__002",
        "label": "Energy + Fuel Type",
        "requires": [
          "energyConsumption",
          "fuelType"
        ],
        "optional": [],
        "methodology": "ENERGY_CONTENT",
        "note": "Used where the site meters delivered energy rather than fuel volume.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "STATIONARY_COMBUSTION__FUEL_BASED__001",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "FUEL_BASED",
        "note": "Metered fuel purchase is the preferred basis for all stationary sources.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "STATIONARY_COMBUSTION__SPEND_BASED__003",
        "label": "Spend + Currency + Fuel Type",
        "requires": [
          "spend",
          "currency",
          "fuelType"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Screening only. Fuel price volatility makes this unsuitable for disclosure.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "upstreamLeased",
    "category": "UPSTREAM_LEASED",
    "label": "Upstream Leased Assets",
    "scope": "Scope 3",
    "ghgCat": "Category 8",
    "table": "UPSTREAM_LEASED",
    "tableVersion": "2026.09.05",
    "templates": [
      "Leased Office",
      "Leased Warehouse",
      "Leased Vehicle"
    ],
    "fields": [
      "energyConsumption",
      "gridRegion",
      "floorArea",
      "assetType",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "UPSTREAM_LEASED__ASSET_SPEC__001",
        "label": "Energy + Grid Region",
        "requires": [
          "energyConsumption",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "ASSET_SPEC",
        "note": "Sub-metered consumption for the leased space.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "UPSTREAM_LEASED__FLOOR_AREA__002",
        "label": "Floor Area + Asset Type",
        "requires": [
          "floorArea",
          "assetType"
        ],
        "optional": [],
        "methodology": "FLOOR_AREA",
        "note": "Asset-class intensity per square metre where no sub-meter exists.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "UPSTREAM_LEASED__SPEND_BASED__003",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Lease payments as a last-resort driver.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "upstreamTransport",
    "category": "UPSTREAM_TRANSPORT",
    "label": "Upstream Transportation & Distribution",
    "scope": "Scope 3",
    "ghgCat": "Category 4",
    "table": "UPSTREAM_TRANSPORT",
    "tableVersion": "2026.09.05",
    "templates": [
      "Inbound Freight",
      "Third-party Warehousing",
      "Courier & Parcel",
      "Ocean Freight"
    ],
    "fields": [
      "freightMass",
      "distance",
      "mode",
      "fuelQuantity",
      "fuelType",
      "spend"
    ],
    "fieldOptions": {
      "mode": [
        "Road — LGV (<3.5t)",
        "Road — HGV (>7.5t)",
        "Rail — Freight",
        "Sea — Container Ship",
        "Air — Freight",
        "Inland Waterway"
      ],
      "distanceUnit": [
        "km",
        "tonne.km",
        "vehicle.km",
        "miles"
      ]
    },
    "rules": [
      {
        "priority": 1,
        "id": "UPSTREAM_TRANSPORT__FUEL_BASED__002",
        "label": "Fuel Quantity + Fuel Type",
        "requires": [
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "FUEL_BASED",
        "note": "Applies where the carrier discloses fuel consumed on your consignments.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "UPSTREAM_TRANSPORT__VEH_DIST__003",
        "label": "Distance + Mode",
        "requires": [
          "distance",
          "mode"
        ],
        "optional": [],
        "methodology": "VEH_DIST",
        "note": "Vehicle-kilometre factor where consignment weight is unrecorded.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "UPSTREAM_TRANSPORT__WT_DIST__001",
        "label": "Weight + Distance + Mode",
        "requires": [
          "freightMass",
          "distance",
          "mode"
        ],
        "optional": [],
        "methodology": "WT_DIST",
        "note": "Tonne-kilometre is the reference method for all freight movements.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 4,
        "id": "UPSTREAM_TRANSPORT__SPEND_BASED__004",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Freight invoice value. Screening only.",
        "preference_rank": 4,
        "preference_basis": "EXPLICIT_STANDARD_GUIDANCE",
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "useOfSold",
    "category": "USE_OF_SOLD",
    "label": "Use of Sold Products",
    "scope": "Scope 3",
    "ghgCat": "Category 11",
    "table": "USE_OF_SOLD",
    "tableVersion": "2026.09.05",
    "templates": [
      "Energy-using Product",
      "Fuel-using Product",
      "Feedstock / Intermediate"
    ],
    "fields": [
      "unitsSold",
      "energyPerUse",
      "usesPerLifetime",
      "gridRegion",
      "fuelQuantity",
      "fuelType",
      "productType"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "USE_OF_SOLD__AVG_DATA__003",
        "label": "Units Sold + Product Type",
        "requires": [
          "unitsSold",
          "productType"
        ],
        "optional": [],
        "methodology": "AVG_DATA",
        "note": "Product-class lifetime average. Wide uncertainty; disclose the assumption.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "USE_OF_SOLD__USE_DIRECT__001",
        "label": "Units Sold + Energy / Use + Lifetime Uses + Grid Region",
        "requires": [
          "unitsSold",
          "energyPerUse",
          "usesPerLifetime",
          "gridRegion"
        ],
        "optional": [],
        "methodology": "USE_DIRECT",
        "note": "Measured product energy against the grid of the sales market.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "USE_OF_SOLD__USE_FUEL__002",
        "label": "Units Sold + Fuel Quantity + Fuel Type",
        "requires": [
          "unitsSold",
          "fuelQuantity",
          "fuelType"
        ],
        "optional": [],
        "methodology": "USE_FUEL",
        "note": "Lifetime fuel combustion for fuel-burning products.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "wasteOperations",
    "category": "WASTE_OPERATIONS",
    "label": "Waste Generated in Operations",
    "scope": "Scope 3",
    "ghgCat": "Category 5",
    "table": "WASTE_OPERATIONS",
    "tableVersion": "2026.09.05",
    "templates": [
      "General Waste",
      "Recycling Stream",
      "Hazardous Waste",
      "Wastewater"
    ],
    "fields": [
      "wasteQuantity",
      "wasteType",
      "treatmentMethod",
      "employeeCount",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "WASTE_OPERATIONS__AVG_DATA__003",
        "label": "Employees + Country",
        "requires": [
          "employeeCount",
          "country"
        ],
        "optional": [],
        "methodology": "AVG_DATA",
        "note": "Per-employee waste generation default. Use only where no tickets exist.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "WASTE_OPERATIONS__SPEND_BASED__004",
        "label": "Spend + Currency",
        "requires": [
          "spend",
          "currency"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Waste contractor invoice value.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 3,
        "id": "WASTE_OPERATIONS__WASTE_TREAT__002",
        "label": "Waste Quantity + Treatment",
        "requires": [
          "wasteQuantity",
          "treatmentMethod"
        ],
        "optional": [],
        "methodology": "WASTE_TREAT",
        "note": "Average-composition factor for the disposal route.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 4,
        "id": "WASTE_OPERATIONS__WASTE_TYPE__001",
        "label": "Waste Quantity + Waste Type + Treatment",
        "requires": [
          "wasteQuantity",
          "wasteType",
          "treatmentMethod"
        ],
        "optional": [],
        "methodology": "WASTE_TYPE",
        "note": "Weighbridge tickets naming both stream and route.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  },
  {
    "id": "waterWastewater",
    "category": "WATER_WASTEWATER",
    "label": "Water Supply & Wastewater",
    "scope": "Scope 3",
    "ghgCat": "Category 1",
    "table": "WATER_WASTEWATER",
    "tableVersion": "2026.09.05",
    "templates": [
      "Municipal Supply",
      "Wastewater Discharge",
      "Treated Effluent"
    ],
    "fields": [
      "waterVolume",
      "waterService",
      "spend"
    ],
    "fieldOptions": {},
    "rules": [
      {
        "priority": 1,
        "id": "WATER_WASTEWATER__SPEND_BASED__002",
        "label": "Spend + Currency + Country",
        "requires": [
          "spend",
          "currency",
          "country"
        ],
        "optional": [],
        "methodology": "SPEND_BASED",
        "note": "Utility invoice value where no meter reading exists.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      },
      {
        "priority": 2,
        "id": "WATER_WASTEWATER__VOL_WATER__001",
        "label": "Water Volume + Water Service",
        "requires": [
          "waterVolume",
          "waterService"
        ],
        "optional": [],
        "methodology": "VOL_WATER",
        "note": "Metered volume with the service split declared.",
        "preference_rank": null,
        "preference_basis": null,
        "applies_count": "one_of"
      }
    ]
  }
];

/* Both identifiers resolve: the governed code and the one records were
   written against before the ruleset was formalised. Renaming an identifier
   must not orphan historical activity data. */
const CATEGORY_BY_ID = {};
CATEGORIES.forEach(function (c) {
  CATEGORY_BY_ID[c.id] = c;
  if (c.category && c.category !== c.id) CATEGORY_BY_ID[c.category] = c;
});

const CORE_FIELDS = ['distance', 'mode', 'fuelQuantity', 'fuelType',
  'energyConsumption', 'gridRegion', 'spend', 'contractualInstrument'];

const SOURCES = {};
const METHODOLOGY_SOURCES = {};
