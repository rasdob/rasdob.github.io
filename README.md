# RA-SDOB

Project page for **Image-Based Visual Servoing with a Response-Augmented Sampling-Based Disturbance Observer**.

**Website:** https://rasdob.github.io/

The page includes a four-step animated explanation, the paper framework, an interactive browser simulation with the Astribot S1 model, disturbance estimation results, and three recorded real-robot comparisons. English is the default language, with a Chinese translation available.

## Run locally

No build step or frontend dependencies are required. From this directory:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open http://127.0.0.1:8766/. ES modules require an HTTP server. The teaching simulation is simplified and separate from the recorded paper results. It does not connect to robot hardware.

## Publishing

GitHub Pages serves the root of the `main` branch. The `.nojekyll` file preserves the static assets without Jekyll processing.

## Assets and acknowledgements

Astribot model assets retain their Apache 2.0 license and attribution in `assets/astribot/`. See the model README for the asset source and rendering limitations. Page layout references are listed in the footer.
