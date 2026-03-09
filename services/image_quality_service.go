package services

import (
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"math"
	"mime/multipart"
	"strings"
)

// ImageQualityIssue represents a single quality problem detected in an image.
type ImageQualityIssue struct {
	Type       string `json:"type"`       // "blur", "dark", "bright", "low_resolution", "non_product", "suspicious"
	Severity   string `json:"severity"`   // "warning", "error"
	Message    string `json:"message"`    // User-facing message
	Suggestion string `json:"suggestion"` // Actionable suggestion
	Score      int    `json:"score"`      // 0-100 quality sub-score (100 = perfect)
}

// ImageQualityResult is the full quality analysis for one or more images.
type ImageQualityResult struct {
	OverallScore  int                 `json:"overall_score"` // 0-100
	PassesCheck   bool                `json:"passes_check"`  // true if quality is acceptable
	Issues        []ImageQualityIssue `json:"issues"`        // List of detected issues
	Width         int                 `json:"width"`
	Height        int                 `json:"height"`
	IsLowRes      bool                `json:"is_low_res"`
	IsDark        bool                `json:"is_dark"`
	IsBright      bool                `json:"is_bright"`
	IsBlurry      bool                `json:"is_blurry"`
	BrightnessAvg float64             `json:"brightness_avg"`
	BlurScore     float64             `json:"blur_score"` // Higher = sharper
}

// AnalyzeImageQuality performs server-side quality checks on an uploaded image.
// It checks resolution, brightness, and blur (Laplacian variance approximation).
func AnalyzeImageQuality(file *multipart.FileHeader) (*ImageQualityResult, error) {
	f, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open image: %w", err)
	}
	defer f.Close()

	// Decode image
	img, format, err := image.Decode(f)
	if err != nil {
		// Try to re-read if format is unsupported but still allow through
		log.Printf("Image quality check: could not decode %s (format: %s): %v", file.Filename, format, err)
		return &ImageQualityResult{
			OverallScore: 50,
			PassesCheck:  true,
			Issues: []ImageQualityIssue{{
				Type:       "format",
				Severity:   "warning",
				Message:    "Could not analyze image quality for this format.",
				Suggestion: "Use JPEG or PNG for best results.",
				Score:      50,
			}},
		}, nil
	}

	bounds := img.Bounds()
	width := bounds.Max.X - bounds.Min.X
	height := bounds.Max.Y - bounds.Min.Y

	result := &ImageQualityResult{
		Width:  width,
		Height: height,
	}

	var issues []ImageQualityIssue
	scores := []int{}

	// 1. Resolution check
	resScore := checkResolution(width, height)
	scores = append(scores, resScore)
	if resScore < 60 {
		result.IsLowRes = true
		sev := "warning"
		if resScore < 30 {
			sev = "error"
		}
		issues = append(issues, ImageQualityIssue{
			Type:       "low_resolution",
			Severity:   sev,
			Message:    fmt.Sprintf("⚠ Image resolution is low (%dx%d).", width, height),
			Suggestion: "Please retake the photo at higher resolution for better trade chances.",
			Score:      resScore,
		})
	}

	// 2. Brightness check (sample pixels)
	brightnessAvg, darkPct, brightPct := analyzeBrightness(img)
	result.BrightnessAvg = brightnessAvg

	brightScore := 100
	if darkPct > 0.5 || brightnessAvg < 50 {
		result.IsDark = true
		brightScore = int(math.Max(0, 100-float64(100-brightnessAvg)*1.5))
		sev := "warning"
		if brightnessAvg < 30 {
			sev = "error"
			brightScore = int(math.Max(0, float64(brightScore)-20))
		}
		issues = append(issues, ImageQualityIssue{
			Type:       "dark",
			Severity:   sev,
			Message:    "⚠ Image quality is low — the photo appears too dark.",
			Suggestion: "Please retake the photo with better lighting for better trade chances.",
			Score:      brightScore,
		})
	} else if brightPct > 0.5 || brightnessAvg > 230 {
		result.IsBright = true
		brightScore = int(math.Max(0, 100-float64(brightnessAvg-200)*2))
		issues = append(issues, ImageQualityIssue{
			Type:       "bright",
			Severity:   "warning",
			Message:    "⚠ Image appears overexposed or washed out.",
			Suggestion: "Reduce brightness or avoid direct flash when photographing your item.",
			Score:      brightScore,
		})
	}
	scores = append(scores, brightScore)

	// 3. Blur detection (Laplacian variance approximation)
	blurScore := analyzeBlur(img)
	result.BlurScore = blurScore

	sharpScore := 100
	if blurScore < 100 {
		result.IsBlurry = true
		sharpScore = int(math.Min(100, math.Max(0, blurScore)))
		sev := "warning"
		if blurScore < 40 {
			sev = "error"
			sharpScore = int(math.Max(0, float64(sharpScore)-10))
		}
		issues = append(issues, ImageQualityIssue{
			Type:       "blur",
			Severity:   sev,
			Message:    "⚠ Image quality is low — the photo appears blurry.",
			Suggestion: "Please retake the photo with a steady hand for better trade chances.",
			Score:      sharpScore,
		})
	}
	scores = append(scores, sharpScore)

	// 4. Aspect ratio sanity (extremely narrow/tall images)
	aspect := float64(width) / float64(height)
	if width > 0 && height > 0 && (aspect > 4.0 || aspect < 0.25) {
		issues = append(issues, ImageQualityIssue{
			Type:       "aspect_ratio",
			Severity:   "warning",
			Message:    "⚠ Unusual aspect ratio detected. This may be a screenshot or cropped image.",
			Suggestion: "Use a standard photo of the product for the best listing results.",
			Score:      60,
		})
		scores = append(scores, 60)
	}

	// Calculate overall score
	if len(scores) > 0 {
		total := 0
		for _, s := range scores {
			total += s
		}
		result.OverallScore = total / len(scores)
	} else {
		result.OverallScore = 100
	}

	result.PassesCheck = result.OverallScore >= 40
	result.Issues = issues

	log.Printf("Image quality analysis for %s: score=%d, res=%dx%d, brightness=%.1f, blur=%.1f, issues=%d",
		file.Filename, result.OverallScore, width, height, brightnessAvg, blurScore, len(issues))

	return result, nil
}

// AnalyzeMultipleImageQuality checks quality for multiple images and returns per-image results.
func AnalyzeMultipleImageQuality(files []*multipart.FileHeader) ([]*ImageQualityResult, error) {
	var results []*ImageQualityResult
	for _, file := range files {
		result, err := AnalyzeImageQuality(file)
		if err != nil {
			log.Printf("Quality check failed for %s: %v", file.Filename, err)
			// Return a default "pass" result so one bad image doesn't block everything
			results = append(results, &ImageQualityResult{
				OverallScore: 50,
				PassesCheck:  true,
			})
			continue
		}
		// Reset file reader position for downstream consumers
		resetFileReader(file)
		results = append(results, result)
	}
	return results, nil
}

// resetFileReader reopens the file to reset the read position.
func resetFileReader(file *multipart.FileHeader) {
	// multipart.FileHeader can be re-opened, so downstream code can re-read it
	f, err := file.Open()
	if err == nil {
		if seeker, ok := f.(io.Seeker); ok {
			seeker.Seek(0, io.SeekStart)
		}
		f.Close()
	}
}

// checkResolution scores the image resolution.
func checkResolution(w, h int) int {
	pixels := w * h
	minDim := w
	if h < w {
		minDim = h
	}

	// Very small images are unusable
	if minDim < 100 || pixels < 10000 {
		return 10
	}
	if minDim < 200 || pixels < 50000 {
		return 25
	}
	if minDim < 400 || pixels < 200000 {
		return 50
	}
	if minDim < 600 || pixels < 500000 {
		return 70
	}
	if minDim < 800 || pixels < 1000000 {
		return 85
	}
	return 100
}

// analyzeBrightness samples the image and returns average brightness, dark pixel %, bright pixel %.
func analyzeBrightness(img image.Image) (avgBrightness float64, darkPct float64, brightPct float64) {
	bounds := img.Bounds()
	w := bounds.Max.X - bounds.Min.X
	h := bounds.Max.Y - bounds.Min.Y

	// Sample every Nth pixel for performance (target ~10000 samples max)
	step := 1
	totalPixels := w * h
	if totalPixels > 10000 {
		step = int(math.Sqrt(float64(totalPixels) / 10000))
		if step < 1 {
			step = 1
		}
	}

	var totalBrightness float64
	var count, darkCount, brightCount int

	for y := bounds.Min.Y; y < bounds.Max.Y; y += step {
		for x := bounds.Min.X; x < bounds.Max.X; x += step {
			r, g, b, _ := img.At(x, y).RGBA()
			// Convert from 16-bit to 8-bit
			rf := float64(r >> 8)
			gf := float64(g >> 8)
			bf := float64(b >> 8)

			// Perceived brightness (ITU-R BT.601)
			brightness := 0.299*rf + 0.587*gf + 0.114*bf

			totalBrightness += brightness
			count++

			if brightness < 40 {
				darkCount++
			} else if brightness > 220 {
				brightCount++
			}
		}
	}

	if count == 0 {
		return 128, 0, 0
	}

	avgBrightness = totalBrightness / float64(count)
	darkPct = float64(darkCount) / float64(count)
	brightPct = float64(brightCount) / float64(count)
	return
}

// analyzeBlur approximates Laplacian variance as a blur metric.
// Higher value = sharper. Thresholds: < 40 = very blurry, < 100 = somewhat blurry, > 100 = acceptable.
func analyzeBlur(img image.Image) float64 {
	bounds := img.Bounds()
	w := bounds.Max.X - bounds.Min.X
	h := bounds.Max.Y - bounds.Min.Y

	if w < 3 || h < 3 {
		return 0
	}

	// Convert to grayscale luminance array (sampled for performance)
	step := 1
	totalPixels := w * h
	if totalPixels > 250000 {
		step = int(math.Sqrt(float64(totalPixels) / 250000))
		if step < 1 {
			step = 1
		}
	}

	sampledW := (w + step - 1) / step
	sampledH := (h + step - 1) / step
	gray := make([]float64, sampledW*sampledH)

	for sy := 0; sy < sampledH; sy++ {
		for sx := 0; sx < sampledW; sx++ {
			px := bounds.Min.X + sx*step
			py := bounds.Min.Y + sy*step
			if px >= bounds.Max.X {
				px = bounds.Max.X - 1
			}
			if py >= bounds.Max.Y {
				py = bounds.Max.Y - 1
			}
			r, g, b, _ := img.At(px, py).RGBA()
			// Luminance in 0-255 range
			lum := (0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b)) / 256.0
			gray[sy*sampledW+sx] = lum
		}
	}

	// Compute Laplacian variance
	var sumLap, sumLap2 float64
	var lapCount int

	for y := 1; y < sampledH-1; y++ {
		for x := 1; x < sampledW-1; x++ {
			// Laplacian kernel: center*4 - top - bottom - left - right
			center := gray[y*sampledW+x]
			top := gray[(y-1)*sampledW+x]
			bottom := gray[(y+1)*sampledW+x]
			left := gray[y*sampledW+(x-1)]
			right := gray[y*sampledW+(x+1)]

			lap := 4*center - top - bottom - left - right
			sumLap += lap
			sumLap2 += lap * lap
			lapCount++
		}
	}

	if lapCount == 0 {
		return 0
	}

	mean := sumLap / float64(lapCount)
	variance := (sumLap2 / float64(lapCount)) - (mean * mean)

	return math.Abs(variance)
}

// GetQualityLabel returns a human-readable quality label.
func GetQualityLabel(score int) string {
	switch {
	case score >= 90:
		return "Excellent"
	case score >= 75:
		return "Good"
	case score >= 55:
		return "Fair"
	case score >= 40:
		return "Poor"
	default:
		return "Very Poor"
	}
}

// FormatQualityWarnings converts ImageQualityResult into the GeminiResponse quality fields
// so the existing frontend can display them without changes.
func FormatQualityWarnings(results []*ImageQualityResult) (isBlurryOrDark bool, qualityWarning string, issues []ImageQualityIssue) {
	var allIssues []ImageQualityIssue
	var warnings []string

	for i, r := range results {
		if r == nil {
			continue
		}
		for _, issue := range r.Issues {
			allIssues = append(allIssues, issue)
			prefix := ""
			if len(results) > 1 {
				prefix = fmt.Sprintf("Photo %d: ", i+1)
			}
			warnings = append(warnings, prefix+issue.Message+" "+issue.Suggestion)

			if issue.Type == "blur" || issue.Type == "dark" || issue.Type == "bright" {
				isBlurryOrDark = true
			}
		}
	}

	qualityWarning = strings.Join(warnings, " | ")
	return isBlurryOrDark, qualityWarning, allIssues
}
