# Gamedig Web API

A minimal Express-based HTTP API written in typescript for querying game servers using **Gamedig**.

## Usage

GET `/query/:type?host=<ip_or_domain>&raw=true`


- `type` – Gamedig server type (e.g. `minecraft`, `cs2`)
- `host` – Server IP or domain
- `raw=true` – Include Gamedig's raw data (otherwise removed)

## Example

`/query/minecraft?host=mc.hypixel.net&raw=true`

## Errors

Returns JSON error messages such as:
- `host_type_missing`
- `host_unreachable`
- `query_failed`

## Run

`npm install`
`npm start`