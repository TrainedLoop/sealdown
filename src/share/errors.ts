export type LinkErrorKind = 'corrupt' | 'expired' | 'network' | 'unknown-format'

/** Why a shared link could not be opened; the UI maps each kind to a message. */
export class LinkError extends Error {
  readonly kind: LinkErrorKind

  constructor(kind: LinkErrorKind, options?: ErrorOptions) {
    super(`link error: ${kind}`, options)
    this.name = 'LinkError'
    this.kind = kind
  }
}
