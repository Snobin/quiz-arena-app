import i18n from 'i18next';

/**
 * The `admin` i18n namespace: English only (the admin UI has no Malayalam copy at MVP). It is part of the admin
 * chunk, so it loads with the console and never ships to players. Question content keeps its own `lang`.
 */
export const adminStrings = {
  'brand.admin': 'Minnal Admin',
  'title.page': '{{page}} · Admin · Minnal',
  'nav.label': 'Admin sections',
  'nav.questions': 'Questions',
  'nav.upload': 'Upload',
  'nav.drafts': 'Drafts',
  'nav.reports': 'Reports',
  'bar.signOut': 'Sign out',
  'bar.signedInAs': 'Signed in as {{name}}',
  'bar.adminFallback': 'Admin',
  'placeholder.upload': 'Upload is not available yet.',
  'placeholder.drafts': 'Drafts is not available yet.',
  'placeholder.reports': 'Reports is not available yet.',
  'questions.title': 'Questions',
  'questions.caption': 'Question bank',
  'questions.filters': 'Filters',
  'filter.status': 'Status',
  'filter.category': 'Category',
  'filter.subject': 'Subject',
  'filter.topic': 'Topic',
  'filter.level': 'Exam level',
  'filter.difficulty': 'Difficulty',
  'filter.search': 'Search question text',
  'filter.any': 'Any',
  'filter.clear': 'Clear filters',
  'state.PUBLISHED': 'Published',
  'state.DRAFT': 'Draft',
  'state.DISCARDED': 'Discarded',
  'state.DELETED': 'Deleted',
  'category.KERALA_PSC': 'Kerala PSC',
  'category.SCHOOL_QUIZ': 'School quiz',
  'category.GENERAL_KERALA': 'General Kerala',
  'level.TENTH': '10th',
  'level.DEGREE': 'Degree',
  'level.OTHER': 'Other',
  'difficulty.EASY': 'Easy',
  'difficulty.MEDIUM': 'Medium',
  'difficulty.HARD': 'Hard',
  'col.no': 'No.',
  'col.question': 'Question',
  'col.subjectTopic': 'Subject · Topic',
  'col.level': 'Level',
  'col.difficulty': 'Difficulty',
  'col.state': 'State',
  'col.updated': 'Updated',
  'row.number': 'Q {{no}}',
  'row.expand': 'Show details for Q {{no}}',
  'row.collapse': 'Hide details for Q {{no}}',
  'row.draftPending': 'Draft v{{version}} pending',
  'row.version': 'Version {{version}}',
  'detail.malayalam': 'Malayalam',
  'detail.english': 'English',
  'detail.options': 'Options',
  'detail.correct': 'correct answer',
  'detail.explanation': 'Explanation',
  'detail.missing': 'Not provided',
  'page.range': '{{from}}–{{to}} of {{total}}',
  'page.nav': 'Pages',
  'page.previous': 'Previous',
  'page.next': 'Next',
  'count_one': '{{count}} question',
  'count_other': '{{count}} questions',
  'empty.bank': 'No questions yet.',
  'empty.upload': 'Upload questions',
  'empty.filtered': 'No questions match these filters.',
  'error.load': 'Could not load questions.',
  'error.unknown': 'Something went wrong. Try again.',
  'error.retry': 'Retry',
} as const;

export type AdminKey = Exclude<keyof typeof adminStrings, 'count_one' | 'count_other'> | 'count';

export const ADMIN_NS = 'admin';

let registered = false;

/** Adds the namespace once. */
export function registerAdminStrings(): void {
  if (registered && i18n.hasResourceBundle('en', ADMIN_NS)) return;
  i18n.addResourceBundle('en', ADMIN_NS, adminStrings, true, true);
  registered = true;
}

/** The admin translator: always English, whatever the player language is. */
export function adminT(key: AdminKey, options?: Record<string, unknown>): string {
  registerAdminStrings();
  // The app's typed resources only know the player catalogue, so the admin namespace is reached untyped.
  const fixed = i18n.getFixedT as unknown as (lng: string, ns: string) => (key: string, options?: object) => string;
  return fixed('en', ADMIN_NS)(key, options);
}
