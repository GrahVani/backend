# Muhurat Engine — Developer Integration Guide

**Version**: 1.1 (Sprint 8.5 — Utility Endpoints)
**Last Updated**: 2026-03-14
**Production Base URL**: `https://astroengine.astrocorp.in`
**Maintainer**: AstroCorp Engine Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Quick Start](#2-quick-start)
3. [Authentication & Rate Limits](#3-authentication--rate-limits)
4. [API Reference — Core Endpoints](#4-api-reference--core-endpoints)
   - 4.1 [POST /muhurat/find](#41-post-muhuratfind)
   - 4.2 [POST /muhurat/evaluate](#42-post-muhuratevaluate)
   - 4.3 [POST /muhurat/compatibility](#43-post-muhuratcompatibility)
   - 4.4 [GET /muhurat/event-types](#44-get-muhuratevent-types)
   - 4.5 [POST /muhurat/interpret](#45-post-muhuratinterpret)
   - 4.6 [GET /muhurat/traditions](#46-get-muhurattraditions)
   - 4.7 [POST /muhurat/panchang](#47-post-muhuratpanchang)
   - 4.8 [POST /muhurat/inauspicious-windows](#48-post-muhuratinauspicious-windows)
   - 4.9 [POST /muhurat/time-quality](#49-post-muhurattime-quality)
5. [Request Schemas](#5-request-schemas)
   - 5.1 [PersonInput](#51-personinput)
   - 5.2 [Event Types](#52-event-types)
   - 5.3 [Traditions](#53-traditions)
6. [Response Schemas](#6-response-schemas)
   - 6.1 [Muhurat Object](#61-muhurat-object)
   - 6.2 [Panchang Object](#62-panchang-object)
   - 6.3 [Score Breakdown](#63-score-breakdown)
   - 6.4 [Time Quality Object](#64-time-quality-object)
   - 6.5 [Inauspicious Windows Object](#65-inauspicious-windows-object)
   - 6.6 [Compatibility Object](#66-compatibility-object)
   - 6.7 [Rejection Summary](#67-rejection-summary)
   - 6.8 [Date Verdict (Evaluate Only)](#68-date-verdict-evaluate-only)
7. [Tradition-Specific Behavior](#7-tradition-specific-behavior)
   - 7.1 [North Indian](#71-north-indian)
   - 7.2 [South Indian — Tamil](#72-south-indian--tamil)
   - 7.3 [South Indian — Kerala](#73-south-indian--kerala)
   - 7.4 [South Indian — Telugu](#74-south-indian--telugu)
   - 7.5 [South Indian — Kannada](#75-south-indian--kannada)
   - 7.6 [Universal](#76-universal)
   - 7.7 [Tradition Comparison Matrix](#77-tradition-comparison-matrix)
8. [Pipeline Architecture](#8-pipeline-architecture)
   - 8.1 [Layer Overview](#81-layer-overview)
   - 8.2 [Gate vs Score Layers](#82-gate-vs-score-layers)
   - 8.3 [Scoring System](#83-scoring-system)
   - 8.4 [Grade Thresholds](#84-grade-thresholds)
9. [Marriage Compatibility](#9-marriage-compatibility)
   - 9.1 [Ashtakoot Gun Milan (North Indian)](#91-ashtakoot-gun-milan-north-indian)
   - 9.2 [Dasha Porutham (South Indian)](#92-dasha-porutham-south-indian)
   - 9.3 [Manglik / Chevvai / Chovva Dosham](#93-manglik--chevvai--chovva-dosham)
10. [Time Quality Systems](#10-time-quality-systems)
    - 10.1 [Choghadiya (North Indian)](#101-choghadiya-north-indian)
    - 10.2 [Gowri Panchangam (South Indian)](#102-gowri-panchangam-south-indian)
11. [Error Handling](#11-error-handling)
12. [Caching Behavior](#12-caching-behavior)
13. [Integration Patterns](#13-integration-patterns)
    - 13.1 [Mobile App (AstroCorp / Grahasth)](#131-mobile-app-astrocorp--grahasth)
    - 13.2 [Pro Astrologer SaaS (Grahvani)](#132-pro-astrologer-saas-grahvani)
    - 13.3 [AI Chat (Astro Ratan)](#133-ai-chat-astro-ratan)
14. [Enums & Constants Reference](#14-enums--constants-reference)
15. [FAQ](#15-faq)

---

## 1. Overview

The Muhurat Engine is a **10-layer parametric scoring pipeline** that finds auspicious date-time windows for Hindu ceremonies. It evaluates every potential muhurat through a series of gate checks and scoring layers, then returns ranked results with tradition-specific formatting.

**Key Capabilities**:
- **9 API endpoints** — 5 core (find, evaluate, compatibility, interpret, event-types) + 4 utility (traditions, panchang, inauspicious-windows, time-quality)
- 13 event types (Vivah, Griha Pravesh, Vyapaar, etc.)
- 6 regional traditions (North Indian, Tamil, Kerala, Telugu, Kannada, Universal)
- 10-layer pipeline with 21+ dosha checks
- Marriage compatibility (Ashtakoot 36-point + Dasha Porutham 10-factor)
- Tradition-specific response formatting (Choghadiya vs Gowri, Ashtakoot vs Porutham)
- Standalone utility lookups (daily Panchang, Rahu Kaal, time quality)
- Classical text references (Muhurta Chintamani, Kalaprakashika, etc.)
- Optional AI-powered interpretation (multi-language)

**Architecture at a Glance**:
```
Client Request
    |
    v
POST /muhurat/find { tradition, event_type, dates, persons }
    |
    v
MuhuratService.find_muhurats()
    |
    v
Pipeline Orchestrator
    L0  Macro Period Gate -----> REJECT (Shukra Asta, Chaturmas, etc.)
    L1  Day Disqualifiers -----> REJECT (Combust Moon, Gandanta, etc.)
    L2  Panchang Shuddhi -----> SCORE 0-25
    L3  Yoga Matrix ----------> GATE (Dagdha Yoga → reject)
    L4  Mahadosha (21+) ------> GATE (critical doshas → reject)
    L5  Personalization -------> SCORE 0-20 (Tara, Chandrabala, Dasha)
    L6  Compatibility ---------> GATE+SCORE 0-15 (marriage only)
    L7  Lagna Shuddhi ---------> SCORE 0-15 (best ascendant windows)
    L8  Bad Windows -----------> PENALTY (Rahu Kaal, Varjyam, etc.)
    L9  Good Windows ----------> BONUS 0-10 (Abhijit, Amrit Kaal)
    L10 Rank & Return ---------> Top N results
    |
    v
Tradition Formatter (Strategy Pattern)
    get_formatter(tradition) → NorthIndian / Tamil / Kerala / ...
    |
    v
Tradition-Shaped JSON Response
```

---

## 2. Quick Start

### Find a Muhurat (Simplest Call)

```bash
curl -s -X POST https://astroengine.astrocorp.in/muhurat/find \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "GRIHA_PRAVESH",
    "from_date": "2026-11-01",
    "to_date": "2026-12-31",
    "persons": [{
      "birth_date": "1995-03-15",
      "birth_time": "10:30",
      "latitude": 28.6139,
      "longitude": 77.2090,
      "timezone": "Asia/Kolkata"
    }]
  }'
```

**Defaults applied**: `tradition=NORTH_INDIAN`, `max_results=10`, location=Delhi.

### Check Marriage Compatibility

```bash
curl -s -X POST https://astroengine.astrocorp.in/muhurat/compatibility \
  -H 'Content-Type: application/json' \
  -d '{
    "tradition": "SOUTH_INDIAN_TAMIL",
    "person1": {
      "birth_date": "1995-03-15", "birth_time": "10:30",
      "latitude": 13.08, "longitude": 80.27, "timezone": "Asia/Kolkata"
    },
    "person2": {
      "birth_date": "1997-08-22", "birth_time": "14:45",
      "latitude": 13.08, "longitude": 80.27, "timezone": "Asia/Kolkata"
    }
  }'
```

### List Supported Events

```bash
curl -s https://astroengine.astrocorp.in/muhurat/event-types
```

### Quick Utility Lookups

```bash
# Today's Panchang (Tithi, Nakshatra, Yoga, Karana)
curl -s -X POST https://astroengine.astrocorp.in/muhurat/panchang \
  -H 'Content-Type: application/json' \
  -d '{"date": "2026-11-15", "time": "09:00"}'

# Today's Rahu Kaal and inauspicious windows
curl -s -X POST https://astroengine.astrocorp.in/muhurat/inauspicious-windows \
  -H 'Content-Type: application/json' \
  -d '{"date": "2026-11-15", "tradition": "SOUTH_INDIAN_KERALA"}'

# Is right now auspicious? (Choghadiya/Gowri check)
curl -s -X POST https://astroengine.astrocorp.in/muhurat/time-quality \
  -H 'Content-Type: application/json' \
  -d '{"date": "2026-11-15", "time": "10:30", "tradition": "NORTH_INDIAN"}'

# List all traditions with metadata
curl -s https://astroengine.astrocorp.in/muhurat/traditions
```

---

## 3. Authentication & Rate Limits

| Setting | Value |
|---------|-------|
| Authentication | None (public API) |
| Rate Limit | Standard Astro Engine limits apply |
| Max Date Range | 365 days per `/find` call |
| Max Results | 50 per call |
| Request Timeout | 90 seconds recommended |
| Content-Type | `application/json` |

> **Note for AstroCorp Backend / Grahvani**: These endpoints are proxied through the respective backend services. Use your backend's proxy path (e.g., `/api/astro-engine/muhurat/find`) with your JWT auth headers. The Astro Engine itself is unauthenticated.

---

## 4. API Reference

### 4.1 POST /muhurat/find

**Purpose**: Find the best auspicious date-time windows for an event within a date range.

**Cache TTL**: 1 hour

**Request Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `event_type` | string | Yes | — | Event code (see [5.2](#52-event-types)) |
| `tradition` | string | No | `"NORTH_INDIAN"` | Regional tradition (see [5.3](#53-traditions)) |
| `from_date` | string | Yes | — | Start date `YYYY-MM-DD` |
| `to_date` | string | Yes | — | End date `YYYY-MM-DD` |
| `latitude` | float | No | `28.6139` | Event location latitude (-90 to 90) |
| `longitude` | float | No | `77.2090` | Event location longitude (-180 to 180) |
| `timezone` | string | No | `"Asia/Kolkata"` | IANA timezone |
| `persons` | array | Conditional | `[]` | 1-2 PersonInput objects. **Required for VIVAH/SAGAI** |
| `max_results` | int | No | `10` | Max muhurats to return (1-50) |
| `preferred_start_time` | string | No | — | Prefer muhurats after this time `HH:MM` |
| `preferred_end_time` | string | No | — | Prefer muhurats before this time `HH:MM` |
| `weekdays_only` | bool | No | `false` | Exclude weekends |
| `include_interpretation` | bool | No | `false` | Add AI-generated guidance text |
| `user_name` | string | No | — | Name for personalized interpretation |
| `preferred_language` | string | No | `"english"` | Language for interpretation (english, hindi, hinglish, tamil, telugu, kannada, malayalam) |

**Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "tradition": "NORTH_INDIAN",
    "tradition_display": "North Indian (Muhurta Chintamani)",
    "matching_system": "ashtakoot",
    "time_quality_system": "choghadiya",
    "primary_reference": "Muhurta Chintamani",
    "total_muhurats": 3,
    "best_score": 31.1,
    "best_grade": "Adhama",
    "search_info": {
      "event_type": "GRIHA_PRAVESH",
      "tradition": "NORTH_INDIAN",
      "days_scanned": 8,
      "candidates_evaluated": 48,
      "muhurats_found": 3,
      "computation_time_ms": 721
    },
    "rejection_summary": { ... },
    "compatibility": null,
    "muhurats": [ ... ]
  }
}
```

The `muhurats` array contains [Muhurat Objects](#61-muhurat-object) ranked by score (highest first).

---

### 4.2 POST /muhurat/evaluate

**Purpose**: Evaluate a specific date (optionally with a time) through the full pipeline. Use this when a user asks "Is November 20th good for my housewarming?"

**Cache TTL**: 1 hour

**Request Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `event_type` | string | Yes | — | Event code |
| `tradition` | string | No | `"NORTH_INDIAN"` | Regional tradition |
| `date` | string | Yes | — | Date to evaluate `YYYY-MM-DD` |
| `time` | string | No | `"06:00:00"` | Specific time `HH:MM` or `HH:MM:SS` |
| `latitude` | float | No | `28.6139` | Location latitude |
| `longitude` | float | No | `77.2090` | Location longitude |
| `timezone` | string | No | `"Asia/Kolkata"` | IANA timezone |
| `persons` | array | Conditional | `[]` | PersonInput objects |
| `include_interpretation` | bool | No | `false` | AI guidance |
| `user_name` | string | No | — | For interpretation |
| `preferred_language` | string | No | `"english"` | Interpretation language |

**Response** — Same structure as `/find`, plus:

```json
{
  "data": {
    "evaluation": {
      "date": "2026-11-20",
      "time": "06:00:00",
      "event_type": "GRIHA_PRAVESH",
      "tradition": "NORTH_INDIAN"
    },
    "date_verdict": {
      "is_suitable": false,
      "date_display": "Friday, 20th November 2026",
      "event": "Griha Pravesh",
      "summary": "Friday, 20th November 2026 is not suitable for Griha Pravesh. Reason: ...",
      "reasons": [
        "No suitable lagna (ascendant) windows found in the requested time range"
      ],
      "recommendation": "Please try a different date. Use the /muhurat/find endpoint with a date range to discover the best available muhurats."
    },
    "muhurats": []
  }
}
```

> **Important**: If `muhurats` is empty, the `date_verdict` object explains why the date is unsuitable. Always check `muhurats.length` before accessing muhurat data.

---

### 4.3 POST /muhurat/compatibility

**Purpose**: Standalone marriage compatibility check without searching for muhurats. Returns Ashtakoot (North Indian) or Dasha Porutham (South Indian) analysis.

**Cache TTL**: 24 hours

**Request Body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tradition` | string | No (default `NORTH_INDIAN`) | Determines matching system |
| `person1` | PersonInput | Yes | Groom / Person 1 |
| `person2` | PersonInput | Yes | Bride / Person 2 |

> **Note**: This endpoint uses `person1` and `person2` (not a `persons` array).

**Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "tradition": "SOUTH_INDIAN_TAMIL",
    "tradition_display": "South Indian — Tamil (Kalaprakashika)",
    "matching_system": "dasha_porutham",
    "primary_reference": "Kalaprakashika",
    "muhurat_score": 0.0,
    "verdict": "Porutham: BLOCKED — mandatory Rajju/Vedhai failed (9/10)",
    "compatibility": {
      "tradition": "SOUTH_INDIAN_TAMIL",
      "yoni_animals": ["", ""],
      "yoni_score": 0,
      "gana_match": "",
      "chevvai_dosham": {
        "person1": false,
        "person2": false,
        "cancelled": false,
        "note": "Chevvai Dosham (Tamil: Mars affliction)"
      },
      "porutham": {
        "system": "DASHA_PORUTHAM",
        "total_passed": 9,
        "total_poruthams": 10,
        "mandatory_passed": false,
        "poruthams": {
          "dina":    { "pass": true,  "mandatory": false },
          "gana":    { "pass": true,  "mandatory": false },
          "rajju":   { "pass": false, "mandatory": true },
          "vedhai":  { "pass": true,  "mandatory": true },
          ...
        }
      },
      "mandatory_passed": false,
      "mandatory_warning": "Mandatory porutham(s) failed: Rajju. Marriage not recommended per Kalaprakashika.",
      "verdict": "Porutham: BLOCKED — mandatory Rajju/Vedhai failed (9/10)"
    }
  }
}
```

---

### 4.4 GET /muhurat/event-types

**Purpose**: List all supported event types and traditions.

**Response** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "event_types": [
      { "code": "VIVAH",         "name": "Vivah",         "description": "Marriage ceremony",              "requires_two_persons": true },
      { "code": "SAGAI",         "name": "Sagai",         "description": "Engagement / Nischitartham",     "requires_two_persons": true },
      { "code": "GRIHA_PRAVESH", "name": "Griha Pravesh", "description": "Housewarming ceremony",          "requires_two_persons": false },
      { "code": "BHOOMI_PUJAN",  "name": "Bhoomi Pujan",  "description": "Ground breaking ceremony",       "requires_two_persons": false },
      { "code": "VYAPAAR",       "name": "Vyapaar",       "description": "Business opening / new venture",  "requires_two_persons": false },
      { "code": "VAHAN",         "name": "Vahan",         "description": "Vehicle purchase / first drive",   "requires_two_persons": false },
      { "code": "UPANAYANA",     "name": "Upanayana",     "description": "Thread ceremony (Janeu/Poonal)",   "requires_two_persons": false },
      { "code": "NAAMKARAN",     "name": "Naamkaran",     "description": "Naming ceremony",                  "requires_two_persons": false },
      { "code": "ANNAPRASHAN",   "name": "Annaprashan",   "description": "First rice feeding ceremony",      "requires_two_persons": false },
      { "code": "VIDYAARAMBH",   "name": "Vidyaarambh",   "description": "Starting education / joining school", "requires_two_persons": false },
      { "code": "SURGERY",       "name": "Surgery",       "description": "Surgical procedure / medical operation", "requires_two_persons": false },
      { "code": "YATRA",         "name": "Yatra",         "description": "Travel / pilgrimage",              "requires_two_persons": false },
      { "code": "PROPERTY",      "name": "Property",      "description": "Property purchase / registration",  "requires_two_persons": false }
    ],
    "total": 13,
    "traditions": [
      { "code": "NORTH_INDIAN",         "name": "North Indian" },
      { "code": "SOUTH_INDIAN_TAMIL",   "name": "South Indian (Tamil)" },
      { "code": "SOUTH_INDIAN_KERALA",  "name": "South Indian (Kerala)" },
      { "code": "SOUTH_INDIAN_TELUGU",  "name": "South Indian (Telugu)" },
      { "code": "SOUTH_INDIAN_KANNADA", "name": "South Indian (Kannada)" },
      { "code": "UNIVERSAL",            "name": "Universal (strictest of both)" }
    ]
  }
}
```

---

### 4.5 POST /muhurat/interpret

**Purpose**: Generate AI-powered human-readable interpretation of muhurat results. Calls Gemini under the hood.

**Cache TTL**: 1 hour

**Request Body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `muhurat_data` | object | Yes | Raw response from `/find` or `/evaluate` |
| `event_type` | string | Yes | Event code |
| `tradition` | string | No | Regional tradition (default `NORTH_INDIAN`) |
| `language` | string | No | Output language (default `english`) |
| `user_name` | string | No | For personalized interpretation |

**Response**: Returns AI-generated text explaining the muhurat in plain language. Useful for chat interfaces and reports.

---

### 4.6 GET /muhurat/traditions

**Purpose**: List all supported traditions with their systems, classical references, penalty multipliers, and terminology. Useful for populating tradition selectors and understanding system differences.

**Cache TTL**: Static (no computation)

**Request**: No body required.

**Example**:

```bash
curl -s https://astroengine.astrocorp.in/muhurat/traditions | python3 -m json.tool
```

**Response**:

```json
{
  "success": true,
  "data": {
    "traditions": [
      {
        "code": "NORTH_INDIAN",
        "display": "North Indian (Muhurta Chintamani)",
        "time_quality_system": "choghadiya",
        "matching_system": "ashtakoot",
        "primary_reference": "Muhurta Chintamani",
        "manglik_term": "Manglik",
        "mandatory_avoid": ["rahu_kaal", "durmuhurta"],
        "penalty_multipliers": { "rahu_kaal": 1.0, "yamaganda": 0.5, "gulika_kaal": 0.3 }
      },
      {
        "code": "SOUTH_INDIAN_TAMIL",
        "display": "South Indian — Tamil (Kalaprakashika)",
        "time_quality_system": "gowri_panchangam",
        "matching_system": "dasha_porutham",
        "primary_reference": "Kalaprakashika",
        "manglik_term": "Chevvai Dosham",
        "mandatory_avoid": ["rahu_kaal", "varjyam"],
        "penalty_multipliers": { "rahu_kaal": 1.5, "yamaganda": 0.5, "gulika_kaal": 0.5 }
      },
      {
        "code": "SOUTH_INDIAN_KERALA",
        "display": "South Indian — Kerala (Muhurta Padavi)",
        "time_quality_system": "gowri_panchangam",
        "matching_system": "dasha_porutham",
        "primary_reference": "Muhurta Padavi",
        "manglik_term": "Chovva Dosham",
        "mandatory_avoid": ["rahu_kaal", "varjyam", "gulika_kaal"],
        "penalty_multipliers": { "rahu_kaal": 2.0, "yamaganda": 0.7, "gulika_kaal": 1.0 }
      }
    ],
    "total": 6
  }
}
```

> **Use case**: Call once on app launch. Cache the result client-side (it never changes). Use `mandatory_avoid` to highlight which periods are absolutely forbidden per tradition.

---

### 4.7 POST /muhurat/panchang

**Purpose**: Get the daily Panchang (five limbs of the Vedic calendar) for a specific date, time, and location. Returns Tithi, Nakshatra, Yoga, Karana, and Vara.

**Cache TTL**: 1 hour

**Request Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | string | Yes | — | Date `YYYY-MM-DD` |
| `time` | string | No | `06:00:00` | Time `HH:MM` or `HH:MM:SS` |
| `latitude` | float | No | 28.6139 | Location latitude |
| `longitude` | float | No | 77.2090 | Location longitude |
| `timezone` | string | No | `Asia/Kolkata` | IANA timezone |

**Example**:

```bash
curl -s -X POST https://astroengine.astrocorp.in/muhurat/panchang \
  -H 'Content-Type: application/json' \
  -d '{
    "date": "2026-11-15",
    "time": "09:00",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timezone": "Asia/Kolkata"
  }'
```

**Response**:

```json
{
  "success": true,
  "data": {
    "date": "2026-11-15",
    "time": "09:00:00",
    "panchang": {
      "tithi": "Shukla Dvitiya (Shukla)",
      "tithi_index": 1,
      "tithi_group": "NANDA",
      "paksha": "SHUKLA",
      "nakshatra": "Rohini",
      "nakshatra_index": 3,
      "nakshatra_category": "FIXED",
      "yoga": "Shubha",
      "yoga_index": 5,
      "yoga_nature": "AUSPICIOUS",
      "karana": "Balava",
      "karana_index": 1,
      "karana_nature": "MOVABLE"
    },
    "vara": "Sunday"
  }
}
```

> **Use case**: Mobile home screen Panchang widget, Grahvani daily calendar view, WhatsApp bot "What's today's tithi?"

---

### 4.8 POST /muhurat/inauspicious-windows

**Purpose**: Get all auspicious and inauspicious muhurat time windows for a date/location, annotated with tradition-specific penalties and mandatory-avoid periods.

**Cache TTL**: 1 hour

**Request Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | string | Yes | — | Date `YYYY-MM-DD` |
| `latitude` | float | No | 28.6139 | Location latitude |
| `longitude` | float | No | 77.2090 | Location longitude |
| `timezone` | string | No | `Asia/Kolkata` | IANA timezone |
| `tradition` | string | No | `NORTH_INDIAN` | For penalty annotations |

**Example**:

```bash
curl -s -X POST https://astroengine.astrocorp.in/muhurat/inauspicious-windows \
  -H 'Content-Type: application/json' \
  -d '{
    "date": "2026-11-15",
    "latitude": 10.0159,
    "longitude": 76.3419,
    "timezone": "Asia/Kolkata",
    "tradition": "SOUTH_INDIAN_KERALA"
  }'
```

**Response**:

```json
{
  "success": true,
  "data": {
    "date": "2026-11-15",
    "weekday": "Sunday",
    "sun_timings": {
      "sunrise": "06:12:42",
      "sunset": "17:54:18",
      "day_duration_hours": 11.6933,
      "day_duration_formatted": "11h 41m"
    },
    "auspicious_periods": {
      "abhijit_muhurat": {
        "name": "Abhijit Muhurat",
        "start_time": "11:37:09",
        "end_time": "12:23:56",
        "quality": "Most Auspicious"
      },
      "pradosh_kaal": {
        "name": "Pradosh Kaal",
        "start_time": "17:54:18",
        "end_time": "20:29:18",
        "quality": "Auspicious"
      }
    },
    "inauspicious_periods": {
      "rahu_kaal": {
        "name": "Rahu Kaal",
        "start_time": "16:27:13",
        "end_time": "17:54:18",
        "quality": "Highly Inauspicious"
      },
      "yamaganda_kaal": { "..." : "..." },
      "gulika_kaal": { "..." : "..." },
      "dur_muhurats": [ { "..." : "..." } ]
    },
    "tradition_annotations": {
      "tradition": "SOUTH_INDIAN_KERALA",
      "tradition_display": "Muhurta Padavi",
      "mandatory_avoid": ["rahu_kaal", "varjyam", "gulika_kaal"],
      "penalty_multipliers": { "rahu_kaal": 2.0, "yamaganda": 0.7, "gulika_kaal": 1.0 },
      "rahu_kaal_note": "Absolutely forbidden in Kerala tradition (2x penalty per Muhurta Padavi)"
    }
  }
}
```

> **Use case**: Mobile home screen "Today's Rahu Kaal" card, Grahvani daily planner overlay, any app showing "avoid these times today". The `tradition_annotations` object tells you exactly which periods to highlight as critical.

---

### 4.9 POST /muhurat/time-quality

**Purpose**: Check whether a specific moment is auspicious by looking up the active Choghadiya (North Indian) or Gowri Panchangam (South Indian) segment.

**Cache TTL**: 30 minutes

**Request Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `date` | string | Yes | — | Date `YYYY-MM-DD` |
| `time` | string | Yes | — | Time `HH:MM` or `HH:MM:SS` |
| `latitude` | float | No | 28.6139 | Location latitude |
| `longitude` | float | No | 77.2090 | Location longitude |
| `timezone` | string | No | `Asia/Kolkata` | IANA timezone |
| `tradition` | string | No | `NORTH_INDIAN` | Determines which system |

**Example (North Indian — Choghadiya)**:

```bash
curl -s -X POST https://astroengine.astrocorp.in/muhurat/time-quality \
  -H 'Content-Type: application/json' \
  -d '{
    "date": "2026-11-15",
    "time": "10:30",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timezone": "Asia/Kolkata",
    "tradition": "NORTH_INDIAN"
  }'
```

**Response (Choghadiya)**:

```json
{
  "success": true,
  "data": {
    "date": "2026-11-15",
    "time": "10:30:00",
    "tradition": "NORTH_INDIAN",
    "tradition_display": "Muhurta Chintamani",
    "time_quality": {
      "system": "CHOGHADIYA",
      "active_segment": "Labh",
      "is_auspicious": true,
      "segment_index": 2,
      "all_day_segments": ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg"]
    },
    "sunrise": "06:25:32",
    "sunset": "17:38:28"
  }
}
```

**Example (South Indian — Gowri Panchangam)**:

```bash
curl -s -X POST https://astroengine.astrocorp.in/muhurat/time-quality \
  -H 'Content-Type: application/json' \
  -d '{
    "date": "2026-11-15",
    "time": "10:30",
    "tradition": "SOUTH_INDIAN_TAMIL"
  }'
```

**Response (Gowri)**:

```json
{
  "success": true,
  "data": {
    "date": "2026-11-15",
    "time": "10:30:00",
    "tradition": "SOUTH_INDIAN_TAMIL",
    "tradition_display": "Kalaprakashika",
    "time_quality": {
      "system": "GOWRI_PANCHANGAM",
      "active_segment": "Amirtham",
      "is_auspicious": true,
      "segment_index": 2,
      "all_day_segments": ["Visham", "Udayam", "Amirtham", "Rogam", "Sukhsm", "Dhana", "Labham", "Maranam"]
    },
    "sunrise": "06:25:32",
    "sunset": "17:38:28"
  }
}
```

> **Use case**: "Is right now a good time?" quick check. Real-time auspicious indicator on mobile app. Also useful for UNIVERSAL tradition which returns both systems side-by-side.

---

## 5. Request Schemas

### 5.1 PersonInput

Every person (for personalization or compatibility) uses this schema:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `birth_date` | string | Yes | `YYYY-MM-DD` format |
| `birth_time` | string | Yes | `HH:MM` or `HH:MM:SS` (24-hour) |
| `latitude` | float | Yes | Birth place latitude (-90 to 90) |
| `longitude` | float | Yes | Birth place longitude (-180 to 180) |
| `timezone` | string | Yes | IANA timezone (e.g., `"Asia/Kolkata"`) |

```json
{
  "birth_date": "1995-03-15",
  "birth_time": "10:30",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "timezone": "Asia/Kolkata"
}
```

> **Tip**: The birth place latitude/longitude is used for calculating the birth chart (janma kundali), not the event location. The event location is specified separately in the top-level `latitude`/`longitude` fields.

### 5.2 Event Types

| Code | Name | Two Persons? | Description |
|------|------|:---:|-------------|
| `VIVAH` | Vivah | Yes | Marriage ceremony |
| `SAGAI` | Sagai | Yes | Engagement / Nischitartham |
| `GRIHA_PRAVESH` | Griha Pravesh | No | Housewarming ceremony |
| `BHOOMI_PUJAN` | Bhoomi Pujan | No | Ground breaking ceremony |
| `VYAPAAR` | Vyapaar | No | Business opening / new venture |
| `VAHAN` | Vahan | No | Vehicle purchase / first drive |
| `UPANAYANA` | Upanayana | No | Thread ceremony (Janeu/Poonal) |
| `NAAMKARAN` | Naamkaran | No | Naming ceremony |
| `ANNAPRASHAN` | Annaprashan | No | First rice feeding ceremony |
| `VIDYAARAMBH` | Vidyaarambh | No | Starting education |
| `SURGERY` | Surgery | No | Surgical / medical procedure |
| `YATRA` | Yatra | No | Travel / pilgrimage |
| `PROPERTY` | Property | No | Property purchase / registration |

> **Two Persons**: VIVAH and SAGAI require exactly 2 `PersonInput` objects in the `persons` array. All other events require exactly 1.

### 5.3 Traditions

| Code | Display Name | Matching System | Time System | Primary Reference |
|------|-------------|-----------------|-------------|-------------------|
| `NORTH_INDIAN` | North Indian (Muhurta Chintamani) | Ashtakoot | Choghadiya | Muhurta Chintamani |
| `SOUTH_INDIAN_TAMIL` | South Indian — Tamil (Kalaprakashika) | Dasha Porutham | Gowri Panchangam | Kalaprakashika |
| `SOUTH_INDIAN_KERALA` | South Indian — Kerala (Muhurta Padavi) | Dasha Porutham | Gowri Panchangam | Muhurta Padavi |
| `SOUTH_INDIAN_TELUGU` | South Indian — Telugu (Muhurta Martanda) | Dasha Porutham | Gowri Panchangam | Muhurta Martanda |
| `SOUTH_INDIAN_KANNADA` | South Indian — Kannada (Panchanga Siddhanti) | Dasha Porutham | Gowri Panchangam | Panchanga Siddhanti |
| `UNIVERSAL` | Universal (Combined Strictest) | Both | Both | Muhurta Chintamani + Kalaprakashika |

---

## 6. Response Schemas

### 6.1 Muhurat Object

Each item in the `muhurats` array:

| Field | Type | Description |
|-------|------|-------------|
| `rank` | int | 1-based rank (1 = best) |
| `score` | float | 0-100 composite score |
| `grade` | string | Quality grade (see [8.4](#84-grade-thresholds)) |
| `date` | string | `YYYY-MM-DD` |
| `date_display` | string | `"Friday, 20th November 2026"` |
| `day` | string | `"Friday"` |
| `window_start` | string | `HH:MM:SS` — muhurat start time |
| `window_end` | string | `HH:MM:SS` — muhurat end time |
| `time_display` | string | `"12:48 PM – 2:18 PM"` — human-readable |
| `duration_minutes` | int | Window duration (typically 90) |
| `lagna` | string | `"Kumbha (Aquarius)"` — ascending sign |
| `panchang` | object | [Panchang Object](#62-panchang-object) |
| `score_breakdown` | object | [Score Breakdown](#63-score-breakdown) |
| `time_quality` | object | [Time Quality Object](#64-time-quality-object) |
| `inauspicious_windows_today` | object | [Inauspicious Windows](#65-inauspicious-windows-object) |
| `tradition_notes` | array[string] | Tradition-specific advisory notes |
| `classical_references` | array[string] | Classical texts cited in scoring |
| `reasoning` | array[string] | Human-readable explanations for the score |
| `warnings` | array[string] | Active warnings (doshas, afflictions) |
| `compatibility` | object\|null | [Compatibility Object](#66-compatibility-object) (marriage only) |

### 6.2 Panchang Object

The five elements of the Hindu calendar for the muhurat day:

| Field | Type | Description |
|-------|------|-------------|
| `tithi` | string | `"Shukla Dashami (Shukla)"` |
| `tithi_index` | int | 0-29 (0=Shukla Pratipada, 15=Krishna Pratipada) |
| `tithi_group` | string | `Nanda` \| `Bhadra` \| `Jaya` \| `Rikta` \| `Purna` |
| `paksha` | string | `Shukla` (bright) \| `Krishna` (dark) |
| `nakshatra` | string | `"Purva Bhadrapada"` |
| `nakshatra_index` | int | 0-26 |
| `nakshatra_category` | string | `Dhruva` \| `Chara` \| `Ugra` \| `Mishra` \| `Kshipra` \| `Mridu` \| `Tikshna` |
| `yoga` | string | `"Harshana"` |
| `yoga_index` | int | 0-26 |
| `yoga_nature` | string | `Auspicious` \| `Inauspicious` |
| `karana` | string | `"Bava"` |
| `karana_index` | int | 0-10 |
| `karana_nature` | string | `Auspicious` \| `Inauspicious` |

### 6.3 Score Breakdown

How the total score was computed across pipeline layers:

| Field | Type | Range | Layer | Description |
|-------|------|-------|-------|-------------|
| `panchang_shuddhi` | float | 0-25 | L2 | Tithi + Nakshatra + Vara + Yoga + Karana |
| `yoga_matrix` | float/int | 0 or value | L3 | Named yoga bonus/penalty |
| `mahadosha` | string | `"PASS"` \| `"FAIL"` | L4 | 21+ dosha gate check |
| `personalization` | float | 0-20 | L5 | Tara bala + Chandrabala + Dasha |
| `compatibility` | float | 0-15 | L6 | Marriage matching score |
| `lagna_shuddhi` | float | 0-15 | L7 | Ascendant quality |
| `time_window_penalties` | float | ≤ 0 | L8 | Rahu Kaal etc. penalties |
| `auspicious_bonus` | float | 0-10 | L9 | Abhijit, Amrit Kaal, etc. |
| `total` | float | 0-100 | L10 | Final composite score |

### 6.4 Time Quality Object

Indicates which time-system segment the muhurat falls in. Shape varies by tradition:

**North Indian** (Choghadiya):
```json
{
  "system": "CHOGHADIYA",
  "active_segment": "Shubh",
  "is_auspicious": true,
  "segment_index": 4,
  "all_day_segments": ["Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Char"]
}
```

**South Indian** (Gowri Panchangam):
```json
{
  "system": "GOWRI_PANCHANGAM",
  "active_segment": "Amirtham",
  "is_auspicious": true,
  "segment_index": 3,
  "all_day_segments": ["Dosham", "Udayam", "Aravam", "Amirtham", "Visham", "Sugam", "Rogam", "Labhham"]
}
```

**Universal** (Both side-by-side):
```json
{
  "system": "BOTH",
  "choghadiya": { "system": "CHOGHADIYA", "active_segment": "Char", "is_auspicious": false, ... },
  "gowri_panchangam": { "system": "GOWRI_PANCHANGAM", "active_segment": "Dosham", "is_auspicious": false, ... },
  "both_auspicious": false
}
```

### 6.5 Inauspicious Windows Object

Today's inauspicious time windows with tradition-specific annotations:

| Field | Type | Description |
|-------|------|-------------|
| `rahu_kaal` | string\|null | `"10:47:06 - 12:06:36"` |
| `yamaganda` | string\|null | `"14:45:36 - 16:05:06"` |
| `gulika_kaal` | string\|null | `"08:08:06 - 09:27:36"` |
| `varjyam` | string\|null | Time range or null |
| `durmuhurta` | string\|null | Can have multiple periods separated by `\|` |
| `mandatory_avoid` | array[string] | Windows that MUST be avoided per this tradition |
| `penalty_multipliers` | object | `{ "rahu_kaal": 1.5, ... }` — per-tradition severity |
| `rahu_kaal_note` | string | Tradition's stance on Rahu Kaal |

### 6.6 Compatibility Object

Present in muhurat responses for VIVAH/SAGAI events, and in `/compatibility` responses. Shape depends on tradition:

**North Indian** — Ashtakoot:
```json
{
  "tradition": "NORTH_INDIAN",
  "ashtakoot": {
    "system": "ASHTAKOOT",
    "koots": {
      "varna":       { "obtained": 1.0, "max": 1 },
      "vashya":      { "obtained": 2.0, "max": 2 },
      "tara":        { "obtained": 3.0, "max": 3 },
      "yoni":        { "obtained": 2.0, "max": 4 },
      "graha_maitri": { "obtained": 5.0, "max": 5 },
      "gana":        { "obtained": 0.0, "max": 6 },
      "bhakoot":     { "obtained": 7.0, "max": 7 },
      "nadi":        { "obtained": 8.0, "max": 8 }
    },
    "total": 27,
    "max": 36,
    "percentage": 75.0,
    "nadi_dosha": false,
    "nadi_dosha_cancelled": false
  },
  "manglik": { "person1": false, "person2": true, "cancelled": false },
  "nadi_dosha": false,
  "bhakoot_dosha": false,
  "verdict": "Ashtakoot: Excellent (27/36, 75.0%) | Manglik: Present — NOT cancelled (advisory)"
}
```

**South Indian (Tamil)** — Dasha Porutham:
```json
{
  "tradition": "SOUTH_INDIAN_TAMIL",
  "porutham": {
    "system": "DASHA_PORUTHAM",
    "total_passed": 9,
    "total_poruthams": 10,
    "mandatory_passed": false,
    "poruthams": {
      "dina":          { "pass": true,  "mandatory": false },
      "gana":          { "pass": true,  "mandatory": false },
      "mahendram":     { "pass": true,  "mandatory": false },
      "stree_deergham": { "pass": true,  "mandatory": false },
      "yoni":          { "pass": true,  "mandatory": false },
      "rashi":         { "pass": true,  "mandatory": false },
      "rasiyathipathi": { "pass": true,  "mandatory": false },
      "rajju":         { "pass": false, "mandatory": true },
      "vedhai":        { "pass": true,  "mandatory": true },
      "vasya":         { "pass": true,  "mandatory": false }
    }
  },
  "chevvai_dosham": { "person1": false, "person2": true, "cancelled": false, "note": "..." },
  "mandatory_passed": false,
  "mandatory_warning": "Mandatory porutham(s) failed: Rajju. Marriage not recommended per Kalaprakashika.",
  "verdict": "Porutham: BLOCKED — mandatory Rajju/Vedhai failed (9/10) | Chevvai Dosham: Present..."
}
```

### 6.7 Rejection Summary

Explains why days/candidates were filtered out:

```json
{
  "macro_period": {
    "Shukra Asta (Venus combustion)": 45
  },
  "day_level": {
    "Krishna Paksha (dark fortnight) — inauspicious for this ceremony": 15,
    "Inauspicious yoga combination": 2,
    "Major dosha active": 3,
    "Moon in Gandanta junction": 1,
    "Moon too close to Sun": 1
  }
}
```

> **UI Tip**: Show `macro_period` rejections as top-level banners ("45 days excluded due to Shukra Asta") and `day_level` as a collapsible detail.

### 6.8 Date Verdict (Evaluate Only)

Present when `/evaluate` returns 0 muhurats:

```json
{
  "is_suitable": false,
  "date_display": "Friday, 20th November 2026",
  "event": "Griha Pravesh",
  "summary": "Friday, 20th November 2026 is not suitable for Griha Pravesh. Reason: ...",
  "reasons": ["No suitable lagna (ascendant) windows found in the requested time range"],
  "recommendation": "Please try a different date. Use the /muhurat/find endpoint..."
}
```

---

## 7. Tradition-Specific Behavior

The same pipeline produces different response shapes per tradition. This section details what each tradition adds.

### 7.1 North Indian

| Aspect | Value |
|--------|-------|
| **Time System** | Choghadiya (7 segments, 8 per day) |
| **Matching System** | Ashtakoot Gun Milan (36 points) |
| **Manglik Term** | "Manglik" |
| **Primary Reference** | Muhurta Chintamani |
| **mandatory_avoid** | `["rahu_kaal", "durmuhurta"]` |
| **Penalty Multipliers** | All at 1.0x (base) |
| **Tradition Notes** | Choghadiya segment guidance; Nadi/Bhakoot Dosha advisories for marriage |

### 7.2 South Indian — Tamil

| Aspect | Value |
|--------|-------|
| **Time System** | Gowri Panchangam (8 segments) |
| **Matching System** | Dasha Porutham (10 factors, Rajju/Vedhai mandatory) |
| **Manglik Term** | "Chevvai Dosham" |
| **Primary Reference** | Kalaprakashika |
| **mandatory_avoid** | `["rahu_kaal", "varjyam"]` |
| **Penalty Multipliers** | rahu_kaal: 1.5x, varjyam: 1.5x, gulika_kaal: 1.5x, yamaganda: 1.3x |
| **Tradition Notes** | Gowri segment guidance; Moola Triad (Moolam/Ayilyam/Kettai) warnings; Gold standard nakshatras (Astham/Uthiram) for marriage |

### 7.3 South Indian — Kerala

| Aspect | Value |
|--------|-------|
| **Time System** | Gowri Panchangam |
| **Matching System** | Dasha Porutham |
| **Manglik Term** | "Chovva Dosham" (assessed from Moon, Lagna, AND Venus) |
| **Primary Reference** | Muhurta Padavi |
| **mandatory_avoid** | `["rahu_kaal", "varjyam", "gulika_kaal"]` — **3 items (strictest)** |
| **Penalty Multipliers** | rahu_kaal: **2.0x** (absolutely forbidden), varjyam: 1.5x, gulika_kaal: 1.5x, durmuhurta: 1.2x |
| **Tradition Notes** | Absolute Rahu Kaal prohibition; Thiruvonam (Shravana) as Kerala's most sacred nakshatra; Chovva Dosham triple-point analysis |

### 7.4 South Indian — Telugu

| Aspect | Value |
|--------|-------|
| **Time System** | Gowri Panchangam |
| **Matching System** | Dasha Porutham |
| **Manglik Term** | "Manglik" |
| **Primary Reference** | Muhurta Martanda |
| **mandatory_avoid** | `["rahu_kaal", "varjyam"]` |
| **Penalty Multipliers** | rahu_kaal: 1.5x, varjyam: 1.5x, gulika_kaal: 1.3x |
| **Tradition Notes** | Pushyami as supreme business nakshatra; Uttara Phalguni gold standard for marriage; Bharani strictly avoided; Yoga quality 1.1x emphasis |

### 7.5 South Indian — Kannada

| Aspect | Value |
|--------|-------|
| **Time System** | Gowri Panchangam |
| **Matching System** | Dasha Porutham |
| **Manglik Term** | "Manglik" |
| **Primary Reference** | Panchanga Siddhanti |
| **mandatory_avoid** | `["rahu_kaal", "varjyam"]` |
| **Penalty Multipliers** | rahu_kaal: 1.5x, varjyam: 1.5x, gulika_kaal: 1.3x |
| **Tradition Notes** | Panchang Shuddhi 1.1x emphasis; Yoga quality 1.2x emphasis (highest); Pushya as divine nakshatra; Naga Dosha (Moola/Ashlesha/Jyeshtha) warnings |

### 7.6 Universal

| Aspect | Value |
|--------|-------|
| **Time System** | Both (Choghadiya + Gowri side-by-side) |
| **Matching System** | Both (Ashtakoot + Porutham) |
| **Manglik Term** | "Manglik" |
| **Primary Reference** | Muhurta Chintamani + Kalaprakashika |
| **mandatory_avoid** | `["rahu_kaal", "varjyam", "gulika_kaal", "yamaganda"]` — **all 4** |
| **Penalty Multipliers** | Strictest from all traditions (rahu_kaal: 2.0x) |
| **Tradition Notes** | Agreement/disagreement between both time systems; Combined strictest rules note |
| **time_quality shape** | Nested `choghadiya` + `gowri_panchangam` + `both_auspicious` boolean |

### 7.7 Tradition Comparison Matrix

| Field | NORTH | TAMIL | KERALA | TELUGU | KANNADA | UNIVERSAL |
|-------|:-----:|:-----:|:------:|:------:|:-------:|:---------:|
| `time_quality.system` | CHOGHADIYA | GOWRI_PANCHANGAM | GOWRI_PANCHANGAM | GOWRI_PANCHANGAM | GOWRI_PANCHANGAM | BOTH |
| `compatibility.ashtakoot` | Yes | — | — | — | — | Yes |
| `compatibility.porutham` | — | Yes | Yes | Yes | Yes | Yes |
| `mandatory_avoid` count | 2 | 2 | **3** | 2 | 2 | **4** |
| `rahu_kaal` multiplier | 1.0 | 1.5 | **2.0** | 1.5 | 1.5 | **2.0** |
| Manglik terminology | Manglik | Chevvai Dosham | Chovva Dosham | Manglik | Manglik | Manglik |
| Panchang weight | 1.0 | 1.0 | 1.0 | 1.0 | **1.1** | 1.1 |
| Yoga emphasis | 1.0 | 1.0 | 1.0 | **1.1** | **1.2** | 1.2 |

---

## 8. Pipeline Architecture

### 8.1 Layer Overview

| Layer | Name | Type | Points | Purpose |
|:-----:|------|------|:------:|---------|
| **L0** | Macro Period | GATE | — | Rejects entire date ranges (Shukra Asta, Chaturmas, Eclipse Sutak, etc.) |
| **L1** | Day Disqualifiers | GATE | — | Rejects individual days (Combust Moon, Gandanta, Kshaya Tithi, Sankramana) |
| **L2** | Panchang Shuddhi | SCORE | 0-25 | Scores Tithi + Nakshatra + Vara + Yoga + Karana quality |
| **L3** | Yoga Matrix | GATE | — | Named yoga combinations (Amrit Siddhi → bonus, Dagdha → reject) |
| **L4** | Mahadosha | GATE | — | 21+ major dosha checks (Panchaka, Latta, Graha Yuddha, etc.) |
| **L5** | Personalization | SCORE | 0-20 | Person-specific: Tara bala, Chandrabala, Dasha alignment |
| **L6** | Compatibility | GATE+SCORE | 0-15 | Marriage matching (Ashtakoot/Porutham). Gate for VIVAH/SAGAI |
| **L7** | Lagna Shuddhi | SCORE | 0-15 | Evaluates ascending sign quality for the event |
| **L8** | Bad Windows | PENALTY | ≤ 0 | Deducts for Rahu Kaal, Yamaganda, Gulika, Varjyam, Durmuhurta overlap |
| **L9** | Good Windows | BONUS | 0-10 | Adds for Abhijit Muhurat, Amrit Kaal, best Hora, Choghadiya/Gowri |
| **L10** | Rank & Return | RANK | — | Aggregate score, assign grade, rank, return top N |

### 8.2 Gate vs Score Layers

- **Gate layers** (L0, L1, L3, L4, L6): Binary pass/fail. Failure → candidate is **rejected** and excluded from results.
- **Score layers** (L2, L5, L7, L9): Contribute points to the composite score. Higher = better muhurat.
- **Penalty layers** (L8): Deduct points for overlapping inauspicious windows.

### 8.3 Scoring System

The final score (0-100) is computed as:

```
total = panchang_shuddhi  (0-25)
      + personalization    (0-20)
      + lagna_shuddhi      (0-15)
      + compatibility      (0-15)
      + auspicious_bonus   (0-10)
      + time_window_penalties (≤ 0)
      + yoga_matrix_bonus  (varies)
```

Score is clamped to 0-100.

### 8.4 Grade Thresholds

| Grade | Score Range | Meaning |
|-------|:-----------:|---------|
| **Sarvottama** | 82-100 | Supreme — best possible muhurat |
| **Uttama** | 68-81 | Excellent — highly recommended |
| **Madhyama** | 55-67 | Good — recommended |
| **Samanya** | 42-54 | Average — acceptable |
| **Adhama** | 25-41 | Below average — proceed with caution |
| **Tyajya** | 0-24 | Avoidable — not recommended |

> **UI Recommendation**: Use green for Sarvottama/Uttama, yellow for Madhyama/Samanya, red for Adhama/Tyajya.

---

## 9. Marriage Compatibility

Marriage compatibility is computed automatically for VIVAH and SAGAI events (via Layer 6) and can also be checked standalone via `/muhurat/compatibility`.

### 9.1 Ashtakoot Gun Milan (North Indian)

The 36-point system from Muhurta Chintamani. Eight koots (factors) are evaluated:

| Koot | Max Points | Significance |
|------|:---------:|-------------|
| Varna | 1 | Spiritual compatibility (ego levels) |
| Vashya | 2 | Mutual attraction and influence |
| Tara | 3 | Birth star compatibility and destiny |
| Yoni | 4 | Physical and sexual compatibility |
| Graha Maitri | 5 | Mental and psychological compatibility |
| Gana | 6 | Temperament (Deva/Manushya/Rakshasa) |
| Bhakoot | 7 | Love, prosperity, family welfare |
| Nadi | 8 | Health, genetics, progeny |

**Thresholds**: Excellent ≥ 25, Good ≥ 18, Average ≥ 12, Below < 12.

**Critical Doshas**: Nadi Dosha (same nadi = health risk) and Bhakoot Dosha (adverse sign combination) are flagged separately.

### 9.2 Dasha Porutham (South Indian)

The 10-factor system from Kalaprakashika. All South Indian traditions use this:

| Porutham | Mandatory? | What It Checks |
|----------|:----------:|----------------|
| Dina | No | Day star harmony |
| Gana | No | Temperament match (Deva/Manushya/Rakshasa) |
| Mahendram | No | Prosperity and progeny |
| Stree Deergham | No | Wife's longevity |
| Yoni | No | Physical compatibility |
| Rashi | No | Moon sign harmony |
| Rasiyathipathi | No | Sign lord friendship |
| **Rajju** | **Yes** | Longevity of husband — **must pass** |
| **Vedhai** | **Yes** | Enmity check — **must pass** |
| Vasya | No | Mutual attraction |

> **Critical**: If either Rajju or Vedhai fails, the match is **BLOCKED** regardless of how many other poruthams pass. The verdict will say "Marriage not recommended per [tradition reference]."

### 9.3 Manglik / Chevvai / Chovva Dosham

Mars Dosha (Mangal Dosha) is checked for both persons. Terminology varies by tradition:

| Tradition | Term | Special Notes |
|-----------|------|---------------|
| North Indian | Manglik | Standard check (Mars in 1,2,4,7,8,12) |
| Tamil | Chevvai Dosham | Same logic, Tamil terminology |
| Kerala | Chovva Dosham | **Triple-point analysis**: assessed from Moon, Lagna, AND Venus |
| Telugu / Kannada | Manglik | Standard terminology |

**Cancellation**: Dosha is cancelled if both persons are Manglik, or Mars is in own/exaltation sign, or Mars conjoins Jupiter.

---

## 10. Time Quality Systems

### 10.1 Choghadiya (North Indian)

Divides the daytime (sunrise to sunset) into **8 equal segments**, each ruled by a planet. The sequence rotates by weekday.

**Segments** (7 types, repeating to fill 8 slots):

| Segment | Quality | Planet | Meaning |
|---------|---------|--------|---------|
| **Amrit** | BEST | Moon | Nectar — most auspicious |
| **Shubh** | GOOD | Jupiter | Auspicious — general good |
| **Labh** | GOOD | Mercury | Profit — good for business |
| **Char** | NEUTRAL | Venus | Moveable — acceptable |
| **Kaal** | BAD | Saturn | Death — avoid |
| **Rog** | BAD | Mars | Disease — avoid |
| **Udveg** | BAD | Sun | Anxiety — avoid |

### 10.2 Gowri Panchangam (South Indian)

Divides the daytime into **8 segments** following the Gowri sequence. Used by all South Indian traditions.

**Segments** (8 types):

| Segment | Quality | Meaning |
|---------|---------|---------|
| **Amirtham** | BEST | Nectar — most auspicious |
| **Udayam** | GOOD | Rising — auspicious |
| **Labhham** | GOOD | Profit — auspicious |
| **Sugam** | GOOD | Ease — auspicious |
| **Aravam** | BAD | Noise — inauspicious |
| **Visham** | BAD | Poison — inauspicious |
| **Rogam** | BAD | Disease — inauspicious |
| **Dosham** | BAD | Fault — inauspicious |

---

## 11. Error Handling

All errors follow a consistent format:

```json
{
  "status": "error",
  "request_id": "c1d99cf2-106b-42f9-946d-875a7ebc30a9",
  "error": {
    "code": "VALIDATION_ERROR",
    "error_code": 1000,
    "message": "Invalid input data provided",
    "suggestion": "Check the field requirements and try again",
    "details": [
      {
        "field": "event_type",
        "error": "Value error, Invalid event type 'INVALID_EVENT'. Valid: ANNAPRASHAN, ...",
        "input": "INVALID_EVENT",
        "type": "value_error"
      }
    ]
  }
}
```

**Error Codes**:

| Code | error_code | Meaning |
|------|:----------:|---------|
| `VALIDATION_ERROR` | 1000 | Invalid request data. Check `details` array |
| `COMPUTATION_ERROR` | 2000 | Birth chart computation failed |
| `UNEXPECTED_ERROR` | 5000 | Server error (rare). Retry after 5s |

**Common Validation Errors**:
- Missing `person1`/`person2` for `/compatibility` (uses separate fields, not `persons` array)
- Missing `persons` for VIVAH/SAGAI events
- Invalid `event_type` (check `/muhurat/event-types` for valid codes)
- Invalid `tradition` code
- `from_date` after `to_date`
- Date range exceeding 365 days

---

## 12. Caching Behavior

| Endpoint | Cache TTL | Cache Key Includes |
|----------|:---------:|-------------------|
| `/muhurat/find` | 1 hour | All request parameters |
| `/muhurat/evaluate` | 1 hour | All request parameters |
| `/muhurat/compatibility` | 24 hours | tradition + person1 + person2 |
| `/muhurat/interpret` | 1 hour | muhurat_data hash + language |
| `/muhurat/event-types` | Static | — |
| `/muhurat/traditions` | Static | — |
| `/muhurat/panchang` | 1 hour | date + time + lat/lon + timezone |
| `/muhurat/inauspicious-windows` | 1 hour | date + lat/lon + timezone + tradition |
| `/muhurat/time-quality` | 30 min | date + time + lat/lon + timezone + tradition |

> **Note**: Caching is server-side. Identical requests within the TTL return instantly. If you need fresh results (e.g., after a code update), wait for the cache to expire.

---

## 13. Integration Patterns

### 13.1 Mobile App (AstroCorp / Grahasth)

**Recommended flow for Muhurat Finder screen**:

```
1. GET /muhurat/event-types → Populate event picker dropdown
2. GET /muhurat/traditions → Populate tradition selector (cache forever)
3. User selects event, tradition, dates, enters birth details
4. POST /muhurat/find → Show ranked results
5. User taps a muhurat → Show detail view with:
   - score, grade (color-coded)
   - time_quality.is_auspicious (prominent yes/no badge)
   - time_quality.active_segment (segment name)
   - tradition_notes (advisories list)
   - warnings (highlight in yellow/red)
   - score_breakdown (expandable section)
   - classical_references (footer)
5. Optional: POST /muhurat/interpret → Show AI explanation
```

**UI Mappings**:

| API Field | UI Element |
|-----------|-----------|
| `grade` | Color-coded badge (Sarvottama=gold, Uttama=green, etc.) |
| `time_display` | Primary time display |
| `time_quality.is_auspicious` | Large checkmark or cross icon |
| `time_quality.active_segment` | Segment name with tradition-appropriate color |
| `tradition_notes` | Info cards below the muhurat |
| `warnings` | Yellow/red alert banners |
| `inauspicious_windows_today.mandatory_avoid` | "Avoid these windows" section |
| `score_breakdown` | Expandable radar/bar chart |

**Recommended flow for Home Screen widgets**:

```
1. POST /muhurat/panchang → "Today's Panchang" card
   - Show: Tithi, Nakshatra, Yoga, Vara
   - Color-code by yoga_nature (AUSPICIOUS=green, INAUSPICIOUS=red)

2. POST /muhurat/inauspicious-windows → "Rahu Kaal Today" card
   - Highlight rahu_kaal start/end prominently
   - Show abhijit_muhurat as "Best Time Today"
   - Use tradition_annotations.mandatory_avoid to mark critical periods

3. POST /muhurat/time-quality → "Right Now" indicator
   - Show is_auspicious as green checkmark / red cross
   - Display active_segment name
   - Refresh every 30 minutes
```

### 13.2 Pro Astrologer SaaS (Grahvani)

**Power-user features to expose**:

- Allow tradition selection per client profile (store as preference)
- Show full `score_breakdown` in a radar chart
- Display `rejection_summary` — astrologers want to know WHY days were eliminated
- Show `classical_references` prominently — credibility matters to professionals
- Use `/muhurat/evaluate` for "Is this date good?" workflow
- Use `/muhurat/compatibility` standalone for matching consultations
- Show all 8 Choghadiya or 8 Gowri segments with the active one highlighted
- Display `panchang` details in full (tithi, nakshatra, yoga, karana with indices)
- Show `reasoning` array as a step-by-step pipeline explanation

**Daily Dashboard (using utility endpoints)**:

```
1. POST /muhurat/panchang → Full daily panchang panel
2. POST /muhurat/inauspicious-windows → Timeline overlay
   showing Rahu Kaal, Yamaganda, Gulika on a 24-hour bar
3. POST /muhurat/time-quality → Live "current segment" indicator
4. GET /muhurat/traditions → Client tradition preferences
```

### 13.3 AI Chat (Astro Ratan)

**For conversational muhurat queries**:

```
User: "When is a good time for my housewarming next month?"
    ↓
1. POST /muhurat/find with GRIHA_PRAVESH, next month's date range
2. POST /muhurat/interpret with the results + preferred_language
3. Present interpretation text naturally in chat
4. If user asks about specific date: POST /muhurat/evaluate
5. If user asks about marriage: POST /muhurat/compatibility first
```

**Response fields most useful for chat**:
- `tradition_display` — "Your results are based on the North Indian (Muhurta Chintamani) tradition."
- `date_display` + `time_display` — Natural language dates/times
- `grade` + `tradition_notes` — Concise summary
- `date_verdict.summary` — Ready-made explanation for unsuitable dates

---

## 14. Enums & Constants Reference

### Event Types
```
VIVAH | SAGAI | GRIHA_PRAVESH | BHOOMI_PUJAN | VYAPAAR | VAHAN |
UPANAYANA | NAAMKARAN | ANNAPRASHAN | VIDYAARAMBH | SURGERY | YATRA | PROPERTY
```

### Traditions
```
NORTH_INDIAN | SOUTH_INDIAN_TAMIL | SOUTH_INDIAN_KERALA |
SOUTH_INDIAN_TELUGU | SOUTH_INDIAN_KANNADA | UNIVERSAL
```

### Grades (high to low)
```
Sarvottama (82-100) | Uttama (68-81) | Madhyama (55-67) |
Samanya (42-54) | Adhama (25-41) | Tyajya (0-24)
```

### Choghadiya Segments
```
Auspicious: Amrit, Shubh, Labh
Neutral:    Char
Inauspicious: Kaal, Rog, Udveg
```

### Gowri Segments
```
Auspicious:   Udayam, Amirtham, Labhham, Sugam
Inauspicious: Aravam, Visham, Rogam, Dosham
```

### Tithi Groups
```
Nanda (1,6,11) | Bhadra (2,7,12) | Jaya (3,8,13) | Rikta (4,9,14) | Purna (5,10,15)
```

### Nakshatra Categories
```
Dhruva (Fixed) | Chara (Movable) | Ugra (Fierce) | Mishra (Mixed) |
Kshipra (Swift) | Mridu (Soft) | Tikshna (Sharp)
```

### Paksha
```
Shukla (bright fortnight) | Krishna (dark fortnight)
```

### Macro Period Blocks
```
CHATURMAS | ADHIK_MAAS | KHARMAS | PITRU_PAKSHA | HOLASHTAK |
GURU_ASTA | SHUKRA_ASTA | ECLIPSE_SUTAK
```

### Inauspicious Windows
```
RAHU_KAAL | YAMAGANDA | GULIKA_KAAL | VARJYAM | DURMUHURTA
```

### Auspicious Windows
```
ABHIJIT | AMRIT_KAAL | BEST_CHOGHADIYA | BEST_GOWRI | BEST_HORA
```

### Ashtakoot Koots (8)
```
Varna (/1) | Vashya (/2) | Tara (/3) | Yoni (/4) |
Graha Maitri (/5) | Gana (/6) | Bhakoot (/7) | Nadi (/8)
Total: /36
```

### Dasha Porutham (10)
```
Dina | Gana | Mahendram | Stree Deergham | Yoni |
Rashi | Rasiyathipathi | Rajju* | Vedhai* | Vasya
(* = mandatory)
```

---

## 15. FAQ

**Q: How long does a `/find` call take?**
A: Typically 0.7-3 seconds for a 2-month range. Longer date ranges (6-12 months) may take up to 30 seconds. VYAPAAR/PROPERTY tend to take longer (~2.5s) due to more candidate windows.

**Q: Why does VIVAH return 0 muhurats for some date ranges?**
A: VIVAH has the strictest filters. Common macro-period blocks include Shukra Asta (Venus combustion, ~40 days), Chaturmas (4 months), and Pitru Paksha (15 days). Use the `rejection_summary.macro_period` to see what blocked. Try a wider date range.

**Q: What's the difference between `/find` and `/evaluate`?**
A: `/find` scans a date range and returns the best muhurat windows. `/evaluate` checks a specific date (optionally a specific time) and tells you if it's suitable. Use `/find` for discovery, `/evaluate` for validation.

**Q: Can I use the same `persons` format for `/compatibility`?**
A: No. `/compatibility` uses `person1` and `person2` as separate top-level fields, not a `persons` array. This is different from `/find` and `/evaluate`.

**Q: What does `both_auspicious` mean in Universal mode?**
A: It's `true` only when BOTH Choghadiya AND Gowri segments are auspicious for the muhurat window. If they disagree (one auspicious, one not), the `tradition_notes` will explain.

**Q: How is the `muhurat_score` in `/compatibility` different from the main `score`?**
A: The `muhurat_score` (0-15) is the Layer 6 compatibility contribution that gets added to the overall muhurat score. The main `score` (0-100) is the total across all 10 layers.

**Q: Do I need to pass `persons` for non-marriage events?**
A: Yes, pass 1 person. The engine uses birth data for Layer 5 (Tara bala, Chandrabala, Dasha alignment). Without it, personalization score will be 0.

**Q: What timezone should I use for NRI users?**
A: Use the **event location's timezone** for the top-level `timezone` field. Use the **birth place's timezone** in each `PersonInput`. The engine handles the conversion.

**Q: How do tradition overrides affect scoring?**
A: The engine applies 47 tradition-specific overrides that modify nakshatra scores, forbidden/allowed lists, lagna preferences, and panchang weights per event type. For example, Tamil tradition penalizes Moola Triad nakshatras (-3 for Moolam) for VIVAH while Telugu tradition penalizes Bharani instead.

---

*This guide is maintained by the AstroCorp Engine Team. For bugs or feature requests, contact the Astro Engine maintainers.*
