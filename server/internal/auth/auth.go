package auth

import (
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Staff struct {
	UserID string
	Role   string
	Email  string
}

type Customer struct {
	CustomerID string
	Email      string
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func SignStaff(secret string, user Staff) (string, error) {
	role := user.Role
	if role != "technician" {
		role = "dispatcher"
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"userId": user.UserID,
		"role":   role,
		"email":  user.Email,
		"iat":    now.Unix(),
		"exp":    now.Add(7 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func VerifyStaff(secret, token string) (Staff, error) {
	claims, err := parse(secret, token)
	if err != nil {
		return Staff{}, err
	}
	if str(claims["scope"]) == "customer" {
		return Staff{}, errors.New("Staff token required")
	}
	role := str(claims["role"])
	if role != "technician" {
		role = "dispatcher"
	}
	userID := str(claims["userId"])
	email := str(claims["email"])
	if userID == "" || email == "" {
		return Staff{}, errors.New("Unauthorized")
	}
	return Staff{UserID: userID, Role: role, Email: email}, nil
}

func SignCustomer(secret string, customer Customer) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"customerId": customer.CustomerID,
		"email":      customer.Email,
		"scope":      "customer",
		"aud":        "portal",
		"iat":        now.Unix(),
		"exp":        now.Add(7 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func VerifyCustomer(secret, token string) (Customer, error) {
	claims, err := parse(secret, token)
	if err != nil {
		return Customer{}, err
	}
	if str(claims["scope"]) != "customer" || str(claims["customerId"]) == "" || str(claims["email"]) == "" {
		return Customer{}, errors.New("Invalid customer token")
	}
	aud, _ := claims.GetAudience()
	ok := false
	for _, item := range aud {
		if item == "portal" {
			ok = true
			break
		}
	}
	if !ok {
		if str(claims["aud"]) != "portal" {
			return Customer{}, errors.New("Invalid customer token")
		}
	}
	return Customer{CustomerID: str(claims["customerId"]), Email: str(claims["email"])}, nil
}

func Bearer(header string) (string, bool) {
	if !strings.HasPrefix(header, "Bearer ") {
		return "", false
	}
	token := strings.TrimSpace(header[7:])
	return token, token != ""
}

func parse(secret, token string) (jwt.MapClaims, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("Unauthorized")
		}
		return []byte(secret), nil
	}, jwt.WithoutClaimsValidation())
	if err != nil || !parsed.Valid {
		return nil, errors.New("Unauthorized")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("Unauthorized")
	}
	if exp, err := claims.GetExpirationTime(); err == nil && exp != nil && time.Now().After(exp.Time) {
		return nil, errors.New("Unauthorized")
	}
	return claims, nil
}

func str(v any) string {
	s, _ := v.(string)
	return s
}
