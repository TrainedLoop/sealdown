import type { SVGProps } from 'react'

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const

const LOGO_DIR = `${import.meta.env.BASE_URL}sealdown-logo/`

/**
 * The Sealdown mark (public/sealdown-logo): the colour icon on light surfaces, the white one on
 * dark ones. Both are in the page and the theme shows one, so switching never waits for a load.
 */
export function SealMark({ size = 26 }: { size?: number }) {
  return (
    <span className="seal-mark" style={{ height: size }} aria-hidden="true">
      <img className="seal-mark-light" src={`${LOGO_DIR}sealdown-icon-color.svg`} alt="" height={size} />
      <img className="seal-mark-dark" src={`${LOGO_DIR}sealdown-icon-white.svg`} alt="" height={size} />
    </span>
  )
}

export function Sun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

export function Moon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  )
}

export function Lock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  )
}

export function Folder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...props}>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
    </svg>
  )
}

export function Download(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
    </svg>
  )
}

export function Play(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="5" width="17" height="12" rx="1.6" />
      <path d="m10.5 8.5 4 2.5-4 2.5Z" fill="currentColor" />
      <path d="M9 20.5h6" strokeLinecap="round" />
    </svg>
  )
}

export function Key(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
    </svg>
  )
}

/** The seal, large, pressed in when it appears (the one animated moment in the app). */
export function SealStamp() {
  return (
    <div className="seal-stamp" aria-hidden="true">
      <SealMark size={84} />
    </div>
  )
}

export function Search(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  )
}

export function People(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.5 14.2a4.6 4.6 0 0 1 5 5.3" />
    </svg>
  )
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  )
}

export function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  )
}

export function Chevron(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  )
}
