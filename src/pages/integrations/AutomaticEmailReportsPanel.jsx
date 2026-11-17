import { useEffect, useState } from 'react'
import {
  createEmailReport,
  deleteEmailReport,
  getCompany,
  readApiError,
  setEmailReportsEnabled,
  updateEmailReport,
} from '../../api/client'

const emptyForm = {
  id: '',
  reportType: 'lead_report',
  recipientsText: '',
  sendHour: '9',
  sendMinute: '0',
  sendMeridiem: 'AM',
  frequency: 'daily',
  monthlySchedule: 'start',
}

/**
 * Automatic Email Reports UI (moved from Settings). Reuses company email-report APIs.
 *
 * @param {{
 *   canManage: boolean,
 *   onNotice?: (message: string) => void,
 *   onError?: (message: string) => void,
 * }} props
 */
export function AutomaticEmailReportsPanel({ canManage, onNotice, onError }) {
  const [loading, setLoading] = useState(true)
  const [emailReportsEnabled, setEmailReportsEnabledState] = useState(false)
  const [emailReports, setEmailReports] = useState([])
  const [reportTimezone, setReportTimezone] = useState('')
  const [companyTimezone, setCompanyTimezone] = useState('')
  const [reportForm, setReportForm] = useState(emptyForm)

  async function load() {
    const companyPayload = await getCompany()
    const company = companyPayload.data.company
    const cfg = company.emailReports || {}
    setCompanyTimezone(company.timezone || '')
    setEmailReportsEnabledState(Boolean(cfg.enabled))
    setEmailReports(Array.isArray(cfg.reports) ? cfg.reports : [])
    setReportTimezone(cfg.timezone || company.timezone || '')
  }

  useEffect(() => {
    let active = true
    async function start() {
      setLoading(true)
      try {
        await load()
      } catch (loadError) {
        if (active) {
          onError?.(readApiError(loadError))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    start()
    return () => {
      active = false
    }
    // Load once on mount; toast handlers are stable from the parent page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="admin-panel">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </div>
    )
  }

  return (
    <div className="admin-panel integration-section">
      <h3 className="section-heading">Automatic Email Reports</h3>
      <p className="sub">
        Schedule Lead Reports by email. Attachments are separate CSVs by Page Type (including Unknown_Page_Type).
        Timezone: <strong>{reportTimezone || companyTimezone || '—'}</strong>
      </p>
      <label className="sub integration-check-line">
        <input
          type="checkbox"
          checked={emailReportsEnabled}
          disabled={!canManage}
          onChange={async (event) => {
            if (!canManage) return
            try {
              const payload = await setEmailReportsEnabled(event.target.checked)
              setEmailReportsEnabledState(Boolean(payload.data.emailReports.enabled))
              setEmailReports(payload.data.emailReports.reports || [])
              setReportTimezone(payload.data.emailReports.timezone || '')
              onNotice?.(payload.data.message)
            } catch (toggleError) {
              onError?.(readApiError(toggleError))
            }
          }}
        />
        Enable automatic email reports
      </label>

      {emailReports.length > 0 ? (
        <div className="admin-table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Recipients</th>
                <th>Time</th>
                <th>Frequency</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {emailReports.map((report) => (
                <tr key={report.id}>
                  <td>{report.reportName || report.reportType}</td>
                  <td>{(report.recipients || []).join(', ')}</td>
                  <td>
                    {String(report.sendHour).padStart(2, '0')}:
                    {String(report.sendMinute).padStart(2, '0')} {report.sendMeridiem}
                  </td>
                  <td>{report.periodLabel || report.frequency}</td>
                  <td>{emailReportsEnabled ? 'Enabled' : 'Paused'}</td>
                  <td>
                    {canManage ? (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => setReportForm({
                            id: report.id,
                            reportType: report.reportType || 'lead_report',
                            recipientsText: (report.recipients || []).join(', '),
                            sendHour: String(report.sendHour || 9),
                            sendMinute: String(report.sendMinute || 0),
                            sendMeridiem: report.sendMeridiem || 'AM',
                            frequency: report.frequency || 'daily',
                            monthlySchedule: report.monthlySchedule || 'start',
                          })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={async () => {
                            if (!window.confirm('Delete this email report schedule?')) return
                            try {
                              const payload = await deleteEmailReport(report.id)
                              setEmailReports(payload.data.emailReports.reports || [])
                              setEmailReportsEnabledState(Boolean(payload.data.emailReports.enabled))
                              onNotice?.(payload.data.message)
                              if (reportForm.id === report.id) {
                                setReportForm(emptyForm)
                              }
                            } catch (deleteError) {
                              onError?.(readApiError(deleteError))
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">No schedules yet.</p>
      )}

      {canManage ? (
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault()
            const recipients = reportForm.recipientsText
              .split(/[,;\s]+/)
              .map((item) => item.trim())
              .filter(Boolean)
            const body = {
              reportType: reportForm.reportType,
              recipients,
              sendHour: Number(reportForm.sendHour),
              sendMinute: Number(reportForm.sendMinute),
              sendMeridiem: reportForm.sendMeridiem,
              frequency: reportForm.frequency,
              monthlySchedule: reportForm.frequency === 'monthly'
                ? reportForm.monthlySchedule
                : null,
            }
            try {
              const payload = reportForm.id
                ? await updateEmailReport(reportForm.id, body)
                : await createEmailReport(body)
              setEmailReports(payload.data.emailReports.reports || [])
              setEmailReportsEnabledState(Boolean(payload.data.emailReports.enabled))
              onNotice?.(payload.data.message)
              setReportForm(emptyForm)
            } catch (saveError) {
              onError?.(readApiError(saveError))
            }
          }}
        >
          <div className="field">
            <label htmlFor="email-report-type">Report type</label>
            <select
              id="email-report-type"
              value={reportForm.reportType}
              onChange={(e) => setReportForm((prev) => ({ ...prev, reportType: e.target.value }))}
            >
              <option value="lead_report">Lead Report</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="email-report-recipients">Recipients (comma-separated)</label>
            <input
              id="email-report-recipients"
              value={reportForm.recipientsText}
              onChange={(e) => setReportForm((prev) => ({ ...prev, recipientsText: e.target.value }))}
              placeholder="ops@example.com, manager@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email-report-hour">Hour</label>
            <select
              id="email-report-hour"
              value={reportForm.sendHour}
              onChange={(e) => setReportForm((prev) => ({ ...prev, sendHour: e.target.value }))}
            >
              {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
                <option key={hour} value={hour}>{hour}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="email-report-minute">Minute</label>
            <select
              id="email-report-minute"
              value={reportForm.sendMinute}
              onChange={(e) => setReportForm((prev) => ({ ...prev, sendMinute: e.target.value }))}
            >
              {['0', '15', '30', '45'].map((minute) => (
                <option key={minute} value={minute}>{minute.padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="email-report-meridiem">AM/PM</label>
            <select
              id="email-report-meridiem"
              value={reportForm.sendMeridiem}
              onChange={(e) => setReportForm((prev) => ({ ...prev, sendMeridiem: e.target.value }))}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="email-report-frequency">Frequency</label>
            <select
              id="email-report-frequency"
              value={reportForm.frequency}
              onChange={(e) => setReportForm((prev) => ({ ...prev, frequency: e.target.value }))}
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {reportForm.frequency === 'monthly' ? (
            <div className="field">
              <label htmlFor="email-report-monthly">Monthly schedule</label>
              <select
                id="email-report-monthly"
                value={reportForm.monthlySchedule}
                onChange={(e) => setReportForm((prev) => ({ ...prev, monthlySchedule: e.target.value }))}
              >
                <option value="start">Beginning of month</option>
                <option value="end">End of month</option>
              </select>
            </div>
          ) : null}
          <div className="modal-actions" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
            <button type="submit" className="primary-btn">
              {reportForm.id ? 'Update schedule' : 'Add schedule'}
            </button>
            {reportForm.id ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setReportForm(emptyForm)}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="sub">You can view schedules but cannot change them.</p>
      )}
    </div>
  )
}
