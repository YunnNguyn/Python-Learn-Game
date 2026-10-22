import type { MissionSolutions } from "./solutions";

/**
 * Reference and deliberately wrong solutions of the eight M9 missions (PF-08..PF-15).
 *
 * TEST DATA ONLY: imported by tests, never by `src/`. Every wrong solution lists, in
 * `fails`, the variables - and in `failsFunctions` the functions - whose check the grader
 * must report on EVERY tested variant, which is what proves the feedback points at the
 * real mistake. A wrong solution that "crashes" lists the exception type in `raises`.
 */

export interface M9WrongSolution {
  readonly name: string;
  readonly code: string;
  readonly fails: readonly string[];
  readonly failsFunctions?: readonly string[];
  readonly raises?: string;
}

export interface M9MissionSolutions {
  readonly reference: string;
  readonly wrong: readonly M9WrongSolution[];
}

export const M9_SOLUTIONS: Readonly<Record<string, M9MissionSolutions>> = {
  "python-foundations.pf08": {
    reference: `first_sample = samples[0]
last_sample = samples[-1]
head = samples[:n]
tail = samples[-n:]
window = samples[start:stop]
every_second = samples[::2]
newest_first = samples[::-1]
print(first_sample, last_sample, head, tail, window, every_second, newest_first)
`,
    wrong: [
      {
        name: "tail off by one (-n-1)",
        code: `first_sample = samples[0]
last_sample = samples[-1]
head = samples[:n]
tail = samples[-n - 1:]
window = samples[start:stop]
every_second = samples[::2]
newest_first = samples[::-1]
`,
        fails: ["tail"],
      },
      {
        name: "window includes the stop index",
        code: `first_sample = samples[0]
last_sample = samples[-1]
head = samples[:n]
tail = samples[-n:]
window = samples[start:stop + 1]
every_second = samples[::2]
newest_first = samples[::-1]
`,
        fails: ["window"],
      },
      {
        name: "reverses samples in place (the source list changes)",
        code: `first_sample = samples[0]
last_sample = samples[-1]
head = samples[:n]
tail = samples[-n:]
window = samples[start:stop]
every_second = samples[::2]
samples.reverse()
newest_first = samples
`,
        fails: ["samples"],
      },
      {
        name: "every_second starts from the second element",
        code: `first_sample = samples[0]
last_sample = samples[-1]
head = samples[:n]
tail = samples[-n:]
window = samples[start:stop]
every_second = samples[1::2]
newest_first = samples[::-1]
`,
        fails: ["every_second"],
      },
      {
        name: "head takes n-1 elements",
        code: `first_sample = samples[0]
last_sample = samples[-1]
head = samples[:n - 1]
tail = samples[-n:]
window = samples[start:stop]
every_second = samples[::2]
newest_first = samples[::-1]
`,
        fails: ["head"],
      },
    ],
  },

  "python-foundations.pf09": {
    reference: `label_counts = {}
for label in labels:
    label_counts[label] = label_counts.get(label, 0) + 1
unique_labels = set(labels)
unique_sorted = sorted(unique_labels)
best = max(label_counts, key=label_counts.get)
top_label = (best, label_counts[best])
class_index = {name: index for index, name in enumerate(unique_sorted)}
image_size = (width, height)
swapped_size = (height, width)
print(label_counts, unique_sorted, top_label, class_index, image_size, swapped_size)
`,
    wrong: [
      {
        name: "unique_labels is a list, not a set",
        code: `label_counts = {}
for label in labels:
    label_counts[label] = label_counts.get(label, 0) + 1
unique_labels = sorted(set(labels))
unique_sorted = sorted(unique_labels)
best = max(label_counts, key=label_counts.get)
top_label = (best, label_counts[best])
class_index = {name: index for index, name in enumerate(unique_sorted)}
image_size = (width, height)
swapped_size = (height, width)
`,
        fails: ["unique_labels"],
      },
      {
        name: "image_size is a list, not a tuple",
        code: `label_counts = {}
for label in labels:
    label_counts[label] = label_counts.get(label, 0) + 1
unique_labels = set(labels)
unique_sorted = sorted(unique_labels)
best = max(label_counts, key=label_counts.get)
top_label = (best, label_counts[best])
class_index = {name: index for index, name in enumerate(unique_sorted)}
image_size = [width, height]
swapped_size = (height, width)
`,
        fails: ["image_size"],
      },
      {
        name: "class_index in reverse alphabetical order",
        code: `label_counts = {}
for label in labels:
    label_counts[label] = label_counts.get(label, 0) + 1
unique_labels = set(labels)
unique_sorted = sorted(unique_labels)
best = max(label_counts, key=label_counts.get)
top_label = (best, label_counts[best])
class_index = {name: index for index, name in enumerate(sorted(unique_labels, reverse=True))}
image_size = (width, height)
swapped_size = (height, width)
`,
        fails: ["class_index"],
      },
      {
        name: "top_label is only the label, not the (label, count) tuple",
        code: `label_counts = {}
for label in labels:
    label_counts[label] = label_counts.get(label, 0) + 1
unique_labels = set(labels)
unique_sorted = sorted(unique_labels)
top_label = max(label_counts, key=label_counts.get)
class_index = {name: index for index, name in enumerate(unique_sorted)}
image_size = (width, height)
swapped_size = (height, width)
`,
        fails: ["top_label"],
      },
      {
        name: "label_counts counts distinct labels once",
        code: `label_counts = {}
for label in labels:
    label_counts[label] = 1
unique_labels = set(labels)
unique_sorted = sorted(unique_labels)
best = max(label_counts, key=label_counts.get)
top_label = (best, label_counts[best])
class_index = {name: index for index, name in enumerate(unique_sorted)}
image_size = (width, height)
swapped_size = (height, width)
`,
        fails: ["label_counts", "top_label"],
      },
    ],
  },

  "python-foundations.pf10": {
    reference: `valid_scaled = [p / 255 for p in pixels if 0 <= p <= 255]
bright_indices = [i for i, p in enumerate(pixels) if 0 <= p <= 255 and p >= bright_from]
word_lengths = {w: len(w) for w in words}
passed_scores = {name: score for name, score in scores.items() if score >= pass_mark}
print(valid_scaled)
print(bright_indices)
print(word_lengths, passed_scores)
`,
    wrong: [
      {
        name: "bright_indices forgets the validity test",
        code: `valid_scaled = [p / 255 for p in pixels if 0 <= p <= 255]
bright_indices = [i for i, p in enumerate(pixels) if p >= bright_from]
word_lengths = {w: len(w) for w in words}
passed_scores = {name: score for name, score in scores.items() if score >= pass_mark}
`,
        fails: ["bright_indices"],
      },
      {
        name: "passed_scores uses > (drops the score on the pass mark)",
        code: `valid_scaled = [p / 255 for p in pixels if 0 <= p <= 255]
bright_indices = [i for i, p in enumerate(pixels) if 0 <= p <= 255 and p >= bright_from]
word_lengths = {w: len(w) for w in words}
passed_scores = {name: score for name, score in scores.items() if score > pass_mark}
`,
        fails: ["passed_scores"],
      },
      {
        name: "word_lengths is a list, not a dict",
        code: `valid_scaled = [p / 255 for p in pixels if 0 <= p <= 255]
bright_indices = [i for i, p in enumerate(pixels) if 0 <= p <= 255 and p >= bright_from]
word_lengths = [len(w) for w in words]
passed_scores = {name: score for name, score in scores.items() if score >= pass_mark}
`,
        fails: ["word_lengths"],
      },
      {
        name: "valid_scaled uses floor division",
        code: `valid_scaled = [p // 255 for p in pixels if 0 <= p <= 255]
bright_indices = [i for i, p in enumerate(pixels) if 0 <= p <= 255 and p >= bright_from]
word_lengths = {w: len(w) for w in words}
passed_scores = {name: score for name, score in scores.items() if score >= pass_mark}
`,
        fails: ["valid_scaled"],
      },
      {
        name: "valid_scaled keeps the invalid pixels",
        code: `valid_scaled = [p / 255 for p in pixels]
bright_indices = [i for i, p in enumerate(pixels) if 0 <= p <= 255 and p >= bright_from]
word_lengths = {w: len(w) for w in words}
passed_scores = {name: score for name, score in scores.items() if score >= pass_mark}
`,
        fails: ["valid_scaled"],
      },
    ],
  },

  "python-foundations.pf11": {
    reference: `def moving_average(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]


def clip_values(values, low, high):
    if low > high:
        raise ValueError("low must not exceed high")
    return [max(low, min(v, high)) for v in values]


print(moving_average(example_values, example_window))
print(clip_values(example_values, example_low, example_high))
`,
    wrong: [
      {
        name: "clip_values changes the input list in place",
        code: `def moving_average(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]


def clip_values(values, low, high):
    if low > high:
        raise ValueError("low must not exceed high")
    for index, value in enumerate(values):
        if value < low:
            values[index] = low
        elif value > high:
            values[index] = high
    return values
`,
        fails: [],
        failsFunctions: ["clip_values"],
      },
      {
        name: "moving_average never validates the window",
        code: `def moving_average(values, window):
    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]


def clip_values(values, low, high):
    if low > high:
        raise ValueError("low must not exceed high")
    return [max(low, min(v, high)) for v in values]
`,
        fails: [],
        failsFunctions: ["moving_average"],
      },
      {
        name: "moving_average with floor division",
        code: `def moving_average(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    return [sum(values[i:i + window]) // window for i in range(len(values) - window + 1)]


def clip_values(values, low, high):
    if low > high:
        raise ValueError("low must not exceed high")
    return [max(low, min(v, high)) for v in values]
`,
        fails: [],
        failsFunctions: ["moving_average"],
      },
      {
        name: "moving_average returns a tuple",
        code: `def moving_average(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    return tuple(sum(values[i:i + window]) / window for i in range(len(values) - window + 1))


def clip_values(values, low, high):
    if low > high:
        raise ValueError("low must not exceed high")
    return [max(low, min(v, high)) for v in values]
`,
        fails: [],
        failsFunctions: ["moving_average"],
      },
      {
        name: "clip_values never checks the range (low > high)",
        code: `def moving_average(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]


def clip_values(values, low, high):
    return [max(low, min(v, high)) for v in values]
`,
        fails: [],
        failsFunctions: ["clip_values"],
      },
      {
        name: "clip_values clamps in the wrong order (low wins over high)",
        code: `def moving_average(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]


def clip_values(values, low, high):
    if low > high:
        raise ValueError("low must not exceed high")
    return [min(high, max(v, low)) if v != high else low for v in values]
`,
        fails: [],
        failsFunctions: ["clip_values"],
      },
    ],
  },

  "python-foundations.pf12": {
    reference: `def parse_measurements(raw_values, low, high):
    if not isinstance(raw_values, list):
        raise TypeError("raw_values must be a list")
    if low > high:
        raise ValueError("low must not exceed high")
    values = []
    rejected = 0
    for text in raw_values:
        if not isinstance(text, str):
            rejected += 1
            continue
        try:
            number = float(text)
        except ValueError:
            rejected += 1
            continue
        if low <= number <= high:
            values.append(number)
        else:
            rejected += 1
    return {"values": values, "rejected": rejected}


result = parse_measurements(form_inputs, low, high)
print(result)
`,
    wrong: [
      {
        name: "everything fixed except the return type (still a tuple)",
        code: `def parse_measurements(raw_values, low, high):
    if not isinstance(raw_values, list):
        raise TypeError("raw_values must be a list")
    if low > high:
        raise ValueError("low must not exceed high")
    values = []
    rejected = 0
    for text in raw_values:
        if not isinstance(text, str):
            rejected += 1
            continue
        try:
            number = float(text)
        except ValueError:
            rejected += 1
            continue
        if low <= number <= high:
            values.append(number)
        else:
            rejected += 1
    return values, rejected


result = parse_measurements(form_inputs, low, high)
`,
        fails: ["result"],
        failsFunctions: ["parse_measurements"],
      },
      {
        name: "no validation of raw_values / low / high",
        code: `def parse_measurements(raw_values, low, high):
    values = []
    rejected = 0
    for text in raw_values:
        if not isinstance(text, str):
            rejected += 1
            continue
        try:
            number = float(text)
        except ValueError:
            rejected += 1
            continue
        if low <= number <= high:
            values.append(number)
        else:
            rejected += 1
    return {"values": values, "rejected": rejected}


result = parse_measurements(form_inputs, low, high)
`,
        fails: [],
        failsFunctions: ["parse_measurements"],
      },
      {
        name: "accepts non-string items (float(5) works) and swallows every error",
        code: `def parse_measurements(raw_values, low, high):
    if not isinstance(raw_values, list):
        raise TypeError("raw_values must be a list")
    if low > high:
        raise ValueError("low must not exceed high")
    values = []
    rejected = 0
    for text in raw_values:
        try:
            number = float(text)
        except (ValueError, TypeError):
            rejected += 1
            continue
        if low <= number <= high:
            values.append(number)
        else:
            rejected += 1
    return {"values": values, "rejected": rejected}


result = parse_measurements(form_inputs, low, high)
`,
        fails: [],
        failsFunctions: ["parse_measurements"],
      },
      {
        name: "exclusive range ends",
        code: `def parse_measurements(raw_values, low, high):
    if not isinstance(raw_values, list):
        raise TypeError("raw_values must be a list")
    if low > high:
        raise ValueError("low must not exceed high")
    values = []
    rejected = 0
    for text in raw_values:
        if not isinstance(text, str):
            rejected += 1
            continue
        try:
            number = float(text)
        except ValueError:
            rejected += 1
            continue
        if low < number < high:
            values.append(number)
        else:
            rejected += 1
    return {"values": values, "rejected": rejected}


result = parse_measurements(form_inputs, low, high)
`,
        fails: ["result"],
        failsFunctions: ["parse_measurements"],
      },
      {
        name: "reads integers only (int instead of float)",
        code: `def parse_measurements(raw_values, low, high):
    if not isinstance(raw_values, list):
        raise TypeError("raw_values must be a list")
    if low > high:
        raise ValueError("low must not exceed high")
    values = []
    rejected = 0
    for text in raw_values:
        if not isinstance(text, str):
            rejected += 1
            continue
        try:
            number = int(text)
        except ValueError:
            rejected += 1
            continue
        if low <= number <= high:
            values.append(number)
        else:
            rejected += 1
    return {"values": values, "rejected": rejected}


result = parse_measurements(form_inputs, low, high)
`,
        fails: ["result"],
        failsFunctions: ["parse_measurements"],
      },
    ],
  },

  "python-foundations.pf13": {
    reference: `import json


def _number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _positive_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.isdigit():
        return int(value) if int(value) > 0 else None
    return None


def summarize_records(text):
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("expected a JSON list of records")
    seen = set()
    accepted = []
    for record in data:
        if not isinstance(record, dict):
            continue
        record_id = record.get("id")
        label = record.get("label")
        if not isinstance(record_id, str) or record_id.strip() == "" or record_id.strip() in seen:
            continue
        if not isinstance(label, str) or label.strip() == "":
            continue
        confidence = _number(record.get("confidence"))
        if confidence is None or not 0 <= confidence <= 1:
            continue
        width = _positive_int(record.get("width"))
        height = _positive_int(record.get("height"))
        if width is None or height is None:
            continue
        seen.add(record_id.strip())
        accepted.append((width * height, confidence, label.strip().lower()))
    labels = sorted({item[2] for item in accepted})
    label_counts = {}
    for _, _, name in accepted:
        label_counts[name] = label_counts.get(name, 0) + 1
    mean = sum(item[1] for item in accepted) / len(accepted) if accepted else 0.0
    return {
        "valid_count": len(accepted),
        "invalid_count": len(data) - len(accepted),
        "labels": labels,
        "label_counts": label_counts,
        "mean_confidence": mean,
        "rows": [[pixels, conf, labels.index(name)] for pixels, conf, name in accepted],
    }


summary = summarize_records(raw_json)
print(summary)
`,
    wrong: [], // filled below from the reference with one-line edits
  },

  "python-foundations.pf14": {
    reference: `import numpy as np

arr = np.array(table, dtype=np.float64)
n_dims = arr.ndim
shape_of_arr = arr.shape
element_count = arr.size
dtype_name = str(arr.dtype)
last_row = arr[-1]
second_column = arr[:, 1]
picked = arr[row_i, col_j]


def describe_array(a):
    return {"ndim": a.ndim, "shape": a.shape, "size": a.size, "dtype": str(a.dtype)}


print(describe_array(arr))
print(n_dims, shape_of_arr, element_count, dtype_name, picked)
`,
    wrong: [],
  },

  "python-foundations.pf15": {
    reference: `import numpy as np

data = np.array(grid, dtype=np.float64)


def valid_mask(data, max_value):
    return (data >= 0) & (data <= max_value)


def scale_valid(data, max_value):
    mask = valid_mask(data, max_value)
    return np.where(mask, data / max_value, 0.0)


def sensor_means(data, max_value):
    mask = valid_mask(data, max_value)
    totals = np.where(mask, data, 0.0).sum(axis=1)
    counts = mask.sum(axis=1)
    return totals / np.maximum(counts, 1)


valid_total = int(valid_mask(data, max_value).sum())
best_sensor = int(np.argmax(sensor_means(data, max_value)))
print(valid_total, best_sensor)
`,
    wrong: [],
  },
};

/** `reference` with every `from` -> `to` replacement applied (each `from` must occur). */
export function edit(reference: string, ...replacements: readonly (readonly [string, string])[]): string {
  let code = reference;
  for (const [from, to] of replacements) {
    if (!code.includes(from)) throw new Error(`reference does not contain: ${from}`);
    code = code.replace(from, to);
  }
  return code;
}

const wrongSet = (activityId: string, wrong: readonly M9WrongSolution[]): void => {
  (M9_SOLUTIONS[activityId] as { wrong: readonly M9WrongSolution[] }).wrong = wrong;
};

const PF13 = M9_SOLUTIONS["python-foundations.pf13"]!.reference;
wrongSet("python-foundations.pf13", [
  {
    name: "does not drop duplicate ids",
    code: edit(PF13, [`record_id.strip() == "" or record_id.strip() in seen`, `record_id.strip() == ""`]),
    fails: [],
    failsFunctions: ["summarize_records"],
  },
  {
    name: "does not normalise the label case",
    code: edit(PF13, [`label.strip().lower()`, `label.strip()`]),
    fails: [],
    failsFunctions: ["summarize_records"],
  },
  {
    name: "accepts a confidence above 1",
    code: edit(PF13, [`not 0 <= confidence <= 1`, `confidence < 0`]),
    fails: [],
    failsFunctions: ["summarize_records"],
  },
  {
    name: "mean taken over all records, not the valid ones",
    code: edit(PF13, [`/ len(accepted) if accepted else 0.0`, `/ len(data) if data else 0.0`]),
    fails: [],
    failsFunctions: ["summarize_records"],
  },
  {
    name: "swallows invalid JSON instead of raising ValueError",
    code: edit(PF13, [
      `    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("expected a JSON list of records")`,
      `    try:
        data = json.loads(text)
    except ValueError:
        data = []
    if not isinstance(data, list):
        data = []`,
    ]),
    fails: [],
    failsFunctions: ["summarize_records"],
  },
  {
    name: "accepts a record whose width is not a number",
    code: edit(PF13, [`if width is None or height is None:`, `if height is None:`], [
      `width = _positive_int(record.get("width"))`,
      `width = _positive_int(record.get("width")) or 1`,
    ]),
    fails: [],
    failsFunctions: ["summarize_records"],
  },
]);

const PF14 = M9_SOLUTIONS["python-foundations.pf14"]!.reference;
wrongSet("python-foundations.pf14", [
  {
    name: "dtype_name is the dtype object, not its name",
    code: edit(PF14, [`dtype_name = str(arr.dtype)`, `dtype_name = arr.dtype`]),
    fails: ["dtype_name"],
  },
  {
    name: "shape_of_arr is a list, not a tuple",
    code: edit(PF14, [`shape_of_arr = arr.shape`, `shape_of_arr = list(arr.shape)`]),
    fails: ["shape_of_arr"],
  },
  {
    name: "last_row takes the last column",
    code: edit(PF14, [`last_row = arr[-1]`, `last_row = arr[:, -1]`]),
    fails: ["last_row"],
  },
  {
    name: "second_column takes the second row",
    code: edit(PF14, [`second_column = arr[:, 1]`, `second_column = arr[1]`]),
    fails: ["second_column"],
  },
  {
    name: "array built without dtype (integers)",
    code: edit(PF14, [`arr = np.array(table, dtype=np.float64)`, `arr = np.array(table)`]),
    fails: ["dtype_name"],
  },
  {
    name: "describe_array reports the shape as a list",
    code: edit(PF14, [`"shape": a.shape`, `"shape": list(a.shape)`]),
    fails: [],
    failsFunctions: ["describe_array"],
  },
  {
    name: "describe_array uses len() for the size",
    code: edit(PF14, [`"size": a.size`, `"size": len(a)`]),
    fails: [],
    failsFunctions: ["describe_array"],
  },
  {
    name: "describe_array returns the dtype object",
    code: edit(PF14, [`"dtype": str(a.dtype)`, `"dtype": a.dtype`]),
    fails: [],
    failsFunctions: ["describe_array"],
  },
]);

const PF15 = M9_SOLUTIONS["python-foundations.pf15"]!.reference;
wrongSet("python-foundations.pf15", [
  {
    name: "valid_mask excludes the upper bound",
    code: edit(PF15, [`(data <= max_value)`, `(data < max_value)`]),
    fails: [],
    failsFunctions: ["valid_mask"],
  },
  {
    name: "scale_valid overwrites the input array in place",
    code: edit(PF15, [
      `    mask = valid_mask(data, max_value)
    return np.where(mask, data / max_value, 0.0)`,
      `    mask = valid_mask(data, max_value)
    data[~mask] = 0.0
    return data / max_value`,
    ]),
    fails: [],
    failsFunctions: ["scale_valid"],
  },
  {
    name: "scale_valid does not zero the invalid readings",
    code: edit(PF15, [`return np.where(mask, data / max_value, 0.0)`, `return data / max_value`]),
    fails: [],
    failsFunctions: ["scale_valid"],
  },
  {
    name: "sensor_means divides by zero for a row without valid readings",
    code: edit(PF15, [`return totals / np.maximum(counts, 1)`, `return totals / counts`]),
    fails: [],
    failsFunctions: ["sensor_means"],
  },
  {
    name: "sensor_means averages over the wrong axis",
    code: edit(PF15, [`.sum(axis=1)
    counts = mask.sum(axis=1)`, `.sum(axis=0)
    counts = mask.sum(axis=0)`]),
    fails: [],
    failsFunctions: ["sensor_means"],
  },
  {
    name: "sensor_means returns one overall mean instead of one per sensor",
    code: edit(PF15, [
      `    totals = np.where(mask, data, 0.0).sum(axis=1)
    counts = mask.sum(axis=1)
    return totals / np.maximum(counts, 1)`,
      `    return np.where(mask, data, 0.0).sum() / max(int(mask.sum()), 1)`,
    ]),
    fails: [],
    failsFunctions: ["sensor_means"],
  },
  {
    name: "valid_total stays a NumPy integer",
    code: edit(PF15, [`valid_total = int(valid_mask(data, max_value).sum())`, `valid_total = valid_mask(data, max_value).sum()`]),
    fails: ["valid_total"],
  },
  {
    name: "best_sensor picks the lowest mean",
    code: edit(PF15, [`np.argmax(sensor_means`, `np.argmin(sensor_means`]),
    fails: ["best_sensor"],
  }
]);

export const M9_SOLUTIONS_AS_MISSION_SOLUTIONS = M9_SOLUTIONS as unknown as Readonly<Record<string, MissionSolutions>>;
