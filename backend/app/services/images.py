"""Opening a picture someone uploaded: its size is read from the header and checked before a single
pixel is decoded, so a small file that claims to be enormous can't fill the server's memory."""
import io

from PIL import Image

# 40 megapixels: more than any phone takes, far less than fills a small server's memory.
MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageTooLarge(ValueError):
    pass


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    if img.width * img.height > MAX_PIXELS:
        raise ImageTooLarge(f"The picture has too many pixels ({img.width}×{img.height})")
    return img
