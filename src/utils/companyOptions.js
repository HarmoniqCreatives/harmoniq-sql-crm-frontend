/**
 * Company Settings timezone / currency options (mirrors backend enums).
 */

export const COMPANY_TIMEZONES = [
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UAE)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (India)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (Pakistan)' },
]

export const COMPANY_CURRENCIES = [
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
]

export function currencyLabel(code) {
  const row = COMPANY_CURRENCIES.find((item) => item.value === code)
  return row ? row.label : code
}
