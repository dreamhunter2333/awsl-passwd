package main

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx     context.Context
	manager *PasswordManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		manager: NewPasswordManager(),
	}
}

// startup is called at application startup
func (a *App) startup(ctx context.Context) {
	// Perform your setup here
	a.ctx = ctx
}

// domReady is called after front-end resources have been loaded
func (a App) domReady(ctx context.Context) {
	// Add your action here
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
// Returning true will cause the application to continue, false will continue shutdown as normal.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	return false
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	// Perform your teardown here
}

// buildAccountResponse 组装前端需要的账号结构
func (a *App) buildAccountResponse(account Account) AccountResponse {
	otpCode, _ := a.manager.generateOTPCode(account.OTPKey)
	otpRemaining := 0
	if account.OTPKey != "" {
		otpRemaining = a.manager.getOTPRemaining()
	}

	return AccountResponse{
		ID:           account.ID,
		Name:         account.Name,
		Password:     account.Password,
		OTPCode:      otpCode,
		OTPKey:       account.OTPKey,
		OTPRemaining: otpRemaining,
		Notes:        account.Notes,
		Created:      account.Created,
		Updated:      account.Updated,
	}
}

// GetStorageInfo 获取当前数据文件配置
func (a *App) GetStorageInfo() *StorageInfo {
	info := a.manager.GetStorageInfo()
	return &info
}

// SetConfigFilePath 设置数据文件路径
func (a *App) SetConfigFilePath(filePath string) (*StorageInfo, error) {
	if filePath == "" {
		return nil, fmt.Errorf("数据文件路径不能为空")
	}

	if err := a.manager.SetDataFile(filePath); err != nil {
		return nil, err
	}

	return a.GetStorageInfo(), nil
}

// SelectConfigFile 通过文件选择器设置数据文件路径
func (a *App) SelectConfigFile() (*StorageInfo, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("应用尚未初始化")
	}

	storageInfo := a.manager.GetStorageInfo()
	selectedPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:                "选择账号数据文件",
		DefaultDirectory:     filepath.Dir(storageInfo.DataFilePath),
		DefaultFilename:      filepath.Base(storageInfo.DataFilePath),
		CanCreateDirectories: true,
		ShowHiddenFiles:      true,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "JSON 文件 (*.json)",
				Pattern:     "*.json",
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("选择数据文件失败: %w", err)
	}

	if selectedPath == "" {
		return a.GetStorageInfo(), nil
	}

	return a.SetConfigFilePath(selectedPath)
}

// ResetConfigFile 重置为默认数据文件
func (a *App) ResetConfigFile() (*StorageInfo, error) {
	if err := a.manager.ResetDataFile(); err != nil {
		return nil, err
	}

	return a.GetStorageInfo(), nil
}

// GetAccounts 获取所有账号列表
func (a *App) GetAccounts() ([]AccountResponse, error) {
	accounts, err := a.manager.loadAccounts()
	if err != nil {
		return nil, err
	}

	responses := make([]AccountResponse, len(accounts))
	for i, account := range accounts {
		responses[i] = a.buildAccountResponse(account)
	}

	return responses, nil
}

// CreateAccount 创建新账号
func (a *App) CreateAccount(name, password, notes, otpKey string) (*AccountResponse, error) {
	if name == "" {
		return nil, fmt.Errorf("账号名不能为空")
	}

	accounts, err := a.manager.loadAccounts()
	if err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	account := Account{
		ID:       a.manager.generateID(),
		Name:     name,
		Password: password,
		Notes:    notes,
		OTPKey:   otpKey,
		Created:  now,
		Updated:  now,
	}

	accounts = append(accounts, account)
	if err := a.manager.saveAccounts(accounts); err != nil {
		return nil, err
	}

	response := a.buildAccountResponse(account)

	return &response, nil
}

// UpdateAccount 更新账号信息
func (a *App) UpdateAccount(id, name, password, notes, otpKey string) (*AccountResponse, error) {
	if id == "" {
		return nil, fmt.Errorf("账号ID不能为空")
	}
	if name == "" {
		return nil, fmt.Errorf("账号名不能为空")
	}

	accounts, err := a.manager.loadAccounts()
	if err != nil {
		return nil, err
	}

	for i, account := range accounts {
		if account.ID == id {
			accounts[i].Name = name
			accounts[i].Password = password
			accounts[i].Notes = notes
			accounts[i].OTPKey = otpKey
			accounts[i].Updated = time.Now().Unix()

			if err := a.manager.saveAccounts(accounts); err != nil {
				return nil, err
			}

			response := a.buildAccountResponse(accounts[i])

			return &response, nil
		}
	}

	return nil, fmt.Errorf("未找到指定的账号")
}

// DeleteAccount 删除账号
func (a *App) DeleteAccount(id string) error {
	if id == "" {
		return fmt.Errorf("账号ID不能为空")
	}

	accounts, err := a.manager.loadAccounts()
	if err != nil {
		return err
	}

	for i, account := range accounts {
		if account.ID == id {
			accounts = append(accounts[:i], accounts[i+1:]...)
			return a.manager.saveAccounts(accounts)
		}
	}

	return fmt.Errorf("未找到指定的账号")
}

// GetOTPCode 获取指定账号的OTP验证码
func (a *App) GetOTPCode(id string) (string, error) {
	accounts, err := a.manager.loadAccounts()
	if err != nil {
		return "", err
	}

	for _, account := range accounts {
		if account.ID == id {
			return a.manager.generateOTPCode(account.OTPKey)
		}
	}

	return "", fmt.Errorf("未找到指定的账号")
}
