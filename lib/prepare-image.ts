/**
 * Shrinks an attached image before it is sent to the model.
 *
 * This is not an optimisation, it is what makes the feature work at all. An
 * attachment travels to the model inside the request body as a base64 `data:`
 * URL, which is about a third larger than the file on disk, and the deployed
 * request body is capped well below the size of a modern phone photo. Sending
 * one untouched fails the whole turn with a 413 rather than degrading.
 *
 * A photo of a textbook page or a screenshot of a worked solution stays
 * perfectly legible at this size, and a smaller image also costs the student
 * fewer tokens per question.
 */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

/** Above this, re-encode even when the pixel dimensions look reasonable. */
const SOFT_BYTE_BUDGET = 400_000;

export interface PreparedImage {
  url: string;
  mediaType: string;
}

function estimateBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // Four base64 characters encode three bytes.
  return Math.floor((base64.length * 3) / 4);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  // oxlint-disable-next-line eslint-plugin-promise(avoid-new)
  return new Promise((resolve, reject) => {
    const image = new Image();
    // oxlint-disable-next-line eslint-plugin-unicorn(prefer-add-event-listener)
    image.onload = () => resolve(image);
    // oxlint-disable-next-line eslint-plugin-unicorn(prefer-add-event-listener)
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = url;
  });
}

/**
 * Returns a smaller version of `dataUrl`, or the original when shrinking it
 * would not help.
 *
 * Failure is deliberately silent: if the browser cannot decode the image, the
 * original is returned and the request is allowed to proceed. A send that the
 * server might still accept is a better outcome than refusing locally.
 */
export async function prepareImage(
  dataUrl: string,
  mediaType: string
): Promise<PreparedImage> {
  const unchanged = { mediaType, url: dataUrl };

  if (!mediaType.startsWith("image/")) {
    return unchanged;
  }

  try {
    const image = await loadImage(dataUrl);
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    if (longestEdge === 0) {
      return unchanged;
    }

    const needsResize = longestEdge > MAX_EDGE;
    const needsRecompress = estimateBytes(dataUrl) > SOFT_BYTE_BUDGET;
    if (!(needsResize || needsRecompress)) {
      return unchanged;
    }

    const scale = needsResize ? MAX_EDGE / longestEdge : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      return unchanged;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // JPEG rather than the source type: these are photographs and screenshots
    // of maths, where PNG's lossless guarantee costs several times the bytes
    // for no readability the student would notice.
    const resized = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

    // Re-encoding a small, already-efficient image can make it bigger.
    if (estimateBytes(resized) >= estimateBytes(dataUrl)) {
      return unchanged;
    }

    return { mediaType: "image/jpeg", url: resized };
  } catch {
    return unchanged;
  }
}
