export function normalizeDiopter(raw: string, field: string, isEdited = true): string {
  if (!isEdited || !['sph', 'cyl', 'add'].includes(field)) return raw
  const input = raw.trim().replace(/^−/, '-')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) return raw

  const value = Number(input)
  if (!Number.isFinite(value)) return raw
  const explicitSign = /^[+-]/.test(input) ? input[0] : ''
  const defaultSign = field === 'cyl' ? '-' : field === 'add' ? '+' : ''
  const sign = explicitSign || (value === 0 ? '' : defaultSign)
  const magnitude = input.replace(/^[+-]/, '')
  if (input.includes('.')) return `${sign}${magnitude}`
  return `${sign}${(Math.abs(value) / 100).toFixed(2)}`
}
