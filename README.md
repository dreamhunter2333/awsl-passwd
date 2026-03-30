# WailsPassword

[English](README.md) | [简体中文](README.zh-CN.md)

A cross-platform password manager built with Wails.

## Features

- Manage accounts with create, edit, and delete actions
- Store account name, password, notes, and TOTP seed locally
- Generate TOTP codes with countdown refresh
- Copy account name, password, OTP code, and notes with one click
- Store data locally in `~/.wails-passwd/accounts.json` by default
- Switch the active JSON data file from the UI
- Built-in Chinese and English UI switching
- Frontend refactored into a Material Design style

## Installation

### Homebrew

One-line install:

```bash
brew install --cask dreamhunter2333/dreamhunter/wails-passwd
```

Or tap first:

```bash
brew tap dreamhunter2333/dreamhunter
brew install --cask wails-passwd
```

Install after tapping:

```bash
brew install --cask dreamhunter2333/dreamhunter/wails-passwd
```

### Scoop

```bash
scoop bucket add dreamhunter https://github.com/dreamhunter2333/scoop-dreamhunter.git
scoop install dreamhunter/wails-passwd
```

### Direct Download

Download the latest release assets from GitHub Releases:

- macOS Apple Silicon: `wails-passwd-macOS-arm64.dmg`
- macOS Intel: `wails-passwd-macOS-amd64.dmg`
- Windows: `wails-passwd.exe`

## Development

```bash
wails dev
```

After the first run, the selected data file path is stored in `~/.wails-passwd/settings.json`.

## Build

```bash
wails build
```

## Release Automation

The project includes GitHub Actions workflows for release automation:

- `release.yml`: manually trigger a versioned release
- `ci-wails-build.yml`: build macOS and Windows assets and upload them to the release
- `update-homebrew.yml`: update `dreamhunter2333/homebrew-dreamhunter`
- `update-scoop.yml`: update `dreamhunter2333/scoop-dreamhunter`

Repository secrets required for release automation:

- `APP_ID`
- `APP_PRIVATE_KEY`

The GitHub App must be installed on:

- this repository
- `dreamhunter2333/homebrew-dreamhunter`
- `dreamhunter2333/scoop-dreamhunter`

## Tech Stack

- Go 1.26+
- Wails v2.12.0
- HTML/CSS/JavaScript

## License

MIT
