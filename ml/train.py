import json
from datetime import date, timedelta
from pathlib import Path
from random import Random

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, classification_report, confusion_matrix, roc_auc_score
from sklearn.preprocessing import StandardScaler

SEED = 42
TRAIN_SESSIONS = 1200
TEST_SEED = 8713
TEST_SESSIONS = 360
# Selected on separate synthetic validation to match the v1 false-positive rate.
EVALUATION_THRESHOLD = 0.290448
FEATURE_NAMES = [
    "last_sleep_hours", "mean_sleep_hours_3", "last_fatigue", "mean_fatigue_3",
    "mean_sleep_hours_session", "mean_fatigue_session",
    "projected_sleep_trend", "projected_fatigue_trend",
]
MODEL_PATH = Path(__file__).resolve().parent / "fatigue-model.json"


def clamp(value, lower, upper):
    return min(upper, max(lower, value))


def generate_sessions(seed, count):
    rng = Random(seed)
    sessions = {}
    start = date(2026, 1, 1)
    for index in range(count):
        session_id = f"synthetic-{seed}-{index + 1:04d}"
        sleep_baseline = rng.uniform(6.0, 8.5)
        fatigue_baseline = rng.uniform(2.0, 4.8)
        fatigue_trend = (0, 0.24, -0.24)[index % 3]
        check_ins = []
        for day in range(14):
            trend = fatigue_trend * (day - 6.5)
            sleep = clamp(round(rng.gauss(sleep_baseline - 0.6 * trend, 0.8), 1), 0, 24)
            fatigue = clamp(round(rng.gauss(fatigue_baseline + trend + 0.45 * (7 - sleep), 0.9)), 1, 7)
            check_ins.append({
                "session_id": session_id,
                "check_in_date": (start + timedelta(days=day)).isoformat(),
                "sleep_hours": sleep,
                "fatigue": fatigue,
                "mood_level": rng.randint(1, 5),
                "stress_level": rng.randint(1, 5),
                "team_conflict_level": rng.randint(1, 5),
                "description": None,
            })
        sessions[session_id] = check_ins
    return sessions


def session_features(history):
    recent = history[-3:]
    last = recent[-1]
    length = len(history)
    center = (length - 1) / 2
    offsets = [index - center for index in range(length)]
    # Project the fitted linear trend from the historical mean to the next check-in.
    trend_factor = (length - center) / sum(offset ** 2 for offset in offsets)
    return [
        last["sleep_hours"],
        sum(row["sleep_hours"] for row in recent) / 3,
        last["fatigue"],
        sum(row["fatigue"] for row in recent) / 3,
        sum(row["sleep_hours"] for row in history) / length,
        sum(row["fatigue"] for row in history) / length,
        sum(offset * row["sleep_hours"] for offset, row in zip(offsets, history)) * trend_factor,
        sum(offset * row["fatigue"] for offset, row in zip(offsets, history)) * trend_factor,
    ]


def build_examples(sessions):
    for check_ins in sessions:
        for index in range(2, len(check_ins) - 1):
            target = int(check_ins[index + 1]["fatigue"] >= 5)
            yield session_features(check_ins[:index + 1]), target


def train():
    train_sessions = generate_sessions(SEED, TRAIN_SESSIONS)
    test_sessions = generate_sessions(TEST_SEED, TEST_SESSIONS)
    assert train_sessions.keys().isdisjoint(test_sessions)

    train_features, train_labels = zip(*build_examples(train_sessions.values()))
    test_features, test_labels = zip(*build_examples(test_sessions.values()))
    assert len(train_labels) == TRAIN_SESSIONS * 11 and len(test_labels) == TEST_SESSIONS * 11
    assert set(train_labels) == set(test_labels) == {0, 1}

    scaler = StandardScaler()
    classifier = LogisticRegression(random_state=SEED)
    classifier.fit(scaler.fit_transform(train_features), train_labels)
    assert len(FEATURE_NAMES) == classifier.n_features_in_
    probabilities = classifier.predict_proba(scaler.transform(test_features))[:, 1]
    predicted = probabilities >= EVALUATION_THRESHOLD
    baseline = np.asarray(test_features)[:, 2] >= 5

    model = {
        "model_version": "fatigue-logistic-synthetic-v2",
        "feature_names": FEATURE_NAMES,
        "means": scaler.mean_.round(12).tolist(),
        "scales": scaler.scale_.round(12).tolist(),
        "coefficients": classifier.coef_[0].round(12).tolist(),
        "intercept": round(float(classifier.intercept_[0]), 12),
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    print(f"Synthetic train: {len(train_sessions)} sessions, {len(train_labels)} windows, "
          f"{np.mean(train_labels):.1%} positive")
    print(f"Synthetic test: {len(test_sessions)} sessions, {len(test_labels)} windows, "
          f"{np.mean(test_labels):.1%} positive")
    print(f"Model Brier: {brier_score_loss(test_labels, probabilities):.4f}")
    print(f"Model ROC-AUC: {roc_auc_score(test_labels, probabilities):.4f}")
    print(f"Persistence Brier: {brier_score_loss(test_labels, baseline.astype(int)):.4f}")
    print(f"Model confusion matrix (rows actual, columns predicted, threshold {EVALUATION_THRESHOLD}):",
          confusion_matrix(test_labels, predicted).tolist())
    print(classification_report(test_labels, predicted, digits=4))
    print("Persistence confusion matrix:", confusion_matrix(test_labels, baseline).tolist())


if __name__ == "__main__":
    train()
