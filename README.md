# 密码管理器 (WailsPassword)

使用 Wails 框架开发的跨平台密码管理工具。

## 功能特性

- 账号管理：添加、编辑、删除账号信息
- 密码存储：安全存储账号名、密码和备注信息
- 二步验证：支持 TOTP 二步验证
- 一键复制：支持复制账号名、密码、OTP验证码、备注到剪贴板
- 本地存储：默认存储在 `~/.wails-passwd/accounts.json`
- 数据文件切换：支持在界面中选择任意 JSON 文件作为当前账号数据文件
- 多语言界面：内置中文/English 切换
- Material Design：前端界面已重构为 Material Design 风格

## 构建和运行

### 开发模式

```bash
wails dev
```

首次运行后，应用会在 `~/.wails-passwd/settings.json` 中记录当前选择的数据文件路径。

### 构建

```bash
wails build
```

## 自动发布

项目内置 GitHub Actions 发布流程：

- `release.yml`：手动输入版本号，创建 GitHub Release
- `ci-wails-build.yml`：构建 macOS 和 Windows 发布包并上传到 Release
- `update-homebrew.yml`：更新 `dreamhunter2333/homebrew-dreamhunter`
- `update-scoop.yml`：更新 `dreamhunter2333/scoop-dreamhunter`

当前项目仓库需要配置：

- Actions Variable：`APP_ID`
- Actions Secret：`APP_PRIVATE_KEY`

同一个 GitHub App 需要安装到以下仓库：

- 当前项目仓库
- `dreamhunter2333/homebrew-dreamhunter`
- `dreamhunter2333/scoop-dreamhunter`

## 技术栈

- Go 1.23+
- Wails v2.10.1
- HTML/CSS/JavaScript

## 许可证

MIT
