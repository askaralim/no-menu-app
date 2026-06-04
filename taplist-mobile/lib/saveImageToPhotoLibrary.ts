import * as MediaLibrary from 'expo-media-library'

export class PhotoLibraryPermissionError extends Error {
  constructor() {
    super('photo_library_permission_denied')
    this.name = 'PhotoLibraryPermissionError'
  }
}

/** Add-only photo library access (writeOnly on iOS). */
export async function ensurePhotoLibraryAddPermission(): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync(true)
  if (status !== 'granted') {
    throw new PhotoLibraryPermissionError()
  }
}

export async function saveImageUriToPhotoLibrary(uri: string): Promise<void> {
  await ensurePhotoLibraryAddPermission()
  await MediaLibrary.saveToLibraryAsync(uri)
}
