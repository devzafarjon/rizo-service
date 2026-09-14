package config

import (
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL  string
	JWTSecret    string
	Port         int
	Origins      []string
	NodeEnv      string
	PublicAppURL string
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, errMissing("JWT_SECRET")
	}
	db := os.Getenv("DATABASE_URL")
	if db == "" {
		return nil, errMissing("DATABASE_URL")
	}
	port := 4000
	if raw := os.Getenv("PORT"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			return nil, err
		}
		port = n
	}
	origins := splitOrigins(os.Getenv("CLIENT_ORIGIN"))
	if len(origins) == 0 {
		origins = []string{"http://localhost:5173"}
	}
	return &Config{
		DatabaseURL:  db,
		JWTSecret:    secret,
		Port:         port,
		Origins:      origins,
		NodeEnv:      os.Getenv("NODE_ENV"),
		PublicAppURL: strings.TrimRight(os.Getenv("PUBLIC_APP_URL"), "/"),
	}, nil
}

func splitOrigins(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimRight(strings.TrimSpace(part), "/")
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}

func (c *Config) AllowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	for _, item := range c.Origins {
		if item == "*" || item == origin {
			return true
		}
	}
	return false
}

func (c *Config) PublicApp() string {
	if c.PublicAppURL != "" {
		return c.PublicAppURL
	}
	if len(c.Origins) > 0 {
		return c.Origins[0]
	}
	return "http://localhost:5173"
}

func (c *Config) DevResetLinks() bool {
	return c.NodeEnv != "production"
}

type missingError string

func errMissing(name string) error { return missingError(name + " is not set") }

func (e missingError) Error() string { return string(e) }
