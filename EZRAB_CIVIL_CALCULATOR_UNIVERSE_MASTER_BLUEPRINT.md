# EZRAB Civil Calculator Universe — Master Blueprint

**Status:** Blueprint / specification only. No calculator implementation is authorized by this document.  
**Scope:** deterministic physical quantity takeoff for building and civil infrastructure.  
**Explicitly excluded:** AHSP, prices, productivity, wages, equipment cost, structural design, hydraulic design, pavement design, and automatic engineering decisions.

## 1. Executive Summary

EZRAB should expand from the existing `residential.*` and legacy workbook calculators into a namespaced civil quantity universe without multiplying formula engines. The recommended architecture is:

```text
DED / structured input
  -> evidence-backed entity model
  -> geometry and quantity engines
  -> versioned calculator variant
  -> ownership/dependency validation
  -> QTO quantity lines
  -> AHSP resolver
  -> pricing resolver
  -> cost composition
  -> RAB
```

The authoritative producer rule is mandatory: each physical quantity has one producer, while other calculators consume a referenced output. `road.surface_area`, `bridge.deck_slab`, and `drainage.channel` must not independently recreate the same geometry.

The universe is broad, but the implementation unit is small: geometry primitives, stations/cross-sections, layers, routes, members, openings, materials, reinforcement, formwork, earthwork, and aggregation. Domain packs provide definitions and variants over those engines.

Any standard, product property, waste, overlap, lap, stock length, compaction, swell, shrinkage, or design parameter without a recorded source is:

`NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`

## 2. Current EZRAB Calculator Architecture

Existing layers are retained:

1. Generic deterministic calculation core
2. Unit engine
3. Precision engine
4. Validation engine
5. Dependency DAG
6. Provenance engine
7. Execution trace
8. Calculator registry
9. QTO adapter
10. RAB adapter
11. AHSP resolver
12. Pricing resolver
13. Cost composition engine

The physical quantity core must stop at quantity/provenance/validation. AHSP and price may consume QTO output but must never be called from a geometry calculator. Legacy workbook-backed calculators remain compatibility definitions under `legacy.*` or an explicit legacy alias and must retain their source/version snapshots.

### Responsibility boundary

| Layer | Responsibility | Must not do |
|---|---|---|
| Entity/evidence | represent what the DED says and where it came from | invent dimensions |
| Geometry | deterministic shapes, stations, routes, sections | choose design |
| Quantity | physical length/area/volume/count/weight | price/AHSP/productivity |
| QTO | persist quantity lines and lineage | silently price |
| AHSP | map approved work/resource composition | calculate geometry |
| Pricing | resolve contextual prices | alter quantity |
| RAB | cost composition and totals | infer missing design |
| AI/orchestrator | interpret, extract, map, suggest, explain | calculate authoritative numbers |

## 3. Generic Civil Engines

Every engine returns a trace containing normalized inputs, raw result, unit, formula ID/version, source references, dependencies, warnings, and ownership key.

| Engine | Purpose / inputs | Outputs and formula | Applicable types | Dependency / duplication risk | Source requirement and NOT VERIFIED condition |
|---|---|---|---|---|---|
| Rectangle geometry | length, width | area = L×W; perimeter = 2(L+W) | building, road, slab, channel | reusing footprint as sloped/finished area | mathematical geometry; non-rectangular assumption is NOT VERIFIED |
| Triangle geometry | base, height or 3 points | area = ½bh | earthwork, sections, roof | triangle and trapezoid decomposition overlap | geometry source/points required |
| Trapezoid geometry | top/bottom width, height | area = (a+b)h/2 | channels, embankments, walls, sections | section ownership must be unique | section dimensions from DED; otherwise NOT VERIFIED |
| Circle geometry | radius/diameter | area = πr²; circumference = 2πr | pipes, tanks, piles | nominal vs internal diameter confusion | product/drawing diameter required |
| Polygon geometry | ordered vertices | area by shoelace; perimeter by segment sum | alignments, irregular sites, basins | self-intersection or duplicate vertices | surveyed/D​ED coordinates required |
| Prism geometry | base area, length | volume = base area×length | channels, walls, road layers | same segment counted as layer and assembly | cross-section source required |
| Cylinder geometry | radius, height/length | volume = πr²h; lateral area = 2πrh | piles, pipes, tanks | internal/external surface ambiguity | geometry and material boundary required |
| Segment geometry | start/end points or station interval | length = distance; aggregate segment lengths | routes, alignment, edges | shared route ownership | DED coordinates/chainage required |
| Sloped plane | horizontal run, rise/slope, length | slope length = √(run²+rise²); area = length×width | roofs, ramps, pavement | horizontal area mistaken for surface area | slope must be explicit/approved |
| Surface area | face/mesh/section list | Σ face areas less declared voids | concrete, lining, coating | double-counting faces | face ownership required |
| Volume | area/thickness or solids | Σ component volumes | all packs | composite intersection counted twice | decomposition/source required |
| Length | ordered path/edge list | Σ segment lengths | routes, joints, kerb, pipe | same path used by two systems | route source required |
| Route | nodes, segments, offsets, system ID | route length, bends, endpoints | pipe, cable, drainage, haul | shared/branch route duplicate | layout/drawing required |
| Stationing/chainage | alignment origin, station interval, offset | station IDs and segment ranges | roads, channels, river works | mismatched coordinate systems | alignment reference required |
| Cross-section | station, ordered offsets/elevations | section area, widths, elevations | earthwork, roads, embankments | section area reused across layers | surveyed/DED section required |
| Average end area | consecutive section areas and distance | V = (A1+A2)/2×L | road/earthwork/channel | end-area and grid volume overlap | method must be selected by source/policy |
| Grid volume | grid cells, elevations | Σ cell area×mean depth | cut/fill, basins | grid and station model both active | elevation data required |
| Layer build-up | layers, area, thickness | per-layer volume = area×thickness | pavement, floor, lining, embankment | layer included in multiple assemblies | approved layer schedule required |
| Count | records/type/quantity | Σ counts by type | fixtures, signs, joints, piles | schedule and geometry count duplicate | schedule/drawing required |
| Opening deduction | parent face + openings | net = gross−Σ(w×h×count) | walls, slabs, culverts | downstream deducts opening again | opening schedule required |
| Intersection | solids/lines and ownership policy | intersection volume/length/area or excluded region | members, roads, pipes | member and generic concrete duplicate | explicit ownership policy required |
| Assembly | components and ownership | component totals with parent trace | bridge, structures, road packages | child and parent both persisted as quantity | assembly contract required |
| Repetition | prototype + count/spacing | repeated geometry/count/length | piers, frames, barriers | repeated item also individually imported | unique source IDs required |
| Material quantity | installed quantity + conversion | material quantity by sourced conversion | blocks, tiles, pipes, armor | installed vs procurement quantity mixed | product data required; otherwise NOT VERIFIED |
| Reinforcement | bar marks, cut lengths, counts, unit weights | total length and weight | all reinforced concrete | design and takeoff confused | bar schedule and unit-weight source required |
| Formwork | member faces and inclusion flags | Σ included face area | concrete structures | all concrete surface assumed formwork | method/detail required |
| Earthwork | sections/grid, cut/fill classes | cut, fill, borrow, disposal volumes | roads, dams, drainage | excavation and foundation calculator duplicate | source method, swell/shrinkage required |
| Pavement layer | alignment area/volume + layer thickness | layer area, volume, mass if density supplied | roads, yards | surface area counted as every layer without layer ID | pavement schedule required |
| Pipe/route | route + diameter/material | length, joints, fittings, trench envelope | water/wastewater/drainage | route shared by pipe and trench | layout/product data required |
| Channel section | section type/dimensions/lining faces | area, perimeter, volume, lining area | drainage/irrigation/weir | hydraulic section interpreted as design | dimensions explicit; hydraulic parameters NOT VERIFIED |
| Structural member | member geometry + element type | geometric concrete, faces, length | bridge/building/water structures | structural design inferred | approved member schedule required |
| Stock length | installed length, stock length, joint/lap rule | procurement piece count and cut plan | pipes, bars, profiles, boards | stock length treated as installed length | manufacturer/source required; otherwise NOT VERIFIED |
| Joint/lap | joint locations, overlap/lap length | joint count and added length/area | pavement, rebar, waterproofing | overlap applied twice | detail/product/standard required |
| Segment aggregation | segment quantities + grouping key | totals by station/material/phase | every pack | aggregate and parent both exported | aggregation ownership required |

## 4. Road Calculator Pack

### Road calculator definitions

| ID | Name | Inputs | Outputs/formula | Dependencies | Source / boundary / status |
|---|---|---|---|---|---|
| `road.surface.existing` | Existing Ground/Surface | surveyed points, stations, elevations | surface model; no quantity by itself | survey/DED | survey source; NOT VERIFIED without points |
| `road.alignment` | Road Alignment | ordered coordinates, radius/segments | centerline length, tangent/curve segments | geometry | alignment drawing; design alignment is not inferred |
| `road.chainage` | Chainage | alignment, origin, interval | station IDs, ranges, offsets | alignment | project chainage convention required |
| `road.cross_section` | Cross Section | station, offsets, elevations, templates | section areas/widths | alignment/surface | DED sections required |
| `road.cut` | Cut | existing/proposed sections | cut volume via selected section method | cross-section | method/source required |
| `road.fill` | Fill | existing/proposed sections | fill volume | cross-section | compaction/swell excluded unless sourced |
| `road.earthwork` | Earthwork | cut/fill sections/grid | cut, fill, net, station breakdown | cut/fill | no automatic borrow/disposal assumption |
| `road.subgrade` | Subgrade | alignment area, limits, thickness if volume | area/volume/length | layer build-up | thickness is explicit input, not design |
| `road.selected_material` | Selected Material | layer area, thickness | volume/mass if density supplied | subgrade/layer | material specification/density required |
| `road.granular_subbase` | Granular Subbase | area, thickness, material | area/volume/mass | pavement layer | layer schedule/density required |
| `road.aggregate_base` | Aggregate Base | area, thickness, material | area/volume/mass | pavement layer | source required |
| `road.cement_treated_base` | Cement Treated Base | area, thickness, mix/material | volume; component quantities only if sourced | layer | mix design/source required; no cement coefficient invented |
| `road.lean_concrete` | Lean Concrete | area, thickness | concrete volume | pavement layer | approved thickness required |
| `road.rigid_pavement` | Rigid Pavement | panel area, thickness, joints | concrete volume, panel/joint counts | lean concrete/joint | structural pavement design excluded |
| `road.asphalt_base` | Asphalt Base | area, thickness, density if mass | volume/mass | pavement layer | density/source required |
| `road.asphalt_binder` | Asphalt Binder | area, thickness, density | volume/mass | asphalt layer | mix/density source required |
| `road.asphalt_wearing_course` | Asphalt Wearing Course | area, thickness, density | volume/mass | surface layer | no asphalt content inference |
| `road.prime_coat` | Prime Coat | treated area, application rate if explicit | area; material volume if sourced | granular base | rate must be supplied/source-backed |
| `road.tack_coat` | Tack Coat | treated area, application rate if explicit | area; material volume if sourced | asphalt layer | NOT VERIFIED without rate source |
| `road.asphalt_surface` | Asphalt Surface | surface polygon/layer | surface area, volume | alignment/layer | no duplicate with wearing course |
| `road.shoulder` | Shoulder | station widths, thickness/material | area, volume, length | cross-section | material/layer source required |
| `road.median` | Median | alignment/width/sections | area, length, volume | alignment | landscaping excluded unless separate |
| `road.kerb` | Kerb | route, profile, repetition | length/count/volume | alignment | product profile required |
| `road.drainage` | Road Drainage | route/section/lining | length, excavation, lining volume | route/channel | relationship to `drainage.*` required |
| `road.side_ditch` | Side Ditch | station route, section | excavation, lining, length | cross-section | hydraulic design excluded |
| `road.marking` | Road Marking | line segments, width, type | length, painted area, count | alignment | application system source required |
| `road.delineator` | Road Delineator | route, spacing or schedule | count, route length | alignment | spacing must be input/source |
| `road.guardrail` | Guardrail | route, terminal/joint schedule | length, posts/count | alignment | product system source required |
| `road.sign_foundation` | Sign Foundation | count, geometry | excavation/concrete/rebar/formwork | sign schedule | foundation design excluded |
| `road.traffic_barrier` | Traffic Barrier | route/profile/repetition | length, concrete/steel volume, count | alignment | profile/source required |
| `road.geotextile` | Geotextile | surface/overlap/joint | installed area; procurement area if overlap sourced | layer | overlap source required |
| `road.geogrid` | Geogrid | surface/roll layout/overlap | area/roll count | layer | product layout source required |
| `road.concrete_joint` | Concrete Pavement Joint | joint lines, spacing/length | length/count; sealant area/volume if sourced | rigid pavement | joint detail required |
| `road.expansion_joint` | Expansion Joint | joint locations/profile | length/count/assembly quantity | pavement/structure | product detail required |
| `road.excavation` | Road Excavation | sections/grid | cut volume | earthwork | one ownership key with `road.cut` |
| `road.embankment` | Road Embankment | sections, fill zones | fill volume/layer volume | earthwork | compaction factors excluded |
| `road.disposal` | Disposal | excavated volume and destination | in-situ volume; haul quantity separately | excavation | swell/loose conversion NOT VERIFIED |
| `road.borrow_material` | Borrow Material | fill deficit, source zones | borrow volume | fill/disposal | source and conversion required |
| `road.material_hauling` | Material Hauling Quantity | source/destination, volume, route | volume, trip count if truck capacity supplied, distance | material/disposal | not a cost/productivity calculator |

Road pavement thickness, layer composition, CBR, asphalt content, density, compaction, swell, shrinkage, and productivity are explicit inputs or authoritative-source fields only.

## 5. Bridge Calculator Pack

Bridge definitions use shared concrete, reinforcement, formwork, structural-member, earthwork, route, and assembly engines.

| ID | Name | Primary quantity | Required evidence / boundary |
|---|---|---|---|
| `bridge.geometry` | Bridge General Geometry | span, width, stations, alignment | bridge GA/drawing; does not design span |
| `bridge.deck` | Bridge Deck | plan area, edge lengths | deck ownership must be distinct from slab |
| `bridge.deck_slab` | Deck Slab | concrete volume, formwork area, reinforcement reference | slab geometry/schedule; no thickness design |
| `bridge.girder` | Girder | length/count/volume or profile length | member schedule |
| `bridge.prestressed_girder` | Prestressed Girder | count, length, concrete/steel quantities | approved girder schedule; prestress design excluded |
| `bridge.steel_girder` | Steel Girder | length, mass if sourced, plate/profile areas | profile/weight table source required |
| `bridge.diaphragm` | Diaphragm | count, concrete/rebar/formwork | component schedule |
| `bridge.cross_beam` | Cross Beam | concrete/rebar/formwork | component schedule |
| `bridge.abutment` | Abutment | concrete, rebar, formwork, excavation | geometry and component ownership |
| `bridge.pier` | Pier | shaft/column volume and faces | approved member geometry |
| `bridge.pier_cap` | Pier Cap | concrete/rebar/formwork | schedule |
| `bridge.pile_cap` | Pile Cap | concrete/rebar/formwork/excavation | geometry; pile arrangement is input |
| `bridge.foundation` | Foundation | excavation/concrete/rebar/formwork | foundation schedule; no sizing |
| `bridge.bored_pile` | Bored Pile | count, length, cylindrical volume, reinforcement reference | diameter/depth schedule; capacity excluded |
| `bridge.driven_pile` | Driven Pile | count, installed length, profile/weight if sourced | pile schedule; driving design/productivity excluded |
| `bridge.footing` | Footing | volume/area/formwork/rebar reference | approved footing geometry |
| `bridge.wing_wall` | Wing Wall | wall concrete/masonry, faces, excavation/backfill | geometry |
| `bridge.retaining_wall` | Retaining Wall | concrete/rebar/formwork/backfill/drainage | use `retaining.*` ownership where applicable |
| `bridge.backwall` | Backwall | concrete/rebar/formwork | geometry |
| `bridge.approach_slab` | Approach Slab | area/volume/joints | drawing; interface ownership |
| `bridge.bearing` | Bearing | count/set | bearing schedule/product data |
| `bridge.expansion_joint` | Expansion Joint | length/count/assembly | product detail |
| `bridge.parapet` | Parapet | length/volume/area/count | profile/detail |
| `bridge.railing` | Railing | length/count | product/detail |
| `bridge.drainage` | Bridge Drainage | pipe/scupper route/count | drainage layout; no hydraulic design |
| `bridge.scupper` | Scupper | count, pipe length, opening count | product/detail |
| `bridge.sidewalk` | Bridge Sidewalk | area/volume/kerb length | deck layout |
| `bridge.asphalt_overlay` | Asphalt Overlay | area/volume/mass if density sourced | overlay schedule |
| `bridge.waterproofing` | Waterproofing | treated area, joint length | product application data |
| `bridge.reinforcement` | Reinforcement | bar length/weight | bar schedule/unit-weight source |
| `bridge.formwork` | Formwork | included face area | formwork detail |
| `bridge.concrete` | Concrete | geometric volume | component ownership prevents duplicate generic concrete |
| `bridge.excavation` | Excavation | volume | foundation/abutment ownership |
| `bridge.backfill` | Backfill | volume | excavation minus declared occupied volumes |
| `bridge.protection` | Protection Works | area/volume/length/count | river/erosion detail |

## 6. Drainage Calculator Pack

All channel calculators produce geometry only. Hydraulic capacity, Manning coefficient, design discharge, slope, diameter, and freeboard are never inferred.

| ID | Name | Quantity/formula | Dependencies / boundary |
|---|---|---|---|
| `drainage.open_channel` | Open Channel | route, section area, lining area, excavation volume | section input; no flow design |
| `drainage.rectangular_channel` | Rectangular Channel | A=b×h; V=A×L; lining faces | open-channel parent ownership |
| `drainage.trapezoidal_channel` | Trapezoidal Channel | A=(top+bottom)h/2; V=A×L | side slopes explicit |
| `drainage.u_ditch` | U-Ditch | count/length, bedding, joint, excavation/backfill | product dimensions/source |
| `drainage.box_culvert` | Box Culvert | box concrete/rebar/formwork, excavation/backfill | opening and external geometry explicit |
| `drainage.pipe_culvert` | Pipe Culvert | pipe length/count, bedding, trench/backfill | product route and diameter input |
| `drainage.circular_pipe` | Circular Pipe | length, internal/external surface/volume as selected | no hydraulic sizing |
| `drainage.manhole` | Manhole | count, excavation, concrete/masonry, cover | detail/product source |
| `drainage.catch_basin` | Catch Basin | count, excavation, concrete, grating | layout/detail |
| `drainage.inlet` | Inlet | count/length/volume | detail |
| `drainage.outlet` | Outlet | count/length/volume | detail |
| `drainage.headwall` | Headwall | concrete/masonry/rebar/formwork | detail |
| `drainage.wingwall` | Wingwall | wall volume/area/length | detail; retaining ownership where applicable |
| `drainage.cover` | Drainage Cover | area/count/volume | product/detail |
| `drainage.grating` | Grating | area/count/weight if sourced | product weight source |
| `drainage.concrete_drain` | Concrete Drain | concrete volume/lining/formwork | section ownership |
| `drainage.masonry_drain` | Masonry Drain | masonry area/volume | material detail |
| `drainage.lining` | Lining | lining area/volume | channel geometry |
| `drainage.bedding` | Bedding | length×width×thickness | pipe/channel detail |
| `drainage.backfill` | Backfill | trench excavation minus occupied volume | one earthwork owner |
| `drainage.excavation` | Excavation | section area×length or station method | one owner with road/foundation |
| `drainage.disposal` | Disposal | declared excavated volume | swell/haul conversion requires source |

## 7. Irrigation Calculator Pack

The same channel, section, lining, route, concrete, reinforcement, formwork, excavation, backfill, and assembly engines are reused.

| ID family | Variants/capabilities | Quantity output | Boundary |
|---|---|---|---|
| `irrigation.channel` | primary, secondary, tertiary | length, section area, excavation, lining, concrete/masonry | hydraulic classification is input, not inferred |
| `irrigation.lined_channel` | concrete/masonry lining | lining area/volume, channel volume | lining thickness source required |
| `irrigation.unlined_channel` | earth section | excavation/embankment/backfill | slope/capacity excluded |
| `irrigation.box_channel` | rectangular box | concrete/rebar/formwork/volume | geometry input |
| `irrigation.u_ditch` | U-ditch | units/length/joints/bedding | product data |
| `irrigation.culvert` | pipe/box crossing | pipe/box, excavation/backfill | drainage alias relationship |
| `irrigation.drop_structure` | drop structure | concrete/masonry/rebar/formwork/excavation | hydraulic drop design excluded |
| `irrigation.check_structure` | check structure | concrete/masonry/gate-related count | geometry/detail |
| `irrigation.division_box` | division box | concrete/rebar/formwork/openings | hydraulic division excluded |
| `irrigation.intake` | intake | excavation/concrete/rebar/formwork/gate count | detail |
| `irrigation.outlet` | outlet | structure and route quantities | detail |
| `irrigation.flume` | flume | lining/structure length/volume | hydraulic section not inferred |
| `irrigation.aqueduct` | aqueduct | piers, deck/channel, concrete/rebar/formwork | structural design excluded |
| `irrigation.siphon` | siphon | pipe length, chambers, bedding/backfill | hydraulic sizing excluded |
| `irrigation.crossing` | crossing | route and structure quantities | detail |
| `irrigation.gate_structure` | gate structure | count, concrete, rebar, formwork | gate product/design source |
| `irrigation.concrete_lining` | lining | area×thickness | source thickness |
| `irrigation.masonry_lining` | lining | area/volume | material detail |
| `irrigation.excavation` | excavation | section/station quantity | earthwork ownership |
| `irrigation.embankment` | embankment | cross-section/station quantity | compaction excluded |
| `irrigation.backfill` | backfill | void-adjusted volume | occupied-volume evidence |
| `irrigation.concrete` | generic concrete | geometry volume | shared concrete owner |
| `irrigation.reinforcement` | generic reinforcement | bar length/weight | bar schedule/source |
| `irrigation.formwork` | generic formwork | face area | formwork detail |

## 8. River Protection Pack

| ID | Quantity focus | Required inputs | Boundary/source |
|---|---|---|---|
| `river.bank_protection` | length/area/volume | bank alignment, section, treatment | erosion design excluded |
| `river.riprap` | volume/area/weight | protected face, thickness/density if weight | stone density/grading source |
| `river.stone_pitching` | area/volume | face area, thickness | detail/material source |
| `river.gabion` | count/volume/mesh area | units/dimensions | product data |
| `river.concrete_block` | count/area/volume | block module, protected surface | product data |
| `river.sheet_pile` | length/count/area/weight | profile, wall line, embedment input | profile weight/source; stability excluded |
| `river.retaining_wall` | concrete/masonry/rebar/formwork/backfill | wall geometry | use retaining ownership |
| `river.revetment` | area/volume/layers | bank face, layers | layer/source required |
| `river.river_wall` | length/volume/area | wall geometry | structural design excluded |
| `river.toe_protection` | length/area/volume | toe geometry | detail |
| `river.apron` | area/volume | plan/thickness | detail |
| `river.floodwall` | length/volume/area | wall geometry | flood design excluded |
| `river.levee` | cross-section/volume/length | station sections | compaction/design excluded |
| `river.embankment` | volume | sections/material | shared earthwork |
| `river.excavation` | volume | sections/grid | shared earthwork ownership |
| `river.backfill` | volume | voids/sections | source |
| `river.filter_layer` | area/volume | layer face/thickness | gradation/source |
| `river.geotextile` | area/rolls | face/overlap | product overlap source |
| `river.drainage_layer` | area/volume | layer geometry | material/source |

Outputs explicitly distinguish `area`, `volume`, `length`, `count`, and `weight`. Weight is only available when density/unit weight is sourced or supplied.

## 9. Weir / Bendung Pack

| ID | Main output | Required input | Boundary |
|---|---|---|---|
| `weir.geometry` | plan/section dimensions | DED geometry | no hydraulic crest design |
| `weir.body` | concrete/masonry volume | section×length | geometry |
| `weir.spillway` | area/volume/length | spillway geometry | hydraulic profile excluded |
| `weir.crest` | length/area/volume | crest geometry | design excluded |
| `weir.apron` | area/volume | plan/thickness | detail |
| `weir.stilling_basin` | volume/formwork/rebar reference | basin geometry | energy dissipation design excluded |
| `weir.energy_dissipation` | structure quantities | approved geometry | hydraulic design excluded |
| `weir.intake` | concrete/rebar/formwork/openings | detail | flow design excluded |
| `weir.divide_structure` | structure quantities | geometry | division design excluded |
| `weir.gate` | count/area/weight if sourced | gate schedule | product/design source |
| `weir.gate_slot` | length/area/volume | slot geometry | detail |
| `weir.pier` | concrete/rebar/formwork | member geometry | structural design excluded |
| `weir.abutment` | concrete/masonry/rebar/formwork | geometry | stability excluded |
| `weir.wing_wall` | wall quantities | geometry | retaining ownership |
| `weir.cutoff_wall` | volume/area/formwork | geometry | seepage design excluded |
| `weir.floor` | area/volume | plan/thickness | detail |
| `weir.concrete` | volume | component geometry | shared owner |
| `weir.reinforcement` | length/weight | bar schedule | source required |
| `weir.formwork` | face area | face schedule | source required |
| `weir.excavation` | volume | sections | earthwork owner |
| `weir.backfill` | volume | voids | source |
| `weir.stone_work` | area/volume/weight | geometry/material | density/source required |
| `weir.protection` | area/volume/length | treatment geometry | detail |

## 10. Embung Pack

`embung.*` uses basin, station, cross-section, earthwork, layer, route, concrete, reinforcement, formwork, lining, and protection engines.

| Capability | Outputs | Required source/boundary |
|---|---|---|
| Basin Excavation | cut volume, area, station totals | basin sections; storage/hydraulic design excluded |
| Embankment | fill volume, length, section area | approved sections; compaction excluded |
| Core | length/area/volume | material and section source |
| Filter | area/volume | gradation/layer source |
| Drainage Layer | area/volume/length | detail |
| Riprap | area/volume/weight if density | material source |
| Lining | area/volume | lining detail |
| Geomembrane | area/overlap/roll count | product overlap source |
| Spillway | length/area/volume | geometry; hydraulic capacity excluded |
| Outlet | pipe/structure quantities | detail |
| Intake | structure quantities | detail |
| Pipe | route length/count | pipe schedule |
| Valve | count/set | product schedule |
| Concrete | volume | shared concrete producer |
| Reinforcement | length/weight | bar schedule |
| Formwork | face area | formwork detail |
| Excavation | volume | basin/section owner |
| Backfill | volume | occupied voids |
| Access Road | road layer quantities | relationship to `road.*` |

## 11. Dam / Bendungan Pack

`dam.*` supports large-project granularity by station, material zone, lift/block, gallery, joint, and source drawing reference.

| Capability | Outputs | Boundary |
|---|---|---|
| Dam Body | zone volume/area/length | geometry only |
| Embankment | section/station volume | compaction/design excluded |
| Core | zone volume | material/gradation source |
| Filter | zone volume/area | source |
| Drainage | route/area/volume | hydraulic design excluded |
| Rockfill | volume/weight if density | source |
| Concrete Dam | block volume, joints, faces | structural/hydraulic design excluded |
| Spillway | concrete/formwork/rebar/lining | hydraulic profile excluded |
| Intake | structure/openings | flow design excluded |
| Outlet | pipe/structure quantities | flow design excluded |
| Energy Dissipation | geometry quantities | hydraulic design excluded |
| Gallery | excavation/concrete/formwork/route | structural/detail source |
| Foundation Excavation | volume | geology/stability excluded |
| Grouting Quantity | hole count/length/volume if injected volume supplied | grout design/consumption NOT VERIFIED |
| Drainage Hole | count/length/diameter | diameter/layout source |
| Concrete | block/component volume | shared owner |
| Reinforcement | bar length/weight | source |
| Formwork | face area | source |
| Joint | length/area/count | joint detail |
| Waterstop | length | product/detail |
| Rock Protection | area/volume/weight | material source |
| Access Road | road layer quantity | `road.*` ownership |

## 12. Water Structure Pack

Namespace `water.*` covers civil quantity, not process design:

| Calculator | Main quantity | Boundary |
|---|---|---|
| `water.intake` | excavation/concrete/rebar/formwork/pipe | hydraulic intake design excluded |
| `water.treatment_civil_works` | basin/tank/building quantities | treatment process design excluded |
| `water.reservoir` | excavation/lining/embankment/concrete | storage/hydraulic design excluded |
| `water.tank` | shell volume/formwork/rebar/waterproofing area | capacity/design excluded |
| `water.ground_reservoir` | excavation/structure/lining | capacity excluded |
| `water.elevated_tank` | tank/support quantities | structural design excluded |
| `water.pump_house` | building/foundation/slab/roof quantities | pump selection excluded |
| `water.valve_chamber` | excavation/concrete/rebar/formwork/cover | hydraulic design excluded |
| `water.meter_chamber` | chamber quantities | equipment selection excluded |
| `water.break_pressure_tank` | chamber/tank/pipe quantities | hydraulic design excluded |
| `water.air_valve_chamber` | chamber/count/pipe | air-valve design excluded |
| `water.washout_chamber` | chamber/pipe/count | discharge design excluded |
| `water.pipeline_trench` | excavation/bedding/backfill/route | pipe sizing excluded |
| `water.thrust_block` | concrete volume/formwork | thrust design excluded |
| `water.anchor_block` | concrete volume/formwork | anchor design excluded |
| `water.pipe_bedding` | volume/area | material/thickness source |
| `water.pipe_backfill` | volume | trench/occupied volume |
| `water.manhole` | count/excavation/chamber quantities | detail |

## 13. Coastal / Marine Pack

| Calculator | Outputs | Boundary/source |
|---|---|---|
| `coastal.seawall` | length/area/volume | geometry; wave/stability design excluded |
| `coastal.revetment` | face area/layer volume | detail/source |
| `coastal.breakwater` | core/filter/armor volume/weight | armor grading/density source |
| `coastal.groin` | length/volume/weight | geometry; coastal design excluded |
| `coastal.beach_protection` | area/volume/weight | material/source |
| `coastal.toe_protection` | length/area/volume | detail |
| `coastal.concrete_block` | count/area/volume | product data |
| `coastal.armor_stone` | volume/weight | density/grading source |
| `coastal.filter_layer` | area/volume | layer source |
| `coastal.geotextile` | installed/procurement area | overlap source |
| `coastal.pile` | count/length/volume/weight | pile schedule; capacity excluded |
| `coastal.concrete` | geometric volume | shared producer |
| `coastal.reinforcement` | length/weight | bar schedule |
| `coastal.formwork` | face area | detail |
| `coastal.excavation` | volume | earthwork ownership |
| `coastal.backfill` | volume | source |

## 14. Retaining Structure Pack

Variants share `retaining.wall_geometry`, concrete, reinforcement, formwork, masonry, earthwork, drainage, filter, and geotextile engines.

| Variant | Quantity outputs | Boundary |
|---|---|---|
| `retaining.gravity_wall` | masonry/concrete volume, faces, excavation/backfill | no stability/overturning design |
| `retaining.cantilever_wall` | stem/base concrete/rebar/formwork, excavation/backfill | no structural sizing |
| `retaining.counterfort_wall` | wall/counterfort quantities | spacing/design excluded |
| `retaining.gabion_wall` | basket count/volume/mesh/stone weight | product/stones source |
| `retaining.stone_wall` | masonry area/volume | material detail |
| `retaining.concrete_wall` | concrete/rebar/formwork | geometry only |
| `retaining.block_wall` | block count/mortar area/volume | product/mortar source |
| `retaining.sheet_pile_wall` | wall length/count/profile weight | profile source; stability/driving excluded |

Common outputs: excavation, concrete, reinforcement, formwork, masonry, backfill, drainage, filter, geotextile, length, area, volume, and count.

## 15. DED Entity Model

```text
CivilEntity {
  entityId: stable ID
  projectId: authoritative project ID
  parentEntityId: optional assembly parent
  type: namespaced entity type
  geometry: primitive/route/section/solid reference
  dimensions: typed values with units
  material: optional material specification reference
  drawingReference: drawing/document ID
  pageReference: page/detail/grid/chainage reference
  source: source type, file, revision, hash, location
  confidence: extraction confidence, not engineering approval
  dependencies: entity/output references
}
```

Supported entity types include `Road`, `Bridge`, `Drainage`, `Channel`, `Culvert`, `Foundation`, `Pile`, `Girder`, `Deck`, `Abutment`, `Pier`, `Weir`, `Spillway`, `Dam`, `Embankment`, `Reservoir`, `Pipe`, `Manhole`, `RetainingWall`, and `ProtectionWork`.

`confidence` describes extraction uncertainty. It must not be interpreted as design approval. Every entity also needs a `status` such as `extracted`, `mapped`, `validated`, or `blocked`, using the project status vocabulary where applicable.

## 16. Registry Architecture

Namespaces:

```text
legacy.*
residential.*
civil.*
road.*
bridge.*
drainage.*
irrigation.*
river.*
weir.*
embung.*
dam.*
water.*
coastal.*
retaining.*
```

`civil.*` contains shared generic definitions only. Domain namespaces contain variants and composition definitions; they do not fork core arithmetic.

### Required metadata

```text
id
name
category
description
version
inputs
outputs
units
formula
dependencies
source
sourceVersion
provenance
warnings
validation
engineeringBoundary
```

Registration must reject duplicate IDs, cycles, missing unit declarations, missing source for claimed source-backed formulas, invalid dependency references, and incompatible output ownership. A legacy alias must resolve to an immutable version.

## 17. DED → Calculator Selection

```text
DED evidence
  -> document/page/detail extraction
  -> entity detection
  -> entity type normalization
  -> geometry extraction
  -> source/ownership validation
  -> calculator selection
  -> typed parameter mapping
  -> deterministic calculation
  -> result validation
  -> QTO persistence
```

AI/orchestrator may interpret text, extract dimensions, map aliases, suggest a calculator, request clarification, and explain a result. It may not fill a missing dimension from a guessed default, choose structural/hydraulic design values, or alter a deterministic result.

Selection algorithm requirements:

1. Resolve authoritative project/workspace context.
2. Match entity type and pack namespace.
3. Match geometry compatibility and required inputs.
4. Match source/drawing revision.
5. Reject ambiguous variants and ask for clarification.
6. Execute only after validation.
7. Store extraction evidence and parameter mapping in the execution trace.

## 18. Anti-Duplication Architecture

### Ownership keys

Every output receives an ownership key such as:

```text
project/entity/revision/quantity-kind/segment/material-layer
```

The QTO adapter rejects two authoritative producers for the same key unless an explicit assembly policy declares one as derived/consumed.

### Required rules

* Road surface is produced by one road geometry/layer definition; wearing course, marking, and coat calculators consume the declared surface without recreating it.
* Bridge deck geometry owns deck area. Deck slab is its declared concrete component; generic slab cannot also own it.
* Road drainage and `drainage.*` use a shared entity ID and one producer; the other is an alias/consumer.
* Concrete is owned by the structural/component definition; generic concrete is an engine, not a second QTO line.
* Excavation is owned by the earthwork package selected for the entity; foundation, drainage, and road calculators must reference or partition it.
* Pipe route owns centerline length. Trench, bedding, and backfill consume the route and envelope.
* Gross/net/opening deductions have explicit policy and cannot be repeated downstream.
* Parent assemblies do not add child quantity again unless the assembly output is a deliberate summary, not an additional QTO line.

Duplicate checks include repeated invocation, imported-versus-extracted duplicate entities, shared boundaries, intersections, overlapping stations, and same source revision mapped to multiple calculators.

## 19. Versioning

Persist all four versions:

* `calculatorVersion`: behavior/schema identity;
* `formulaVersion`: mathematical definition;
* `sourceVersion`: workbook, drawing, product, or reference revision;
* `standardVersion`: applicable standard/edition, if any.

An estimate stores immutable calculation snapshots. Updating a calculator must create a new version and migration/comparison record; it must never silently recalculate historical projects. Source hash and drawing revision are part of provenance.

## 20. Provenance

Every quantity line traces:

```text
QTO line
 -> calculator ID/version
 -> formula ID/version
 -> normalized inputs/units
 -> entity ID and parent
 -> dependency outputs
 -> source file/hash/page/cell/detail/chainage
 -> precision/rounding policy
 -> warnings and validation
 -> execution ID and timestamp
```

Source types: `project_drawing`, `survey`, `approved_schedule`, `product_data`, `government_standard`, `external_reference`, `user_input`, `ai_extraction_pending`, and `assumption`. An assumption cannot receive `VERIFIED` without an authoritative source/review.

## 21. Testing

### Test layers

1. **Unit tests:** geometry, units, precision, section, route, layer, count, opening, intersection, stock/joint rules.
2. **Golden vectors:** source-backed inputs and expected physical outputs.
3. **Independent evaluator:** separate reference implementation; never imports production calculator definitions.
4. **Cross-calculator tests:** producer/consumer unit and lineage compatibility.
5. **Dependency tests:** DAG order, missing dependency, cycle rejection, version pinning.
6. **Ownership tests:** duplicate producer and parent/child summary rejection.
7. **Project isolation:** missing, invalid, unauthorized, stale, switched, and valid context.
8. **Precision tests:** exact, tolerance, display, and no-intermediate-rounding cases.
9. **Idempotency tests:** repeated same execution does not duplicate QTO.
10. **Provenance tests:** source/hash/page/detail and formula versions persist.
11. **Invalid/missing source tests:** output is blocked or unverified, never guessed.

### Minimum domain test targets

| Domain | Minimum vectors before production status |
|---|---|
| Road | one plan area, one station cross-section, cut/fill, each pavement layer, route/accessory, duplicate ownership |
| Bridge | deck/slab, girder, pier/abutment, pile, joint, concrete/rebar/formwork lineage |
| Drainage | rectangular/trapezoid/U-ditch/box/pipe, excavation/backfill, lining, route duplicate |
| Irrigation | lined/unlined channel, crossing, intake, drop/check structure, earthwork |
| River | riprap, gabion, wall, levee, filter/geotextile, area/volume/weight distinction |
| Weir | body, crest, apron, cutoff, gate, protection, concrete lineage |
| Embung | basin, embankment zones, lining, spillway, pipe, access road ownership |
| Dam | zone/station/block, gallery, joint/waterstop, grouting/hole, rock protection |
| Water | tank/chamber/trench/pipe/bedding/backfill/thrust block |
| Coastal | seawall/revetment/breakwater/armor/geotextile/pile |
| Retaining | gravity/cantilever/counterfort/gabion/sheet pile quantity variants |

No row receives `VERIFIED` from code tests alone. Reference parity and human/source validation remain separate gates.

## 22. Source Strategy

### Source hierarchy

1. Project DED/drawing and approved revision
2. Survey/as-built/field measurement
3. Approved engineering schedule/specification
4. Product technical data
5. Government or contract standard, with exact version/clause
6. Independently reviewed mathematical reference
7. Explicit user input
8. Assumption, which is never silently promoted

### Source-sensitive items

The following require source/version before production use:

* pavement thickness and layer composition;
* density, asphalt mix properties, cement treatment composition;
* compaction, swell, shrinkage, loose/in-situ conversion;
* reinforcement unit-weight table, laps, hooks, bends;
* pile/profile stock length and weight;
* geotextile/geogrid overlap;
* roofing, pipe, tile, block, gutter, grating, gate, bearing, joint, waterstop, membrane, armor, and concrete-block product data;
* paint coverage and coat system;
* channel/pipe slope, diameter, freeboard, discharge, hydraulic coefficients;
* structural dimensions, reinforcement arrangement, pile embedment, wall proportions;
* coastal/river protection grading and density;
* grouting consumption and drainage-hole spacing;
* stock length and procurement rounding.

For each unavailable item: `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`.

## 23. Implementation Roadmap

### Phase A — Generic Civil Geometry

**Engines:** primitives, units, precision, surface/volume/length, route, stationing, sections, layers, count, openings, intersections, assembly, provenance, ownership.  
**Tests:** independent geometry vectors, unit/tolerance, DAG, ownership, idempotency.  
**Risk:** building domain-specific shortcuts into core.  
**Reuse:** all future packs.

### Phase B — Road

**Calculators:** surface, alignment, chainage, sections, cut/fill/earthwork, subgrade, selected/granular/base layers, asphalt layers/coats, shoulder, kerb, drainage relationship, marking, delineator, guardrail, barriers, geosynthetics, joints, disposal/borrow/haul.  
**Dependencies:** sections, layer build-up, route, earthwork.  
**Source:** alignment, sections, pavement schedule, materials, densities, product data.  
**Risk:** design assumptions and double-counted layers.  
**Reuse:** drainage, embankment, coastal, access roads.

### Phase C — Drainage

**Calculators:** channels, U-ditch, box/pipe culvert, manhole, inlet/outlet, head/wing walls, covers/grating, lining, bedding, backfill, excavation, disposal.  
**Dependencies:** channel/pipe section, route, earthwork.  
**Source:** drawings, product details, lining details.  
**Risk:** accidental hydraulic design.  
**Reuse:** irrigation, road drainage, water structures.

### Phase D — Bridge

**Calculators:** geometry, deck/slab, girders, diaphragms, beams, abutments, piers/caps, pile/foundation variants, wing/retaining/backwalls, approach, bearings, joints, parapets/railings, drainage/scuppers, overlay/waterproofing, protection.  
**Dependencies:** member, concrete, reinforcement, formwork, earthwork, assembly.  
**Source:** bridge GA, member/bar schedules, product data.  
**Risk:** structural design contamination and component ownership.  
**Reuse:** concrete/water/river structures.

### Phase E — Irrigation

**Calculators:** channel variants, crossings, drop/check/division/intake/outlet/flume/aqueduct/siphon/gate structures, lining, earthwork, concrete/rebar/formwork.  
**Dependencies:** drainage/channel and structure engines.  
**Source:** irrigation DED and section schedules.  
**Risk:** hydraulic design inference.  
**Reuse:** drainage, weir, water.

### Phase F — River / Flood Protection

**Calculators:** bank, riprap, pitching, gabion, blocks, sheet pile, walls, revetment, toe/apron/floodwall/levee, excavation/backfill, filter/geotextile/drainage.  
**Source:** treatment sections, material grading/density.  
**Risk:** erosion/stability assumptions.  
**Reuse:** coastal, retaining, embankment.

### Phase G — Weir

**Calculators:** body, spillway, crest, apron, stilling/energy structures, intake/division/gate/slots, pier/abutment/wing/cutoff/floor, concrete/rebar/formwork, earthwork, stone/protection.  
**Risk:** hydraulic design and shared concrete ownership.  
**Reuse:** channel/structure engines.

### Phase H — Embung

**Calculators:** basin, embankment zones, core/filter/drainage, riprap/lining/geomembrane, spillway/outlet/intake, pipes/valves, concrete/rebar/formwork, earthwork, access road.  
**Risk:** storage/embankment design and material conversion.  
**Reuse:** dam/road/water engines.

### Phase I — Dam

**Calculators:** dam zones, rockfill, concrete blocks, spillway/intake/outlet, energy dissipation, gallery, foundation excavation, grouting, drainage holes, joints/waterstop, protection/access road.  
**Risk:** large-project source density, block/lift ownership, grouting assumptions.  
**Reuse:** embung/weir/bridge/concrete engines.

### Phase J — Water Structures

**Calculators:** intake, treatment civil works, reservoirs/tanks, pump house, chambers, pipeline trench, thrust/anchor blocks, bedding/backfill/manholes.  
**Risk:** process/hydraulic design leaking into quantity.  
**Reuse:** drainage, building, pipe/route, concrete engines.

### Phase K — Coastal

**Calculators:** seawall, revetment, breakwater, groin, beach/toe protection, blocks, armor, filter, geotextile, pile, concrete/rebar/formwork, excavation/backfill.  
**Risk:** marine material grading, wave/stability design.  
**Reuse:** river/retaining/earthwork/layer engines.

### Phase L — Retaining Structures

**Calculators:** gravity, cantilever, counterfort, gabion, stone, concrete, block, sheet-pile variants.  
**Risk:** stability design, wall/drainage/backfill ownership.  
**Reuse:** concrete, reinforcement, formwork, masonry, earthwork, drainage.

## 24. Dependency Matrix

| Pack | Required generic engines | Cross-pack dependencies |
|---|---|---|
| Road | geometry, alignment, chainage, section, earthwork, layer, route, segment aggregation | drainage, geosynthetic, access road |
| Bridge | assembly, member, concrete, rebar, formwork, earthwork, route | river protection, drainage, retaining |
| Drainage | channel, pipe/route, section, volume, earthwork, lining | road drainage, irrigation, water |
| Irrigation | channel, section, lining, structure, earthwork, route | drainage, weir, water |
| River | section, layer, earthwork, material, geotextile, wall | retaining, coastal, road |
| Weir | structure, channel, member, concrete, rebar, formwork, earthwork | irrigation, river, drainage |
| Embung | basin/section, earthwork, layer, pipe, structure | road, weir, dam, water |
| Dam | zone/section, block/assembly, earthwork, concrete, joints, grouting | embung, weir, road |
| Water | tank/chamber, pipe/route, concrete, earthwork, layer | drainage, building, road |
| Coastal | section, layer, material, earthwork, pile, concrete | river, retaining, road |
| Retaining | wall/member, earthwork, drainage, filter, geotextile | bridge, river, coastal |

## 25. Calculator Count Summary

Counts below are capability counts, not separate formula engines.

| Universe | Capability scope | Recommended implementation model |
|---|---:|---|
| Legacy workbook | 19 | source-backed compatibility definitions |
| Residential | 30 | shared residential/civil variants |
| Road | 39 requested candidates | road geometry/layer/earthwork/route variants |
| Bridge | 35 requested candidates | bridge assembly/member variants |
| Drainage | 22 requested candidates | channel/pipe/chamber variants |
| Irrigation | 27 requested candidates | channel/structure variants |
| River protection | 19 requested candidates | protection/layer/wall variants |
| Weir | 23 requested candidates | hydraulic-geometry-free structure variants |
| Embung | 18 requested candidates | basin/embankment/layer/structure variants |
| Dam | 22 requested candidates | zone/block/structure variants |
| Water structures | 18 requested candidates | chamber/tank/pipe variants |
| Coastal | 16 requested candidates | marine protection/layer variants |
| Retaining | 8 variants | wall/masonry/sheet-pile variants |

The count is a catalog planning number. It must not become a reason to create duplicate engines or claim production readiness.

## 26. Risks and Boundaries

### Primary risks

1. AI extracts a dimension that is not present in the source.
2. A design value is silently used as a quantity input.
3. Gross/net/opening quantities are deducted more than once.
4. Parent assemblies and child components both enter QTO.
5. Excavation, backfill, disposal, borrow, and loose/in-situ quantities use inconsistent bases.
6. Product module, overlap, waste, lap, stock length, or density is invented.
7. Hydraulic or structural design logic enters a quantity calculator.
8. Source revisions change historical calculations.
9. Shared route or surface is counted by multiple packs.
10. A missing source is represented as zero/default rather than blocked.

### Mandatory behavior

* Missing required geometry: validation failure.
* Missing authoritative material/product/design parameter: `NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE`.
* Ambiguous entity or variant: clarification required.
* Conflicting producers: execution blocked.
* Missing project/workspace ownership: fail closed.
* Unsupported formula or source feature: `BLOCKED`, not guessed.
* Quantity result and cost result remain separate artifacts.

### Final architectural recommendation

Implement Phase A first and make it the only source of geometry, units, precision, ownership, provenance, and aggregation behavior. Then add packs in dependency order. Each domain calculator should be a thin, source-backed definition over reusable engines. This preserves fewer, reusable, deterministic, traceable, source-backed generic engines while allowing EZRAB to cover building through major civil infrastructure without formula duplication.