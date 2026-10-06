# EZRAB Civil Domain Implementation Specification

**Purpose:** implementation-ready scope for the remaining civil quantity-takeoff domains.  
**Reuse:** existing Generic Calculator Core, Unit/Precision/Validation/Dependency/Provenance/Trace engines, Registry, QTO Adapter, UI framework, AHSP/Pricing layer, project isolation, and ownership guard.  
**Do not build:** new architecture, AHSP, pricing, hydraulic design, structural design, productivity, or engineering approval.

## 1. Common contract

```text
DOMAIN → ENTITY → CALCULATOR → APPROVED INPUT → DETERMINISTIC OUTPUT → QTO
```

Every definition requires: namespaced ID, entity type/subtype, required/optional typed inputs, output units, dependency IDs, ownership kind, validation rules, anti-duplicate policy, UI label, formula/source provenance, version, and status. Missing design/product/source data is `BLOCKED` or `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`; never defaulted.

Common ownership kinds: `produced`, `derived`, `consumed`. A component calculator owns its QTO quantity; generic concrete/earthwork/formwork engines are services, not additional QTO producers.

Common acceptance for each domain: registered; callable; required inputs rejected when absent/invalid; deterministic output; QTO proposal/commit through existing adapter; visible UI entry; authoritative project context; duplicate ownership guard; unit/golden/validation/dependency tests; TypeScript and build pass.

## 2. Implementation table

| Domain | Calculator | Entity | Required inputs | Optional inputs | Output | Unit | Dependency | Ownership | Validation | Anti-duplicate | UI label | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| drainage | `drainage.channel.rectangular` | channel | route length, width, depth | lining thickness, cover | section area, excavation/lining volume | m, m², m³ | channel geometry | produced | positive dimensions, unit compatibility | one channel entity/section owner | Saluran Persegi | planned |
| drainage | `drainage.channel.trapezoidal` | channel | length, top/bottom width, depth | lining | section/volume/lining area | m, m², m³ | channel geometry | produced | valid trapezoid | cannot coexist with rectangular owner | Saluran Trapesium | planned |
| drainage | `drainage.u_ditch` | culvert/channel | route length, product section | joint, bedding, cover | unit count, length, bedding/excavation/backfill | bh, m, m³ | product geometry, route | produced | product dimensions required | road drainage references same entity | U-Ditch | planned |
| drainage | `drainage.box_culvert` | culvert | length, opening, wall/slab dimensions | wing/headwall | concrete, rebar reference, formwork, excavation/backfill | m, m², m³ | route, section | produced | opening and external geometry | one culvert owner | Box Culvert | planned |
| drainage | `drainage.pipe` | pipe/culvert | route length, diameter/product | bedding, joint, trench | pipe length/count, bedding/excavation/backfill | m, bh, m³ | route, product | produced | diameter/product evidence | pipe route has one owner | Pipa Drainase | planned |
| drainage | `drainage.ditch` | ditch | route, cross-section | lining/cover | length, excavation, lining | m, m², m³ | route/section | produced | section closure | road side ditch links, not duplicates | Parit | planned |
| drainage | `drainage.inlet` | inlet | count, geometry | grating/connection | count, concrete/excavation | bh, m³ | drainage route | produced | count/geometry | one inlet entity | Inlet | planned |
| drainage | `drainage.outlet` | outlet | count, geometry | headwall/energy element | count, structure volume | bh, m³ | route/channel | produced | geometry | one outlet owner | Outlet | planned |
| drainage | `drainage.manhole` | manhole | count, internal/external geometry, depth | cover/ladder | count, excavation, structure, cover | bh, m³ | pipe route | produced | depth/geometry | no duplicate chamber | Manhole | planned |
| drainage | `drainage.headwall` | headwall | count, dimensions | wingwall/opening | concrete/masonry/formwork | bh, m³, m² | culvert/outlet | produced | dimension completeness | culvert references component | Headwall | planned |
| drainage | `drainage.excavation` | drain/trench | route/section/depth | station segments | excavation volume | m³ | route, section | produced | nonnegative, section valid | one earthwork partition | Galian Drainase | planned |
| drainage | `drainage.bedding` | pipe/channel | route, width, thickness | material | bedding volume | m³ | route/section | derived | thickness explicit | consumed by pipe/channel | Bedding | planned |
| drainage | `drainage.backfill` | trench | excavation, occupied volume | layer detail | backfill volume | m³ | excavation, pipe/structure | derived | occupied ≤ excavation | one backfill owner | Urugan Kembali | planned |
| drainage | `drainage.concrete_channel` | channel | geometry, thickness | reinforcement/formwork | concrete volume | m³ | channel geometry | produced | thickness/source | lining is component, not duplicate channel | Saluran Beton | planned |
| drainage | `drainage.lining` | channel | lining face, thickness | material | area/volume | m², m³ | channel geometry | produced | face ownership | concrete channel consumes/links | Lining Drainase | planned |
| drainage | `drainage.cover` | channel | length/width/thickness or product | opening/grating | area/count/volume | m², bh, m³ | channel | produced | product/detail | cover separate from channel body | Cover/Slab Drainase | planned |
| bridge | `bridge.geometry` | bridge | alignment, span, width | station/offset | length/area/segments | m, m² | geometry | produced | geometry closure | one bridge parent | Geometri Jembatan | planned |
| bridge | `bridge.deck` | deck | plan length/width/edges | openings | deck area/edge length | m², m | bridge geometry | produced | polygon/void checks | slab consumes deck area | Deck Jembatan | planned |
| bridge | `bridge.girder` | girder | count, length, section/profile | material | length/count/volume or sourced mass | m, bh, m³, kg | bridge/deck | produced | schedule required | one girder schedule owner | Girder | planned |
| bridge | `bridge.abutment` | abutment | component geometry | wing/backwall | concrete/masonry/excavation/backfill | m³ | bridge geometry | produced | child completeness | children linked to parent | Abutment | planned |
| bridge | `bridge.pier` | pier | count, section, height | cap/shaft segments | concrete/formwork/rebar reference | bh, m³, m² | bridge geometry | produced | member dimensions | one pier owner | Pier | planned |
| bridge | `bridge.foundation` | foundation | approved geometry, count | pile/footing variant | excavation/concrete/formwork | m³, m² | bridge geometry | produced | approved dimensions | no generic duplicate | Fondasi Jembatan | planned |
| bridge | `bridge.approach_slab` | approach_slab | length, width, thickness | joint | area/volume/formwork | m², m³ | abutment/road | produced | thickness required | road interface linked | Approach Slab | planned |
| bridge | `bridge.barrier_parapet` | barrier/parapet | route/profile/count | reinforcement | length/volume/area/count | m, m³, m², bh | deck edges | produced | profile required | one edge owner | Barrier/Parapet | planned |
| bridge | `bridge.bearing` | bearing | count, type | dimensions | count/set | bh, set | girder/deck schedule | produced | schedule evidence | one bearing schedule | Bearing | planned |
| bridge | `bridge.expansion_joint` | expansion_joint | joint line length, profile | count | length/count/area | m, bh, m² | deck | produced | product/detail | one joint line owner | Expansion Joint | planned |
| bridge | `bridge.excavation` | foundation/abutment | section/volume inputs | station breakdown | excavation volume | m³ | foundation/earthwork | produced | partition valid | one earthwork partition | Galian Jembatan | planned |
| bridge | `bridge.backfill` | abutment/foundation | excavation, occupied volume | material layers | backfill volume | m³ | excavation | derived | occupied ≤ excavation | one backfill owner | Urugan Kembali Jembatan | planned |
| bridge | `bridge.concrete` | component | approved solid geometry | openings | concrete volume | m³ | component geometry | consumed | no design inference | component owns output | Beton Jembatan | planned |
| bridge | `bridge.formwork` | component | included faces | exclusions | formwork area | m² | concrete geometry | consumed | face flags required | no all-face default | Bekisting Jembatan | planned |
| bridge | `bridge.reinforcement` | component | approved bar schedule | lap/bend from source | length/weight/count | m, kg, bh | member schedule | consumed | unit weight/source | no design bar generation | Pembesian Jembatan | planned |
| irrigation | `irrigation.canal` | canal | route, cross-section | station segments | length/section/excavation | m, m², m³ | channel engine | produced | section valid | one canal owner | Saluran Irigasi | planned |
| irrigation | `irrigation.excavation` | canal | section/route | station method | excavation volume | m³ | canal | produced | partition valid | one earthwork owner | Galian Saluran | planned |
| irrigation | `irrigation.lining` | lining | face, thickness | material | area/volume | m², m³ | canal | produced | thickness/source | canal consumes lining | Lining Saluran | planned |
| irrigation | `irrigation.embankment` | embankment | cross-sections/stations | layers | fill volume | m³ | canal/sections | produced | section sequence | no road fill duplicate | Tanggul Irigasi | planned |
| irrigation | `irrigation.gate` | gate | count, product geometry | accessories | count/area/weight if sourced | bh, m², kg | structure schedule | produced | product evidence | one gate schedule | Pintu Air | planned |
| irrigation | `irrigation.intake` | intake | structure geometry | screens/gates | concrete/formwork/excavation | m³, m² | canal | produced | dimensions | one intake owner | Intake | planned |
| irrigation | `irrigation.outlet` | outlet | geometry/count | pipe/headwall | count/structure volume | bh, m³ | canal/pipe | produced | geometry | one outlet owner | Outlet Irigasi | planned |
| irrigation | `irrigation.structure.box` | structure | box geometry | openings | concrete/rebar/formwork | m³, m² | canal | produced | opening/solid checks | component ownership | Box Structure | planned |
| irrigation | `irrigation.concrete` | component | solid geometry | openings | concrete volume | m³ | structure | consumed | geometry | no second concrete line | Beton Irigasi | planned |
| irrigation | `irrigation.formwork` | component | included faces | exclusions | formwork area | m² | concrete | consumed | face flags | no all-face default | Bekisting Irigasi | planned |
| irrigation | `irrigation.backfill` | trench/structure | excavation/occupied volume | layer | backfill volume | m³ | excavation | derived | volume bounds | one backfill owner | Urugan Kembali Irigasi | planned |
| river | `river.segment` | river_segment | alignment/length/sections | chainage | length/area/section | m, m² | geometry | produced | station validity | one river segment owner | Segmen Sungai | planned |
| river | `river.riprap` | riprap | protected face, thickness | density/grading | area/volume/weight if sourced | m², m³, kg | river segment | produced | thickness/source | one protection layer | Riprap | planned |
| river | `river.gabion` | gabion | count/dimensions | stone density | count/volume/mesh area/weight | bh, m³, m², kg | river segment | produced | product dimensions | one gabion owner | Bronjong | planned |
| river | `river.revetment` | revetment | face area, layer thickness | filter/geotextile | area/volume | m², m³ | river segment | produced | layer boundaries | no riprap duplicate | Revetment | planned |
| river | `river.protection_concrete` | protection_structure | solid geometry | reinforcement/formwork | concrete/formwork area | m³, m² | river segment | produced | geometry | component owner | Beton Pengaman Sungai | planned |
| river | `river.sheet_pile` | sheet_pile | wall length, profile, count | sourced unit weight | length/count/area/weight | m, bh, m², kg | river segment | produced | profile/source | one wall owner | Sheet Pile | planned |
| river | `river.toe_protection` | protection_structure | toe route/section | material | length/area/volume | m, m², m³ | river segment | produced | section valid | one toe owner | Toe Protection | planned |
| river | `river.excavation` | river work | section/route | station | excavation volume | m³ | geometry | produced | partition valid | one earthwork producer | Galian Pengaman Sungai | planned |
| river | `river.backfill` | river work | excavation/occupied volume | material layers | backfill volume | m³ | excavation | derived | bounds | one backfill owner | Urugan Pengaman Sungai | planned |
| weir | `weir.body` | weir | plan/section/length | openings | concrete/masonry volume | m³ | weir geometry | produced | solid/void checks | one body owner | Tubuh Bendung | planned |
| weir | `weir.spillway` | spillway | geometry/length | lining | area/volume/length | m², m³, m | weir | produced | geometry | body/spillway boundary explicit | Spillway | planned |
| weir | `weir.apron` | apron | length/width/thickness | joint | area/volume | m², m³ | weir | produced | dimensions | one apron owner | Apron | planned |
| weir | `weir.stilling_basin` | stilling_basin | geometry | lining/joints | concrete/formwork/area | m³, m² | weir | produced | geometry | no hydraulic output | Kolam Olak | planned |
| weir | `weir.wing_wall` | wing_wall | length/section | reinforcement/formwork | concrete/masonry/area | m³, m² | weir | produced | section valid | retaining relationship | Dinding Sayap | planned |
| weir | `weir.gate` | gate | count/product geometry | accessories | count/area/weight if sourced | bh, m², kg | weir schedule | produced | product source | one gate owner | Pintu Bendung | planned |
| weir | `weir.excavation` | weir work | sections/route | station | excavation volume | m³ | geometry | produced | partition valid | one earthwork owner | Galian Bendung | planned |
| weir | `weir.backfill` | weir work | excavation/occupied | layers | backfill volume | m³ | excavation | derived | bounds | one backfill owner | Urugan Bendung | planned |
| weir | `weir.concrete` | component | solid geometry | openings | concrete volume | m³ | body/apron/spillway | consumed | no hydraulic design | component owns output | Beton Bendung | planned |
| weir | `weir.formwork` | component | included faces | exclusions | formwork area | m² | concrete | consumed | face flags | no all-face default | Bekisting Bendung | planned |
| embung | `embung.reservoir` | reservoir | basin boundary/sections | station grid | area/excavation volume | m², m³ | basin geometry | produced | closed sections | one basin owner | Geometri Embung | planned |
| embung | `embung.embankment` | embankment | station cross-sections | zones | fill volume/length | m³, m | reservoir | produced | section order | one fill owner | Tanggul Embung | planned |
| embung | `embung.excavation` | basin | sections/grid | station | cut volume | m³ | reservoir | produced | method explicit | one excavation owner | Galian Embung | planned |
| embung | `embung.fill` | embankment | sections | layer | fill volume | m³ | embankment | derived | no compaction inference | one fill owner | Timbunan Embung | planned |
| embung | `embung.core` | embankment zone | zone sections | material | zone volume/area | m³, m² | embankment | produced | zone boundaries | no duplicate embankment total | Core | planned |
| embung | `embung.filter` | filter zone | zone sections/thickness | material | area/volume | m², m³ | embankment | produced | layer boundaries | one filter owner | Filter | planned |
| embung | `embung.drainage_layer` | drainage zone | layer geometry | material | area/volume | m², m³ | embankment | produced | thickness/source | no filter duplicate | Drainage Layer | planned |
| embung | `embung.spillway` | spillway | geometry | lining | length/area/volume | m, m², m³ | reservoir | produced | geometry | one spillway owner | Spillway Embung | planned |
| embung | `embung.outlet` | outlet | route/structure geometry | valve/pipe | pipe/structure quantity | m, bh, m³ | reservoir | produced | geometry | one outlet owner | Outlet Embung | planned |
| embung | `embung.intake` | intake | structure geometry/count | screen/gate | count/concrete/formwork | bh, m³, m² | reservoir | produced | dimensions | one intake owner | Intake Embung | planned |
| embung | `embung.protection` | riprap/lining | protected face/thickness | geotextile | area/volume/weight if sourced | m², m³, kg | reservoir | produced | material source | one protection layer | Proteksi Embung | planned |
| dam | `dam.body` | dam | sections/zones/stations | lifts/blocks | zone volume/area/length | m³, m², m | dam geometry | produced | section sequence | one dam body owner | Tubuh Bendungan | planned |
| dam | `dam.embankment` | embankment | sections/stations | material zones | fill volume | m³ | dam body | produced | zone ownership | core/filter consume zones | Timbunan Bendungan | planned |
| dam | `dam.excavation` | dam foundation | sections/grid | station | excavation volume | m³ | dam geometry | produced | method explicit | one excavation owner | Galian Bendungan | planned |
| dam | `dam.fill` | fill zone | cross-sections | layers | volume | m³ | embankment | derived | bounds | one fill owner | Timbunan | planned |
| dam | `dam.core` | core | zone sections | material | area/volume | m², m³ | embankment | produced | zone boundary | no embankment duplicate | Core Bendungan | planned |
| dam | `dam.filter` | filter | zone sections | material | area/volume | m², m³ | embankment | produced | layer source | no drainage duplicate | Filter Bendungan | planned |
| dam | `dam.drainage` | drainage zone | route/layer geometry | material | length/area/volume | m, m², m³ | dam body | produced | geometry | one drainage owner | Drainage Bendungan | planned |
| dam | `dam.rockfill` | rockfill zone | sections/volume | density | volume/weight if sourced | m³, kg | dam body | produced | material source | zone ownership | Rockfill | planned |
| dam | `dam.spillway` | spillway | geometry | lining/joint | concrete/lining/formwork | m³, m² | dam body | produced | geometry | one spillway owner | Spillway Bendungan | planned |
| dam | `dam.outlet` | outlet | pipe/structure geometry | valve | length/count/volume | m, bh, m³ | dam body | produced | dimensions | one outlet owner | Outlet Bendungan | planned |
| dam | `dam.intake` | intake | structure geometry | gate/screen | count/concrete/formwork | bh, m³, m² | dam body | produced | dimensions | one intake owner | Intake Bendungan | planned |
| dam | `dam.protection` | protection work | face/section/thickness | material | area/volume/weight if sourced | m², m³, kg | dam body | produced | source required | one protection layer | Proteksi Bendungan | planned |
| water | `water.intake` | intake | structure geometry | screen/gate | excavation/concrete/formwork/count | m³, m², bh | pipe/reservoir | produced | dimensions | one intake owner | Intake Bangunan Air | planned |
| water | `water.outlet` | outlet | pipe/structure route | valve/headwall | length/count/volume | m, bh, m³ | reservoir/pipe | produced | route valid | one outlet owner | Outlet Bangunan Air | planned |
| water | `water.chamber` | chamber | internal/external geometry, depth | cover/ladder | excavation/concrete/formwork | m³, m² | route | produced | dimensions | one chamber owner | Chamber | planned |
| water | `water.manhole` | manhole | count/geometry/depth | cover | count/excavation/structure | bh, m³ | pipe route | produced | depth/product | no duplicate drainage manhole | Manhole Bangunan Air | planned |
| water | `water.reservoir` | reservoir | plan/section geometry | lining/cover | area/volume/lining | m², m³ | water geometry | produced | closed geometry | one reservoir owner | Reservoir | planned |
| water | `water.tank` | tank | tank geometry | waterproofing/cover | shell volume/area/formwork | m³, m² | water geometry | produced | dimensions | no duplicate concrete shell | Tangki Air | planned |
| water | `water.pipe` | pipe | route length, diameter/product | joints/fittings | length/count/area | m, bh, m² | route/product | produced | product/route | one route owner | Pipa Bangunan Air | planned |
| water | `water.box_structure` | box structure | external/opening dimensions | cover/lining | concrete/formwork/volume | m³, m² | water geometry | produced | opening/solid | one structure owner | Struktur Box | planned |
| water | `water.concrete` | component | approved solid geometry | openings | concrete volume | m³ | component | consumed | geometry | no generic duplicate | Beton Bangunan Air | planned |
| water | `water.excavation` | trench/chamber | sections/route | station | excavation volume | m³ | pipe/chamber | produced | partition valid | one earthwork owner | Galian Bangunan Air | planned |
| water | `water.backfill` | trench/chamber | excavation/occupied | layers | backfill volume | m³ | excavation | derived | bounds | one backfill owner | Urugan Kembali Bangunan Air | planned |
| water | `water.lining` | reservoir/channel | face/thickness | material | area/volume | m², m³ | geometry | produced | thickness/source | one lining owner | Lining Bangunan Air | planned |
| water | `water.cover` | chamber/tank | plan dimensions/thickness or product | openings/grating | area/count/volume | m², bh, m³ | structure | produced | product/detail | cover separate from body | Cover/Slab Bangunan Air | planned |

## 3. Domain acceptance criteria

### Drainage

All priority channel, U-Ditch, box, pipe, ditch, inlet/outlet, manhole, headwall, excavation, bedding, backfill, concrete, lining, and cover definitions are registered and callable. Tests cover rectangular/trapezoidal sections, product dimensions, route ownership, excavation-minus-occupied backfill, unit validation, QTO, UI, isolation, and duplicate references. No debit/Manning/capacity/diameter sizing is executed.

### Bridge

Geometry, deck, girder, abutment, pier, foundation, approach slab, barrier/parapet, bearing, expansion joint, excavation, backfill, concrete, formwork, and approved-input reinforcement are callable. Tests cover parent/child ownership, deck/slab separation, member geometry, missing approved rebar, QTO, UI, isolation, and duplicates. No member sizing or structural capacity is executed.

### Irrigation

Canal, excavation, lining, embankment, gate, intake, outlet, box/channel structure, concrete, formwork, and backfill are registered/callable. Tests cover lined/unlined variants, station sections, zone ownership, QTO/UI/isolation/duplicates. No discharge, hydraulic capacity, slope design, or freeboard design is executed.

### River / Flood Protection

River segment, riprap, gabion, revetment, protection concrete, sheet pile with approved dimensions, toe protection, excavation, and backfill are callable. Tests distinguish area/volume/length/count/weight and require source density/profile for weight. No erosion/stability design is executed.

### Weir

Body, spillway, apron, stilling basin, wing wall, gate, excavation, backfill, concrete, and formwork are callable. Tests cover component ownership, geometry/voids, gate schedule, QTO/UI/isolation/duplicates. No hydraulic performance is calculated.

### Embung

Reservoir geometry, embankment, excavation, fill, core, filter, drainage layer, spillway, outlet, intake, and protection are callable. Tests cover station sections, material-zone ownership, basin/embankment partitions, QTO/UI/isolation/duplicates. No storage performance or hydraulic design is calculated.

### Dam

Dam body, embankment, excavation, fill, core, filter, drainage, approved rockfill, spillway, outlet, intake, and protection are callable. Tests cover zones/stations, body versus zone summaries, source-backed weight, QTO/UI/isolation/duplicates. No structural/hydraulic design or compaction assumption is executed.

### Water Structure

Intake, outlet, chamber, manhole, reservoir, tank, pipe, box structure, concrete, excavation, backfill, lining, and cover/slab are callable. Tests cover route ownership, chamber/pipe relationships, occupied-volume backfill, product data, QTO/UI/isolation/duplicates. No process, pressure, flow, or hydraulic sizing is executed.

## 4. Implementation order

1. **Drainage:** validates channel/route/earthwork/lining patterns reused elsewhere.
2. **Bridge:** exercises assembly, member, concrete, formwork, approved reinforcement, and parent-child ownership.
3. **Irrigation:** reuses channel and structure variants with embankment/layer handling.
4. **River:** reuses protection/layer/material/earthwork patterns.
5. **Weir:** reuses structure/channel/concrete/formwork patterns.
6. **Embung:** reuses station earthwork, zones, layers, and water outlets.
7. **Dam:** reuses embung zones with block/station granularity and stricter source gates.
8. **Water Structure:** reuses pipe/chamber/tank/structure patterns.

After the minimum sequence, implement Coastal then Retaining using the same registry and generic engines. Do not create separate arithmetic cores for any domain.

## 5. Source and engineering boundary

Required source categories include DED geometry, approved schedules, product data, material density/unit weight, section/detail drawings, and revision metadata. Waste, overlap, lap, stock length, compaction, swell, shrinkage, density, and procurement conversion are explicit inputs or source-backed parameters only. Without source: `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`.

The calculators produce physical quantity only: length, area, volume, count, and sourced weight. AHSP, pricing, productivity, hydraulic performance, structural sizing/capacity, pavement design, and engineering approval remain outside these definitions.

## 6. Delivery checklist for Antigravity

For each domain, deliver registry definitions first, then selector/UI catalog entries, then deterministic execution adapters, then QTO proposal integration. Preserve existing Calculator Core, UnitEngine, PrecisionEngine, ValidationEngine, DependencyEngine, ProvenanceEngine, ExecutionTrace, QTO/RAB adapters, AHSP/Pricing layers, project isolation, and ownership guard. Add no parallel architecture and no new calculator formula where a generic variant already exists.

**STOP:** this document is specification only. No code, calculator, AHSP, pricing, UI rewrite, hydraulic design, or structural design is included.