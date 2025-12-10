package services

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var fileNameSanitizer = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

// SanitizeFileName removes characters that Cloudinary or the filesystem would reject.
func SanitizeFileName(name string) string {
	if name == "" {
		return fmt.Sprintf("file-%d", time.Now().UnixNano())
	}
	safe := strings.TrimSpace(name)
	safe = strings.ReplaceAll(safe, " ", "-")
	safe = fileNameSanitizer.ReplaceAllString(safe, "")
	if safe == "" {
		return fmt.Sprintf("file-%d", time.Now().UnixNano())
	}
	return safe
}

// GenerateLocalMediaPaths returns the filesystem path and HTTP path (prefixed with /) for a file.
func GenerateLocalMediaPaths(folder, originalName string) (string, string) {
	timestamped := fmt.Sprintf("%d_%s", time.Now().UnixNano(), SanitizeFileName(originalName))
	relativePath := filepath.Join("uploads", folder, timestamped)
	publicPath := "/" + filepath.ToSlash(relativePath)
	return relativePath, publicPath
}
