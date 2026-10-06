/**
 * EZRAB — CONSTRUCTION RESOURCE INTELLIGENCE SERVICE 2026
 * AI-Powered Labor & Equipment Resource Suggester and Estimator
 * 
 * Complies with:
 * - Permen PUPR No. 1 Tahun 2022 (AHSP Bidang Cipta Karya, Bina Marga, SDA)
 * - SNI & Standar Produktivitas Konstruksi Indonesia
 * - Explicit User Review Gate (AI suggestions require user approval before applying to RAB)
 */

import { LaborDatabaseService, LaborRateRecord, laborDatabaseService } from '../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService, EquipmentRecord, equipmentDatabaseService } from '../domain/equipment/equipmentDatabaseService';

export interface ResourceSuggestionResult<T> {
  primary: T[];
  supporting: T[];
  optional: T[];
  confidence: number;
  reason: string;
  assumptions: string[];
  requires_review: boolean;
}

export interface CompleteResourceBreakdown {
  workItemName: string;
  volume: number;
  unit: string;
  durationDays?: number;
  labor: {
    primary: Array<{ role: LaborRateRecord; count: number; totalOH: number; totalCost: number; coefficient: number }>;
    supporting: Array<{ role: LaborRateRecord; count: number; totalOH: number; totalCost: number; coefficient: number }>;
  };
  equipment: {
    primary: Array<{ item: EquipmentRecord; count: number; totalHours: number; totalCost: number; coefficient: number }>;
    supporting: Array<{ item: EquipmentRecord; count: number; totalHours: number; totalCost: number; coefficient: number }>;
  };
  totalEstimatedLaborCost: number;
  totalEstimatedEquipmentCost: number;
  totalEstimatedResourceCost: number;
  confidence: number;
  reasoning: string;
  assumptions: string[];
  requires_review: boolean;
}

export class ResourceIntelligenceService {
  private static instance: ResourceIntelligenceService;
  private laborDb: LaborDatabaseService;
  private equipDb: EquipmentDatabaseService;

  private constructor() {
    this.laborDb = LaborDatabaseService.getInstance();
    this.equipDb = EquipmentDatabaseService.getInstance();
  }

  public static getInstance(): ResourceIntelligenceService {
    if (!ResourceIntelligenceService.instance) {
      ResourceIntelligenceService.instance = new ResourceIntelligenceService();
    }
    return ResourceIntelligenceService.instance;
  }

  /**
   * Suggests labor candidates for a given work item description.
   */
  public suggestLaborForWorkItem(workItemDescription: string): ResourceSuggestionResult<LaborRateRecord> {
    const text = (workItemDescription || '').toLowerCase();
    const allLabor = this.laborDb.getAllLabor();

    const primary: LaborRateRecord[] = [];
    const supporting: LaborRateRecord[] = [];
    const optional: LaborRateRecord[] = [];
    const assumptions: string[] = [];

    // Helper match
    const findLabor = (query: string): LaborRateRecord | undefined => {
      const q = query.toLowerCase();
      return allLabor.find(
        (l) =>
          l.code.toLowerCase() === q ||
          l.name.toLowerCase().includes(q) ||
          l.aliases.some((a) => a.toLowerCase().includes(q))
      );
    };

    const mandor = findLabor('L.09') || findLabor('Mandor');
    const pekerja = findLabor('L.01') || findLabor('Pekerja');
    const kepalaTukang = findLabor('L.08') || findLabor('Kepala Tukang');

    // Rule 1: Dinding Bata / Hebel / Plesteran
    if (text.includes('bata') || text.includes('hebel') || text.includes('dinding') || text.includes('plester') || text.includes('acian')) {
      const tukangBatu = findLabor('L.02') || findLabor('Tukang Batu');
      if (tukangBatu) primary.push(tukangBatu);
      if (pekerja) supporting.push(pekerja);
      if (mandor) supporting.push(mandor);
      if (kepalaTukang) optional.push(kepalaTukang);
      assumptions.push('Pekerjaan pasangan bata/plesteran mengacu pada komposisi standar Permen PUPR: Tukang Batu, Pekerja, dan Mandor.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.94,
        reason: 'Pekerjaan pasangan dinding batu/hebel/plesteran membutuhkan keahlian Tukang Batu terampil didampingi Pekerja pembantu adukan.',
        assumptions,
        requires_review: true,
      };
    }

    // Rule 2: Pembetonan & Pengecoran
    if (text.includes('beton') || text.includes('cor') || text.includes('slab') || text.includes('kolom') || text.includes('balok') || text.includes('pile cap')) {
      const tukangBeton = findLabor('L.14') || findLabor('Tukang Beton');
      const tukangBesi = findLabor('L.04') || findLabor('Tukang Besi');
      const tukangKayu = findLabor('L.03') || findLabor('Tukang Kayu');
      const opVibrator = findLabor('L.OP-04') || findLabor('Vibrator');

      if (tukangBeton) primary.push(tukangBeton);
      if (tukangBesi && (text.includes('bertulang') || text.includes('besi') || text.includes('rebar'))) primary.push(tukangBesi);
      if (tukangKayu && (text.includes('bekisting') || text.includes('formwork') || text.includes('struktur'))) primary.push(tukangKayu);
      
      if (pekerja) supporting.push(pekerja);
      if (mandor) supporting.push(mandor);
      if (opVibrator) optional.push(opVibrator);
      if (kepalaTukang) optional.push(kepalaTukang);

      assumptions.push('Pekerjaan beton bertulang memerlukan integrasi 3 disiplin: Pembesian, Bekisting, dan Pengecoran.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.92,
        reason: 'Pekerjaan struktur beton bertulang memerlukan sinergi Tukang Beton, Tukang Besi Tulangan, dan Tukang Kayu Bekisting.',
        assumptions,
        requires_review: true,
      };
    }

    // Rule 3: Galian Tanah & Cut and Fill
    if (text.includes('gali') || text.includes('tanah') || text.includes('cut') || text.includes('urug') || text.includes('timbun') || text.includes('land clearing')) {
      const opExcavator = findLabor('L.OP-01') || findLabor('Operator Alat Berat');
      if (text.includes('alat') || text.includes('excavator') || text.includes('mekanis')) {
        if (opExcavator) primary.push(opExcavator);
        if (pekerja) supporting.push(pekerja);
        if (mandor) supporting.push(mandor);
      } else {
        if (pekerja) primary.push(pekerja);
        if (mandor) supporting.push(mandor);
        if (opExcavator) optional.push(opExcavator);
      }
      assumptions.push('Kebutuhan alat berat vs manual disesuaikan dengan volume galian dan akses site.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.90,
        reason: 'Pekerjaan tanah melibatkan regu Pekerja manual atau Operator Alat Berat didampingi Mandor pengawas elevasi.',
        assumptions,
        requires_review: true,
      };
    }

    // Rule 4: Pengecatan
    if (text.includes('cat') || text.includes('paint') || text.includes('epoxy') || text.includes('finishing dinding')) {
      const tukangCat = findLabor('L.05') || findLabor('Tukang Cat');
      if (tukangCat) primary.push(tukangCat);
      if (pekerja) supporting.push(pekerja);
      if (mandor) supporting.push(mandor);
      assumptions.push('Pengecatan mencakup pelapisan dasar (plamir/sealer) dan finishing 2 lapis.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.95,
        reason: 'Pekerjaan pengecatan ditangani oleh Tukang Cat profesional dengan bantuan Pekerja untuk persiapan permukaan dan amplas.',
        assumptions,
        requires_review: true,
      };
    }

    // Rule 5: Plumbing & Pipa
    if (text.includes('pipa') || text.includes('plumbing') || text.includes('sanitair') || text.includes('drainase') || text.includes('air bersih')) {
      const tukangPipa = findLabor('L.06') || findLabor('Tukang Pipa');
      if (tukangPipa) primary.push(tukangPipa);
      if (pekerja) supporting.push(pekerja);
      if (mandor) supporting.push(mandor);
      assumptions.push('Pekerjaan pemipaan mencakup pengetesan kebocoran (hydrotest).');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.92,
        reason: 'Pekerjaan instalasi plumbing dan sanitasi dikerjakan oleh Tukang Pipa bersertifikat.',
        assumptions,
        requires_review: true,
      };
    }

    // Rule 6: Elektrikal & Listrik
    if (text.includes('listrik') || text.includes('lampu') || text.includes('kabel') || text.includes('panel') || text.includes('elektrik')) {
      const tukangListrik = findLabor('L.07') || findLabor('Tukang Listrik');
      if (tukangListrik) primary.push(tukangListrik);
      if (pekerja) supporting.push(pekerja);
      if (mandor) supporting.push(mandor);
      assumptions.push('Instalasi kelistrikan mencakup penarikan kabel NYM/NYY dan instalasi MCB/titik lampu.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.93,
        reason: 'Pekerjaan elektrikal memerlukan Tukang Listrik terampil dengan standar keselamatan PUIL 2020.',
        assumptions,
        requires_review: true,
      };
    }

    // Rule 7: Perkerasan Jalan & Aspal
    if (text.includes('aspal') || text.includes('hotmix') || text.includes('jalan') || text.includes('lpa') || text.includes('lpb')) {
      const opPaver = findLabor('L.OP-02') || findLabor('Operator Alat Berat');
      const opRoller = findLabor('L.OP-03') || findLabor('Operator Vibro');
      if (opPaver) primary.push(opPaver);
      if (opRoller) primary.push(opRoller);
      if (pekerja) supporting.push(pekerja);
      if (mandor) supporting.push(mandor);
      assumptions.push('Pekerjaan jalan aspal mengikutsertakan operator alat pemadat dan penghampar aspal.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.91,
        reason: 'Pekerjaan aspal hotmix membutuhkan Operator Asphalt Finisher & Tandem Roller didukung regu Pekerja perapihan.',
        assumptions,
        requires_review: true,
      };
    }

    // Default Fallback
    if (pekerja) primary.push(pekerja);
    if (mandor) supporting.push(mandor);
    if (kepalaTukang) optional.push(kepalaTukang);

    return {
      primary,
      supporting,
      optional,
      confidence: 0.70,
      reason: 'Rekomendasi umum tenaga kerja konstruksi dasar.',
      assumptions: ['Perlu konfirmasi spesifikasi detail pekerjaan untuk menentukan keahlian tukang spesialis.'],
      requires_review: true,
    };
  }

  /**
   * Suggests equipment candidates for a given work item description.
   */
  public suggestEquipmentForWorkItem(workItemDescription: string): ResourceSuggestionResult<EquipmentRecord> {
    const text = (workItemDescription || '').toLowerCase();
    const allEquip = this.equipDb.getAllEquipment();

    const primary: EquipmentRecord[] = [];
    const supporting: EquipmentRecord[] = [];
    const optional: EquipmentRecord[] = [];
    const assumptions: string[] = [];

    const findEquip = (query: string): EquipmentRecord | undefined => {
      const q = query.toLowerCase();
      return allEquip.find(
        (e) =>
          e.code.toLowerCase() === q ||
          e.name.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q))
      );
    };

    // 1. Galian Tanah & Land Clearing
    if (text.includes('gali') || text.includes('excavation') || text.includes('cut and fill') || text.includes('pematangan lahan')) {
      const exc20T = findEquip('E.01') || findEquip('Excavator Standard');
      const dtTronton = findEquip('E.13') || findEquip('Dump Truck Tronton');
      const dtEngkel = findEquip('E.12') || findEquip('Dump Truck Indeks 4');
      const dozer = findEquip('E.04') || findEquip('Bulldozer');
      const waterTanker = findEquip('E.14') || findEquip('Water Tanker');

      if (exc20T) primary.push(exc20T);
      if (dtTronton) supporting.push(dtTronton);
      else if (dtEngkel) supporting.push(dtEngkel);
      if (waterTanker) supporting.push(waterTanker);
      if (dozer) optional.push(dozer);

      assumptions.push('Volume galian tanah diasumsikan berskala menengah-besar yang efisien menggunakan Excavator 20T dan Dump Truck.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.95,
        reason: 'Pekerjaan galian dan pematangan lahan optimal menggunakan Excavator 20 Ton sebagai alat gali-muat utama dan Dump Truck sebagai alat angkut.',
        assumptions,
        requires_review: true,
      };
    }

    // 2. Pemadatan Tanah & Lapis Pondasi Agregat
    if (text.includes('padat') || text.includes('agregat') || text.includes('lpa') || text.includes('lpb') || text.includes('subgrade')) {
      const vibroRoller = findEquip('E.07') || findEquip('Vibratory Single Drum');
      const motorGrader = findEquip('E.06') || findEquip('Motor Grader');
      const waterTanker = findEquip('E.14') || findEquip('Water Tanker');
      const babyRoller = findEquip('E.10') || findEquip('Baby Roller');

      if (vibroRoller) primary.push(vibroRoller);
      if (motorGrader) supporting.push(motorGrader);
      if (waterTanker) supporting.push(waterTanker);
      if (babyRoller) optional.push(babyRoller);

      assumptions.push('Kadar air pemadatan dikontrol dengan Water Tanker Truck untuk mencapai kepadatan maksimum (Modified Proctor).');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.94,
        reason: 'Pemadatan lapis pondasi membutuhkan kombinasi Motor Grader (perata), Water Tanker (kadar air), dan Vibro Roller 10T (pemadat).',
        assumptions,
        requires_review: true,
      };
    }

    // 3. Pengecoran Beton Ready Mix
    if (text.includes('cor') || text.includes('beton') || text.includes('slab') || text.includes('kolom') || text.includes('balok')) {
      const concPump = findEquip('E.18') || findEquip('Concrete Boom Pump');
      const truckMixer = findEquip('E.19') || findEquip('Truck Mixer');
      const vibrator = findEquip('E.20') || findEquip('Concrete Vibrator');
      const powerTrowel = findEquip('E.21') || findEquip('Power Trowel');

      if (concPump) primary.push(concPump);
      if (truckMixer) supporting.push(truckMixer);
      if (vibrator) supporting.push(vibrator);
      if (powerTrowel) optional.push(powerTrowel);

      assumptions.push('Pengecoran dilakukan menggunakan beton ready mix dengan armada Truck Mixer dan Concrete Pump untuk mobilitas tinggi.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.93,
        reason: 'Pengecoran plat dan balok bertingkat memerlukan Concrete Boom Pump dan Vibrator Penggetar agar beton padat homogen tanpa keropos.',
        assumptions,
        requires_review: true,
      };
    }

    // 4. Pengaspalan Hotmix
    if (text.includes('aspal') || text.includes('hotmix') || text.includes('ac-wc') || text.includes('ac-bc')) {
      const asphaltPaver = findEquip('E.25') || findEquip('Asphalt Finisher');
      const tandemRoller = findEquip('E.08') || findEquip('Tandem Steel Roller');
      const ptr = findEquip('E.09') || findEquip('Pneumatic Tire Roller');
      const bitumenSprayer = findEquip('E.27') || findEquip('Bitumen Sprayer');

      if (asphaltPaver) primary.push(asphaltPaver);
      if (tandemRoller) supporting.push(tandemRoller);
      if (ptr) supporting.push(ptr);
      if (bitumenSprayer) supporting.push(bitumenSprayer);

      assumptions.push('Pekerjaan pengaspalan hotmix mengikuti standar Bina Marga: Bitumen Sprayer (Tack Coat) -> Paver -> Tandem (Breakdown) -> PTR (Intermediate).');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.96,
        reason: 'Paket perkerasan aspal membutuhkan armada lengkap Asphalt Finisher, Tandem Roller, dan Pneumatic Tire Roller.',
        assumptions,
        requires_review: true,
      };
    }

    // 5. Bored Pile & Pondasi Dalam
    if (text.includes('bored pile') || text.includes('bore pile') || text.includes('tiang bor') || text.includes('drilling rig')) {
      const boredRig = findEquip('E.28') || findEquip('Bored Pile Drilling Rig');
      const crawlerCrane = findEquip('E.24') || findEquip('Crawler Crane');
      const concPump = findEquip('E.18') || findEquip('Concrete Pump');

      if (boredRig) primary.push(boredRig);
      if (crawlerCrane) supporting.push(crawlerCrane);
      if (concPump) optional.push(concPump);

      assumptions.push('Pondasi bored pile memerlukan crawler crane pendukung untuk instalasi keranjang pembesian (rebar cage) dan pipa tremie.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.95,
        reason: 'Pekerjaan pondasi dalam membutuhkan Rotary Drilling Rig didampingi Crawler Crane untuk penanganan casing dan sangkar besi.',
        assumptions,
        requires_review: true,
      };
    }

    // 6. Fabrikasi Besi & Pembesian
    if (text.includes('besi') || text.includes('pembesian') || text.includes('rebar') || text.includes('tulangan')) {
      const barBender = findEquip('E.31') || findEquip('Mesin Bar Bender');
      const welder = findEquip('E.32') || findEquip('Mesin Las');
      if (barBender) primary.push(barBender);
      if (welder) optional.push(welder);

      assumptions.push('Fabrikasi besi tulangan menggunakan Bar Bender & Bar Cutter listrik otomatis untuk efisiensi potongan.');
      return {
        primary,
        supporting,
        optional,
        confidence: 0.90,
        reason: 'Fabrikasi pembesian beton didukung mesin Bar Bender dan Bar Cutter berdaya potong multi-batang.',
        assumptions,
        requires_review: true,
      };
    }

    // Default Fallback
    const genset = findEquip('E.36') || findEquip('Genset Silent');
    if (genset) optional.push(genset);

    return {
      primary,
      supporting,
      optional,
      confidence: 0.65,
      reason: 'Tidak terdeteksi kebutuhan alat berat primer khusus untuk pekerjaan ini.',
      assumptions: ['Pekerjaan dapat dikerjakan secara manual atau menggunakan peralatan kerja umum ringan.'],
      requires_review: true,
    };
  }

  /**
   * Calculates complete labor requirement based on work volume and target duration.
   * Formula: Volume ÷ Productivity = Kebutuhan Total OH; Total OH ÷ DurationDays = Jumlah Tenaga Kerja
   */
  public calculateLaborRequirement(params: {
    volume: number;
    standardProductivityRate: number; // e.g. 10 m2/OH
    targetDurationDays: number;       // e.g. 14 hari
    dailyWage: number;                // e.g. Rp 160.000 / OH
  }): {
    totalOH: number;
    recommendedWorkerCount: number;
    totalCost: number;
    dailyOutputRequired: number;
  } {
    const { volume, standardProductivityRate, targetDurationDays, dailyWage } = params;
    const prodRate = standardProductivityRate > 0 ? standardProductivityRate : 1;
    const duration = targetDurationDays > 0 ? targetDurationDays : 1;

    const totalOH = Math.ceil(volume / prodRate);
    const recommendedWorkerCount = Math.max(1, Math.ceil(totalOH / duration));
    const totalCost = totalOH * dailyWage;
    const dailyOutputRequired = Math.round((volume / duration) * 100) / 100;

    return {
      totalOH,
      recommendedWorkerCount,
      totalCost,
      dailyOutputRequired,
    };
  }

  /**
   * Calculates complete equipment requirement based on work volume and target duration.
   * Formula: Volume ÷ Productivity = Machine Hours; Total Hours ÷ (DurationDays * HoursPerDay) = Unit Count
   */
  public calculateEquipmentRequirement(params: {
    volume: number;
    standardHourlyProductivity: number; // e.g. 65 m3/jam
    targetDurationDays: number;         // e.g. 10 hari
    hoursPerDay?: number;               // default 7 jam kerja efektif
    hourlyRentalRate: number;           // e.g. Rp 450.000 / jam
    mobDemobCost?: number;              // e.g. Rp 4.500.000
  }): {
    totalMachineHours: number;
    recommendedUnitCount: number;
    rentalCost: number;
    totalCost: number;
  } {
    const { volume, standardHourlyProductivity, targetDurationDays, hoursPerDay = 7, hourlyRentalRate, mobDemobCost = 0 } = params;
    const prodRate = standardHourlyProductivity > 0 ? standardHourlyProductivity : 1;
    const duration = targetDurationDays > 0 ? targetDurationDays : 1;

    const totalMachineHours = Math.ceil(volume / prodRate);
    const availableWorkingHoursPerUnit = duration * hoursPerDay;
    const recommendedUnitCount = Math.max(1, Math.ceil(totalMachineHours / availableWorkingHoursPerUnit));
    const rentalCost = totalMachineHours * hourlyRentalRate;
    const totalCost = rentalCost + (mobDemobCost * recommendedUnitCount);

    return {
      totalMachineHours,
      recommendedUnitCount,
      rentalCost,
      totalCost,
    };
  }

  /**
   * Generates a complete comprehensive resource breakdown (Labor + Equipment) for DED / RAB item.
   */
  public getCompleteResourceBreakdown(params: {
    workItemName: string;
    volume: number;
    unit: string;
    targetDurationDays?: number;
    province?: string;
  }): CompleteResourceBreakdown {
    const { workItemName, volume, unit, targetDurationDays = 14, province = 'DKI Jakarta' } = params;

    const laborSuggestion = this.suggestLaborForWorkItem(workItemName);
    const equipSuggestion = this.suggestEquipmentForWorkItem(workItemName);

    // Calculate labor costs
    let totalLaborCost = 0;
    const laborPrimary = laborSuggestion.primary.map((lab) => {
      const rate = this.laborDb.getAdjustedRate(lab.id, province);
      const coeff = lab.ahspMappings?.[0]?.coefficient || 0.15;
      const totalOH = Math.ceil(volume * coeff);
      const workerCount = Math.max(1, Math.ceil(totalOH / targetDurationDays));
      const cost = totalOH * rate.priceOH;
      totalLaborCost += cost;
      return { role: lab, count: workerCount, totalOH, totalCost: cost, coefficient: coeff };
    });

    const laborSupporting = laborSuggestion.supporting.map((lab) => {
      const rate = this.laborDb.getAdjustedRate(lab.id, province);
      const coeff = lab.ahspMappings?.[0]?.coefficient || 0.30;
      const totalOH = Math.ceil(volume * coeff);
      const workerCount = Math.max(1, Math.ceil(totalOH / targetDurationDays));
      const cost = totalOH * rate.priceOH;
      totalLaborCost += cost;
      return { role: lab, count: workerCount, totalOH, totalCost: cost, coefficient: coeff };
    });

    // Calculate equipment costs
    let totalEquipCost = 0;
    const equipPrimary = equipSuggestion.primary.map((eq) => {
      const rate = this.equipDb.getAdjustedRate(eq.id, province);
      const coeff = eq.ahspMappings?.[0]?.coefficient || 0.02;
      const totalHours = Math.ceil(volume * coeff);
      const unitCount = Math.max(1, Math.ceil(totalHours / (targetDurationDays * 7)));
      const cost = totalHours * rate.pricePerHour;
      totalEquipCost += cost;
      return { item: eq, count: unitCount, totalHours, totalCost: cost, coefficient: coeff };
    });

    const equipSupporting = equipSuggestion.supporting.map((eq) => {
      const rate = this.equipDb.getAdjustedRate(eq.id, province);
      const coeff = eq.ahspMappings?.[0]?.coefficient || 0.05;
      const totalHours = Math.ceil(volume * coeff);
      const unitCount = Math.max(1, Math.ceil(totalHours / (targetDurationDays * 7)));
      const cost = totalHours * rate.pricePerHour;
      totalEquipCost += cost;
      return { item: eq, count: unitCount, totalHours, totalCost: cost, coefficient: coeff };
    });

    const assumptions = [
      ...laborSuggestion.assumptions,
      ...equipSuggestion.assumptions,
      `Durasi pelaksanaan direncanakan ${targetDurationDays} hari kerja efektif (7 jam/hari).`,
      `Standar harga upah dan sewa alat disesuaikan untuk wilayah ${province}.`,
    ];

    return {
      workItemName,
      volume,
      unit,
      durationDays: targetDurationDays,
      labor: {
        primary: laborPrimary,
        supporting: laborSupporting,
      },
      equipment: {
        primary: equipPrimary,
        supporting: equipSupporting,
      },
      totalEstimatedLaborCost: totalLaborCost,
      totalEstimatedEquipmentCost: totalEquipCost,
      totalEstimatedResourceCost: totalLaborCost + totalEquipCost,
      confidence: Math.round(((laborSuggestion.confidence + equipSuggestion.confidence) / 2) * 100) / 100,
      reasoning: `${laborSuggestion.reason} ${equipSuggestion.reason}`,
      assumptions,
      requires_review: true,
    };
  }
}

export const resourceIntelligenceService = ResourceIntelligenceService.getInstance();
