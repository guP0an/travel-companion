// Files are read locally. Only the reviewed text is sent to the formatting API.
export async function readTripDocument(file: File, progress: (text: string) => void): Promise<string> {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('请选择 15MB 以内的非空文件')
  const ext = file.name.split('.').pop()?.toLowerCase()
  let result = ''
  const recognize = async (image: File | HTMLCanvasElement) => {
    const { default: OCR } = await import('tesseract.js')
    return (await OCR.recognize(image, 'chi_sim+eng')).data.text
  }
  if (['txt', 'md'].includes(ext || '')) {
    result = await file.text()
  } else if (ext === 'docx') {
    const { default: mammoth } = await import('mammoth')
    result = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value
  } else if (ext === 'pdf') {
    const pdf = await import('pdfjs-dist')
    const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdf.GlobalWorkerOptions.workerSrc = worker
    const task = pdf.getDocument({ data: await file.arrayBuffer(), enableXfa: false })
    try {
      const pdfDocument = await task.promise
      if (pdfDocument.numPages > 15) throw new Error('单次最多导入 15 页 PDF，请拆分后导入')
      for (let index = 1; index <= pdfDocument.numPages; index++) {
        progress(`正在读取第 ${index} / ${pdfDocument.numPages} 页…`)
        const page = await pdfDocument.getPage(index)
        const content = await page.getTextContent()
        let text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
        if (!text.trim()) {
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) })
          const surface = window.document.createElement('canvas')
          surface.width = Math.ceil(viewport.width)
          surface.height = Math.ceil(viewport.height)
          try {
            await page.render({ canvas: surface, viewport }).promise
            text = await recognize(surface)
          } finally { surface.width = surface.height = 0 }
        }
        result += `\n${text}`
        page.cleanup()
        if (result.length > 20_000) throw new Error('内容超过 2 万字，请拆分后导入')
      }
    } finally { await task.destroy() }
  } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
    progress('正在识别图片文字，首次加载可能稍慢…')
    result = await recognize(file)
  } else {
    throw new Error('支持 PDF、Word（.docx）、TXT、Markdown 和 JPG/PNG/WebP 图片')
  }
  result = result.replace(/\r\n/g, '\n').trim()
  if (!result) throw new Error('没有读到文字。Word 中的图片请单独导入，或换一份清晰文件')
  if (result.length > 20_000) throw new Error('内容超过 2 万字，请拆分后导入')
  return result
}
