export const formatPHP = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '₱0.00'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
}
