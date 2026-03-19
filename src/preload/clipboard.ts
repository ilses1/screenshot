import { clipboard, nativeImage } from 'electron'

export const writeImageDataUrlToClipboard = (dataUrl: string) => {
  const image = nativeImage.createFromDataURL(dataUrl)
  if (!clipboard || typeof clipboard.writeImage !== 'function') {
    console.error('剪贴板对象不可用，无法写入图片')
    return
  }
  clipboard.writeImage(image)
}
