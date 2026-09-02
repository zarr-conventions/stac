# STAC Zarr Convention

- **UUID**: b3703368-7e7e-4e8e-9e0e-6d0f0d5e8e8e
- **Name**: stac:
- **Schema URL**: https://raw.githubusercontent.com/zarr-conventions/stac/refs/tags/v0.1/schema.json
- **Spec URL**: https://github.com/zarr-conventions/stac/blob/v0.1/README.md
- **Scope**: Group
- **Extension Maturity Classification**: Proposal
- **Owner**: @emmanuelmathot

This convention defines a standard way to attach [STAC](https://stacspec.org/) (SpatioTemporal Asset Catalog) metadata to a Zarr group. It defines four fields, each with one fixed shape and one job: embed a complete STAC Item or Collection directly in the group's attributes, reference a separate JSON value stored elsewhere in the same Zarr store, or point to the canonical STAC object at an external location. Which field is present tells a reader everything it needs to know and the Zarr group carries enough information for a STAC-aware tool to discover, describe, and validate the data.

## Table of Contents

- [Overview](#overview)
- [Status](#status)
- [Motivation](#motivation)
- [Convention Attributes](#convention-attributes)
- [Applicable To](#applicable-to)
- [Scope of the Embedded STAC Object](#scope-of-the-embedded-stac-object)
- [STAC URL Resolution](#stac-url-resolution)
- [Collection Array Storage (Experimental)](#collection-array-storage-experimental)
- [Examples](#examples)
- [Validation](#validation)
- [Known Implementations](#known-implementations)

## Overview

The STAC Zarr Convention supports two patterns:

1. **Metadata Sidecar**: attach STAC metadata to a Zarr group as the source of truth (or a pointer to the source of truth) for a single dataset. Use `stac:item` or `stac:collection` to embed the object directly, `stac:key` to reference a separate JSON value elsewhere in the same store, or `stac:link` to point to it at an external location. This is the stable part of the convention.
2. **Collection Array Storage**: store a whole STAC Collection's worth of items as a multidimensional array, indexed by space and time, using `stac:array`. This pattern is experimental — see [Status](#status).

## Status

- **`stac:item`, `stac:collection`, `stac:key`, and `stac:link`** are stable enough to build on. They have a JSON Schema, validated examples, and a settled, single-shape attribute model. This convention deliberately does not pick one as "the" way to attach STAC metadata — see [Choosing a Field](#choosing-a-field) for the trade-offs and why that choice is left to producers.
- **`stac:array`** is an early-stage experiment. It has no JSON Schema, no validated examples, and its on-disk layout is still open for discussion. Do not build production tooling against it yet. Read [Collection Array Storage](#collection-array-storage-experimental) for the current thinking, and use the issue tracker to weigh in before it stabilizes.

## Motivation

Zarr conventions offer a place to attach STAC metadata to array data, without requiring a separate catalog service to describe that data.

### Why Metadata Sidecar

For individual datasets, attaching STAC metadata this way gives:

1. **Self-Describing Data**: the Zarr group carries the metadata needed for discovery and description.
2. **Simplified Distribution**: one Zarr store carries both data and metadata.
3. **Offline Capability**: no external catalog service is needed to understand the data.
4. **STAC Compliance**: the embedded object is a real STAC Item or Collection, so standard STAC tools and validators work on it directly.
5. **Producer Choice**: `stac:item`/`stac:collection` embed the object for full offline use; `stac:key` keeps it out of the attributes while staying inside the same store, for producers serving a static catalog from a plain object store; `stac:link` keeps the Zarr store small and defers to a catalog that is already the source of truth (see [Issue #1](https://github.com/zarr-conventions/stac/issues/1)).

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

Exactly one of the following four fields MUST be present. There is no separate mode or encoding field: each field has exactly one shape, and which field is present is itself the signal for how to interpret it.

| Field Name | Type | Description | Reference |
|---|---|---|---|
| `stac:item` | [STAC Item](https://github.com/radiantearth/stac-spec/tree/master/item-spec) | A complete, embedded STAC Item. | [stac:item / stac:collection](#stacitem-and-staccollection) |
| `stac:collection` | [STAC Collection](https://github.com/radiantearth/stac-spec/tree/master/collection-spec) | A complete, embedded STAC Collection. | [stac:item / stac:collection](#stacitem-and-staccollection) |
| `stac:key` | string | A store-relative key referencing a separate JSON value holding the STAC object. | [stac:key](#stackey) |
| `stac:link` | [Link Object](#staclink) | A pointer to the canonical STAC object at an external location. | [stac:link](#staclink) |

### Choosing a Field

All four fields are stable and equally supported. This convention does not prescribe one as "the" correct way to attach STAC metadata — which to use is a producer decision based on deployment constraints:

- **`stac:item` / `stac:collection`** embed the object directly. Maximum portability: the metadata travels with the store through any tool, including ones that virtualize or move Zarr stores (Icechunk, VirtualiZarr).
- **`stac:key`** references a separate JSON value in the same store. Lets a producer serve a static, file-based catalog (e.g. a `stac.json` next to `zarr.json`) straight from a plain object store over plain HTTP, no query engine required. Tooling that virtualizes or moves a Zarr store by walking only `zarr.json` and chunk keys (Icechunk, VirtualiZarr) doesn't know a referenced key exists, so such an operation can leave it behind.
- **`stac:link`** points at an external canonical STAC object, typically a STAC API. Keeps the Zarr store minimal and defers to a catalog that's already the source of truth. Resolving it needs network access.


### `stac:item` and `stac:collection`

Each holds a complete, valid STAC object, embedded directly as JSON in the Zarr group attributes — never a path, a key, or a link. This is the authoritative source of truth for every asset it lists — see [Scope of the Embedded STAC Object](#scope-of-the-embedded-stac-object).

**Example:**

```json
{
  "stac:item": { "type": "Feature", "id": "...", "...": "..." }
}
```

### `stac:key`

A key (a Unicode string, relative to the group carrying this attribute) referencing a separate JSON value elsewhere in the same Zarr store that holds the STAC object. This is how a producer serves a static, file-based STAC catalog (e.g. a `stac.json` next to `zarr.json`) alongside the data, without duplicating the object into attributes. See [Choosing a Field](#choosing-a-field) for the trade-off against `stac:item`/`stac:collection` and `stac:link`.

`stac:key` doesn't say whether the referenced document is an Item or a Collection — read the document's own `type` field to find out.

**Example:**

```json
{
  "stac:key": "stac.json"
}
```

`stac:key` is not the same as `stac:link`: `stac:key` stays inside the current Zarr store (the referenced JSON is another value in the same abstract store, addressed by a store-relative key); `stac:link` leaves the store entirely (an absolute URL to wherever the object is actually served).

### `stac:link`

A [STAC Link Object](https://github.com/radiantearth/stac-spec/blob/master/commons/links.md) pointing to the canonical STAC object at an external location, typically a STAC API. Use this when a catalog, not the Zarr store, is the source of truth: the Zarr store stays small, and readers follow `href` to get the full object.

| Field Name | Type | Description | Required |
|---|---|---|---|
| `href` | string (URI) | Absolute URL to the canonical STAC Item or Collection. MUST NOT be relative to the Zarr store, since the target lives outside it. | Yes |
| `rel` | string | Link relation type. Defaults to `self` when omitted. | No |
| `type` | string | Media type of the target, e.g. `application/geo+json` for an Item, `application/json` for a Collection. | No |

`stac:link` doesn't say whether the target is an Item or a Collection either — follow `href` and inspect the retrieved object's own `type`, or use the Link Object's own `type` (media type) as a hint before fetching.

**Example:**

```json
{
  "stac:link": {
    "rel": "self",
    "type": "application/geo+json",
    "href": "https://api.example.com/stac/collections/sentinel-2-l2a/items/S2C_..."
  }
}
```

`stac:link` is not the same as the org's [`ref` convention](https://github.com/R-CF/zarr_convention_ref): `ref` points to another *Zarr* node (array, group, or an attribute inside one), addressed by store URI plus a relative or absolute node path. `stac:link` points to a *STAC* resource — usually a STAC API endpoint — which is not necessarily Zarr-addressable at all, and carries STAC's own `rel`/`type` vocabulary instead of a node path. Use `ref` to point at another Zarr object; use `stac:link` to point at a STAC Item or Collection, wherever it is served.

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

**This declaration is what makes the convention visible.** A group that carries `stac:item`, `stac:collection`, `stac:key`, or `stac:link` without a matching entry in `zarr_conventions` is not conformant, and a spec-compliant reader has no way to know the attribute is there or how to interpret it.

## Applicable To

This convention can be used with these parts of the Zarr hierarchy:

- [x] Group
- [ ] Array

## Scope of the Embedded STAC Object

This section applies to `stac:item` and `stac:collection`, where the Zarr group carries the actual STAC object. It answers one question: is that object an authoritative STAC Item that a catalog can ingest as-is, or a producer-side hint that a catalog is expected to transform? This convention takes a clear position:

**The embedded object MUST be a complete, valid STAC Item or Collection.** It is authoritative for every asset it lists. In particular:

1. **Assets follow [STAC Zarr Best Practices' Asset Organization rules](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md#asset-organization) and [Bands Representation](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md#bands-representation) patterns**, which this convention treats as binding rather than restating. [`examples/sentinel2_item_example.json`](examples/sentinel2_item_example.json) is the reference example. An asset with only `href` and `title`, one per array, does not meet this rule — it is a node index, not a STAC asset.
2. **`id` SHOULD be stable across representations.** If the same product is also served by an external catalog, producers SHOULD use the same `id` in both places. This convention cannot force a catalog to reuse an embedded `id` verbatim — a catalog may have its own uniqueness constraints — but a producer that silently changes the `id` between the in-store copy and the catalog copy breaks the one thing self-description is for: letting a consumer correlate the two.
3. **Links are optional context, not a dependency — except `store`, which is intentionally excluded.** STAC Zarr Best Practices recommends a [`store` link](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md#store-link-relationship) so a STAC object can point a client at the root of the Zarr hierarchy it describes. For an object embedded via `stac:item`/`stac:collection`, that link would point back at the store the object is already embedded in — see [Store Link Omission](#store-link-omission) for why this convention excludes it specifically. Everywhere else the best-practices document applies as written: other link relationships (`collection`, `parent`, `root`, `self`, `license`, `cite-as`, …) MAY be included and typically point to external resources.

A group that only meets some of these — for example, one asset per array with no roles or type, and an `id` that a downstream catalog silently reassigns — is not yet a conformant `stac:item`/`stac:collection`. Producers in that position have two honest options: fix the object so it satisfies the three points above, or use `stac:link` and let the catalog that already holds the well-formed object be the source of truth.

## STAC URL Resolution

### Asset Href Resolution

This section applies to `stac:item`, `stac:collection`, and the document referenced by `stac:key` — for all three, the STAC object lives inside the same Zarr store as the attribute that points to it. Under `stac:link`, the referenced object's own hrefs are resolved by whatever store it actually lives in — this convention has no say over them.

All asset `href` values in an embedded STAC object **MUST** be relative to the Zarr group containing the STAC metadata. This ensures:

- **Portability**: the Zarr store can be moved without breaking references.
- **Scope**: STAC objects can only reference assets within their own hierarchy.
- **Simplicity**: path resolution is straightforward and predictable.

#### Resolution Rules

1. Asset `href` paths are resolved relative to the group containing the `stac:item`, `stac:collection`, or `stac:key` attribute — not relative to the keyed document's own location, in the `stac:key` case.
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

[The STAC `store` link relationship](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md#store-link-relationship) **MUST** be omitted from objects embedded via `stac:item`/`stac:collection`.

This is a narrow, deliberate exception to STAC Zarr Best Practices, not a disagreement with it. That document recommends a `store` link so a STAC object can point a client at the root of the Zarr hierarchy it describes — necessary when the object is served separately from the store, e.g. by a STAC API. Embedded objects are different: the object lives inside the very store it describes, so a client that has read it has, by construction, already found the store. A `store` link would point back at itself.

Other link relationships (e.g., `collection`, `parent`, `self`, `license`) may be included as needed, typically pointing to external resources.

## Collection Array Storage (Experimental)

*This section is experimental and open for community feedback. There is no JSON Schema and no validated example for `stac:array` yet — see [Status](#status).*

`stac:array` stores a set of STAC objects — for example, a whole Collection's items — as data array(s) within the Zarr store, instead of one JSON document per item. There is no real benefit to storing a single STAC object this way, but it is supported for completeness. `stac:array` holds a relative path to the array node.

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

- [Minimal STAC Item](examples/minimal_item_example.json) — a minimal example showing the required fields, `stac:item`.
- [STAC Collection](examples/collection_example.json) — embedding a STAC Collection, `stac:collection`.
- [Sentinel-2 Scene](examples/sentinel2_item_example.json) — Sentinel-2 L2A data with multiple group-level assets, bands, and extensions, `stac:item`. This is the reference example for [asset granularity](#scope-of-the-embedded-stac-object).
- [In-Store Key](examples/key_item_example.json) — referencing a separate `stac.json` value in the same store, `stac:key`.
- [External Link](examples/link_item_example.json) — pointing to a canonical STAC Item hosted in an external STAC API, `stac:link`.

## Validation

### Schema Validation

The convention includes a JSON Schema that validates:

1. **Convention Structure**: ensures proper `zarr_conventions` metadata.
2. **Mutual Exclusivity**: ensures exactly one of `stac:item`, `stac:collection`, `stac:key`, or `stac:link` is present (`stac:array` is not yet covered — see [Status](#status)).
3. **STAC Compliance**: references official STAC schemas for Item and Collection validation of `stac:item`/`stac:collection`.

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

Since an object embedded via `stac:item` or `stac:collection` is a complete STAC Item or Collection, it can be validated using standard STAC validation tools:

```bash
# Extract the STAC object from Zarr metadata
jq '.attributes["stac:item"]' examples/minimal_item_example.json > item.json

# Validate with stac-validator (Python)
stac-validator item.json
```

### Asset Organization

This convention does not define its own rules for asset hierarchy, bands, multiscales, or dimension metadata. It defers entirely to [STAC Zarr Best Practices](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md), and treats that document's Asset Organization section as binding for `stac:item`/`stac:collection` — see [Scope of the Embedded STAC Object](#scope-of-the-embedded-stac-object).

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
- [`ref` — Referencing external objects from a Zarr array or group](https://github.com/R-CF/zarr_convention_ref)
- [STAC in Zarr — ESRIN Rome sprint notes, Oct 2025](https://github.com/radiantearth/community-sprints/blob/main/2025-10-14-esrin-rome-italy/sprint-notes/STAC%20in%20Zarr.md)
- [Why Arrays as a universal data model](https://www.tiledb.com/blog/why-arrays-as-a-universal-data-model)
