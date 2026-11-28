import filosIconColor from '../assets/brand/filos-icon.png'
import filosIconOnDark from '../assets/brand/filos-icon-on-dark.png'
import filosLockup from '../assets/brand/filos-lockup.png'

export const FILOS_TAGLINE = 'Powered by Harmoniq Creatives'
/** @deprecated Prefer FILOS_TAGLINE */
export const MELO_TAGLINE = FILOS_TAGLINE

/**
 * Official FILOS brand lockup from trademark artwork (Filos-TM-color).
 *
 * - `color`: full colour wordmark for light surfaces (auth).
 * - `onDark`: white F strokes + coloured nodes + white “ilos” for navy shell.
 * - collapsed: white-F mark only (for dark sidebar).
 *
 * @param {{
 *   collapsed?: boolean,
 *   showTagline?: boolean,
 *   variant?: 'color' | 'onDark',
 *   className?: string,
 * }} props
 */
export function BrandLockup({
  collapsed = false,
  showTagline = true,
  variant = 'onDark',
  className = '',
}) {
  const markSrc = variant === 'color' ? filosIconColor : filosIconOnDark

  return (
    <div className={`filos-brand melo-brand ${collapsed ? 'is-collapsed' : ''} ${className}`.trim()}>
      <div className="filos-lockup-row melo-lockup-row">
        {collapsed ? (
          <img src={markSrc} alt="FILOS" className="filos-icon melo-icon" width={36} height={36} />
        ) : variant === 'color' ? (
          <img
            src={filosLockup}
            alt="FILOS"
            className="filos-lockup-img melo-lockup-img"
            width={200}
            height={93}
          />
        ) : (
          <div className="filos-wordmark is-on-dark" role="img" aria-label="FILOS">
            <img
              src={filosIconOnDark}
              alt=""
              className="filos-icon filos-icon-inline melo-icon"
              width={40}
              height={40}
            />
            <span className="filos-word" aria-hidden="true">ilos</span>
          </div>
        )}
      </div>
      {!collapsed && showTagline ? (
        <p className="filos-tagline melo-tagline">{FILOS_TAGLINE}</p>
      ) : null}
    </div>
  )
}
