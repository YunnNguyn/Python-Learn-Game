/**
 * Reference and deliberately wrong solutions of the seven Python Foundations missions.
 *
 * TEST DATA ONLY. This module is imported by tests, never by `src/`, so the reference
 * solutions are not part of the shipped application bundle and the learner never sees one
 * before they have earned a pass.
 *
 * `fails` lists the variables the grader must report for the wrong solution - on every
 * variant tested. The list is what proves the feedback points at the real mistake.
 */

export interface WrongSolution {
  readonly name: string;
  readonly code: string;
  /** Every variable listed must have a failed check. */
  readonly fails: readonly string[];
  /** Python exception type expected instead of a grading result, when the code crashes. */
  readonly raises?: string;
}

export interface MissionSolutions {
  readonly reference: string;
  readonly wrong: readonly WrongSolution[];
}

export const SOLUTIONS: Readonly<Record<string, MissionSolutions>> = {
  "python-foundations.pf01": {
    reference: `pixel_count = width * height
aspect_ratio = width / height
total_values = pixel_count * channels
half_width = width // 2
print(pixel_count, aspect_ratio, total_values, half_width)
`,
    wrong: [
      {
        name: "aspect ratio with floor division",
        code: `pixel_count = width * height
aspect_ratio = width // height
total_values = pixel_count * channels
half_width = width // 2
`,
        fails: ["aspect_ratio"],
      },
      {
        name: "half width with true division (float instead of int)",
        code: `pixel_count = width * height
aspect_ratio = width / height
total_values = pixel_count * channels
half_width = width / 2
`,
        fails: ["half_width"],
      },
      {
        name: "pixel count by addition",
        code: `pixel_count = width + height
aspect_ratio = width / height
total_values = pixel_count * channels
half_width = width // 2
`,
        fails: ["pixel_count", "total_values"],
      },
      {
        name: "total values forgets the channels",
        code: `pixel_count = width * height
aspect_ratio = width / height
total_values = pixel_count
half_width = width // 2
`,
        fails: ["total_values"],
      },
      {
        name: "aspect ratio inverted",
        code: `pixel_count = width * height
aspect_ratio = height / width
total_values = pixel_count * channels
half_width = width // 2
`,
        fails: ["aspect_ratio"],
      },
    ],
  },

  "python-foundations.pf02": {
    reference: `is_confident = confidence >= high_threshold

if confidence >= high_threshold:
    label = "accept"
elif confidence >= low_threshold:
    label = "review"
else:
    label = "reject"

if edge_confidence >= high_threshold:
    edge_label = "accept"
elif edge_confidence >= low_threshold:
    edge_label = "review"
else:
    edge_label = "reject"

print(is_confident, label, edge_label)
`,
    wrong: [
      {
        name: "strict comparison on the high threshold misses the boundary",
        code: `is_confident = confidence > high_threshold

if confidence > high_threshold:
    label = "accept"
elif confidence >= low_threshold:
    label = "review"
else:
    label = "reject"

if edge_confidence > high_threshold:
    edge_label = "accept"
elif edge_confidence >= low_threshold:
    edge_label = "review"
else:
    edge_label = "reject"
`,
        fails: ["edge_label"],
      },
      {
        name: "branches checked in the wrong order",
        code: `is_confident = confidence >= high_threshold

if confidence >= low_threshold:
    label = "review"
elif confidence >= high_threshold:
    label = "accept"
else:
    label = "reject"

if edge_confidence >= low_threshold:
    edge_label = "review"
elif edge_confidence >= high_threshold:
    edge_label = "accept"
else:
    edge_label = "reject"
`,
        fails: ["edge_label"],
      },
      {
        name: "is_confident stored as text",
        code: `is_confident = "True" if confidence >= high_threshold else "False"

if confidence >= high_threshold:
    label = "accept"
elif confidence >= low_threshold:
    label = "review"
else:
    label = "reject"

if edge_confidence >= high_threshold:
    edge_label = "accept"
elif edge_confidence >= low_threshold:
    edge_label = "review"
else:
    edge_label = "reject"
`,
        fails: ["is_confident"],
      },
      {
        name: "edge label forgotten (left as None)",
        code: `is_confident = confidence >= high_threshold

if confidence >= high_threshold:
    label = "accept"
elif confidence >= low_threshold:
    label = "review"
else:
    label = "reject"

edge_label = None
`,
        fails: ["edge_label"],
      },
    ],
  },

  "python-foundations.pf03": {
    reference: `width = int(width_text)
height = int(height_text)
pixel_count = width * height

if pixel_count > max_pixels:
    size_label = "too_large"
else:
    size_label = "ok"

print(pixel_count, size_label)
`,
    wrong: [
      {
        name: "the untouched buggy code (TypeError)",
        code: `width = width_text
height = height_text
pixel_count = width * height

if pixel_count < max_pixels:
    size_label = "too_large"
else:
    size_label = "ok"
`,
        fails: [],
        raises: "TypeError",
      },
      {
        name: "conversion fixed but the branch is still inverted",
        code: `width = int(width_text)
height = int(height_text)
pixel_count = width * height

if pixel_count < max_pixels:
    size_label = "too_large"
else:
    size_label = "ok"
`,
        fails: ["size_label"],
      },
      {
        name: "branch fixed but the strings are still multiplied (TypeError)",
        code: `width = width_text
height = height_text
pixel_count = width * height

if pixel_count > max_pixels:
    size_label = "too_large"
else:
    size_label = "ok"
`,
        fails: [],
        raises: "TypeError",
      },
      {
        name: "float() instead of int()",
        code: `width = float(width_text)
height = float(height_text)
pixel_count = width * height

if pixel_count > max_pixels:
    size_label = "too_large"
else:
    size_label = "ok"
`,
        fails: ["width", "height", "pixel_count"],
      },
    ],
  },

  "python-foundations.pf04": {
    reference: `valid_readings = []
invalid_count = 0
valid_total = 0

for value in readings:
    if min_valid <= value <= max_valid:
        valid_readings.append(value)
        valid_total += value
    else:
        invalid_count += 1

print(valid_readings, invalid_count, valid_total)
`,
    wrong: [
      {
        name: "upper bound excluded (drops max_valid)",
        code: `valid_readings = []
invalid_count = 0
valid_total = 0

for value in readings:
    if min_valid <= value < max_valid:
        valid_readings.append(value)
        valid_total += value
    else:
        invalid_count += 1
`,
        fails: ["valid_readings", "invalid_count", "valid_total"],
      },
      {
        name: "lower bound excluded (drops min_valid)",
        code: `valid_readings = []
invalid_count = 0
valid_total = 0

for value in readings:
    if min_valid < value <= max_valid:
        valid_readings.append(value)
        valid_total += value
    else:
        invalid_count += 1
`,
        fails: ["valid_readings", "invalid_count"],
      },
      {
        name: "invalid readings are never counted",
        code: `valid_readings = []
invalid_count = 0
valid_total = 0

for value in readings:
    if min_valid <= value <= max_valid:
        valid_readings.append(value)
        valid_total += value
`,
        fails: ["invalid_count"],
      },
      {
        name: "total forgotten",
        code: `valid_readings = []
invalid_count = 0
valid_total = 0

for value in readings:
    if min_valid <= value <= max_valid:
        valid_readings.append(value)
    else:
        invalid_count += 1
`,
        fails: ["valid_total"],
      },
      {
        name: "readings sorted instead of kept in order",
        code: `valid_readings = []
invalid_count = 0
valid_total = 0

for value in sorted(readings):
    if min_valid <= value <= max_valid:
        valid_readings.append(value)
        valid_total += value
    else:
        invalid_count += 1
`,
        fails: ["valid_readings"],
      },
    ],
  },

  "python-foundations.pf05": {
    reference: `def mean_of(values):
    if len(values) == 0:
        return 0.0
    return sum(values) / len(values)


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])

print(mean_a, mean_b, mean_empty)
`,
    wrong: [
      {
        name: "floor division returns int / wrong values",
        code: `def mean_of(values):
    if len(values) == 0:
        return 0.0
    return sum(values) // len(values)


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])
`,
        fails: ["mean_b"],
      },
      {
        name: "empty list not handled (ZeroDivisionError)",
        code: `def mean_of(values):
    return sum(values) / len(values)


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])
`,
        fails: [],
        raises: "ZeroDivisionError",
      },
      {
        name: "print instead of return",
        code: `def mean_of(values):
    if len(values) == 0:
        print(0.0)
    else:
        print(sum(values) / len(values))


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])
`,
        fails: ["mean_a", "mean_b", "mean_empty"],
      },
      {
        name: "no function: the mean is computed inline",
        code: `mean_a = sum(samples_a) / len(samples_a)
mean_b = sum(samples_b) / len(samples_b)
mean_empty = 0.0
`,
        fails: ["mean_of"],
      },
      {
        name: "empty list returns int 0",
        code: `def mean_of(values):
    if len(values) == 0:
        return 0
    return sum(values) / len(values)


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])
`,
        fails: ["mean_empty"],
      },
      {
        name: "divides by a fixed count instead of len(values)",
        code: `def mean_of(values):
    if len(values) == 0:
        return 0.0
    return sum(values) / 5


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])
`,
        fails: ["mean_b"],
      },
    ],
  },

  "python-foundations.pf06": {
    reference: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        if 0 <= value <= max_value:
            result.append(value / max_value)
    return result


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)

print(normalized_8bit)
print(normalized_10bit)
print(normalized_none)
`,
    wrong: [
      {
        name: "upper bound excluded (drops max_value)",
        code: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        if 0 <= value < max_value:
            result.append(value / max_value)
    return result


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)
`,
        fails: ["normalized_8bit", "normalized_10bit"],
      },
      {
        name: "no filtering of invalid values",
        code: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        result.append(value / max_value)
    return result


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)
`,
        fails: ["normalized_none"],
      },
      {
        name: "max_value ignored (255 hard-coded)",
        code: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        if 0 <= value <= max_value:
            result.append(value / 255)
    return result


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)
`,
        fails: ["normalized_10bit"],
      },
      {
        name: "returns None (forgot return)",
        code: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        if 0 <= value <= max_value:
            result.append(value / max_value)


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)
`,
        fails: ["normalized_8bit", "normalized_10bit", "normalized_none"],
      },
      {
        name: "floor division",
        code: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        if 0 <= value <= max_value:
            result.append(value // max_value)
    return result


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)
`,
        fails: ["normalized_8bit", "normalized_10bit"],
      },
      {
        name: "result sorted instead of kept in order",
        code: `def normalize_valid(values, max_value):
    result = []
    for value in values:
        if 0 <= value <= max_value:
            result.append(value / max_value)
    return sorted(result)


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)
`,
        fails: ["normalized_8bit", "normalized_10bit"],
      },
    ],
  },

  "python-foundations.pf07": {
    reference: `def label_for(confidence, high, low):
    if confidence >= high:
        return "accept"
    elif confidence >= low:
        return "review"
    return "reject"


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    if 0 <= c <= 1:
        name = label_for(c, high_threshold, low_threshold)
        clean_confidences.append(c)
        labels.append(name)
        if name == "accept":
            accept_count += 1
        elif name == "review":
            review_count += 1
        else:
            reject_count += 1

if len(clean_confidences) > 0:
    mean_confidence = sum(clean_confidences) / len(clean_confidences)

print(clean_confidences)
print(labels)
print(accept_count, review_count, reject_count, mean_confidence)
`,
    wrong: [
      {
        name: "strict comparison in label_for mislabels the thresholds themselves",
        code: `def label_for(confidence, high, low):
    if confidence > high:
        return "accept"
    elif confidence > low:
        return "review"
    return "reject"


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    if 0 <= c <= 1:
        name = label_for(c, high_threshold, low_threshold)
        clean_confidences.append(c)
        labels.append(name)
        if name == "accept":
            accept_count += 1
        elif name == "review":
            review_count += 1
        else:
            reject_count += 1

if len(clean_confidences) > 0:
    mean_confidence = sum(clean_confidences) / len(clean_confidences)
`,
        fails: ["labels", "accept_count", "reject_count"],
      },
      {
        name: "mean taken over the raw list, invalid values included",
        code: `def label_for(confidence, high, low):
    if confidence >= high:
        return "accept"
    elif confidence >= low:
        return "review"
    return "reject"


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    if 0 <= c <= 1:
        name = label_for(c, high_threshold, low_threshold)
        clean_confidences.append(c)
        labels.append(name)
        if name == "accept":
            accept_count += 1
        elif name == "review":
            review_count += 1
        else:
            reject_count += 1

mean_confidence = sum(confidences) / len(confidences)
`,
        fails: ["mean_confidence"],
      },
      {
        name: "valid range excludes 0 and 1",
        code: `def label_for(confidence, high, low):
    if confidence >= high:
        return "accept"
    elif confidence >= low:
        return "review"
    return "reject"


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    if 0 < c < 1:
        name = label_for(c, high_threshold, low_threshold)
        clean_confidences.append(c)
        labels.append(name)
        if name == "accept":
            accept_count += 1
        elif name == "review":
            review_count += 1
        else:
            reject_count += 1

if len(clean_confidences) > 0:
    mean_confidence = sum(clean_confidences) / len(clean_confidences)
`,
        fails: ["clean_confidences", "labels"],
      },
      {
        name: "invalid values are labelled and counted too",
        code: `def label_for(confidence, high, low):
    if confidence >= high:
        return "accept"
    elif confidence >= low:
        return "review"
    return "reject"


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    name = label_for(c, high_threshold, low_threshold)
    if 0 <= c <= 1:
        clean_confidences.append(c)
        labels.append(name)
    if name == "accept":
        accept_count += 1
    elif name == "review":
        review_count += 1
    else:
        reject_count += 1

if len(clean_confidences) > 0:
    mean_confidence = sum(clean_confidences) / len(clean_confidences)
`,
        fails: ["reject_count"],
      },
      {
        name: "label_for never filled in (returns None)",
        code: `def label_for(confidence, high, low):
    return None


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    if 0 <= c <= 1:
        clean_confidences.append(c)
        labels.append(label_for(c, high_threshold, low_threshold))

if len(clean_confidences) > 0:
    mean_confidence = sum(clean_confidences) / len(clean_confidences)
`,
        fails: ["labels", "accept_count", "review_count", "reject_count"],
      },
      {
        name: "mean never computed (stays 0.0)",
        code: `def label_for(confidence, high, low):
    if confidence >= high:
        return "accept"
    elif confidence >= low:
        return "review"
    return "reject"


clean_confidences = []
labels = []
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0

for c in confidences:
    if 0 <= c <= 1:
        name = label_for(c, high_threshold, low_threshold)
        clean_confidences.append(c)
        labels.append(name)
        if name == "accept":
            accept_count += 1
        elif name == "review":
            review_count += 1
        else:
            reject_count += 1
`,
        fails: ["mean_confidence"],
      },
    ],
  },
};
