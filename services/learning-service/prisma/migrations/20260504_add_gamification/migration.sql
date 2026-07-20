-- Grahvani Learning Module Gamification Tables
-- Migration: Add gamification schema to learning-service
-- Date: 2026-05-04

BEGIN;

-- User learning profile (extends existing user concept)
CREATE TABLE IF NOT EXISTS user_learning_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  skill_score INTEGER DEFAULT 0 CHECK (skill_score BETWEEN 0 AND 1000),
  current_tier INTEGER DEFAULT 1 CHECK (current_tier BETWEEN 1 AND 6),
  current_level VARCHAR(20) DEFAULT 'LEVEL_1',
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  total_points INTEGER DEFAULT 0,
  total_questions_answered INTEGER DEFAULT 0,
  total_correct_answers INTEGER DEFAULT 0,
  total_lessons_completed INTEGER DEFAULT 0,
  total_modules_completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Lesson progress tracking
CREATE TABLE IF NOT EXISTS lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lesson_id VARCHAR(20) NOT NULL,
  module_id VARCHAR(10) NOT NULL,
  status VARCHAR(20) DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
  score INTEGER DEFAULT 0,
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  questions_correct_first_try INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  last_attempted_at TIMESTAMP,
  UNIQUE(user_id, lesson_id)
);

-- Module completion tracking
CREATE TABLE IF NOT EXISTS module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_id VARCHAR(10) NOT NULL,
  status VARCHAR(20) DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  average_lesson_score INTEGER DEFAULT 0,
  final_assessment_score INTEGER DEFAULT 0,
  prerequisite_module_id VARCHAR(10),
  prerequisite_met BOOLEAN DEFAULT false,
  points_earned INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(user_id, module_id)
);

-- Quiz attempt history
CREATE TABLE IF NOT EXISTS quiz_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lesson_id VARCHAR(20) NOT NULL,
  module_id VARCHAR(10) NOT NULL,
  score INTEGER DEFAULT 0,
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER DEFAULT 0,
  answers_json JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  time_spent_seconds INTEGER,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Points transaction log
CREATE TABLE IF NOT EXISTS points_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type VARCHAR(40) NOT NULL CHECK (transaction_type IN (
    'correct_answer', 'first_try_bonus', 'speed_bonus', 'streak_bonus',
    'lesson_completion', 'lesson_mastery', 'module_completion', 'perfect_module',
    'daily_login', 'daily_panchanga', 'badge_earned', 'peer_help',
    'capstone_challenge', 'interpretation_drill'
  )),
  reference_id UUID,
  reference_type VARCHAR(40),
  balance_after INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Badge definitions
CREATE TABLE IF NOT EXISTS badge_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url VARCHAR(255),
  rarity VARCHAR(20) CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  unlock_conditions JSONB NOT NULL DEFAULT '{}',
  points_reward INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User earned badges
CREATE TABLE IF NOT EXISTS user_badge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  badge_id UUID NOT NULL,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, badge_id)
);

-- Daily activity tracking
CREATE TABLE IF NOT EXISTS daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  activity_date DATE NOT NULL,
  had_login BOOLEAN DEFAULT false,
  had_lesson_activity BOOLEAN DEFAULT false,
  had_panchanga_check BOOLEAN DEFAULT false,
  had_peer_interaction BOOLEAN DEFAULT false,
  points_earned_today INTEGER DEFAULT 0,
  UNIQUE(user_id, activity_date)
);

-- Leaderboard snapshots
CREATE TABLE IF NOT EXISTS leaderboard_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('all_time', 'weekly', 'monthly')),
  period_start DATE,
  period_end DATE,
  user_id UUID NOT NULL,
  rank_position INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period_type, period_start, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_user ON quiz_attempt(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transaction_user ON points_transaction(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transaction_type ON points_transaction(transaction_type);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON daily_activity(user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_period ON leaderboard_snapshot(period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_user_badge_user ON user_badge(user_id);
CREATE INDEX IF NOT EXISTS idx_module_progress_user ON module_progress(user_id);

-- Insert badge definitions
INSERT INTO badge_definition (badge_code, name, description, rarity, unlock_conditions, points_reward) VALUES
('first_light', 'First Light', 'Complete your first lesson', 'common', '{"type": "lesson_complete", "count": 1}', 50),
('streak_starter', 'Streak Starter', 'Answer 5 questions correctly in a row', 'common', '{"type": "streak", "length": 5}', 25),
('lightning', 'Lightning', 'Answer 10 questions correctly in a row', 'uncommon', '{"type": "streak", "length": 10}', 100),
('perfect_aim', 'Perfect Aim', 'Score 100% on any lesson quiz', 'uncommon', '{"type": "perfect_lesson", "count": 1}', 75),
('concept_master', 'Concept Master', 'Score 100% on 5 different lessons', 'rare', '{"type": "perfect_lesson", "count": 5}', 250),
('module_conqueror', 'Module Conqueror', 'Complete any module with 90%+ average', 'rare', '{"type": "module_score", "minScore": 90, "count": 1}', 300),
('trinity_expert', 'Trinity Expert', 'Master all 3 pillars: Bhava, Bhavesha, Karaka analysis', 'epic', '{"type": "lesson_group_complete", "group": "trinity", "minScore": 85}', 500),
('time_weaver', 'Time Weaver', 'Complete Module 4 (Timing) with 95%+ average', 'epic', '{"type": "module_score", "moduleId": "M4", "minScore": 95}', 500),
('gem_sage', 'Gem Sage', 'Complete Module 9 (Remedies) with 100%', 'legendary', '{"type": "module_score", "moduleId": "M9", "minScore": 100}', 1000),
('jyotish_acharya', 'Jyotish Acharya', 'Complete all 10 modules with 90%+ average', 'legendary', '{"type": "all_modules", "minScore": 90}', 5000),
('nakshatra_navigator', 'Nakshatra Navigator', 'Identify all 27 Nakshatra lords correctly across quizzes', 'rare', '{"type": "concept_mastery", "concept": "nakshatra", "accuracy": 100}', 300),
('dasha_decoder', 'Dasha Decoder', 'Correctly calculate 5 Dasha sequence questions', 'epic', '{"type": "concept_mastery", "concept": "dasha", "count": 5}', 400),
('chart_builder_pro', 'Chart Builder Pro', 'Complete 10 Chart Builder exercises with 100%', 'rare', '{"type": "exercise_complete", "exerciseType": "chart_builder", "count": 10}', 350),
('interpretation_scholar', 'Interpretation Scholar', 'Score 80%+ on 5 Interpretation Drills', 'epic', '{"type": "exercise_complete", "exerciseType": "interpretation_drill", "count": 5, "minScore": 80}', 600),
('peer_mentor', 'Peer Mentor', 'Provide feedback on 10 peer interpretations', 'rare', '{"type": "peer_help", "count": 10}', 250)
ON CONFLICT (badge_code) DO NOTHING;

COMMIT;
