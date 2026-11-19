import type { MessageKey } from '../i18n/index.ts';

/** Kerala's 14 districts plus "Outside Kerala", as the stable codes core stores. Names are catalogue copy. */
export const DISTRICT_CODES = [
  'thiruvananthapuram',
  'kollam',
  'pathanamthitta',
  'alappuzha',
  'kottayam',
  'idukki',
  'ernakulam',
  'thrissur',
  'palakkad',
  'malappuram',
  'kozhikode',
  'wayanad',
  'kannur',
  'kasaragod',
  'outside-kerala',
] as const;
export type DistrictCode = (typeof DISTRICT_CODES)[number];

export const districtKey = (code: DistrictCode): MessageKey => `district.${code}` as MessageKey;

export const EXAM_LEVELS = ['TENTH', 'DEGREE', 'OTHER'] as const;
export type ExamLevel = (typeof EXAM_LEVELS)[number];
export const examLevelKey = (level: ExamLevel): MessageKey => `profile.level.${level}` as MessageKey;
