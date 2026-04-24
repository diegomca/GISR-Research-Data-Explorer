# GISR Scientific Dashboard

This repository contains a static dashboard for exploring GISR (General Influence Spread Rank) results on synthetic directed networks under two diffusion models:

- Independent Cascade (`IC`)
- Linear Threshold (`LT`)

The site is designed to be published with GitHub Pages and to serve as a companion visualization for the manuscript _....._.

Article: ...

DOI: ....

Website: https://diegomonsalves.github.io/GISR-Research-Data-Explorer/

## What the dashboard shows

For each network and diffusion model, the dashboard exposes:

- Growth curves of GISR centrality values
- A scatter view relating curvature, linear fit quality, and RMSE
- Distribution summaries from precomputed quartiles and extrema
- Correlation matrices among derived curve metrics
- Parallel coordinates for multi-metric comparison

The viewer allows filtering by:

- Neighborhood depth level `ℓ` (`0`, `1`, `4`, `6`)
- Initial activation probability `λ` (`0.25`, `0.5`, `0.75`, `1.0`)
- Neighborhood direction (`IN`, `OUT`, `ALL`)

## Data included in this repository

The published dataset contains aggregated dashboard-ready JSON files rather than raw node-by-node experiment logs.

- `27` synthetic networks
- `3` network sizes: `5000`, `8500`, and `12000` nodes
- `3` density regimes represented in the JSON metadata: `0.0015`, `0.01`, and `0.1`
- Diameters ranging from `2` to `8`
- `2` diffusion models (`IC` and `LT`)
- `48` GISR parameter combinations per network-model pair
- `2592` growth curves in total across both models

Repository layout:

- `index.html`: static entry point for GitHub Pages
- `app.js`: visualization logic
- `web_data/IC`: JSON exports for the Independent Cascade model
- `web_data/LT`: JSON exports for the Linear Threshold model

## JSON schema

Each JSON file corresponds to one network and one diffusion model.

Top-level fields:

- `network_id`: synthetic network identifier
- `spread_model`: `IC` or `LT`
- `params.nodes`: number of nodes
- `params.density`: network density
- `params.diameter`: network diameter
- `curves`: list of GISR configurations for that network-model pair

Each element of `curves` contains:

- `k`: neighborhood depth level `ℓ`
- `prob`: initial activation probability `λ`
- `dir`: neighborhood direction
- `data`: GISR values sorted from lowest to highest centrality
- `metrics.rmse_diag`: RMSE relative to the diagonal baseline
- `metrics.r2_lin`: linear fit quality of the growth curve
- `metrics.curvature_c_abs`: absolute curvature indicator
- `metrics.gisr_min`, `gisr_q25`, `gisr_median`, `gisr_q75`, `gisr_max`: summary statistics used in the distribution panel

## Interpreting the growth curves

The growth-curve view follows the criterion discussed in Section 5.3 of the manuscript. Nodes are sorted on the x-axis from lower to higher GISR centrality, and the y-axis shows the resulting GISR value. Under this reading:

- Informative configurations generate monotonically increasing curves with visible variability.
- Nearly flat curves indicate low discriminative power because most nodes receive very similar centrality values.
- Flat curves near the lower bound usually reflect weak influence propagation.
- Flat curves near the upper bound usually reflect saturation, where many nodes achieve similarly high influence values.

Main patterns highlighted in the manuscript:

- Under `IC`, the depth level `ℓ` is usually more structurally decisive than `λ`.
- In sparse, low-diameter networks, more informative curves tend to appear at higher depth with intermediate activation probability.
- In sparse networks with larger diameter, intermediate depth levels produce more differentiated regimes.
- In denser networks, `λ` often rescales the values, while `ℓ` more strongly shapes the curve profile.
- Under `LT`, curves are generally flatter, and the most informative behavior is concentrated around moderate depth (`ℓ = 4`) with low probability (`λ = 0.25`).

## Local preview

Because the dashboard loads local JSON files with `fetch`, it should be served from a local web server instead of opening `index.html` directly in the browser. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
