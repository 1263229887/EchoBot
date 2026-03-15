import { mouse, keyboard, Key, Point } from '@nut-tree-fork/nut-js'
import { clipboard, nativeImage } from 'electron'

keyboard.config.autoDelayMs = 80

export async function sendReply(text, coordinates) {
  // copy to clipboard
  clipboard.writeText(text)

  // click target input box
  await mouse.setPosition(new Point(coordinates.x, coordinates.y))
  await mouse.leftClick()

  // small delay for focus
  await new Promise((r) => setTimeout(r, 200))

  // paste
  await keyboard.pressKey(Key.LeftControl, Key.V)
  await keyboard.releaseKey(Key.LeftControl, Key.V)

  // small delay before send
  await new Promise((r) => setTimeout(r, 150))

  // press enter to send
  await keyboard.pressKey(Key.Enter)
  await keyboard.releaseKey(Key.Enter)
}

export async function sendImageReply(imagePath, coordinates) {
  // load image and write to clipboard
  const image = nativeImage.createFromPath(imagePath)
  if (image.isEmpty()) {
    throw new Error(`图片加载失败: ${imagePath}`)
  }
  clipboard.writeImage(image)

  // click target input box
  await mouse.setPosition(new Point(coordinates.x, coordinates.y))
  await mouse.leftClick()

  // small delay for focus
  await new Promise((r) => setTimeout(r, 300))

  // paste image
  await keyboard.pressKey(Key.LeftControl, Key.V)
  await keyboard.releaseKey(Key.LeftControl, Key.V)

  // longer delay for image to load in input
  await new Promise((r) => setTimeout(r, 500))

  // press enter to send
  await keyboard.pressKey(Key.Enter)
  await keyboard.releaseKey(Key.Enter)
}
