# Curriculum — CS116 Learning Path

## 1. Curriculum Source of Truth

The primary curriculum source of truth is:

```text
CS116 lecture material supplied by the user
```

This file organizes that curriculum into a learning path. It must not silently redefine the course from external references.

Source policy:

```text
CS116 slides
→ decide WHAT belongs to the main curriculum.

Official library documentation
→ API and reference truth.

Courses/books
→ explanations, examples, and additional exercises.
```

If later course evidence changes the status or ordering of a concept, update this file and any dependent content definitions while preserving stable released concept IDs.

## 2. Supplementary Knowledge Policy

Knowledge that is useful for practical ML but is not clearly supported by the supplied CS116 lecture material must be labeled:

```text
Supplementary / ML Foundation
```

Supplementary material may strengthen understanding or prepare later ML work, but it must not be presented as if it were confirmed official CS116 content.

The learner is not expected to complete all external courses in parallel.

## 3. External Learning References

Use these as supplementary references:

- Python Official Tutorial
- NumPy official documentation
- pandas official documentation
- Matplotlib official documentation
- Python Data Science Handbook
- Kaggle Learn:
  - Pandas
  - Intro to Machine Learning
  - Intermediate Machine Learning
  - Data Cleaning
  - Feature Engineering
  - Data Visualization
- Machine Learning in Python with scikit-learn MOOC
- Google Machine Learning Crash Course
- scikit-learn official documentation
- Polars official documentation
- RAPIDS official documentation
- imbalanced-learn official documentation

Use official documentation for exact API behavior. Use books/courses for explanations, examples, and extra practice.

## 4. Curriculum Map

The canonical course-level progression is:

```text
Optional Recovery — Python Foundation

World 1 — NumPy / Array Core

World 2 — Python for Data Science
  file I/O
  Jupyter concepts
  PIL/OpenCV basics
  Matplotlib
  pandas

World 3 — ML Pipeline

World 4 — Data Validation & EDA

World 5 — Feature Engineering

World 6 — Advanced Data Processing
  Polars
  RAPIDS/GPU

World 7 — Feature Selection

World 8 — ML Models

World 9 — Ensemble & AutoML

World 10 — Model Selection
  Cross-validation
  Hyperparameter Tuning
  Evaluation

World 11 — Imbalanced Data & Error Analysis

Final — End-to-end ML Campaign
  + paper-exam simulation
```

This hierarchy is for presentation and progression. Actual knowledge prerequisites are represented by the **Concept Graph** described in `TECH_ARCHITECTURE.md`.

## 5. Optional Recovery — Python Foundation

Python Foundation is a diagnostic/recovery path, not a mandatory beginner course.

Cover only practical Python needed for Data/ML:

- lists;
- tuples;
- dictionaries;
- sets;
- indexing and slicing;
- loops;
- comprehensions;
- functions;
- imports/modules;
- exceptions;
- file context managers;
- basic classes only when required by later work.

Avoid spending curriculum time on unrelated advanced Python topics.

Suggested recovery behavior:

1. run a short diagnostic;
2. identify missing prerequisite concepts;
3. assign only the required recovery activities;
4. return the learner to the main path when the gap is repaired.

## 6. World 1 — NumPy / Array Core

This is the first production world and the first curriculum area to receive complete mission coverage.

### 6.1 Array Fundamentals

Core concepts:

```python
import numpy as np
np.array(...)
```

Knowledge:

- `ndarray`;
- scalar;
- vector;
- matrix;
- tensor;
- `dtype`;
- `shape`;
- `ndim`;
- `size`.

Shape semantics are mandatory:

```text
(n,)
(n,1)
(1,n)
```

The learner must be able to explain how these differ and why the distinction matters.

Candidate stable concept IDs:

```text
numpy.array
numpy.ndarray
numpy.dtype
numpy.shape
numpy.ndim
numpy.size
numpy.shape.vector_1d
numpy.shape.column_vector
numpy.shape.row_vector
```

### 6.2 Array Creation

Core:

```text
zeros
ones
empty
arange
```

Supplementary when useful:

```text
linspace
basic random generation
```

The learner should understand why a particular constructor fits the data need rather than memorize a catalog of functions.

### 6.3 Indexing & Slicing

Include:

- single indexing;
- negative indexing;
- row selection;
- column selection;
- ranges/slicing;
- fancy indexing.

Representative concept IDs:

```text
numpy.index.single
numpy.index.negative
numpy.index.row
numpy.index.column
numpy.slice
numpy.fancy_index
```

### 6.4 Boolean Filtering

Include:

- comparisons;
- boolean masks;
- `&`;
- `|`;
- `~`.

Representative concept IDs:

```text
numpy.compare
numpy.boolean_mask
numpy.logical_and
numpy.logical_or
numpy.logical_not
```

The learner must understand element-wise conditions and why Python's scalar boolean operators are not interchangeable with NumPy element-wise operators.

### 6.5 Reshape & Transpose

Include:

```text
reshape
reshape(-1,1)
reshape(1,-1)
transpose / .T
(n,) != (n,1)
```

Representative concept IDs:

```text
numpy.reshape
numpy.transpose
numpy.shape.reshape_column
numpy.shape.reshape_row
```

### 6.6 Vectorized Operations

Include:

- array + scalar;
- array * scalar;
- array + array;
- array * array;
- element-wise operations;
- vectorization versus Python loops.

The learning goal is to recognize when an array operation expresses the intended computation directly.

### 6.7 Aggregation & Axis

Classification:

```text
Supplementary / ML Foundation
```

unless later CS116 evidence confirms it as official course content.

Include:

```text
sum
mean
min
max
std
axis=0
axis=1
```

Representative concept IDs:

```text
numpy.aggregate.sum
numpy.aggregate.mean
numpy.aggregate.min
numpy.aggregate.max
numpy.aggregate.std
numpy.axis.zero
numpy.axis.one
```

The learner must explain what an axis means in the current array shape. Memorizing `axis=0` or `axis=1` without shape reasoning is insufficient.

### 6.8 Broadcasting

Include:

```text
(m,n) + scalar
(m,n) + (n,)
(m,n) + (m,1)
broadcast compatibility
```

Representative concept IDs:

```text
numpy.broadcast.scalar
numpy.broadcast.feature_vector
numpy.broadcast.column_vector
numpy.broadcast.compatibility
```

Shape reasoning is mandatory.

### 6.9 Centering & Standardization

Include:

```python
feature_mean = X.mean(axis=0)
feature_std = X.std(axis=0)

X_centered = X - feature_mean
X_standardized = (X - feature_mean) / feature_std
```

The learner must understand:

- mean;
- standard deviation;
- centering;
- standardization;
- why per-feature statistics usually use the feature axis.

Representative concept IDs:

```text
numpy.centering
numpy.standardization
```

### 6.10 Dot Product & Matrix Multiplication

Include:

```text
*
@
np.dot
```

Critical distinction:

```text
* = element-wise
@ = matrix multiplication
```

Shape reasoning:

```text
(m,n) @ (n,p)
→
(m,p)
```

Introduce:

```python
prediction = X @ w
```

as an early bridge from array operations to ML.

Representative concept IDs:

```text
numpy.elementwise_multiply
numpy.matmul
numpy.dot
```

### 6.11 Matrix Operations

Include only the remaining matrix operations required by the course:

- transpose;
- matrix-vector multiplication;
- matrix-matrix multiplication;
- Hadamard product;
- identity matrix;
- inverse.

Do not expand this into a full linear algebra course.

## 7. NumPy Boss

World 1 ends with an integrated boss activity.

Example context: a robot or sensor network produces a feature matrix.

The learner may need to:

1. inspect shape;
2. extract required features;
3. filter invalid robots;
4. calculate statistics;
5. center or standardize data;
6. build or use a weight vector;
7. calculate scores;
8. identify the priority or dangerous robot.

The objective should not tell the learner which NumPy APIs to use.

Replay should vary:

- dataset;
- number of robots;
- thresholds;
- corrupted samples;
- weight vector.

Boss generation must guarantee:

- a valid solution exists;
- generated shapes are compatible;
- required statistics are defined;
- a unique target exists when the objective expects exactly one target;
- the reference solution passes the grader.

Mission-generation mechanics are owned by `MISSION_SYSTEM.md`.

## 8. Future Worlds

These descriptions preserve the approved future learning path at curriculum level. They do not prescribe implementation details. CS116 lecture material remains the authority for what is official course content. Any practical topic below that is not clearly confirmed by the supplied CS116 material must be labeled **Supplementary / ML Foundation** when authored into lessons or activities.

### World 2 — Python for Data Science

Preserve planned coverage for practical data work:

- file/path handling;
- CSV / JSON and basic tabular I/O;
- Jupyter concepts;
- pandas `Series` / `DataFrame` mental model;
- row/column selection;
- filtering;
- missing values;
- concat/merge where course-relevant;
- groupby/aggregation where course-relevant;
- `pivot` / `pivot_table`;
- Matplotlib basics;
- image representation as arrays;
- PIL/OpenCV basics:
  - read image;
  - inspect shape;
  - understand channels;
  - pixel access and basic operations;
  - crop/resize;
  - visualization.

Do not expand this world into advanced OpenCV. The goal is to connect Python data structures, tables, plots, and image arrays to later ML workflows.

### World 3 — ML Pipeline

Preserve the first end-to-end ML workflow:

```text
problem
→ X / y
→ train / validation / test concepts
→ preprocess
→ model training
→ predict
→ evaluate
```

The learner should understand what each stage does, how data moves through the pipeline, and how the stages connect in a first sklearn workflow.

When not clearly confirmed by CS116 material, classify these implementation mental models as **Supplementary / ML Foundation**:

- sklearn estimator mental model;
- `fit`;
- `transform`;
- `fit_transform`;
- `predict`;
- `predict_proba`;
- sklearn `Pipeline` mental model.

### World 4 — Data Validation & EDA

Preserve:

- schema and dtype checks;
- missing values;
- duplicates and invalid values;
- distributions;
- outliers;
- histogram;
- boxplot;
- scatter;
- correlation;
- target/class distribution;
- basic train/test distribution awareness.

**Supplementary / ML Foundation unless confirmed by CS116:** data leakage awareness, including recognizing when validation results become misleading because training information leaks into preprocessing, features, or evaluation.

### World 5 — Feature Engineering

Preserve course-supported coverage for creating and transforming model inputs:

- imputation;
- scaling;
- standardization/normalization;
- categorical encoding;
- one-hot encoding;
- ordinal encoding;
- aggregation features;
- interaction features;
- transformations;
- time/date features;
- basic text features;
- PCA.

Practical preprocessing workflow concepts should be included as **Supplementary / ML Foundation** when they are not clearly present in CS116:

- fit preprocessing only on training data;
- avoid preprocessing leakage;
- sklearn `Pipeline`;
- `ColumnTransformer`.

The learner should understand both the transformation and where it belongs in a valid ML workflow.

### World 6 — Advanced Data Processing

Preserve controlled coverage of:

- Polars;
- eager versus lazy concepts;
- Lazy API;
- columnar-processing motivation;
- recognizing when pandas becomes a bottleneck;
- RAPIDS;
- cuDF;
- cuML;
- CPU versus GPU processing tradeoffs.

Teach these as practical processing tools at the depth justified by CS116. Keep the focus on why and when the tools matter rather than broad package coverage.

### World 7 — Feature Selection

Preserve the planned method families:

- why feature selection;
- filter methods;
- correlation;
- mutual information;
- wrapper methods;
- RFE;
- embedded methods;
- L1 regularization;
- tree importance;
- permutation importance;
- SHAP;
- LOFO;
- Boruta.

Do not imply equal priority for every method. Future lesson authoring must distinguish:

- **core understanding** — concepts the learner should reason about;
- **practical use** — methods worth implementing and applying;
- **exposure / lookup-only** — methods the learner should recognize without memorizing detailed APIs.

Actual placement in those tiers remains governed by CS116 evidence and the knowledge classifications in this document.

### World 8 — ML Models

Preserve the intended progression:

- baseline / Dummy models;
- Linear Regression;
- Logistic Regression;
- Decision Tree;
- bias versus variance;
- model complexity;
- regularization.

Additional models remain governed by actual CS116 lecture evidence. For every model, emphasize inputs/outputs, training and prediction, evaluation interpretation, and the level of assumptions required by the course.

### World 9 — Ensemble & AutoML

Preserve the conceptual order:

1. why ensembles;
2. Bagging;
3. Random Forest;
4. Boosting;
5. Gradient Boosting;
6. XGBoost;
7. LightGBM;
8. CatBoost;
9. AutoML concepts.

Teach the concepts before package-specific APIs. Depth remains governed by CS116 evidence; practical package details that exceed it must be marked **Supplementary / ML Foundation**.

### World 10 — Model Selection, CV, Tuning & Evaluation

Preserve:

- holdout;
- train/validation/test reasoning;
- KFold;
- StratifiedKFold;
- GroupKFold;
- cross-validation APIs where appropriate;
- regression metrics;
- classification metrics;
- model parameters versus hyperparameters;
- Grid Search;
- Random Search;
- Bayesian optimization where course-supported or explicitly **Supplementary / ML Foundation**;
- validation/model-selection reasoning;
- overfitting during tuning.

The learner should understand why a validation design is appropriate, what information it estimates, and how tuning can overfit validation choices rather than only memorize search APIs.

### World 11 — Imbalanced Data & Error Analysis

Preserve:

- class imbalance;
- the accuracy trap;
- precision;
- recall;
- F1;
- confusion matrix;
- ROC/PR concepts where course-supported;
- class weighting;
- undersampling;
- oversampling;
- SMOTE;
- threshold selection;
- false-positive analysis;
- false-negative analysis;
- error slicing/analysis.

Core rule:

> Imbalanced data does not automatically mean “use SMOTE”.

The learner should first understand the metric, class distribution, error costs, validation setup, and failure pattern before selecting a balancing or thresholding technique. `imbalanced-learn` may be used as an API reference when appropriate.

### Final — End-to-End ML Campaign

The final campaign should require a coherent workflow across previous worlds rather than isolated API recall.

It should be paired with paper-exam simulation activities that reduce editor assistance and test recall, prediction, debugging, and shape reasoning.

## 9. Knowledge Classification

Every concept may declare one of:

```text
MUST_RECALL
MUST_UNDERSTAND
LOOKUP_OK
```

### MUST_RECALL

Important code and patterns the learner should be able to produce without autocomplete in exam or practical situations.

Examples:

```text
import numpy as np
np.array(...)
X.shape
X[:, 0]
X[mask]
reshape
mean(axis=0)
X @ w
```

### MUST_UNDERSTAND

Concepts where reasoning matters more than verbatim syntax.

Examples:

```text
(n,) vs (n,1)
axis reasoning
broadcasting
element-wise vs matrix multiplication
centering vs standardization
```

### LOOKUP_OK

Less common optional utility APIs and rare arguments that are reasonable to retrieve from documentation.

This classification should later inform Exam Mode, hint policy, review scheduling, and activity choice.

## 10. Canonical Concept Model

`Concept` is the smallest tracked learning unit.

Concept definitions should support:

```text
id
title
description
classification
source
prerequisites
tags
```

Example stable IDs:

```text
numpy.array
numpy.shape
numpy.ndim
numpy.index.column
numpy.compare
numpy.boolean_mask
numpy.logical_and
numpy.logical_or
numpy.logical_not
numpy.reshape
numpy.transpose
numpy.aggregate.mean
numpy.aggregate.std
numpy.axis.zero
numpy.axis.one
numpy.broadcast.feature_vector
numpy.standardization
numpy.matmul
```

Concept IDs are persistence contracts. Once released with learner history attached, they must not be casually renamed. Prefer metadata/title changes or explicit migrations.

## 11. First Vertical Slice Curriculum Lock

The first vertical slice uses exactly these primary concepts:

```text
numpy.array
numpy.shape
numpy.ndim
numpy.index.column
numpy.compare
numpy.boolean_mask
numpy.logical_and
```

Canonical activity sequence:

```text
VS-01 — Boot Sensor Grid
Discover / Guided
np.array + shape + ndim

VS-02 — Diagnose Telemetry
Independent
shape reasoning

VS-03 — Extract Threat Channel
Independent
column extraction

VS-04 — Radar Filter
Guided
boolean filtering

VS-05 — Radar Filter Variant
Independent
generated filtering

VS-06 — Hostile Contact
Transfer
indexing + boolean logic

VS-07 — Recall Packet
Mixed Review / Retention preparation
generated review
```

The first slice should prove the learning system before the rest of NumPy content is authored.

## 12. Exam Support

The curriculum must be representable through more than executable coding missions.

Exam-oriented `LearningActivity` types may include:

- write code from scratch;
- fill missing code;
- predict output;
- find bugs;
- explain shape;
- select an appropriate API.

Exam Mode may configure:

- autocomplete off;
- syntax hints off;
- documentation off;
- Run disabled or limited.

MUST_RECALL concepts should receive direct no-autocomplete recall practice. MUST_UNDERSTAND concepts should receive explanation, prediction, transfer, and debugging tasks.

## 13. Curriculum Authoring Rules

1. Preserve the CS116 source-of-truth boundary.
2. Label uncertain practical additions as **Supplementary / ML Foundation**.
3. Track small concepts with stable IDs.
4. Express prerequisite knowledge in the Concept Graph rather than relying on chapter order alone.
5. Use the learning stages in `MISSION_SYSTEM.md` to move from introduction to independent transfer and retention.
6. Do not require all external references to be completed.
7. Avoid content that exists only to fill a world with volume.
8. Prefer multiple generated variants over repeated static exercises where generation can remain valid and unambiguous.
9. Keep the first vertical slice small enough to test the engine and learning loop before expanding World 1.

