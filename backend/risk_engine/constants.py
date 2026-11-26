"""Configurable thresholds and scoring constants matching the Spotter assessment rules."""

from trips.models import RiskLevel

RISK_RANK: dict[str, int] = {
    RiskLevel.LOW: 0,
    RiskLevel.MODERATE: 1,
    RiskLevel.HIGH: 2,
    RiskLevel.SEVERE: 3,
    RiskLevel.NO_TRAVEL: 4,
}

TIER_SCORE_RANGES: dict[str, tuple[float, float]] = {
    RiskLevel.LOW: (0.0, 24.0),
    RiskLevel.MODERATE: (25.0, 49.0),
    RiskLevel.HIGH: (50.0, 74.0),
    RiskLevel.SEVERE: (75.0, 89.0),
    RiskLevel.NO_TRAVEL: (90.0, 100.0),
}

# Exact Wind thresholds (mph)
# <25 Low | 25-34 Moderate | 35-44 High | 45-54 Severe | >=55 No Travel
WIND_BANDS = [
    (0.0, 25.0, RiskLevel.LOW, False),        # [0, 25)
    (25.0, 35.0, RiskLevel.MODERATE, False),  # [25, 35)
    (35.0, 45.0, RiskLevel.HIGH, False),      # [35, 45)
    (45.0, 55.0, RiskLevel.SEVERE, False),    # [45, 55)
    (55.0, 90.0, RiskLevel.NO_TRAVEL, True),  # >= 55
]

# Exact Rain thresholds (in/hr)
# <0.10 Low | 0.10-0.25 Moderate | >0.25-0.50 High | >0.50-1.00 Severe | >1.00 No Travel
RAIN_BANDS = [
    (0.0, 0.10, RiskLevel.LOW, False),        # [0, 0.10)
    (0.10, 0.25, RiskLevel.MODERATE, True),   # [0.10, 0.25]
    (0.25, 0.50, RiskLevel.HIGH, True),       # (0.25, 0.50]
    (0.50, 1.00, RiskLevel.SEVERE, True),     # (0.50, 1.00]
    (1.00, 2.50, RiskLevel.NO_TRAVEL, True),  # > 1.00
]

# Exact Snow thresholds (in/hr)
# <0.5 Low | 0.5-1.0 Moderate | >1.0-2.0 High | >2.0-3.0 Severe | >3.0 No Travel
SNOW_BANDS = [
    (0.0, 0.50, RiskLevel.LOW, False),        # [0, 0.50)
    (0.50, 1.00, RiskLevel.MODERATE, True),   # [0.50, 1.00]
    (1.00, 2.00, RiskLevel.HIGH, True),       # (1.00, 2.00]
    (2.00, 3.00, RiskLevel.SEVERE, True),     # (2.00, 3.00]
    (3.00, 6.00, RiskLevel.NO_TRAVEL, True),  # > 3.00
]

# Load-specific wind rules
HEAVY_LOAD_HIGH_WIND_THRESHOLD_LBS = 40000
MEDIUM_LOAD_SEVERE_WIND_THRESHOLD_LBS = 30000

RECOMMENDATIONS_BY_LEVEL: dict[str, str] = {
    RiskLevel.LOW: "Normal HGV operation; maintain standard following distance and monitor routine updates.",
    RiskLevel.MODERATE: "Exercise heightened caution; moderate speed and watch crosswinds or wet pavement.",
    RiskLevel.HIGH: "Reduce speed, increase following distance, and monitor real-time weather advisories closely.",
    RiskLevel.SEVERE: "High-risk corridor conditions; consider delaying transit or staging at a safe truck stop.",
    RiskLevel.NO_TRAVEL: "NO TRAVEL: Conditions exceed safe operating limits for this load. Do not dispatch through this window.",
}
