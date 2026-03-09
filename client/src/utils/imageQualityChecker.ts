/**
 * Client-side Image Quality Checker
 *
 * Performs fast pre-upload checks using the Canvas API to detect:
 * - Low resolution images
 * - Too dark / too bright images
 * - Blurry images (Laplacian variance approximation)
 * - Unusual aspect ratios (likely screenshots)
 *
 * These are instant checks that run before the server-side AI analysis.
 */

export interface ImageQualityIssue {
  type: 'low_resolution' | 'dark' | 'bright' | 'blur' | 'aspect_ratio' | 'small_file'
  severity: 'warning' | 'error'
  message: string
  suggestion: string
  score: number // 0-100
}

export interface ImageQualityResult {
  overallScore: number // 0-100
  passesCheck: boolean
  issues: ImageQualityIssue[]
  width: number
  height: number
  isDark: boolean
  isBright: boolean
  isBlurry: boolean
  isLowRes: boolean
  brightnessAvg: number
}

const MIN_DIMENSION = 300
const MIN_PIXELS = 100_000
const DARK_THRESHOLD = 60
const BRIGHT_THRESHOLD = 220
const BLUR_THRESHOLD = 15

/**
 * Analyze a single image File for quality issues using Canvas.
 */
export async function checkImageQuality(file: File): Promise<ImageQualityResult> {
  const img = await loadImage(file)
  const { width, height } = img

  const issues: ImageQualityIssue[] = []
  const scores: number[] = []

  // 1. Resolution check
  const resScore = scoreResolution(width, height)
  scores.push(resScore)
  if (resScore < 60) {
    const minDim = Math.min(width, height)
    issues.push({
      type: 'low_resolution',
      severity: resScore < 30 ? 'error' : 'warning',
      message: `⚠ Image resolution is low (${width}×${height}).`,
      suggestion: 'Please retake the photo at higher resolution for better trade chances.',
      score: resScore,
    })
  }

  // 2. File size check (very small files = likely low quality)
  if (file.size < 15_000) {
    issues.push({
      type: 'small_file',
      severity: 'warning',
      message: '⚠ Image file is very small, which may indicate poor quality.',
      suggestion: 'Use the original photo from your camera for best results.',
      score: 40,
    })
    scores.push(40)
  }

  // 3. Aspect ratio check
  const aspect = width / height
  if (aspect > 3.5 || aspect < 0.28) {
    issues.push({
      type: 'aspect_ratio',
      severity: 'warning',
      message: '⚠ Unusual aspect ratio — this may be a screenshot or cropped image.',
      suggestion: 'Use a standard photo of the product for the best listing results.',
      score: 55,
    })
    scores.push(55)
  }

  // 4. Brightness & blur analysis via Canvas sampling
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  // Downsample for performance (max 200x200 for analysis)
  const scale = Math.min(1, 200 / Math.max(width, height))
  const sw = Math.round(width * scale)
  const sh = Math.round(height * scale)
  canvas.width = sw
  canvas.height = sh
  ctx.drawImage(img, 0, 0, sw, sh)

  const imageData = ctx.getImageData(0, 0, sw, sh)
  const pixels = imageData.data

  // Brightness analysis
  const { avgBrightness, darkPct, brightPct } = analyzeBrightness(pixels)
  let isDark = false
  let isBright = false
  let brightScore = 100

  if (darkPct > 0.45 || avgBrightness < DARK_THRESHOLD) {
    isDark = true
    brightScore = Math.max(0, Math.round(100 - (100 - avgBrightness) * 1.5))
    if (avgBrightness < 35) brightScore = Math.max(0, brightScore - 20)
    issues.push({
      type: 'dark',
      severity: avgBrightness < 35 ? 'error' : 'warning',
      message: '⚠ Image quality is low — the photo appears too dark.',
      suggestion: 'Please retake the photo with better lighting for better trade chances.',
      score: brightScore,
    })
  } else if (brightPct > 0.45 || avgBrightness > BRIGHT_THRESHOLD) {
    isBright = true
    brightScore = Math.max(0, Math.round(100 - (avgBrightness - 200) * 2))
    issues.push({
      type: 'bright',
      severity: 'warning',
      message: '⚠ Image appears overexposed or washed out.',
      suggestion: 'Reduce brightness or avoid direct flash when photographing your item.',
      score: brightScore,
    })
  }
  scores.push(brightScore)

  // Blur detection (Laplacian variance approximation on grayscale)
  const blurVariance = analyzeBlur(pixels, sw, sh)
  let isBlurry = false
  let sharpScore = 100

  if (blurVariance < BLUR_THRESHOLD) {
    isBlurry = true
    sharpScore = Math.max(0, Math.round((blurVariance / BLUR_THRESHOLD) * 100))
    if (blurVariance < BLUR_THRESHOLD / 2) sharpScore = Math.max(0, sharpScore - 10)
    issues.push({
      type: 'blur',
      severity: blurVariance < BLUR_THRESHOLD / 2 ? 'error' : 'warning',
      message: '⚠ Image quality is low — the photo appears blurry.',
      suggestion: 'Please retake the photo with a steady hand for better trade chances.',
      score: sharpScore,
    })
  }
  scores.push(sharpScore)

  // Overall score
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 100

  return {
    overallScore,
    passesCheck: overallScore >= 35,
    issues,
    width,
    height,
    isDark,
    isBright,
    isBlurry,
    isLowRes: resScore < 60,
    brightnessAvg: avgBrightness,
  }
}

/**
 * Check quality of multiple images. Returns results per image.
 */
export async function checkMultipleImageQuality(files: File[]): Promise<ImageQualityResult[]> {
  return Promise.all(files.map(f => checkImageQuality(f)))
}

// ── Internal helpers ──────────────────────────────────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

function scoreResolution(w: number, h: number): number {
  const pixels = w * h
  const minDim = Math.min(w, h)

  if (minDim < 80 || pixels < 8_000) return 10
  if (minDim < 150 || pixels < 30_000) return 25
  if (minDim < MIN_DIMENSION || pixels < MIN_PIXELS) return 50
  if (minDim < 500 || pixels < 400_000) return 70
  if (minDim < 700 || pixels < 800_000) return 85
  return 100
}

function analyzeBrightness(pixels: Uint8ClampedArray) {
  let totalBrightness = 0
  let darkCount = 0
  let brightCount = 0
  const pixelCount = pixels.length / 4

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b

    totalBrightness += brightness
    if (brightness < 40) darkCount++
    if (brightness > 220) brightCount++
  }

  return {
    avgBrightness: pixelCount > 0 ? totalBrightness / pixelCount : 128,
    darkPct: pixelCount > 0 ? darkCount / pixelCount : 0,
    brightPct: pixelCount > 0 ? brightCount / pixelCount : 0,
  }
}

function analyzeBlur(pixels: Uint8ClampedArray, width: number, height: number): number {
  // Convert to grayscale array
  const gray = new Float64Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const pi = i * 4
    gray[i] = 0.299 * pixels[pi] + 0.587 * pixels[pi + 1] + 0.114 * pixels[pi + 2]
  }

  // Laplacian variance
  let sumLap = 0
  let sumLap2 = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x]
      const top = gray[(y - 1) * width + x]
      const bottom = gray[(y + 1) * width + x]
      const left = gray[y * width + (x - 1)]
      const right = gray[y * width + (x + 1)]

      const lap = 4 * center - top - bottom - left - right
      sumLap += lap
      sumLap2 += lap * lap
      count++
    }
  }

  if (count === 0) return 0
  const mean = sumLap / count
  const variance = sumLap2 / count - mean * mean
  return Math.abs(variance)
}

/**
 * Get a human-readable quality label from a score.
 */
export function getQualityLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 55) return 'Fair'
  if (score >= 40) return 'Poor'
  return 'Very Poor'
}

/**
 * Get the color scheme for a quality score (for Chakra UI).
 */
export function getQualityColorScheme(score: number): string {
  if (score >= 80) return 'green'
  if (score >= 60) return 'yellow'
  if (score >= 40) return 'orange'
  return 'red'
}
