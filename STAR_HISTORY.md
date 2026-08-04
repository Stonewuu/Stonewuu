# Repository Star History

This profile repository generates Star History SVGs for selected repositories and publishes them with GitHub Pages. The workflow runs every six hours and can also be started manually.

## Authentication and history

No custom secret or personal access token is required. The workflow uses its built-in `GITHUB_TOKEN` only to read each public repository's `stargazers_count`, an endpoint that is not affected by GitHub's Stargazers-list restriction.

The initial `ai-fusion-video` curve is stored under `star-history-seeds/`. After the first deployment, each run reads the previously published JSON state from GitHub Pages, updates the current UTC day, and deploys the new JSON and SVG together. This preserves history without generated Git commits.

Newly added repositories begin collecting daily history from their first successful run.

## Optional repository list

Create the repository Actions variable `STAR_HISTORY_REPOSITORIES` to control the generated charts. Values may be separated by commas, spaces, or newlines.

```text
Stonewuu/ai-fusion-video
Stonewuu/Stonewuu
```

When the variable is missing or blank, only `Stonewuu/ai-fusion-video` is generated.

Selected repositories must be public because the workflow deliberately avoids personal credentials.

## GitHub Pages

Set `Settings → Pages → Build and deployment → Source` to `GitHub Actions`, then run `Generate Repository Star History` once.

Generated URLs follow this pattern:

```text
https://stonewuu.github.io/Stonewuu/star-history/{owner}/{repository}.svg
```
