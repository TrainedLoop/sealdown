export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Rasterizes an SVG (without foreignObject, or the canvas gets tainted) over a solid background. */
export async function svgToPngBlob(svg: string, background: string, scale = 2): Promise<Blob> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  const [, , vbWidth, vbHeight] = (root.getAttribute('viewBox') ?? '0 0 300 150').split(/[\s,]+/).map(Number)
  // Mermaid emits width="100%", which gives an <img> no intrinsic size.
  root.setAttribute('width', String(vbWidth))
  root.setAttribute('height', String(vbHeight))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vbWidth * scale)
    canvas.height = Math.ceil(vbHeight * scale)
    const context = canvas.getContext('2d')!
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
