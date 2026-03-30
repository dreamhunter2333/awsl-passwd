# WailsPassword

[English](README.md) | [简体中文](README.zh-CN.md)

一个使用 Wails 构建的跨平台密码管理器。

## 功能特性

- 支持新增、编辑、删除账号
- 本地保存账号名、密码、备注和 TOTP 密钥
- 支持 TOTP 动态验证码与倒计时刷新
- 支持一键复制账号名、密码、OTP 验证码和备注
- 默认数据文件为 `~/.wails-passwd/accounts.json`
- 可在界面中切换当前使用的 JSON 数据文件
- 内置中文 / English 界面切换
- 前端已重构为 Material Design 风格

## 安装方式

### Homebrew

一行安装：

```bash
brew install --cask dreamhunter2333/dreamhunter/wails-passwd
```

或者先 tap：

```bash
brew tap dreamhunter2333/dreamhunter
brew install --cask wails-passwd
```

tap 后也可以直接这样装：

```bash
brew install --cask dreamhunter2333/dreamhunter/wails-passwd
```

### Scoop

```bash
scoop bucket add dreamhunter https://github.com/dreamhunter2333/scoop-dreamhunter.git
scoop install dreamhunter/wails-passwd
```

### 直接下载

也可以在 GitHub Releases 中直接下载：

- macOS Apple Silicon：`wails-passwd-macOS-arm64.dmg`
- macOS Intel：`wails-passwd-macOS-amd64.dmg`
- Windows：`wails-passwd.exe`

## 开发

```bash
wails dev
```

首次运行后，当前选择的数据文件路径会写入 `~/.wails-passwd/settings.json`。

## 构建

```bash
wails build
```

## 自动发布

项目内置 GitHub Actions 发布流程：

- `release.yml`：手动输入版本号并创建 Release
- `ci-wails-build.yml`：构建 macOS 和 Windows 产物并上传到 Release
- `update-homebrew.yml`：更新 `dreamhunter2333/homebrew-dreamhunter`
- `update-scoop.yml`：更新 `dreamhunter2333/scoop-dreamhunter`

发布所需仓库 Secret：

- `APP_ID`
- `APP_PRIVATE_KEY`

同一个 GitHub App 需要安装到以下仓库：

- 当前项目仓库
- `dreamhunter2333/homebrew-dreamhunter`
- `dreamhunter2333/scoop-dreamhunter`

## 技术栈

- Go 1.26+
- Wails v2.12.0
- HTML/CSS/JavaScript

## 许可证

MIT
