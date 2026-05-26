-- Fix lesson slugs to match curriculum front-matter (authoritative source).
-- Run this against the learning-service PostgreSQL database.
--
-- Background: the seeder previously used filename as ground truth for slugs,
-- but the curriculum standard is front-matter `slug:`. These 4 lessons had
-- filename ≠ front-matter mismatches in Module 1.

BEGIN;

-- 1.3.1 — The Three Skandhas Overview
UPDATE "Lesson"
SET slug = 'three-skandhas-overview'
WHERE slug = 'the-three-skandhas-overview';

-- 1.2.4 — Medieval Codifiers (Kalyāṇavarmā, Mantreśvara)
UPDATE "Lesson"
SET slug = 'medieval-codifiers-kalyanavarma-mantresvara'
WHERE slug = 'kalyanavarma-mantresvara-and-the-medieval-codification';

-- 1.2.6 — Modern Founders (Krishnamurti & Joshi)
UPDATE "Lesson"
SET slug = 'modern-founders-krishnamurti-and-joshi'
WHERE slug = 'the-modern-founders-krishnamurti-and-joshi';

-- 1.3.2 — The Seven Sub-Branches
UPDATE "Lesson"
SET slug = 'seven-sub-branches'
WHERE slug = 'the-seven-sub-branches';

COMMIT;
