/**
 * EZRAB CALCULATOR CORE — INDEPENDENT REFERENCE EVALUATOR
 * Independent algebraic evaluator for comparison against EZRAB calculators.
 * Does NOT call EZRAB production calculators; directly implements raw workbook formulas.
 */

import { Decimal } from 'decimal.js';

export interface ReferenceEvaluationResult {
  primaryQuantity: number;
  primaryUnit: string;
  breakdown: Record<string, number>;
  sourceFormula: string;
}

export class IndependentReferenceEvaluator {
  /**
   * 01. Bowplank: Perimeter = 2 * (P + L + 2 * C)
   */
  public static evaluateBowplank(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 12);
    const L = new Decimal(inputs.L ?? 8);
    const C = new Decimal(inputs.C ?? 0.60);
    const H = new Decimal(inputs.H ?? 1.0);
    const R = new Decimal(inputs.R ?? 2.0);

    const luasLahan = P.times(L).toDecimalPlaces(2).toNumber();
    const perimeter = new Decimal(2).times(P.plus(L).plus(new Decimal(2).times(C))).toDecimalPlaces(2).toNumber();
    const jmlPatok = Math.ceil(perimeter / R.toNumber()) + 1;
    const panjangPatok = new Decimal(jmlPatok).times(H.plus(0.3)).times(1.05).toDecimalPlaces(2).toNumber();
    const panjangPapan = new Decimal(perimeter).times(1.05).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: perimeter,
      primaryUnit: 'm',
      breakdown: {
        luasLahan,
        kelilingBowplank: perimeter,
        panjangPatok,
        panjangPapan,
      },
      sourceFormula: '2*(P+L+2*C)',
    };
  }

  /**
   * 02. Pondasi Batu Kali: Pasangan = ((a2 + b2) / 2) * c2 * P
   */
  public static evaluatePondasi(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 45.0);
    const a2 = new Decimal(inputs.a2 ?? 0.30);
    const b2 = new Decimal(inputs.b2 ?? 0.70);
    const c2 = new Decimal(inputs.c2 ?? 0.80);
    const d = new Decimal(inputs.d ?? 0.20);
    const e = new Decimal(inputs.e ?? 0.05);

    const volPondasi = a2.plus(b2).dividedBy(2).times(c2).times(P).toDecimalPlaces(2).toNumber();
    const volAanstamping = b2.times(d).times(P).toDecimalPlaces(2).toNumber();
    const volPasirUrug = b2.times(e).times(P).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: volPondasi,
      primaryUnit: 'm³',
      breakdown: {
        volumePondasi: volPondasi,
        volumeAanstamping: volAanstamping,
        volumePasirUrug: volPasirUrug,
      },
      sourceFormula: '((a2+b2)/2)*c2*P',
    };
  }

  /**
   * 03. Foot Plate: Volume = ((b1*b2*h3) + (b1*b2*h2*0.5) + (a1*a2*h1)) * N
   */
  public static evaluateFootPlate(inputs: Record<string, number>): ReferenceEvaluationResult {
    const a1 = new Decimal(inputs.a1 ?? 0.25);
    const a2 = new Decimal(inputs.a2 ?? 0.25);
    const b1 = new Decimal(inputs.b1 ?? 0.70);
    const b2 = new Decimal(inputs.b2 ?? 0.70);
    const h1 = new Decimal(inputs.h1 ?? 1.50);
    const h2 = new Decimal(inputs.h2 ?? 0.10);
    const h3 = new Decimal(inputs.h3 ?? 0.30);
    const N = new Decimal(inputs.N ?? 5);

    const volKolom = a1.times(a2).times(h1);
    const volTapakBawah = b1.times(b2).times(h3);
    const volTapakMiring = b1.times(b2).times(h2).times(0.5);
    const volPerUnit = volKolom.plus(volTapakBawah).plus(volTapakMiring);
    const volTotal = volPerUnit.times(N).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: volTotal,
      primaryUnit: 'm³',
      breakdown: {
        volumeTotalBeton: volTotal,
        volumePerTitik: volPerUnit.toDecimalPlaces(3).toNumber(),
      },
      sourceFormula: '(a1*a2*h1 + b1*b2*h3 + b1*b2*h2*0.5)*N',
    };
  }

  /**
   * 04. Sloof: Volume = b * h * P * n
   */
  public static evaluateSloof(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 3.0);
    const b = new Decimal(inputs.b ?? 0.20);
    const h = new Decimal(inputs.h ?? 0.30);
    const n = new Decimal(inputs.n ?? inputs.N ?? 5);

    const vol = b.times(h).times(P).times(n).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: vol,
      primaryUnit: 'm³',
      breakdown: { volumeCorSloof: vol },
      sourceFormula: 'b*h*P*n',
    };
  }

  /**
   * 05. Kolom: Volume = L * P * T * Jumlah
   */
  public static evaluateKolom(inputs: Record<string, number>): ReferenceEvaluationResult {
    const T = new Decimal(inputs.T ?? inputs.H ?? 3.00);
    const L = new Decimal(inputs.L ?? inputs.b ?? 0.15);
    const P = new Decimal(inputs.P ?? inputs.h ?? 0.25);
    const Jumlah = new Decimal(inputs.Jumlah ?? inputs.N ?? 5);

    const vol = L.times(P).times(T).times(Jumlah).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: vol,
      primaryUnit: 'm³',
      breakdown: { volumeCorKolom: vol },
      sourceFormula: 'L*P*T*Jumlah',
    };
  }

  /**
   * 06. Balok: Volume = b * h * L
   */
  public static evaluateBalok(inputs: Record<string, number>): ReferenceEvaluationResult {
    const L = new Decimal(inputs.L ?? 36.0);
    const b = new Decimal(inputs.b ?? 0.20);
    const h = new Decimal(inputs.h ?? 0.35);

    const vol = b.times(h).times(L).toDecimalPlaces(3).toNumber();

    return {
      primaryQuantity: vol,
      primaryUnit: 'm³',
      breakdown: { volumeCorBalok: vol },
      sourceFormula: 'b*h*L',
    };
  }

  /**
   * 07. Bata Ringan: Luas Netto = (Pi + Pe)*T + LuasAmpig - LuasPengurang
   */
  public static evaluateBataRingan(inputs: Record<string, number>): ReferenceEvaluationResult {
    const Pi = new Decimal(inputs.Pi ?? 36.0);
    const Pe = new Decimal(inputs.Pe ?? 39.0);
    const T = new Decimal(inputs.T ?? 3.80);
    const aPintu = new Decimal(inputs.aPintu ?? 2.10);
    const bPintu = new Decimal(inputs.bPintu ?? 0.90);
    const jmlPintu = new Decimal(inputs.jmlPintu ?? 6);
    const mJendela = new Decimal(inputs.mJendela ?? 1.50);
    const m1Jendela = new Decimal(inputs.m1Jendela ?? 0.70);
    const jmlJendela = new Decimal(inputs.jmlJendela ?? 7);
    const xBouven = new Decimal(inputs.xBouven ?? 0.20);
    const yBouven = new Decimal(inputs.yBouven ?? 0.30);
    const jmlBouven = new Decimal(inputs.jmlBouven ?? 26);
    const T2Ampig = new Decimal(inputs.T2Ampig ?? 2.30);
    const a2Ampig = new Decimal(inputs.a2Ampig ?? 9.00);
    const jmlAmpig = new Decimal(inputs.jmlAmpig ?? 2);

    const luasKotor = Pi.plus(Pe).times(T);
    const luasAmpig = new Decimal(0.5).times(a2Ampig).times(T2Ampig).times(jmlAmpig);
    const luasBukaan = aPintu.times(bPintu).times(jmlPintu)
      .plus(mJendela.times(m1Jendela).times(jmlJendela))
      .plus(xBouven.times(yBouven).times(jmlBouven));

    const luasNetto = luasKotor.plus(luasAmpig).minus(luasBukaan).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luasNetto,
      primaryUnit: 'm²',
      breakdown: { luasKotor: luasKotor.toNumber(), luasAmpig: luasAmpig.toNumber(), luasNetto },
      sourceFormula: '(Pi+Pe)*T + Ampig - Bukaan',
    };
  }

  /**
   * 08. Bata Merah: Luas = (P * H) - Abukaan + Asop
   */
  public static evaluateBataMerah(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 32.0);
    const H = new Decimal(inputs.H ?? inputs.T ?? 3.50);
    const Abukaan = new Decimal(inputs.Abukaan ?? 14.50);
    const Asop = new Decimal(inputs.Asop ?? 6.0);

    const luasNetto = P.times(H).minus(Abukaan).plus(Asop).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luasNetto,
      primaryUnit: 'm²',
      breakdown: { luasNetto },
      sourceFormula: '(P * H) - Abukaan + Asop',
    };
  }

  /**
   * 09. Batako: Luas = (P * H) - Abukaan + Asop
   */
  public static evaluateBatako(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 28.0);
    const H = new Decimal(inputs.H ?? inputs.T ?? 3.00);
    const Abukaan = new Decimal(inputs.Abukaan ?? 8.0);
    const Asop = new Decimal(inputs.Asop ?? 4.0);

    const luasNetto = P.times(H).minus(Abukaan).plus(Asop).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luasNetto,
      primaryUnit: 'm²',
      breakdown: { luasNetto },
      sourceFormula: '(P * H) - Abukaan + Asop',
    };
  }

  /**
   * 10. Pintu & Jendela: Total Luas Daun Pintu & Jendela
   */
  public static evaluatePintuJendela(inputs: Record<string, number>): ReferenceEvaluationResult {
    const nPU = new Decimal(inputs.nPintuUtama ?? 1);
    const nPK = new Decimal(inputs.nPintuKamar ?? 4);
    const nPKM = new Decimal(inputs.nPintuKM ?? 2);
    const nJG = new Decimal(inputs.nJendelaGanda ?? 3);
    const nJT = new Decimal(inputs.nJendelaTunggal ?? 4);

    const luasPintu = new Decimal(0.9).times(2.1).times(nPU)
      .plus(new Decimal(0.8).times(2.1).times(nPK))
      .plus(new Decimal(0.7).times(2.0).times(nPKM));
    const luasJendela = new Decimal(1.2).times(1.5).times(nJG)
      .plus(new Decimal(0.6).times(1.5).times(nJT));

    const totalLuas = luasPintu.plus(luasJendela).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: totalLuas,
      primaryUnit: 'm²',
      breakdown: { luasDaunPintu: luasPintu.toNumber(), luasDaunJendela: luasJendela.toNumber(), totalLuas },
      sourceFormula: 'LuasDaunPintu + LuasDaunJendela',
    };
  }

  /**
   * 11. Atap Baja Ringan: Luas = ((P + 2*Ov) * (L + 2*Ov)) / cos(rad(sudut))
   */
  public static evaluateAtapBajaRingan(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 12.0);
    const L = new Decimal(inputs.L ?? 8.0);
    const Ov = new Decimal(inputs.overhang ?? inputs.overhangPanjang ?? 0.8);
    const sudut = inputs.sudutKemiringan ?? 30;

    const panjangTotal = P.plus(new Decimal(2).times(Ov));
    const lebarTotal = L.plus(new Decimal(2).times(Ov));
    const luasDatar = panjangTotal.times(lebarTotal);

    const rad = (sudut * Math.PI) / 180;
    const cosAngle = Math.cos(rad);
    const luasMiring = luasDatar.dividedBy(cosAngle).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luasMiring,
      primaryUnit: 'm²',
      breakdown: { luasDatar: luasDatar.toNumber(), luasMiring },
      sourceFormula: '((P+2*Ov)*(L+2*Ov))/cos(rad)',
    };
  }

  /**
   * 12. Plesteran & Acian: Luas = LuasDinding * 2
   */
  public static evaluatePlesteranAcian(inputs: Record<string, number>): ReferenceEvaluationResult {
    const luas = new Decimal(inputs.luasDinding ?? 105.0);
    const faktorSisi = inputs.duaSisi === 0 ? 1 : 2;

    const total = luas.times(faktorSisi).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: total,
      primaryUnit: 'm²',
      breakdown: { luasPlesteran: total },
      sourceFormula: 'luasDinding * faktorSisi',
    };
  }

  /**
   * 13. Penutup Lantai: Luas = P * L
   */
  public static evaluatePenutupLantai(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 10.0);
    const L = new Decimal(inputs.L ?? 8.0);

    const luas = P.times(L).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luas,
      primaryUnit: 'm²',
      breakdown: { luasLantai: luas },
      sourceFormula: 'P * L',
    };
  }

  /**
   * 14. Penutup Dinding: Luas = (K * H - Abukaan) * 1.05
   */
  public static evaluatePenutupDinding(inputs: Record<string, number>): ReferenceEvaluationResult {
    const K = new Decimal(inputs.K ?? 8.0);
    const H = new Decimal(inputs.H ?? 2.40);
    const Abukaan = new Decimal(inputs.Abukaan ?? 1.80);

    const luas = K.times(H).minus(Abukaan).times(1.05).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luas,
      primaryUnit: 'm²',
      breakdown: { luasDindingKeramik: luas },
      sourceFormula: '(K*H - Abukaan)*1.05',
    };
  }

  /**
   * 15. Plafon: Luas = P * L
   */
  public static evaluatePlafon(inputs: Record<string, number>): ReferenceEvaluationResult {
    const P = new Decimal(inputs.P ?? 10.0);
    const L = new Decimal(inputs.L ?? 8.0);

    const luas = P.times(L).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: luas,
      primaryUnit: 'm²',
      breakdown: { luasPlafon: luas },
      sourceFormula: 'P * L',
    };
  }

  /**
   * 16. Pengecatan: Luas = LuasInterior + LuasEksterior + LuasPlafon
   */
  public static evaluatePengecatan(inputs: Record<string, number>): ReferenceEvaluationResult {
    const Lint = new Decimal(inputs.luasInterior ?? 140.0);
    const Leks = new Decimal(inputs.luasEksterior ?? 70.0);
    const Lplf = new Decimal(inputs.luasPlafon ?? 80.0);

    const total = Lint.plus(Leks).plus(Lplf).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: total,
      primaryUnit: 'm²',
      breakdown: { luasCatTotal: total },
      sourceFormula: 'luasInterior + luasEksterior + luasPlafon',
    };
  }

  /**
   * 17. Kelistrikan: Total = nLampu + nStopKontak + nSaklar1 + nSaklar2
   */
  public static evaluateKelistrikan(inputs: Record<string, number>): ReferenceEvaluationResult {
    const nL = new Decimal(inputs.nLampu ?? 18);
    const nSK = new Decimal(inputs.nStopKontak ?? 12);
    const nS1 = new Decimal(inputs.nSaklarTunggal ?? 6);
    const nS2 = new Decimal(inputs.nSaklarGanda ?? 4);

    const total = nL.plus(nSK).plus(nS1).plus(nS2).toNumber();

    return {
      primaryQuantity: total,
      primaryUnit: 'titik',
      breakdown: { totalTitik: total },
      sourceFormula: 'nLampu + nStopKontak + nSaklarTunggal + nSaklarGanda',
    };
  }

  /**
   * 18. Instalasi Air: Total Panjang = pjgPipaUtama + pjgPipaCabang
   */
  public static evaluateInstalasiAir(inputs: Record<string, number>): ReferenceEvaluationResult {
    const pUtama = new Decimal(inputs.pjgPipaUtama ?? 24.0);
    const pCabang = new Decimal(inputs.pjgPipaCabang ?? 32.0);

    const total = pUtama.plus(pCabang).toDecimalPlaces(2).toNumber();

    return {
      primaryQuantity: total,
      primaryUnit: 'm',
      breakdown: { totalPanjangPipa: total },
      sourceFormula: 'pjgPipaUtama + pjgPipaCabang',
    };
  }

  /**
   * 19. Sanitair: Total = nKD + nKJ + nW + nFD + nShower
   */
  public static evaluateSanitair(inputs: Record<string, number>): ReferenceEvaluationResult {
    const nKD = new Decimal(inputs.nKlosetDuduk ?? 2);
    const nKJ = new Decimal(inputs.nKlosetJongkok ?? 0);
    const nW = new Decimal(inputs.nWastafel ?? 2);
    const nFD = new Decimal(inputs.nFloorDrain ?? 3);
    const nShower = new Decimal(inputs.nShowerSet ?? 2);

    const total = nKD.plus(nKJ).plus(nW).plus(nFD).plus(nShower).toNumber();

    return {
      primaryQuantity: total,
      primaryUnit: 'unit',
      breakdown: { totalSanitair: total },
      sourceFormula: 'SUM(kloset, wastafel, floordrain, shower)',
    };
  }
}
