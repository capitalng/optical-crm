import { supabase } from './supabase'
import type { CustomerDocument } from './types'

export const DOC_BUCKET = 'customer-docs'

/** Matches the bucket's server-side file_size_limit in patch-customer-documents.sql. */
export const MAX_DOC_BYTES = 25 * 1024 * 1024

/**
 * Storage allowance of the current Supabase plan.
 * Free = 1 GB. Change to 100 * 1024 ** 3 after upgrading to Pro.
 */
export const PLAN_STORAGE_BYTES = 1024 ** 3

/** Photos are shrunk to this longest edge before upload. */
const MAX_IMAGE_EDGE = 2000
const JPEG_QUALITY = 0.82

/** How long a generated file link stays valid (seconds). */
const SIGNED_URL_TTL = 300

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
]

/** What the file picker offers. Kept in step with the bucket's mime allowlist. */
export const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,application/pdf,image/*'

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function extensionFor(file: File): string {
  switch (file.type) {
    case 'application/pdf':
      return 'pdf'
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default: {
      const match = file.name.match(/\.(\w{1,5})$/)
      return match ? match[1].toLowerCase() : 'bin'
    }
  }
}

/**
 * customer-docs/<customer uuid>/<YYYYMMDD>-<8 hex>.<ext>
 * No name, IC or phone in the path: a leaked path reveals nothing about who
 * the scan belongs to. The random suffix plus the unique constraint on
 * storage_path make collisions impossible.
 */
export function buildStoragePath(customerId: string, file: File): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${customerId}/${stamp}-${suffix}.${extensionFor(file)}`
}

/** Returns a human-readable problem, or null when the file is acceptable. */
export function validateFile(file: File): string | null {
  const looksAccepted =
    ACCEPTED_TYPES.includes(file.type) ||
    /\.(pdf|jpe?g|png|webp|heic|heif|tiff?)$/i.test(file.name)
  // Lenient on type: some file providers hand back an empty MIME type.
  // The bucket's allowed_mime_types is the real gate.
  if (!looksAccepted) return `“${file.name}” is not a PDF or image file.`
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > MAX_DOC_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(
      MAX_DOC_BYTES,
    )} — please export a smaller file.`
  }
  return null
}

/**
 * Shrinks a photo before upload: long edge capped at 2000px, re-encoded as
 * JPEG. A 4 MB camera photo typically lands around 400 KB with no visible
 * difference on screen — the difference between the free 1 GB holding a few
 * hundred scans and holding a few thousand.
 *
 * PDFs pass through untouched, as does anything the browser cannot decode
 * (some HEIC files) or anything that would come out larger than it went in.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

/** Turns a raw storage error into something staff can act on. */
export function describeStorageError(message: string): string {
  if (/mime type/i.test(message)) return 'That file type is not accepted.'
  if (/exceeded the maximum allowed size/i.test(message)) {
    return `That file is too large (limit ${formatBytes(MAX_DOC_BYTES)}).`
  }
  if (/duplicate|already exists/i.test(message)) return 'That file was already uploaded.'
  return message
}

/**
 * Uploads the file, then records it. If the upload succeeds but the metadata
 * insert fails, the object is orphaned (the app has no delete permission) —
 * the thrown message includes the path so it can be traced in the dashboard.
 */
export async function uploadCustomerDocument(
  customerId: string,
  original: File,
): Promise<CustomerDocument> {
  const file = await compressImage(original)
  const path = buildStoragePath(customerId, file)
  const contentType = file.type || 'application/octet-stream'

  const { error: uploadError } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, file, { contentType, upsert: false, cacheControl: '3600' })
  if (uploadError) throw new Error(describeStorageError(uploadError.message))

  const { data, error } = await supabase
    .from('customer_documents')
    .insert({
      customer_id: customerId,
      storage_path: path,
      file_name: original.name,
      byte_size: file.size,
      content_type: contentType,
      doc_date: new Date().toISOString().slice(0, 10),
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(
      `The file uploaded but could not be recorded (${error?.message ?? 'no row returned'}). ` +
        `Storage path: ${path}`,
    )
  }
  return data as CustomerDocument
}

/** Short-lived link to a stored file. `downloadAs` makes the browser save it. */
export async function signedDocUrl(path: string, downloadAs?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL, downloadAs ? { download: downloadAs } : undefined)
  if (error || !data) {
    throw new Error(
      error?.message.match(/not found/i)
        ? 'This file could not be found in storage — it may have been removed from the Supabase dashboard.'
        : (error?.message ?? 'Could not create a link to the file'),
    )
  }
  return data.signedUrl
}
