import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { PostZenApiError } from './errors';
import type { MediaPresignRequest, MediaPresignResponse } from './generated/types.gen';

/**
 * Content types accepted by the media presign endpoint.
 */
export type MediaContentType = MediaPresignRequest['contentType'];

/**
 * Media category returned by the media presign endpoint.
 */
export type MediaType = MediaPresignResponse['type'];

/**
 * Source bytes for {@link PostZen.media.upload}: either a file path or the raw
 * file contents. When raw bytes are provided, `filename` must be set in the
 * options so the content type can be inferred and the upload named.
 */
export type MediaUploadSource = string | Uint8Array;

/**
 * Options for {@link PostZen.media.upload}.
 */
export interface MediaUploadOptions {
  /**
   * File name used for the upload. Required when uploading raw bytes; defaults
   * to the basename of the path when a file path is provided.
   */
  filename?: string;

  /**
   * Explicit content type. Inferred from the file extension when omitted.
   */
  contentType?: MediaContentType;

  /**
   * Optional profile scope. The API key must have access to the profile.
   */
  profileId?: string;

  /**
   * Abort signal applied to both the presign request and the byte upload.
   */
  signal?: AbortSignal | null;
}

/**
 * Result of a successful {@link PostZen.media.upload}.
 */
export interface UploadedMedia {
  /**
   * PostZen-hosted URL to reference in post `mediaItems`.
   */
  publicUrl: string;

  /**
   * Storage key of the uploaded object.
   */
  key: string;

  /**
   * Media category detected by PostZen.
   */
  type: MediaType;

  /**
   * Uploaded byte size.
   */
  size: number;

  /**
   * File name used for the upload.
   */
  filename: string;
}

/**
 * Client-provided plumbing supplied by the generated {@link PostZen} client so
 * the upload helper can presign through the normal request path and honor the
 * client timeout for the byte upload.
 */
export interface MediaUploadInternals {
  presign: (body: MediaPresignRequest, signal?: AbortSignal | null) => Promise<MediaPresignResponse>;
  putSignal: (callerSignal?: AbortSignal | null) => AbortSignal | undefined;
}

/**
 * Maps a lowercased file extension to a presign content type. Mirrors the
 * content types accepted by `POST /v1/media/presign`.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, MediaContentType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  pdf: 'application/pdf',
};

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * Infers a presign content type from a file name's extension.
 *
 * @throws Error when the extension is unknown. The caller should pass an
 * explicit `contentType`.
 */
export function inferContentType(filename: string): MediaContentType {
  const extension = fileExtension(filename);
  const contentType = extension ? CONTENT_TYPE_BY_EXTENSION[extension] : undefined;

  if (!contentType) {
    throw new Error(
      `Unable to infer a content type from the file extension "${extension || '(none)'}" for "${filename}". Pass an explicit contentType option.`
    );
  }

  return contentType;
}

/**
 * Uploads media in one step: presign, PUT the raw bytes to the returned
 * `uploadUrl`, and return the public URL and metadata.
 */
export async function uploadMedia(
  source: MediaUploadSource,
  options: MediaUploadOptions | undefined,
  internals: MediaUploadInternals
): Promise<UploadedMedia> {
  let bytes: Uint8Array;
  let filename: string;

  if (typeof source === 'string') {
    bytes = readFileSync(source);
    filename = options?.filename ?? basename(source);
  } else {
    if (!options?.filename) {
      throw new Error('A filename is required when uploading raw bytes. Pass it via options.filename.');
    }

    bytes = source;
    filename = options.filename;
  }

  const contentType = options?.contentType ?? inferContentType(filename);
  const size = bytes.byteLength;

  const presign = await internals.presign(
    {
      filename,
      contentType,
      size,
      ...(options?.profileId ? { profileId: options.profileId } : {}),
    },
    options?.signal
  );

  const uploadResponse = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    // Node's fetch accepts a Uint8Array/Buffer body; the DOM BodyInit type does not.
    body: bytes as unknown as BodyInit,
    signal: internals.putSignal(options?.signal) ?? undefined,
  });

  if (!uploadResponse.ok) {
    throw new PostZenApiError('upload to presigned URL failed', uploadResponse.status);
  }

  return {
    publicUrl: presign.publicUrl,
    key: presign.key,
    type: presign.type,
    size,
    filename,
  };
}
