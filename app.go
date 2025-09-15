package main

import (
	"context"
	"fmt"
	"time"
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

// GetAccounts 获取所有账号列表
func (a *App) GetAccounts() ([]AccountResponse, error) {
	accounts, err := a.manager.loadAccounts()
	if err != nil {
		return nil, err
	}

	responses := make([]AccountResponse, len(accounts))
	for i, account := range accounts {
		otpCode, _ := a.manager.generateOTPCode(account.OTPKey)
		otpRemaining := 0
		if account.OTPKey != "" {
			otpRemaining = a.manager.getOTPRemaining()
		}
		responses[i] = AccountResponse{
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

	otpCode, _ := a.manager.generateOTPCode(account.OTPKey)
	otpRemaining := 0
	if account.OTPKey != "" {
		otpRemaining = a.manager.getOTPRemaining()
	}
	response := &AccountResponse{
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

	return response, nil
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

			otpCode, _ := a.manager.generateOTPCode(accounts[i].OTPKey)
			otpRemaining := 0
			if accounts[i].OTPKey != "" {
				otpRemaining = a.manager.getOTPRemaining()
			}
			response := &AccountResponse{
				ID:           accounts[i].ID,
				Name:         accounts[i].Name,
				Password:     accounts[i].Password,
				OTPCode:      otpCode,
				OTPKey:       accounts[i].OTPKey,
				OTPRemaining: otpRemaining,
				Notes:        accounts[i].Notes,
				Created:      accounts[i].Created,
				Updated:      accounts[i].Updated,
			}

			return response, nil
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
