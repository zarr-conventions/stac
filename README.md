# STAC Zarr Convention

- **UUID**: b3703368-7e7e-4e8e-9e0e-6d0f0d5e8e8e
- **Name**: stac:
- **Schema URL**: https://raw.githubusercontent.com/zarr-conventions/stac/refs/tags/v1/schema.json
- **Spec URL**: https://github.com/zarr-conventions/stac/blob/v1/README.md
- **Scope**: Group
- **Extension Maturity Classification**: Proposal
- **Owner**: @emmanuelmathot

This convention defines a standard way to embed complete [STAC](https://stacspec.org/) (SpatioTemporal Asset Catalog) objects (Items or Collections) directly in Zarr group metadata. This enables self-describing Zarr stores where the spatial, temporal, and asset metadata travels with the data itself.

## Table of Contents

- [Overview](#overview)
- [Motivation](#motivation)
- [Convention Attributes](#convention-attributes)
- [Relative URL Resolution](#relative-url-resolution)
- [Examples](#examples)
- [Validation](#validation)
- [Known Implementations](#known-implementations)

## Overview

The STAC Zarr Convention allows Zarr groups to contain complete STAC Item or Collection objects in their store.
This creates self-describing Zarr stores that can be easily discovered and understood using standard STAC tools,
including a source of truth for spatial, temporal, and asset metadata.

## Motivation

Zarr conventions offers an ideal place to embed STAC metadata alongside array data.
By embedding STAC objects directly in Zarr metadata, we create:

1. **Self-Describing Data**: The Zarr store contains all necessary metadata for discovery and description
2. **Simplified Distribution**: A single Zarr store contains both data and metadata
3. **Offline Capability**: No external catalog service needed to understand the data
4. **STAC Compliance**: Full compatibility with STAC tools and validation
5. **Relative References**: Asset paths are relative to the embedding group, maintaining portability

## Convention Attributes

This convention defines attributes that appear at the group level of the Zarr hierarchy.
The convention uses the **key-prefixed pattern** to avoid attribute name collisions with other conventions.

**Convention metadata name**: `stac:`

### Fields

| Field Name        | Type                                                                                     | Description                                          |
| ----------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `stac:encoding`   | string                                                                                   | **REQUIRED**. Encoding type for STAC objects.        |
| `stac:item`       | [STAC Item](https://github.com/radiantearth/stac-spec/tree/master/item-spec)             | A STAC Item JSON object or a reference to one.       |
| `stac:collection` | [STAC Collection](https://github.com/radiantearth/stac-spec/tree/master/collection-spec) | A STAC Collection JSON object or a reference to one. |

### Field Details

#### `stac:encoding`

Specifies how the STAC object is encoded in the Zarr store. Valid values are:

- `attribute`: The STAC object is embedded directly as a JSON object in the Zarr group attributes under `stac:item` or `stac:collection`.
- `key` : The STAC object is stored as a separate JSON value within the Zarr store, referenced by a key in the Zarr group under `stac:item` or `stac:collection`.
- `array`: The STAC object is stored as a data array within the Zarr store, referenced by a relative path to the array node in the Zarr group under `stac:item` or `stac:collection`. Section [Encoding as Data Array](#encoding-as-data-array) provides more details.

### Convention Metadata

The convention is identified in the `zarr_conventions` array with the following metadata:

```json
{
  "zarr_conventions": [
    {
      "name": "stac:",
      "spec_url": "https://github.com/zarr-conventions/stac/blob/v1/README.md",
      "schema_url": "https://raw.githubusercontent.com/zarr-conventions/stac/refs/tags/v1/schema.json",
      "uuid": "b3703368-7e7e-4e8e-9e0e-6d0f0d5e8e8e"
    }
  ]
}
```

At minimum, one of `spec_url`, `schema_url`, or `uuid` must be present to identify the convention.

## STAC URL Resolution

### Asset Href Resolution

All asset `href` values in embedded STAC objects **MUST** be relative to the Zarr group containing the STAC metadata. This ensures:

- **Portability**: The Zarr store can be moved without breaking references
- **Scope**: STAC objects can only reference assets within their hierarchy
- **Simplicity**: Path resolution is straightforward and predictable

#### Resolution Rules

1. Asset `href` paths are resolved relative to the group containing the `stac:item` or `stac:collection` attribute
2. Paths use forward slashes (`/`) as separators, following POSIX conventions
3. Paths should not use `..` to reference parent groups (STAC objects should only describe their own hierarchy)

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

## Encoding as Data Array

When using `stac:encoding` value of `array`, the STAC object is stored as a data array within the Zarr store.
This encoding allows to store a large set of STAC objects efficiently like an entire collection of items.
There is no real value in storing a single STAC object as a data array, but it is supported for completeness.
With this encoding, the `stac:item` or `stac:collection` attribute contains a relative path to the array node.

### STAC Array Structure

*TBD*


## Examples

- [Minimal STAC Item](examples/minimal_item_example.json) - A minimal example showing the required fields
- [STAC Collection](examples/collection_example.json) - Example of embedding a STAC Collection
- [Sentinel-2 Scene](examples/sentinel2_item_example.json) - Sentinel-2 L2A data with multiple assets, bands, and extensions

## Validation

### Schema Validation

The convention includes a JSON Schema that validates:

1. **Convention Structure**: Ensures proper `zarr_conventions` metadata
2. **Encoding Field**: Validates the `stac:encoding` value
3. **Mutual Exclusivity**: Ensures only one of `stac:item` or `stac:collection` is present
4. **STAC Compliance**: References official STAC schemas for Item and Collection validation

### Validation Tools

You can validate examples using the included validation script:

```bash
npm install
npm test
```

Or validate a specific file:

```bash
node validate.js examples/minimal_item_example.json
```

### STAC Validation

Since embedded objects are complete STAC Items or Collections, they can be validated using standard STAC validation tools:

```bash
# Extract the STAC object from Zarr metadata
jq '.attributes["stac:item"]' examples/minimal_item_example.json > item.json

# Validate with stac-validator (Python)
stac-validator item.json
```

### Asset Organization

Follow [STAC Zarr Best Practices](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md) for:

- Asset hierarchy and organization
- Band representation patterns
- Multi-resolution data (multiscales)
- Variable and dimension metadata

## Known Implementations

This section helps potential implementers assess the convention's maturity and adoption.

### Libraries and Tools

_If you implement or use this convention, please add your implementation by submitting a pull request._

### Datasets Using This Convention

_If your dataset uses this convention, please add it here by submitting a pull request._

## Acknowledgements

This convention was developed through collaboration with:

- The STAC community
- Zarr developers and users
- Earth observation data providers

Related specifications:

- [STAC Specification](https://github.com/radiantearth/stac-spec)
- [Zarr v3 Specification](https://zarr-specs.readthedocs.io/en/latest/v3/)
- [STAC Zarr Best Practices](https://github.com/radiantearth/stac-best-practices/blob/main/best-practices-zarr.md)
- [Zarr Conventions Specification](https://github.com/zarr-conventions/zarr-conventions-spec)
