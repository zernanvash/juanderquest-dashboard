export interface Submission {
  id: string;
  user_name: string;
  quest_title: string;
  scanned_marker_code: string;
  captured_lat: number;
  captured_lng: number;
  target_lat: number;
  target_lng: number;
  distance_meters: number;
  quest_radius_meters: number;
  captured_accuracy?: number;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  is_test?: boolean;
}

export interface Quest {
  id: string;
  title: string;
  category: string;
  location_name: string;
  reward_points: number;
  marker_code?: string;
  radius_meters: number;
  status?: string;
  steps?: unknown[];
  created_at?: string;
  base_reward_php?: number;
  is_active?: boolean;
}

export interface SpotReport {
  id: string;
  spot_id: string;
  user_id?: string;
  reporter_name?: string;
  reason:
    | 'inaccurate_location'
    | 'site_closed_or_hazard'
    | 'misleading_photo'
    | 'spam_or_scam'
    | 'environmental_concern'
    | 'other';
  details?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  created_at: string;
}

export interface Spot {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  municipality: string;
  source_type?: string;
  source_name: string;
  trust_level: string;
  status: string;
  image_url?: string;
  crowd_capacity_band?: 'low' | 'medium' | 'high';
  crowd_status?: string;
  recommendation_suppressed?: boolean;
}

export interface Voucher {
  id: string;
  merchant_name: string;
  title: string;
  cost_points: number;
  description: string;
}

export type CulturalQuizStatus = 'draft' | 'published' | 'paused' | 'archived';
export type CulturalQuizLanguage = 'en' | 'fil' | 'ilo' | 'pag';

export interface AdminQuiz {
  id: string;
  destination_id: string;
  status: CulturalQuizStatus;
  current_version: number;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminQuizVersion {
  id: string;
  quiz_id: string;
  version: number;
  title: string;
  description: string;
  language: CulturalQuizLanguage;
  radius_meters: number;
  xp_reward: number;
  time_limit_minutes: number;
  cooldown_hours: number;
  published_at?: string | null;
  created_at: string;
}

export interface AdminQuizListItem {
  quiz: AdminQuiz;
  version: AdminQuizVersion;
  destination_name: string;
}

export interface AdminQuizOption {
  id: string;
  ordinal: number;
  option_text: string;
  is_correct?: boolean;
}

export interface AdminQuizQuestion {
  id: string;
  ordinal: number;
  question_text: string;
  explanation: string;
  source_url?: string | null;
  options: AdminQuizOption[];
}

export interface AdminQuizDetail {
  quiz: AdminQuiz;
  version: AdminQuizVersion;
  destination: { id: string; name: string; municipality: string; gps_lat: number; gps_lng: number };
  questions: AdminQuizQuestion[];
}

export interface AdminMerchantListItem {
  id: string;
  name: string;
  category?: string | null;
  municipality?: string | null;
  location?: string | null;
  status: string;
  is_published: boolean;
  source_application_id?: string | null;
  owner_display_name?: string | null;
  membership_count: number;
  active_product_count: number;
  archived_product_count: number;
  created_at: string;
}

export interface AdminMerchantMembership {
  id: string;
  role: 'owner' | 'staff';
  status: string;
  created_at: string;
  member_display_name?: string | null;
}

export interface AdminMerchantProduct {
  id: string;
  name: string;
  description: string;
  price?: number | null;
  currency: string;
  image_url?: string | null;
  is_published: boolean;
  is_archived: boolean;
  display_order: number;
}

export interface AdminMerchantDetail {
  merchant: {
    id: string;
    name: string;
    description: string;
    location: string;
    municipality?: string | null;
    category?: string | null;
    status?: string;
    is_published?: boolean;
    contact_email?: string | null;
    contact_phone?: string | null;
    logo_url?: string | null;
    banner_url?: string | null;
    source_application_id?: string | null;
    created_at: string;
  };
  memberships: AdminMerchantMembership[];
  products: AdminMerchantProduct[];
  application: {
    id: string;
    status: string;
    business_name: string;
    category: string;
    municipality: string;
    business_province?: string | null;
    created_at: string;
    reviewed_at?: string | null;
  } | null;
}

export type SettingValue = string | number | boolean;

export interface SettingDefinition {
  key: string;
  label: string;
  category: 'branding_support' | 'quiz_defaults';
  type: 'email' | 'url' | 'text' | 'integer' | 'boolean' | 'string';
  defaultValue: SettingValue;
  min?: number;
  max?: number;
  maxLength?: number;
  allowedValues?: string[];
  restartRequired: boolean;
  description: string;
}

export interface SettingsSnapshot {
  revision: number;
  updated_by: string | null;
  updated_at: string | null;
  values: Record<string, SettingValue>;
  definitions: SettingDefinition[];
}

export interface SettingsAuditEntry {
  id: string;
  actor_id: string | null;
  changed_keys: string[];
  before_values: Record<string, SettingValue>;
  after_values: Record<string, SettingValue>;
  reason: string | null;
  request_id: string | null;
  revision: number;
  created_at: string;
}

export interface SystemStatus {
  observed_at: string;
  read_only: boolean;
  service: {
    status: string;
    ready: boolean;
    degraded: boolean;
    dependencies: Record<string, { status: string; required: boolean; latency_ms: number; message?: string }>;
    checked_at: string;
  };
  release: {
    version_name: string;
    version_code: number;
    commit_hash: string;
    published_at: string;
    update_policy: string;
    force_update: boolean;
    min_supported_version_code: number;
    channel: string;
  };
  runtime: {
    node_env: string;
    wallet_auth_mode: string;
    spot_photo_storage: string;
    migration_ledger: { applied: number | null; total: number; up_to_date: boolean | null };
  };
  feature_flags: Record<string, boolean>;
  deployment_note: string;
}
