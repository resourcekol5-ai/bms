import { ChemistrySpec, BatteryChemistryType } from '../types/battery';

export const BATTERY_CHEMISTRIES: Record<BatteryChemistryType, ChemistrySpec> = {
  'li-ion': {
    id: 'li-ion',
    name: 'Li-Ion',
    shortName: 'Li-Ion',
    fullName: 'Lithium-Ion (NMC Cylindrical 18650/21700)',
    formula: 'LiNi_xMn_yCo_zO_2 + C_6',
    formFactorName: 'Cylindrical Can (18650 / 21700 / 4680)',
    formFactorType: 'cylindrical_18650',
    nominalVoltage: 3.70,
    maxVoltage: 4.20,
    cutoffVoltage: 2.80,
    typicalCapacity: 3500, // 3500mAh (typical 18650/21700)
    typicalIR: 14.5, // 14.5 mΩ
    energyDensity: 260, // Wh/kg
    cycleLife: 1200,
    maxDischargeC: 5.0, // up to 17.5A
    maxChargeC: 1.5,
    tempMin: -20,
    tempMax: 60,
    thermalRunawayTemp: 150,
    primaryApplications: ['Electric Vehicles (Tesla/Rivian)', 'Laptops & Power Banks', 'Cordless Power Tools', 'E-Bikes'],
    cathodeMaterial: 'Lithium Nickel Manganese Cobalt Oxide (NMC 811) on Aluminum Foil',
    anodeMaterial: 'Mesocarbon Microbead Graphite + Silicon Nanoparticles on Copper Foil',
    electrolyteType: 'LiPF6 (Lithium Hexafluorophosphate) in EC/DMC Organic Carbonate',
    separatorType: '16 µm Ceramic-Coated Microporous Polyethylene (PE) Film',
    housingMaterial: 'Deep-Drawn Nickel-Plated Steel Cylindrical Can with Top CID Vent',
    chemicalReaction: {
      charge: 'LiCoO2 + C6 → Li_(1-x)CoO2 + Li_x C6 (Intercalation into graphite)',
      discharge: 'Li_x C6 + Li_(1-x)CoO2 → C6 + LiCoO2 + Energy (e⁻ flux through load)',
    },
    features: [
      'High volumetric energy density (up to 700 Wh/L)',
      'Built-in Current Interrupt Device (CID) & PTC thermistor',
      'Robust rigid steel shell resists mechanical crushing',
      'Low self-discharge rate (< 2% per month)',
      'Universal modular pack building block'
    ],
    safetyRating: 'A',
    costTier: '$$',
    internalLayers: [
      { name: 'Outer Steel Jacket', material: 'Nickel-Plated Steel (0.2mm)', color: '#94a3b8', thickness: '200 µm', description: 'Rigid protective container holding internal jelly roll pressure.' },
      { name: 'Cathode Current Collector', material: 'Aluminum Foil (Al)', color: '#cbd5e1', thickness: '15 µm', description: 'Porous aluminum sheet carrying positive current to top cap.' },
      { name: 'Cathode Coating (Active)', material: 'LiNi0.8Mn0.1Co0.1O2', color: '#6366f1', thickness: '70 µm', description: 'Positive electrode where lithium ions de-intercalate during charging.' },
      { name: 'Microporous Separator', material: 'Ceramic-Coated PE Membrane', color: '#38bdf8', thickness: '16 µm', description: 'Prevents electrical shorts while permitting Li+ ion transport.' },
      { name: 'Anode Coating (Active)', material: 'Porous Graphite + Si', color: '#10b981', thickness: '75 µm', description: 'Negative electrode storing lithium ions inside graphite lattice.' },
      { name: 'Anode Current Collector', material: 'Copper Foil (Cu)', color: '#f59e0b', thickness: '10 µm', description: 'Pure copper foil welded to negative base terminal.' },
      { name: 'Top Safety Cap & CID', material: 'PTC + Burst Vent Disc', color: '#e11d48', thickness: '1.2 mm', description: 'Trips open to disconnect circuit if internal pressure exceeds 1.5 MPa.' },
    ],
    accentColor: '#3b82f6',
    gradient: 'from-blue-600 via-indigo-600 to-cyan-500',
    badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-400',
  },

  'lipo': {
    id: 'lipo',
    name: 'LiPo',
    shortName: 'LiPo',
    fullName: 'Lithium Polymer (High-Discharge Pouch Cell)',
    formula: 'LiCoO_2 + Poly(vinylidene fluoride-HFP) Gel',
    formFactorName: 'Laminated Aluminum Pouch (Flat Multi-Layer)',
    formFactorType: 'pouch_flat',
    nominalVoltage: 3.70,
    maxVoltage: 4.20,
    cutoffVoltage: 3.00,
    typicalCapacity: 2200, // 2200mAh (typical drone / RC pack cell)
    typicalIR: 3.2, // Ultra-low IR 3.2 mΩ for high C-burst
    energyDensity: 240, // Wh/kg
    cycleLife: 500,
    maxDischargeC: 50.0, // High-discharge 50C to 100C burst!
    maxChargeC: 3.0,
    tempMin: -10,
    tempMax: 65,
    thermalRunawayTemp: 130,
    primaryApplications: ['FPV Racing Drones & RC Models', 'Smartphones & Ultra-thin Laptops', 'Robotics & UAVs', 'Wearable Medical Electronics'],
    cathodeMaterial: 'Lithium Cobalt Oxide (LiCoO2) / High-rate NMC on Aluminum Foil',
    anodeMaterial: 'Nanostructured Synthetic Graphite on Copper Foil',
    electrolyteType: 'Gel Polymer Matrix impregnated with 1M LiPF6 in Carbonates',
    separatorType: 'Polymer Gel Micro-Porous Film (PVDF-HFP)',
    housingMaterial: 'Multi-layer Aluminum Laminate Foil (Heat-Sealed Polyamide/Al/PP)',
    chemicalReaction: {
      charge: 'LiCoO2 + C → Li_(1-x)CoO2 + Li_x C (Li+ transport through gel polymer)',
      discharge: 'Li_x C + Li_(1-x)CoO2 → LiCoO2 + e⁻ (Ultra-low internal impedance surge)',
    },
    features: [
      'Extreme continuous discharge capability (30C - 100C+ bursts)',
      'Ultra-thin flat profile fits customized spatial geometries',
      'Extremely lightweight packaging eliminates heavy steel can weight',
      'Direct external nickel & aluminum solder tabs with balance leads',
      'Visual swelling warning when degraded (pouch ballooning indicator)'
    ],
    safetyRating: 'B',
    costTier: '$$$',
    internalLayers: [
      { name: 'Outer Barrier Pouch', material: 'Polyamide Nylon Film (Outer)', color: '#475569', thickness: '25 µm', description: 'Abrasion-resistant outer layer protecting moisture barrier.' },
      { name: 'Hermetic Foil Shield', material: 'Aluminum Barrier Foil', color: '#e2e8f0', thickness: '40 µm', description: 'Zero-permeability metal layer preventing moisture and air intrusion.' },
      { name: 'Thermal Seal Layer', material: 'Cast Polypropylene (CPP)', color: '#94a3b8', thickness: '30 µm', description: 'Heat-sealed perimeter ensuring hermetic vacuum containment.' },
      { name: 'Positive Tab Terminal', material: 'Solid Aluminum Tab (+)', color: '#38bdf8', thickness: '0.2 mm', description: 'Welded directly to stacked positive cathode collectors.' },
      { name: 'Stacked Cathodes', material: 'LiCoO2 on Double-Sided Al', color: '#ec4899', thickness: '85 µm', description: 'High-current electrode layers connected in parallel stack.' },
      { name: 'Polymer Gel Separator', material: 'PVDF-HFP Gel Electrolyte', color: '#a855f7', thickness: '20 µm', description: 'Semi-solid conductive gel with high ionic conductivity.' },
      { name: 'Stacked Anodes', material: 'Graphite on Double-Sided Cu', color: '#10b981', thickness: '90 µm', description: 'Parallel stacked negative sheets connected to Nickel tab.' },
      { name: 'Negative Tab Terminal', material: 'Nickel-Plated Copper Tab (-)', color: '#f59e0b', thickness: '0.2 mm', description: 'Heavy gauge solder tab for high current draw leads.' },
    ],
    accentColor: '#ec4899',
    gradient: 'from-pink-500 via-rose-500 to-purple-600',
    badgeBg: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    borderColor: 'border-pink-500',
    textColor: 'text-pink-400',
  },

  'nimh': {
    id: 'nimh',
    name: 'NiMH',
    shortName: 'NiMH',
    fullName: 'Nickel-Metal Hydride (Aqueous Alkaline Cell)',
    formula: 'NiO(OH) + MH ⇌ Ni(OH)_2 + M',
    formFactorName: 'Cylindrical Steel Can (AA / AAA / Sub-C / Pack Stick)',
    formFactorType: 'cylindrical_nimh',
    nominalVoltage: 1.20,
    maxVoltage: 1.45,
    cutoffVoltage: 1.00,
    typicalCapacity: 2500, // 2500mAh (AA / Sub-C)
    typicalIR: 8.0, // 8 mΩ high-drain Sub-C power cell
    energyDensity: 90, // Wh/kg
    cycleLife: 1000,
    maxDischargeC: 10.0, // Sub-C high drain packs
    maxChargeC: 1.0,
    tempMin: -20,
    tempMax: 50,
    thermalRunawayTemp: 80, // Negative delta-V (d2V/dt2) charge termination
    primaryApplications: ['Hybrid Electric Vehicles (Toyota Prius NiMH Pack)', 'Consumer Rechargeable AA/AAA', 'Emergency Lighting & Telecom Backup', 'Cordless Phones & Two-Way Radios'],
    cathodeMaterial: 'Nickel Oxyhydroxide (NiOOH) infused in Porous Nickel Metal Foam',
    anodeMaterial: 'Hydrogen-absorbing Rare Earth Metal Alloy (AB5 / LaNi5H6 or AB2)',
    electrolyteType: 'Aqueous Alkaline 30% Potassium Hydroxide (KOH) Solution',
    separatorType: 'Non-Woven Polyolefin / Grafted Nylon Webbing',
    housingMaterial: 'Nickel-Plated Deep-Drawn Steel Can with Resealable Rubber Vent Valve',
    chemicalReaction: {
      charge: 'Ni(OH)2 + M + OH⁻ → NiO(OH) + H2O + MH + e⁻ (Reversible Hydrogen storage in metal alloy)',
      discharge: 'NiO(OH) + MH → Ni(OH)2 + M (Water & Proton exchange with 1.20V nominal output)',
    },
    features: [
      'Inherent thermal safety: aqueous non-flammable KOH electrolyte',
      'No volatile organic solvents; benign failure mode (does not catch fire)',
      'Resealable safety vent safely vents excess hydrogen & oxygen gas',
      'Wide operating temperature window with proven 20+ year reliability',
      'Standard 1.2V replacement for 1.5V alkaline primary batteries'
    ],
    safetyRating: 'A+',
    costTier: '$',
    internalLayers: [
      { name: 'Nickel Steel Casing', material: 'Cold-Rolled Steel + Nickel', color: '#64748b', thickness: '250 µm', description: 'Pressure-resistant vessel designed for alkaline environment.' },
      { name: 'Nickel Foam Cathode', material: 'NiOOH in 3D Ni Foam', color: '#06b6d4', thickness: '280 µm', description: 'Highly porous nickel matrix providing massive electroactive surface area.' },
      { name: 'Hydrophilic Separator', material: 'Porous Non-Woven Polyolefin', color: '#e2e8f0', thickness: '120 µm', description: 'Absorbs aqueous KOH solution; ensures ionic proton transport.' },
      { name: 'Alkaline Electrolyte', material: 'Aqueous KOH (Potassium Hydroxide)', color: '#38bdf8', thickness: 'Micro-film', description: 'Conductive alkaline solution with high ion mobility.' },
      { name: 'Metal Hydride Anode', material: 'AB5 Alloy (LaNi4.5Co0.5)', color: '#10b981', thickness: '240 µm', description: 'Intermetallic alloy lattice that reversibly absorbs hydrogen atoms.' },
      { name: 'Resealable Rubber Vent', material: 'EPDM Rubber Gasket & Cap', color: '#e11d48', thickness: '1.0 mm', description: 'Releases overpressure gas without destroying cell integrity.' },
    ],
    accentColor: '#10b981',
    gradient: 'from-emerald-500 via-teal-600 to-green-600',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    borderColor: 'border-emerald-500',
    textColor: 'text-emerald-400',
  },

  'lifepo4': {
    id: 'lifepo4',
    name: 'LiFePO4',
    shortName: 'LFP',
    fullName: 'Lithium Iron Phosphate (Prismatic LFP)',
    formula: 'LiFePO_4 + C',
    formFactorName: 'Rigid Prismatic Aluminum Block (280Ah / 100Ah)',
    formFactorType: 'prismatic_hardcase',
    nominalVoltage: 3.20,
    maxVoltage: 3.65,
    cutoffVoltage: 2.50,
    typicalCapacity: 100000, // 100Ah (100,000 mAh prismatic cell)
    typicalIR: 0.35, // 0.35 mΩ ultra-low IR
    energyDensity: 160, // Wh/kg
    cycleLife: 6000, // Massive 4000-8000 cycle lifespan!
    maxDischargeC: 3.0,
    maxChargeC: 1.0,
    tempMin: -20,
    tempMax: 65,
    thermalRunawayTemp: 270, // Extremely high thermal stability!
    primaryApplications: ['Solar Home Battery Storage (Powerwalls)', 'Commercial Energy Storage (BESS)', 'Commercial EV Buses & Trucks', 'Marine & RV Deep Cycle House Banks'],
    cathodeMaterial: 'Lithium Iron Phosphate (LiFePO4) with Olivine Crystal Lattice',
    anodeMaterial: 'Synthetic Graphite on High-Conductivity Copper Foil',
    electrolyteType: 'LiPF6 in High-Flashpoint Carbonate Solvents',
    separatorType: 'Ceramic Composite Heavy-Duty Separator (20 µm)',
    housingMaterial: 'Heavy Laser-Welded Aluminum Case with M6/M8 Terminal Studs & Burst Vent',
    chemicalReaction: {
      charge: 'LiFePO4 → FePO4 + Li+ + e⁻ (Extremely stable olivine crystal prevents oxygen release)',
      discharge: 'FePO4 + Li+ + e⁻ → LiFePO4 (Flat 3.2V voltage plateau across 80% of discharge)',
    },
    features: [
      'Ultra-long cycle life: 4,000 to 8,000+ full cycles (15+ years)',
      'Exceptional thermal stability: does not release oxygen at high temperatures',
      'Ultra-flat discharge voltage curve (stays at ~3.2V for 80% DoD)',
      'Heavy-duty laser welded aluminum case with rugged threaded busbar terminals',
      'Cobalt-free & Nickel-free: environmentally friendlier & ethically sourced'
    ],
    safetyRating: 'A+',
    costTier: '$$',
    internalLayers: [
      { name: 'Prismatic Aluminum Shell', material: 'Extruded Aluminum (1.2mm)', color: '#64748b', thickness: '1.2 mm', description: 'Rigid crash-resistant prismatic enclosure.' },
      { name: 'Laser-Welded Top Plate', material: 'Aluminum with Ceramic Seals', color: '#94a3b8', thickness: '2.5 mm', description: 'Hermetically welded top lid with anti-torsion terminal studs.' },
      { name: 'Positive Terminal Stud', material: 'M6/M8 Threaded Aluminum Post', color: '#38bdf8', thickness: '8 mm', description: 'Heavy-gauge high current bolted connection terminal.' },
      { name: 'Olivine LiFePO4 Cathode', material: 'LiFePO4 Nanocoated', color: '#3b82f6', thickness: '110 µm', description: 'Robust P-O covalent bonds prevent thermal runaway oxygen liberation.' },
      { name: 'Reinforced Ceramic Separator', material: 'Al2O3 Coated Polyolefin', color: '#e2e8f0', thickness: '20 µm', description: 'High puncture resistance prevents internal dendrite shorts.' },
      { name: 'Graphite Anode', material: 'High-Density Graphite', color: '#10b981', thickness: '115 µm', description: 'Intercalated negative electrode with low expansion profile.' },
      { name: 'Negative Terminal Stud', material: 'M6/M8 Threaded Copper Post', color: '#f59e0b', thickness: '8 mm', description: 'Direct laser welded copper tab to stud assembly.' },
    ],
    accentColor: '#0ea5e9',
    gradient: 'from-cyan-500 via-blue-600 to-indigo-700',
    badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    borderColor: 'border-cyan-500',
    textColor: 'text-cyan-400',
  },

  'lead-acid': {
    id: 'lead-acid',
    name: 'Lead-Acid',
    shortName: 'Pb-Acid',
    fullName: 'Lead-Acid (Deep-Cycle AGM VRLA)',
    formula: 'PbO_2 + Pb + 2H_2SO_4 ⇌ 2PbSO_4 + 2H_2O',
    formFactorName: 'Molded Monoblock (Cast Lead Grids & Posts)',
    formFactorType: 'lead_acid_monoblock',
    nominalVoltage: 2.00,
    maxVoltage: 2.45,
    cutoffVoltage: 1.75,
    typicalCapacity: 50000, // 50Ah per cell unit
    typicalIR: 4.5, // 4.5 mΩ
    energyDensity: 38, // Wh/kg
    cycleLife: 500,
    maxDischargeC: 5.0, // High starter cranking amps
    maxChargeC: 0.3,
    tempMin: -30,
    tempMax: 50,
    thermalRunawayTemp: 90,
    primaryApplications: ['Automotive 12V SLI (Starter/Lighting/Ignition)', 'Golf Carts & Forklifts', 'Data Center Heavy UPS Backup', 'Marine Trolling Motors'],
    cathodeMaterial: 'Lead Dioxide (PbO2) pasted onto Cast Lead-Calcium Grid Alloy',
    anodeMaterial: 'Spongy Metallic Lead (Pb) on Cast Lead Grid',
    electrolyteType: 'Aqueous Sulfuric Acid (H2SO4, 1.280 Specific Gravity) in Glass Mat',
    separatorType: 'Absorbed Glass Mat (AGM) Microfiber Borosilicate Sheet',
    housingMaterial: 'Heavy Polypropylene / ABS Monoblock Plastic Case with Lead Posts',
    chemicalReaction: {
      charge: '2PbSO4 + 2H2O → PbO2 + Pb + 2H2SO4 (Rebuilds acid density and active lead plates)',
      discharge: 'PbO2 + Pb + 2H2SO4 → 2PbSO4 + 2H2O (Forms Lead Sulfate on both plates + produces water)',
    },
    features: [
      'Extremely high surge cranking current (CCA up to 1000A+)',
      'Lowest initial upfront cost per kilowatt-hour',
      'Proven 160-year industrial history & 99% recycled material stream',
      'Simple float charging profile with wide operating temperature tolerance',
      'VRLA sealed design recombinates 99% of internal hydrogen gas'
    ],
    safetyRating: 'B+',
    costTier: '$',
    internalLayers: [
      { name: 'Polypropylene Case', material: 'Impact-Resistant Molded PP', color: '#334155', thickness: '3.5 mm', description: 'Acid-resistant compartmentalized monoblock jar.' },
      { name: 'Positive Lead Grid', material: 'Cast Pb-Ca-Sn Alloy Grid', color: '#64748b', thickness: '2.8 mm', description: 'Heavy structural grid supporting active lead dioxide paste.' },
      { name: 'PbO2 Positive Paste', material: 'Lead Dioxide Paste (Brown)', color: '#b45309', thickness: '2.2 mm', description: 'Dense porous active cathode material.' },
      { name: 'Absorptive Glass Mat', material: 'Borosilicate Glass Microfiber', color: '#f1f5f9', thickness: '1.5 mm', description: 'Absorbs 100% of liquid acid electrolyte like a sponge.' },
      { name: 'Spongy Lead Paste', material: 'Spongy Metallic Lead (Gray)', color: '#94a3b8', thickness: '2.0 mm', description: 'Active spongy metallic lead anode.' },
      { name: 'Negative Lead Grid', material: 'Cast Pb-Ca Alloy Grid', color: '#475569', thickness: '2.5 mm', description: 'Negative grid conducting electrons to negative post.' },
      { name: 'Cast Inter-Cell Bridge', material: 'Solid Cast Lead Busbar', color: '#cbd5e1', thickness: '8.0 mm', description: 'Through-partition welded lead strap connecting cells.' },
    ],
    accentColor: '#f59e0b',
    gradient: 'from-amber-600 via-orange-600 to-stone-700',
    badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    borderColor: 'border-amber-500',
    textColor: 'text-amber-400',
  },

  'solid-state': {
    id: 'solid-state',
    name: 'Solid-State',
    shortName: 'SSB',
    fullName: 'Solid-State Lithium-Metal (Ceramic LLZO / Sulfide)',
    formula: 'Li + Li_7La_3Zr_2O_{12} + LiNi_{0.9}Mn_{0.05}Co_{0.05}O_2',
    formFactorName: 'Ultra-Dense Solid Laminate Block',
    formFactorType: 'pouch_flat',
    nominalVoltage: 3.85,
    maxVoltage: 4.40,
    cutoffVoltage: 2.70,
    typicalCapacity: 4500, // 4500mAh
    typicalIR: 6.8, // 6.8 mΩ
    energyDensity: 450, // Wh/kg - Ultra High!
    cycleLife: 2500,
    maxDischargeC: 10.0,
    maxChargeC: 4.0, // 10-minute ultra-fast charging
    tempMin: -30,
    tempMax: 100,
    thermalRunawayTemp: 350, // Zero flammable organic solvents!
    primaryApplications: ['Next-Gen High-Range EVs (1000+ km range)', 'Electric Aviation & eVTOL aircraft', 'Military & Aerospace satellites', 'Deep Space Exploration Probes'],
    cathodeMaterial: 'Single-Crystal High-Nickel NMC 90/05/05 with Protective Coating',
    anodeMaterial: 'Pure Lithium Metal Foil (Anode-less in-situ plated copper)',
    electrolyteType: 'Solid Garnet-Type Ceramic (LLZO) / Sulfide Solid Electrolyte',
    separatorType: 'Solid Ceramic Electrolyte Membrane acts as separator & conductor',
    housingMaterial: 'Hermetically Sealed Ceramic-Polymer Composite Shell with Titanium Leads',
    chemicalReaction: {
      charge: 'Li+ ions diffuse across solid crystal lattice and plate as pure lithium metal',
      discharge: 'Lithium metal oxidizes at anode; Li+ ions migrate through ceramic grain boundaries',
    },
    features: [
      'Eliminates flammable organic liquid solvents entirely (Non-flammable)',
      'Game-changing gravimetric energy density (450+ Wh/kg, 1000+ Wh/L)',
      'Ultra-fast 10-minute recharge capability without thermal runaway risk',
      'Solid ceramic barrier physically blocks lithium dendrite penetration',
      'Extreme operating thermal envelope (-30°C to +100°C)'
    ],
    safetyRating: 'A+',
    costTier: '$$$$',
    internalLayers: [
      { name: 'Titanium Shell Barrier', material: 'Ultra-thin Titanium Foil', color: '#475569', thickness: '50 µm', description: 'High-strength containment providing uniform stack pressure.' },
      { name: 'Cathode Current Collector', material: 'Carbon-Coated Aluminum Foil', color: '#cbd5e1', thickness: '10 µm', description: 'Low interface impedance current collector.' },
      { name: 'Solid Composite Cathode', material: 'High-Ni NMC + Solid Electrolyte', color: '#8b5cf6', thickness: '80 µm', description: 'Co-sintered electrode with continuous 3D ion diffusion paths.' },
      { name: 'Solid Ceramic Electrolyte', material: 'LLZO Garnet / Sulfide Glass', color: '#06b6d4', thickness: '25 µm', description: 'Impermeable solid ceramic layer conducting Li+ ions at room temp.' },
      { name: 'In-Situ Plated Li Metal', material: 'Pure Lithium Metal (Anode)', color: '#10b981', thickness: '30 µm', description: 'Maximum theoretical specific capacity (3860 mAh/g).' },
      { name: 'Copper Foil Anode Bus', material: 'Ultra-Thin Copper Foil (Cu)', color: '#f59e0b', thickness: '8 µm', description: 'Negative terminal current collector.' },
    ],
    accentColor: '#8b5cf6',
    gradient: 'from-violet-600 via-purple-600 to-indigo-600',
    badgeBg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    borderColor: 'border-purple-500',
    textColor: 'text-purple-400',
  },
};

export const LOAD_PROFILES: Record<string, { name: string; icon: string; current: number; description: string; chemistryRecommendation: BatteryChemistryType[] }> = {
  custom: {
    name: 'Manual / Custom Load',
    icon: 'Sliders',
    current: 5.0,
    description: 'Freely set charge and discharge current and simulate scenarios.',
    chemistryRecommendation: ['li-ion', 'lipo', 'nimh', 'lifepo4', 'lead-acid', 'solid-state'],
  },
  ev_cruise: {
    name: 'EV Steady Highway Cruise',
    icon: 'Car',
    current: 12.0,
    description: 'Smooth 100 km/h cruising draw with steady thermal build-up and moderate C-rate.',
    chemistryRecommendation: ['li-ion', 'lifepo4', 'solid-state'],
  },
  ev_sport: {
    name: 'EV Ludicrous Acceleration (Surge)',
    icon: 'Zap',
    current: 45.0,
    description: 'Full-throttle 0-100 km/h launch surge testing pack voltage sag & thermal spike.',
    chemistryRecommendation: ['li-ion', 'lipo', 'solid-state'],
  },
  drone_hover: {
    name: 'FPV Drone Steady Hover',
    icon: 'Radio',
    current: 18.0,
    description: 'Constant brushless motor draw demanding tight cell voltage balance.',
    chemistryRecommendation: ['lipo', 'li-ion'],
  },
  drone_acro: {
    name: 'Drone Acrobatic Punchout',
    icon: 'Flame',
    current: 50.0,
    description: 'Extreme 50C+ burst throttle punch testing low internal resistance.',
    chemistryRecommendation: ['lipo'],
  },
  solar_storage: {
    name: 'Solar ESS Deep Cycle Discharge',
    icon: 'Sun',
    current: 8.0,
    description: 'Long-duration steady home inverter load demanding deep cycle longevity.',
    chemistryRecommendation: ['lifepo4', 'lead-acid'],
  },
  fast_charge: {
    name: 'Ultra-Fast CC/CV Supercharger',
    icon: 'BatteryCharging',
    current: 25.0,
    description: 'High-current constant current charge transitioning to constant voltage saturation.',
    chemistryRecommendation: ['li-ion', 'lifepo4', 'solid-state'],
  },
  slow_trickle: {
    name: 'Float / Balancing Trickle Charge',
    icon: 'RefreshCw',
    current: 1.5,
    description: 'Gentle top-off charge with active BMS shunting to equalize all series cells.',
    chemistryRecommendation: ['li-ion', 'lipo', 'nimh', 'lifepo4', 'lead-acid'],
  }
};
