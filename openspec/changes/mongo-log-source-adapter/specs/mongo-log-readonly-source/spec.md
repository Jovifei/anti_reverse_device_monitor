## ADDED Requirements

### Requirement: Read-only Mongo device log source

The system SHALL provide a MongoDB read-only source adapter that queries collections named `device_log_<productId>` (or an explicitly configured collection) using `device_id` and a bounded `time` window, without performing any write, update, delete, or index-creation operations against the company Mongo database.

#### Scenario: Sync expands nested data fields

- **WHEN** a sync run fetches a log document with nested `data` keys of the form `<siid>_<piid>`
- **THEN** the adapter expands each mapped key into a `SourceTelemetryRecord` with `siid`, `piid`, `metricKey` (when configured), `reportedAt` derived from `time`, and `deviceSn` resolved from the device registry or a deterministic placeholder

#### Scenario: Query requires time and device scope

- **WHEN** telemetry is fetched
- **THEN** the query SHALL include a `time` lower and upper bound and SHALL target a specific collection and `device_id` set (from registry and/or explicit filter), not an unconstrained full-collection scan

#### Scenario: Missing SN falls back to device_id identity

- **WHEN** a `device_id` appears in logs without a registry `sn`
- **THEN** the system SHALL use a placeholder SN of the form `unknown-<prefix>` for local device upsert and SHALL expose the underlying `device_id` for display/search where the UI surfaces identity

#### Scenario: Default anti-reverse CT product collection

- **WHEN** `MONGODB_PRODUCT_ID` and `MONGODB_COLLECTION` are unset
- **THEN** the adapter SHALL default the product id to `689adc659f04ec32f7642fbb` and target collection `device_log_689adc659f04ec32f7642fbb`

### Requirement: Device registry file and manual merge

The system SHALL load device metadata from a local JSON registry mapping `sn`, `device_id`, `product_id`, and optional `collection`/`label`, and SHALL provide a CLI to merge recently observed `device_id` values into a draft registry for human confirmation.

#### Scenario: Registry drives sync targets

- **WHEN** `source:sync` runs with Mongo source enabled and a registry present
- **THEN** the adapter uses registry entries to resolve collection names and SN mappings for each `device_id`

#### Scenario: Known anti-reverse CT devices map SN to device_id

- **WHEN** the example or local registry includes the anti-reverse CT fleet
- **THEN** it SHALL map `GC2001000000252` to `69c4e61a495848939ee23928` and `GC2001000000457` to `69c4e417495848939eb67a46` so operators search by SN while queries use `device_id`

### Requirement: Existing UI continues to read local database

After a successful sync, the existing device list and device detail pages SHALL display devices and telemetry sourced from the local application database without requiring a new business UI.

#### Scenario: Mapped power metrics appear after sync

- **WHEN** mapped power-related fields are imported for a device SN
- **THEN** the existing `/devices` and `/devices/[sn]` flows can list the device and chart those metrics using current APIs

#### Scenario: Interactive UI exposes SN only

- **WHEN** an operator uses the device list, search, or detail pages
- **THEN** the interactive copy and inputs SHALL refer to devices by SN only and SHALL NOT display Mongo `device_id`

### Requirement: Application Docker packaging with separated sync

The system SHALL provide Docker packaging for the Next.js application that connects to external Mongo via environment configuration, without embedding secrets in the image and without bundling a company Mongo replica.

#### Scenario: Production sync runs as a separated Compose service

- **WHEN** the stack is deployed for production
- **THEN** telemetry sync SHALL be runnable as a Compose service or profile separate from the web `app` process

#### Scenario: Debug sync can be manual

- **WHEN** engineers are debugging locally or against a running container
- **THEN** they SHALL be able to run `source:sync` manually on the host or via `docker compose exec` without requiring the production sync service to be started
