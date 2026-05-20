# patina-action

<p align="center">
  <img src="assets/patina-logo.svg" alt="patina — Strip the AI packaging. Keep the meaning." width="420">
</p>

<p align="center"><b>Score AI-sounding prose in your pull requests, before it ships.</b></p>

This Action scores the Markdown a PR changes, posts the result as one sticky comment, and can fail the check when a file crosses your threshold.

The number is Patina's deterministic prose hotspot score — the share of paragraphs flagged as editing hotspots. It runs offline: no model call, no API key. Korean, English, Chinese, and Japanese.

## Quick start

```yaml
name: Patina prose score

on:
  pull_request:
    paths:
      - '**/*.md'
      - '**/*.mdx'

permissions:
  contents: read
  pull-requests: read
  issues: write

jobs:
  patina:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: devswha/patina-action@v1
        with:
          score-threshold: 30
          comment: true
          # Optional: publish patina-badge.json for a Shields.io README badge.
          # Requires permissions.contents: write.
          # badge-branch: patina-badge
```

## What you get

A sticky PR comment with a per-file table — paragraphs, hot paragraphs, and score — plus a job summary. When `score-threshold` is set, the check fails if any file goes over it. Leave it unset to keep the report advisory.

## Inputs

| Input | Default | Meaning |
|---|---:|---|
| `github-token` | `${{ github.token }}` | Token for change detection and comments. |
| `files` | changed PR Markdown | Optional newline/comma/JSON file list. Overrides paths-filter. |
| `lang` | `auto` | `auto`, `ko`, `en`, `zh`, or `ja`. |
| `score-threshold` | unset | If set, fail when any file score is above this percentage. |
| `report-threshold` | `30` | Advisory report gate when `score-threshold` is unset. |
| `max-files` | `50` | Maximum Markdown files to score. |
| `comment` | `true` | Create or update a sticky PR comment. |
| `badge-branch` | unset | Optional branch where `patina-badge.json` is published for Shields.io endpoint badges. |
| `patina-package` | `patina-cli@latest` | npm package spec used by `npx`. |
| `patina-bin` | unset | Local `patina-score` executable for tests / self-hosted runners. |

## Outputs

| Output | Meaning |
|---|---|
| `file-count` | Number of Markdown files scored. |
| `failed-count` | Number of files above the active threshold. |
| `max-score` | Highest file score percentage. |
| `badge-json` | One-line Shields.io endpoint JSON derived from `max-score`. |
| `threshold-failed` | `true` when `score-threshold` was set and exceeded. |
| `comment-body-path` | Path to the generated Markdown comment body. |

## README badge

Set `badge-branch` to publish `patina-badge.json`, then point Shields.io at the raw JSON file:

```md
[![patina](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/patina-badge/patina-badge.json)](https://github.com/devswha/patina)
```

Publishing requires `contents: write` permission in the calling workflow. The badge JSON is generated from the same deterministic max score used by the PR comment and contains no per-visitor tracking.

## How it works

It finds changed Markdown with `dorny/paths-filter`, scores each file by running `patina-score` from `npx -p patina-cli@latest`, and upserts the sticky comment with `peter-evans/create-or-update-comment`. The score itself is deterministic and local — no model, no key.

## Forks

On public repos, GitHub limits `GITHUB_TOKEN` permissions for `pull_request` runs triggered from forks. If comments are blocked, the score still shows in the job summary; for inline comments on fork PRs, use a locked-down `pull_request_target` workflow.

## License

MIT. Part of [patina](https://github.com/devswha/patina).
