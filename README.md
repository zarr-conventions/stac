# STAC Zarr Convention

- **UUID**: b3703368-7e7e-4e8e-9e0e-6d0f0d5e8e8e
- **Name**: stac:
- **Schema URL**: https://raw.githubusercontent.com/zarr-conventions/stac/refs/tags/v0.1/schema.json
- **Spec URL**: https://github.com/zarr-conventions/stac/blob/v0.1/README.md
- **Scope**: Group
- **Extension Maturity Classification**: Proposal
- **Owner**: @emmanuelmathot

This convention defines a standard way to attach [STAC](https://stacspec.org/) (SpatioTemporal Asset Catalog) metadata to a Zarr group. It covers two patterns: embedding a complete STAC Item or Collection directly in the group's attributes, or pointing to the canonical STAC object at an external location. Either way, the Zarr group carries enough information for a STAC-aware tool to discover, describe, and validate the data.

## Table of Contents

- [Overview](#overview)
- [Status](#status)
- [Motivation](#motivation)
- [Convention Attributes](#convention-attributes)
- [Scope of the Embedded STAC Object](#scope-of-the-embedded-stac-object)
- [STAC URL Resolution](#stac-url-resolution)
- [Collection Array Storage (Experimental)](#collection-array-storage-experimental)
- [Examples](#examples)
- [Validation](#validation)
- [Known Implementations](#known-implementations)

## Overview

The STAC Zarr Convention supports two patterns:

1. **Metadata Sidecar**: attach STAC metadata to a Zarr group as the source of truth (or a pointer to the source of truth) for a single dataset. Use the `attribute` encoding to embed the object, or the `link` encoding to point to it at an external location. This is the stable part of the convention.
2. **Collection Array Storage**: store a whole STAC Collection's worth of items as a multidimensional array, indexed by space and time, using the `array` encoding. This pattern is experimental — see [Status](#status).

## Status

- **`attribute` and `link` encodings** are stable enough to build on. They have a JSON Schema, validated examples, and a settled attribute model.
- **`array` encoding** is an early-stage experiment. It has no JSON Schema, no validated examples, and its on-disk layout is still open for discussion. Do not build production tooling against it yet. Read [Collection Array Storage](#collection-array-storage-experimental) for the current thinking, and use the issue tracker to weigh in before it stabilizes.

## Motivation

Zarr conventions offer a place to attach STAC metadata to array data, without requiring a separate catalog service to describe that data.

### Why Metadata Sidecar

For individual datasets, attaching STAC metadata this way gives:

1. **Self-Describing Data**: the Zarr group carries the metadata needed for discovery and description.
2. **Simplified Distribution**: one Zarr store carries both data and metadata.
3. **Offline Capability**: no external catalog service is needed to understand the data.
4. **STAC Compliance**: the embedded object is a real STAC Item or Collection, so standard STAC tools and validators work on it directly.
5. **Producer Choice**: `attribute` embeds the object for full offline use; `link` keeps the Zarr store small and defers to a catalog that is already the source of truth (see [Issue #1](https://github.com/zarr-conventions/stac/issues/1)).

### Why Collection Array Storage (experimental)

For large catalogs, storing STAC items as arrays instead of one JSON document per item could give:

1. **Scalable Storage**: a large collection of STAC items is held in sparse multidimensional arrays, instead of one JSON document per item.
2. **Spatiotemporal Indexing**: space-time dimensions allow direct, native queries.
3. **Unified Architecture**: one system serves both catalog storage and data access.
4. **Performance**: Zarr's chunked, multidimensional slicing applies to catalog search, too.

This pattern is unproven. Treat the benefits above as the hypothesis this experiment is testing, not a guarantee.

## Convention Attributes

This convention defines attributes at the group level of the Zarr hierarchy.
The convention uses the **key-prefixed pattern** to avoid attribute name collisions with other conventions.

**Convention metadata name**: `stac:`

### Fields

| Field Name | Type | Description |
|---|---|---|
| `stac:encoding` | string | **REQUIRED**. Encoding type for the STAC object. |
| `stac:item` | [STAC Item](https://github.com/radiantearth/stac-spec/tree/master/item-spec) or [Link Object](#stacencoding) | A STAC Item, or a link to one, depending on `stac:encoding`. |
| `stac:collection` | [STAC Collection](https://github.com/radiantearth/stac-spec/tree/master/collection-spec) or [Link Object](#stacencoding) | A STAC Collection, or a link to one, depending on `stac:encoding`. |

Exactly one of `stac:item` or `stac:collection` MUST be present. A group cannot carry both an Item and a Collection at once.

### `stac:encoding`

Specifies how the STAC object relates to the Zarr group. Valid values are:

- **`attribute`** (Metadata Sidecar, stable): `stac:item` or `stac:collection` holds the complete STAC object, embedded directly as JSON in the Zarr group attributes. This is the authoritative source of truth for the assets it lists — see [Scope of the Embedded STAC Object](#scope-of-the-embedded-stac-object).
- **`link`** (Metadata Sidecar, stable): `stac:item` or `stac:collection` holds a [STAC Link Object](https://github.com/radiantearth/stac-spec/blob/master/commons/links.md) — `{"href": "...", "rel": "...", "type": "..."}` — pointing to the canonical STAC object at an external location, typically a STAC API. Use this when a catalog, not the Zarr store, is the source of truth: the Zarr store stays small, and readers follow `href` to get the full object. `href` MUST be an absolute URL; it is not resolved against the Zarr store.
- **`array`** (Collection Array Storage, **experimental**): `stac:item` or `stac:collection` holds a relative path to an array node that stores STAC objects as data. See [Collection Array Storage](#collection-array-storage-experimental). Not covered by the JSON Schema yet.

**Example — `attribute` encoding:**

```json
{
  "stac:encoding": "attribute",
  "stac:item": { "type": "Feature", "id": "...", "...": "..." }
}
```

**Example — `link` encoding:**

```json
{
  "stac:encoding": "link",
  "stac:item": {
    "rel": "self",
    "type": "application/geo+json",
    "href": "https://api.example.com/stac/collections/sentinel-2-l2a/items/S2C_..."
  }
}
```

> Earlier drafts of this convention defined a `key` encoding, which pointed to a separate JSON document stored as a sibling key inside the same Zarr store (e.g. `stac.json` next to `zarr.json`). It has been removed: Zarr v3 tooling (Icechunk, VirtualiZarr, and generic store movers) does not expect keys outside `zarr.json` and array chunks, so writing one is unsafe. `link` replaces it for the "the STAC object lives elsewhere" case — the difference is that `link` points to a URL outside the store, not a key inside it. See [Issue #2](https://github.com/zarr-conventions/stac/issues/2).

### Convention Metadata

The convention is identified in the `zarr_conventions` array with the following metadata:

```json
{
  "zarr_conventions": [
    {
      "name": "stac:",
      "spec_url": "https://github.com/zarr-conventions/stac/blob/v0.1/README.md",
      "schema_url": "https://raw.githubusercontent.com/zarr-conventions/stac/refs/tags/v0.1/schema.json",
      "uuid": "b3703368-7e7e-4e8e-9e0e-6d0f0d5e8e8e"
    }
  ]
}
```

At minimum, one of `spec_url`, `schema_url`, or `uuid` must be present to identify the convention.

**This declaration is what makes the convention visible.** A group that carries `stac:item` or `stac:collection` without a matching entry in `zarr_conventions` is not conformant, and a spec-compliant reader has no way to know the attribute is there or how to interpret it. If your producer already emits STAC-shaped metadata under a different, undeclared attribute name (for example `stac_discovery`), the fix is to declare it here — see [Scope of the Embedded STAC Object](#scope-of-the-embedded-stac-object) for what else has to be true before that metadata counts as conformant.

## Scope of the Embedded STAC Object

This section applies to the `attribute` encoding, where the Zarr group carries the actual STAC object. It answers one question: is that object an authoritative STAC Item that a catalog can ingest as-is, or a producer-side hint that a catalog is expected to transform? This convention takes a clear position:

**The embedded object MUST be a complete, valid STAC Item or Collection under `attribute` encoding.** It is authoritative for every asset it lists. In particular:

1. **Assets describe publishable entities, not internal storage nodes.** An asset SHOULD correspond to one logical variable or measurement group — the thing a downstream catalog would also expose as one asset — not to every array or intermediate group in the store's hierarchy. A reflectance cube with twelve bands at three resolutions is one asset (`reflectance`, pointing at the multiscale group, with `bands` and `cube:dimensions` describing the internals), not twelve-times-three assets. [`examples/sentinel2_item_example.json`](examples/sentinel2_item_example.json) shows this pattern: `reflectance`, `AOT_10m`, and `SCL_20m` are three assets, each with a `title`, `type`, `roles`, and enough STAC extension metadata (`raster:`, `proj:`, `cube:`) for a client to use the asset directly. An asset with only `href` and `title` fails this requirement — it is a node index, not a STAC asset.
2. **`id` SHOULD be stable across representations.** If the same product is also served by an external catalog, producers SHOULD use the same `id` in both places. This convention cannot force a catalog to reuse an embedded `id` verbatim — a catalog may have its own uniqueness constraints — but a producer that silently changes the `id` between the in-store copy and the catalog copy breaks the one thing self-description is for: letting a consumer correlate the two.
3. **Links are optional context, not a dependency.** Per [Store Link Omission](#store-link-omission), the `store` link MUST be omitted. Other links (`collection`, `parent`, `root`, `self`, `license`, `cite-as`, …) MAY be included and typically point to external resources. A consumer without network access can still use the embedded object fully; a consumer with network access gets extra context from these links.

A group that only meets some of these — for example, one asset per array with no roles or type, and an `id` that a downstream catalog silently reassigns — is not yet conformant `attribute` encoding. Producers in that position have two honest options: fix the object so it satisfies the three points above, or use `link` encoding and let the catalog that already holds the well-formed object be the source of truth.

## STAC URL Resolution

### Asset Href Resolution

This section applies to the `attribute` encoding only. Under `link` encoding, the referenced object's own hrefs are resolved by whatever store it actually lives in — this convention has no say over them.

All asset `href` values in an embedded STAC object **MUST** be relative to the Zarr group containing the STAC metadata. This ensures:

- **Portability**: the Zarr store can be moved without breaking references.
- **Scope**: STAC objects can only reference assets within their own hierarchy.
- **Simplicity**: path resolution is straightforward and predictable.

#### Resolution Rules

1. Asset `href` paths are resolved relative to the group containing the `stac:item` or `stac:collection` attribute.
2. Paths use forward slashes (`/`) as separators, following POSIX conventions.
3. Paths should not use `..` to reference parent groups. A STAC object should only describe its own hierarchy.

#### Asset Examples

If STAC metadata is embedded at the root group (`/`):

```json
{
  "assets": {
    "reflectance": {
      "href": "measurements/reflectance" // → /measurements/reflectance
    },
    "quality": {
      "href": "quality/flags" // → /quality/flags
    }
  }
}
```

If STAC metadata is embedded in a subgroup (`/products/s2/`):

```json
{
  "assets": {
    "data": {
      "href": "data/b01" // → /products/s2/data/b01
    }
  }
}
```

### Store Link Omission

[The STAC `store` link relationship](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md#store-link-relationship) **MUST** be omitted from embedded STAC objects. Since the STAC object is embedded within the Zarr store itself, a store link would be self-referential and redundant.

Other link relationships (e.g., `collection`, `parent`, `self`, `license`) may be included as needed, typically pointing to external resources.

## Collection Array Storage (Experimental)

*This section is experimental and open for community feedback. There is no JSON Schema and no validated example for this encoding yet — see [Status](#status).*

`array` encoding stores a set of STAC objects — for example, a whole Collection's items — as data array(s) within the Zarr store, instead of one JSON document per item. There is no real benefit to storing a single STAC object this way, but it is supported for completeness. With this encoding, the `stac:item` or `stac:collection` attribute holds a relative path to the array node.

### STAC Array Structure

The array encoding would use Zarr's multidimensional array capabilities to store STAC metadata as **[sparse arrays](https://github.com/zarr-developers/zarr-specs/issues/245) with labeled space-time dimensions**.
This approach aligns naturally with core STAC metadata, and could provide:

- **Scalability**: support for millions of STAC items through chunked storage and spatial indexing.
- **Natural Indexing**: space-time dimensions give native spatial and temporal query capabilities.
- **Consistency**: a single source of truth for both data and metadata within the same Zarr store.
- **Performance**: efficient multidimensional slicing for spatial and temporal queries.

#### Dimensional Structure

STAC metadata would be organized as a sparse multidimensional array with the following dimensions:

- **Time dimension**: indexed by STAC Item `datetime` (or time range for multi-temporal items).
- **Spatial dimensions**: indexed by spatial coordinates in any CRS (lat/lon, UTM, etc.).
- **Cell content**: each non-empty cell holds the complete STAC Item metadata as structured data.

#### Coordinate Systems and Indexing

**Temporal Coordinate**

- Primary temporal index using STAC Item `datetime`.
- Can use any time resolution (milliseconds to years) depending on data density.
- Supports labeled dimensions for non-uniform time intervals.

**Spatial Coordinates**

- Flexible spatial reference system (any CRS supported).
- Could use geographic coordinates (lat/lon) for global collections.
- Could use projected coordinates (UTM, etc.) for regional collections.
- Could use grid references (MGRS, tile indices) for regular grids.
- Supports labeled dimensions for irregular spatial sampling.

#### Example Structure

For a Sentinel-2 collection organized by MGRS tiles:

```
/stac_items/
├── zarr.json          # Array metadata defining dimensions and coordinates
├── datetime/          # Temporal coordinate array (1D)
├── mgrs_tile/         # Spatial coordinate array (1D)
├── geometry/           # Geometry data per item (2D: time × space)
├── assets/            # Asset references per item (2D: time × space)
├── properties/        # Flattened properties per item (2D: time × space)
└── links/             # Flattened links per item (2D: time × space)
```

**Coordinate Arrays:**

- `datetime`: `["2024-01-01T10:30:00Z", "2024-01-02T10:30:00Z", ...]`
- `mgrs_tile`: `["32TQQ", "32TQR", "32TQL", ...]`

**Data Arrays:**

- `metadata`: 2D sparse array where `metadata[t, s]` holds the STAC Item at time `t` and location `s`.
- Most cells are empty (sparse), but where data exists, it holds complete STAC metadata.

## Examples

- [Minimal STAC Item](examples/minimal_item_example.json) — a minimal example showing the required fields, `attribute` encoding.
- [STAC Collection](examples/collection_example.json) — embedding a STAC Collection, `attribute` encoding.
- [Sentinel-2 Scene](examples/sentinel2_item_example.json) — Sentinel-2 L2A data with multiple group-level assets, bands, and extensions, `attribute` encoding. This is the reference example for [asset granularity](#scope-of-the-embedded-stac-object).
- [External Link](examples/link_item_example.json) — pointing to a canonical STAC Item hosted in an external STAC API, `link` encoding.

## Validation

### Schema Validation

The convention includes a JSON Schema that validates:

1. **Convention Structure**: ensures proper `zarr_conventions` metadata.
2. **Encoding Field**: validates the `stac:encoding` value (`attribute` or `link`; `array` is not yet covered — see [Status](#status)).
3. **Mutual Exclusivity**: ensures only one of `stac:item` or `stac:collection` is present.
4. **STAC Compliance**: references official STAC schemas for Item and Collection validation under `attribute` encoding.

### Validation Tools

You can validate examples using the included validation script:

```bash
npm install
npm test
```

Or validate a specific file:

```bash
node validate.js schema.json examples/minimal_item_example.json
```

### STAC Validation

Since an object embedded with `attribute` encoding is a complete STAC Item or Collection, it can be validated using standard STAC validation tools:

```bash
# Extract the STAC object from Zarr metadata
jq '.attributes["stac:item"]' examples/minimal_item_example.json > item.json

# Validate with stac-validator (Python)
stac-validator item.json
```

### Asset Organization

Follow [STAC Zarr Best Practices](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md) for:

- Asset hierarchy and organization.
- Band representation patterns.
- Multi-resolution data (multiscales).
- Variable and dimension metadata.

## Known Implementations

This section helps potential implementers assess the convention's maturity and adoption.

### Libraries and Tools

_If you implement or use this convention, please add your implementation by submitting a pull request._

### Datasets Using This Convention

_If your dataset uses this convention, please add it here by submitting a pull request._

## References

Related specifications:

- [STAC Specification](https://github.com/radiantearth/stac-spec)
- [STAC Link Object](https://github.com/radiantearth/stac-spec/blob/master/commons/links.md)
- [Zarr v3 Specification](https://zarr-specs.readthedocs.io/en/latest/v3/)
- [STAC Zarr Best Practices](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md)
- [Zarr Conventions Specification](https://github.com/zarr-conventions/zarr-conventions-spec)
- [STAC in Zarr — ESRIN Rome sprint notes, Oct 2025](https://github.com/radiantearth/community-sprints/blob/main/2025-10-14-esrin-rome-italy/sprint-notes/STAC%20in%20Zarr.md)
- [Why Arrays as a universal data model](https://www.tiledb.com/blog/why-arrays-as-a-universal-data-model)
