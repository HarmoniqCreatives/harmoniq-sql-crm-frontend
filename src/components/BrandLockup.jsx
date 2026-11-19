import meloIcon from '../assets/brand/melo-icon.svg'
import meloLockup from '../assets/brand/melo-lockup.svg'

export const MELO_TAGLINE = 'Powered by Harmoniq Creatives'

/**
 * Official Melo brand lockup.
 * Expanded: icon + wordmark SVG + live tagline.
 * Collapsed: coral icon only.
 *
 * @param {{
 *   collapsed?: boolean,
 *   showTagline?: boolean,
 *   className?: string,
 * }} props
 */
export function BrandLockup({ collapsed = false, showTagline = true, className = '' }) {
  return (
    <div className={`melo-brand ${collapsed ? 'is-collapsed' : ''} ${className}`.trim()}>
      <div className="melo-lockup-row">
        {collapsed ? (
          <img src={meloIcon} alt="Melo" className="melo-icon" width={36} height={36} />
        ) : (
          <img
            src={meloLockup}
            alt="Melo"
            className="melo-lockup-img"
            width={180}
            height={52}
          />
        )}
      </div>
      {!collapsed && showTagline ? (
        <p className="melo-tagline">{MELO_TAGLINE}</p>
      ) : null}
    </div>
  )
}
