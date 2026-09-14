// Clipboard events require no clipboard-read permission; use only the image the user pasted.
export function pastedImage(data: {
  items: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }>
  files: ArrayLike<File>
}): File | null {
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return Array.from(data.files).find(file => file.type.startsWith('image/')) || null
}
