# Repository Star History

This profile repository generates Star History SVGs for selected repositories and publishes them with GitHub Pages. The workflow runs every six hours and can also be started manually.

## Required secret

Create a fine-grained personal access token owned by `Stonewuu`:

1. Select only the repositories whose Star History should be generated.
2. Keep repository permissions at the minimum `Metadata: Read-only` level.
3. Save the token as the repository Actions secret `STAR_HISTORY_TOKEN`.

Do not paste the token into workflow files or repository variables.

## Optional repository list

Create the repository Actions variable `STAR_HISTORY_REPOSITORIES` to control the generated charts. Values may be separated by commas, spaces, or newlines.

```text
Stonewuu/ai-fusion-video
Stonewuu/Stonewuu
```

When the variable is missing or blank, only `Stonewuu/ai-fusion-video` is generated.

The token owner must be an administrator or collaborator of every selected repository because GitHub restricts the Stargazers listing endpoint.

## GitHub Pages

Set `Settings → Pages → Build and deployment → Source` to `GitHub Actions`, then run `Generate Repository Star History` once.

Generated URLs follow this pattern:

```text
https://stonewuu.github.io/Stonewuu/star-history/{owner}/{repository}.svg
```
