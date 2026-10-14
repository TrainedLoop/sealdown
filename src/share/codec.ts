import { LinkError } from './errors.ts'

async function pipe(data: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Response(data as BodyInit).body!.pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function compress(text: string): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw'))
}

export async function decompress(bytes: Uint8Array): Promise<string> {
  try {
    const raw = await pipe(bytes, new DecompressionStream('deflate-raw'))
    return new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch (cause) {
    throw new LinkError('corrupt', { cause })
  }
}
