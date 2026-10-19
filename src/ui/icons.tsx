import type { SVGProps } from 'react'

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const

/** The Sealdown mark: a wax seal (scalloped disc) pressed with a keyhole. */
export function SealMark(props: SVGProps<SVGSVGElement>) {
  const lobes = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return <circle key={i} cx={16 + Math.cos(a) * 12.2} cy={16 + Math.sin(a) * 12.2} r="3.4" />
  })
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" {...props}>
      <g className="seal-mark-wax">
        {lobes}
        <circle cx="16" cy="16" r="12.6" />
      </g>
      <circle cx="16" cy="16" r="9.4" className="seal-mark-ring" fill="none" strokeWidth="1.2" />
      <path className="seal-mark-key" d="M16 10.6a2.9 2.9 0 0 0-1.5 5.4l-.9 4.9h4.8l-.9-4.9A2.9 2.9 0 0 0 16 10.6Z" />
    </svg>
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
