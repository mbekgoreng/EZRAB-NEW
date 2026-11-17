/**
 * AHSP VERSION POINTER — AUTO-GENERATED (Master Pricing §8).
 * DO NOT EDIT BY HAND — regenerate with:
 *   npm run ahsp:versions
 * Source: data/ahsp2026/versions/active-versions.json
 *
 * The active version per family + the registry records for all known
 * versions. The runtime builds its registry state from this module
 * (see buildRegistryState in ahspVersioning.ts). The pointer moves
 * ONLY via publish (Mode B) or a validated direct-edit apply (Mode A).
 */
import type {
  AhspFamily,
  AhspVersionRecord,
} from './ahspVersioning';

export const AHSP_VERSION_POINTER_GENERATED_AT = "2026-11-17T06:38:44.335Z";

export const ACTIVE_AHSP_VERSIONS: Readonly<Record<AhspFamily, string>> = {
  "CIPTA_KARYA": "2026.2",
  "BINA_MARGA": "2026.1",
  "SUMBER_DAYA_AIR": "2026.2",
  "SMKK": "2026.1"
} as const;

export const AHSP_VERSION_RECORDS: readonly AhspVersionRecord[] = [
  {
    "family": "BINA_MARGA",
    "versionId": "2026.1",
    "status": "ACTIVE",
    "createdFrom": null,
    "createdBy": null,
    "createdAt": "2026-11-15T22:57:08.987Z",
    "reason": "Baseline as-is v2026.1: the runtime AHSP catalog as generated 2026-10-20, frozen without content change (Master Pricing §8).",
    "contentChecksum": "08082e878d4f0e90",
    "contentProvenance": "CANONICAL_BASELINE",
    "snapshotPath": "data/ahsp2026/versions/BINA_MARGA/2026.1.json",
    "itemCount": 1137,
    "publishedAt": "2026-11-15T22:57:08.987Z",
    "publishedBy": null
  },
  {
    "family": "CIPTA_KARYA",
    "versionId": "2026.1",
    "status": "SUPERSEDED",
    "createdFrom": null,
    "createdBy": null,
    "createdAt": "2026-11-15T22:57:08.987Z",
    "reason": "Baseline as-is v2026.1: the runtime AHSP catalog as generated 2026-10-20, frozen without content change (Master Pricing §8).",
    "contentChecksum": "e0b539f134f8d64c",
    "contentProvenance": "CANONICAL_BASELINE",
    "snapshotPath": "data/ahsp2026/versions/CIPTA_KARYA/2026.1.json",
    "itemCount": 2859,
    "publishedAt": "2026-11-15T22:57:08.987Z",
    "publishedBy": null
  },
  {
    "family": "CIPTA_KARYA",
    "versionId": "2026.2",
    "status": "ACTIVE",
    "createdFrom": "2026.1",
    "createdBy": null,
    "createdAt": "2026-11-17T06:38:31.336Z",
    "reason": "Ronde 2 (17 Nov 2026): pembersihan master AHSP + adopsi 343 harga pasar + revert koefisien sub-header Media Tanam/Steger/Tutup Beton ke 0.0",
    "contentChecksum": "0281ba316496e839",
    "contentProvenance": "PIPELINE_REGENERATED",
    "snapshotPath": "data/ahsp2026/versions/CIPTA_KARYA/2026.2.json",
    "itemCount": 2859,
    "publishedAt": "2026-11-17T06:38:35.603Z",
    "publishedBy": null
  },
  {
    "family": "SMKK",
    "versionId": "2026.1",
    "status": "ACTIVE",
    "createdFrom": null,
    "createdBy": null,
    "createdAt": "2026-11-15T22:57:08.987Z",
    "reason": "Baseline as-is v2026.1: the runtime AHSP catalog as generated 2026-10-20, frozen without content change (Master Pricing §8).",
    "contentChecksum": "e77bbc73b1fea331",
    "contentProvenance": "CANONICAL_BASELINE",
    "snapshotPath": "data/ahsp2026/versions/SMKK/2026.1.json",
    "itemCount": 190,
    "publishedAt": "2026-11-15T22:57:08.987Z",
    "publishedBy": null
  },
  {
    "family": "SUMBER_DAYA_AIR",
    "versionId": "2026.1",
    "status": "SUPERSEDED",
    "createdFrom": null,
    "createdBy": null,
    "createdAt": "2026-11-15T22:57:08.987Z",
    "reason": "Baseline as-is v2026.1: the runtime AHSP catalog as generated 2026-10-20, frozen without content change (Master Pricing §8).",
    "contentChecksum": "1c4794f9ec5dc3e1",
    "contentProvenance": "CANONICAL_BASELINE",
    "snapshotPath": "data/ahsp2026/versions/SUMBER_DAYA_AIR/2026.1.json",
    "itemCount": 1556,
    "publishedAt": "2026-11-15T22:57:08.987Z",
    "publishedBy": null
  },
  {
    "family": "SUMBER_DAYA_AIR",
    "versionId": "2026.2",
    "status": "ACTIVE",
    "createdFrom": "2026.1",
    "createdBy": null,
    "createdAt": "2026-11-17T06:38:40.865Z",
    "reason": "Ronde 2 (17 Nov 2026): pembersihan master AHSP + adopsi 343 harga pasar (unit-fix, rename, karantina fragmen)",
    "contentChecksum": "b43fd8a665fbdb54",
    "contentProvenance": "PIPELINE_REGENERATED",
    "snapshotPath": "data/ahsp2026/versions/SUMBER_DAYA_AIR/2026.2.json",
    "itemCount": 1556,
    "publishedAt": "2026-11-17T06:38:44.335Z",
    "publishedBy": null
  }
];
