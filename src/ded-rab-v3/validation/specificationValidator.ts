export interface SpecificationValidationResult {
  isCompatible: boolean;
  dimensionMatch: boolean;
  materialMatch: boolean;
  dedSpec: {
    dimensions: string[];
    materials: string[];
    raw: string;
  };
  ahspSpec: {
    dimensions: string[];
    materials: string[];
    raw: string;
  };
  rejectionReasons: string[];
  confidence: number; // 0-100
}

const MATERIAL_GROUPS = [
  // Masonry
  [['bata merah'], ['bata ringan', 'hebel'], ['batako']],
  // Frames
  [['aluminium', 'alumunium'], ['kayu'], ['upvc']],
  // Panels/Ceilings
  [['gypsum', 'gipsum'], ['triplek', 'multipleks', 'plywood'], ['grc'], ['pvc']],
  // Roofing
  [['spandek', 'spandec'], ['genteng'], ['asbes'], ['polycarbonate']],
  // Flooring
  [['keramik'], ['granit', 'granite'], ['marmer'], ['vinyl']],
  // Metals
  [['baja ringan'], ['baja berat', 'baja wf', 'wf']]
];

export class SpecificationValidator {
  private static instance: SpecificationValidator;

  private constructor() {}

  public static getInstance(): SpecificationValidator {
    if (!SpecificationValidator.instance) {
      SpecificationValidator.instance = new SpecificationValidator();
    }
    return SpecificationValidator.instance;
  }

  public validate(dedItemName: string, dedItemSpec: string, ahspName: string, ahspUnit: string): SpecificationValidationResult {
    const dedFull = `${dedItemName} ${dedItemSpec || ''}`.toLowerCase();
    const ahspFull = ahspName.toLowerCase();
    
    const dedDims = this.extractDimensions(dedFull);
    const ahspDims = this.extractDimensions(ahspFull);
    
    const dedMats = this.extractMaterials(dedFull);
    const ahspMats = this.extractMaterials(ahspFull);
    
    const dimCompatible = this.areDimensionsCompatible(dedDims, ahspDims);
    const matCompatible = this.areMaterialsCompatible(dedMats, ahspMats);
    
    const rejectionReasons: string[] = [];
    if (!dimCompatible) {
      rejectionReasons.push(`Dimension conflict: DED specifies [${dedDims.join(', ')}] but AHSP specifies [${ahspDims.join(', ')}]`);
    }
    if (!matCompatible) {
      rejectionReasons.push(`Material conflict: DED specifies [${dedMats.join(', ')}] but AHSP specifies [${ahspMats.join(', ')}]`);
    }
    
    const isCompatible = dimCompatible && matCompatible;
    
    let confidence = 50; // Base neutral confidence
    let dimensionMatch = false;
    let materialMatch = false;

    if (!isCompatible) {
      confidence = 0;
    } else {
      // Evaluate dimension matching
      if (dedDims.length > 0 && ahspDims.length > 0 && dedDims.some(d => ahspDims.includes(d))) {
        dimensionMatch = true;
        confidence += 25;
      }
      
      // Evaluate material matching
      if (dedMats.length > 0 && ahspMats.length > 0 && dedMats.some(m => ahspMats.includes(m))) {
        materialMatch = true;
        confidence += 25;
      }
    }
    
    return {
      isCompatible,
      dimensionMatch,
      materialMatch,
      dedSpec: {
        dimensions: dedDims,
        materials: dedMats,
        raw: dedItemSpec || ''
      },
      ahspSpec: {
        dimensions: ahspDims,
        materials: ahspMats,
        raw: ahspName
      },
      rejectionReasons,
      confidence
    };
  }

  public extractDimensions(text: string): string[] {
    const dims: string[] = [];
    const lowerText = text.toLowerCase();
    
    // WxH or W x H (e.g., 40x40, 15 x 20)
    const nxnRegex = /\b\d+\s*x\s*\d+\b/g;
    const nxnMatch = lowerText.match(nxnRegex);
    if (nxnMatch) {
      dims.push(...nxnMatch.map(m => m.replace(/\s/g, '')));
    }

    // Inches (e.g., 1/2", 3", 1 1/2")
    const inchRegex = /\b(\d+\s+)?\d+(\/\d+)?"/g;
    const inchMatch = lowerText.match(inchRegex);
    if (inchMatch) {
      dims.push(...inchMatch);
    }

    // Thickness in mm (e.g., tebal 15 mm, 15mm, 15 mm)
    const mmRegex = /(?:tebal\s+)?\b\d+(?:\.\d+)?\s*mm\b/g;
    const mmMatch = lowerText.match(mmRegex);
    if (mmMatch) {
      // Normalize spaces
      dims.push(...mmMatch.map(m => m.replace(/\s+/g, ' ').trim()));
    }

    // Dimensions in cm (e.g., 10 cm, 15cm)
    const cmRegex = /\b\d+(?:\.\d+)?\s*cm\b/g;
    const cmMatch = lowerText.match(cmRegex);
    if (cmMatch) {
      dims.push(...cmMatch.map(m => m.replace(/\s+/g, ' ').trim()));
    }

    // Remove duplicates
    return [...new Set(dims)];
  }

  public extractMaterials(text: string): string[] {
    const materials: string[] = [];
    const lowerText = text.toLowerCase();
    
    for (const group of MATERIAL_GROUPS) {
      for (const aliases of group) {
        for (const alias of aliases) {
          const regex = new RegExp(`\\b${alias}\\b`, 'i');
          if (regex.test(lowerText)) {
            materials.push(aliases[0]); // Always use the primary canonical name
            break; // Found a match in this alias list, move to next
          }
        }
      }
    }
    
    return [...new Set(materials)];
  }

  public areDimensionsCompatible(dedDims: string[], ahspDims: string[]): boolean {
    if (dedDims.length === 0 || ahspDims.length === 0) return true; // Benefit of the doubt
    
    // Check NxN dimension compatibility
    const getNxN = (dims: string[]) => dims.filter(d => /\d+x\d+/.test(d));
    const dedNxN = getNxN(dedDims);
    const ahspNxN = getNxN(ahspDims);
    
    if (dedNxN.length > 0 && ahspNxN.length > 0) {
      const hasCommon = dedNxN.some(d => ahspNxN.includes(d));
      if (!hasCommon) return false;
    }
    
    // Check Inch dimension compatibility
    const getInches = (dims: string[]) => dims.filter(d => /"/.test(d));
    const dedInches = getInches(dedDims);
    const ahspInches = getInches(ahspDims);
    
    if (dedInches.length > 0 && ahspInches.length > 0) {
      const hasCommon = dedInches.some(d => ahspInches.includes(d));
      if (!hasCommon) return false;
    }

    // Check mm thickness compatibility (e.g. 5 mm vs 8 mm, tebal 15 mm)
    const getMm = (dims: string[]) => dims.filter(d => /\d+(?:\.\d+)?\s*mm/.test(d)).map(d => d.replace(/tebal\s+/g, '').replace(/\s+/g, ''));
    const dedMm = getMm(dedDims);
    const ahspMm = getMm(ahspDims);
    if (dedMm.length > 0 && ahspMm.length > 0) {
      const hasCommon = dedMm.some(d => ahspMm.includes(d));
      if (!hasCommon) return false;
    }

    // Check cm dimension compatibility
    const getCm = (dims: string[]) => dims.filter(d => /\d+(?:\.\d+)?\s*cm/.test(d)).map(d => d.replace(/\s+/g, ''));
    const dedCm = getCm(dedDims);
    const ahspCm = getCm(ahspDims);
    if (dedCm.length > 0 && ahspCm.length > 0) {
      const hasCommon = dedCm.some(d => ahspCm.includes(d));
      if (!hasCommon) return false;
    }
    
    return true;
  }

  public areMaterialsCompatible(dedMats: string[], ahspMats: string[]): boolean {
    if (dedMats.length === 0 || ahspMats.length === 0) return true; // Benefit of the doubt
    
    for (const group of MATERIAL_GROUPS) {
      // Find if DED and AHSP have materials belonging to this specific categorical group
      const dedInGroup = dedMats.filter(m => group.some(aliases => aliases[0] === m));
      const ahspInGroup = ahspMats.filter(m => group.some(aliases => aliases[0] === m));
      
      if (dedInGroup.length > 0 && ahspInGroup.length > 0) {
        // Both specify a material in this category, so they must overlap
        const hasCommon = dedInGroup.some(m => ahspInGroup.includes(m));
        if (!hasCommon) return false;
      }
    }
    
    return true;
  }
}

export const specificationValidator = SpecificationValidator.getInstance();
