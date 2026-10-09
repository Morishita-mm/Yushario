"""Connected-blob helpers for splitting sprite sheets whose poses overlap in columns."""
import numpy as np


def blobs(alpha: np.ndarray) -> np.ndarray:
    """8-connected labelling of opaque pixels (0 = background)."""
    labels = np.zeros(alpha.shape, np.int32)
    count = 0
    for y, x in zip(*np.nonzero(alpha)):
        if labels[y, x]:
            continue
        count += 1
        stack = [(y, x)]
        labels[y, x] = count
        while stack:
            cy, cx = stack.pop()
            for ny in (cy - 1, cy, cy + 1):
                for nx in (cx - 1, cx, cx + 1):
                    if 0 <= ny < alpha.shape[0] and 0 <= nx < alpha.shape[1] and alpha[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = count
                        stack.append((ny, nx))
    return labels


def split_by_blobs(image: np.ndarray, left: int, right: int, count: int) -> list[np.ndarray]:
    """Assign every blob to the pose slot nearest its mass centre; crop each pose from its own blobs only."""
    labels = blobs(image[..., 3] > 0)
    width = (right - left) / count
    owner = np.zeros(labels.max() + 1, np.int32)
    sizes = np.bincount(labels.ravel())
    big = [label for label in range(1, labels.max() + 1) if sizes[label] >= 40]
    boxes = {}
    for label in range(1, labels.max() + 1):
        ys, xs = np.nonzero(labels == label)
        boxes[label] = (xs.min(), xs.max(), ys.min(), ys.max(), xs.mean())
    for label in big:
        owner[label] = min(count - 1, int((boxes[label][4] - left) // width))
    # Sparks and other small bits belong to the closest big blob, not to the nearest slot.
    for label in range(1, labels.max() + 1):
        if label in big or not big:
            continue
        x0, x1, y0, y1, _ = boxes[label]
        def gap(other: int) -> float:
            ox0, ox1, oy0, oy1, _ = boxes[other]
            return max(0, ox0 - x1, x0 - ox1) + max(0, oy0 - y1, y0 - oy1)
        owner[label] = owner[min(big, key=gap)]
    frames = []
    for slot in range(count):
        mask = (labels > 0) & (owner[labels] == slot)
        if not mask.any():
            frames.append(np.zeros((1, 1, 4), np.uint8))
            continue
        ys, xs = np.nonzero(mask)
        crop = image[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        crop[~mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]] = 0
        frames.append(crop)
    return frames


TILE = 48
