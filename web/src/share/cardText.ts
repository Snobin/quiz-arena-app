import i18n from 'i18next';
import { publicOrigin } from '../config/publicOrigin.ts';
import { formatNumber } from '../i18n/format.ts';
import { uiLanguage } from '../i18n/index.ts';
import type { Language } from '../i18n/language.ts';
import type { MatchEndedPayload, ResultParticipant } from '../realtime/protocol.ts';
import { withBase } from '../shell/router.ts';
import './shareCatalogue.ts';

/** What the card and the share sheet say about one finished match, all from the stored `MATCH_ENDED`. */
export type CardText = {
  language: Language;
  /** The result line, white on the card. */
  resultLine: string;
  /** Her score, volt on the card, with Latin digits and grouping. */
  selfScore: string;
  /** The opponent's score in a 1v1 (muted), else null. */
  rivalScore: string | null;
  /** "Quick Match", "Topic Duel · <topic>", "Battle Room · <topic>", or "Battle Room" alone for a custom topic. */
  modeLine: string;
  cta: string;
  /** The link as shown on the card: no scheme. */
  linkLabel: string;
  /** The link as shared: `<origin>/q`, no query, id or tracking. */
  url: string;
  /** The text sent with the image. */
  shareText: string;
};

/** The share link: the public origin plus `/q` (the base path included), with nothing else on it. */
export function shareUrl(origin: string = publicOrigin()): string {
  return `${origin}${withBase('/q')}`;
}

const stripScheme = (url: string): string => url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

function nameOf(p: ResultParticipant, bot: string): string {
  return p.kind === 'BOT' ? bot : p.displayName;
}

/** Null when `selfId` is not in the match. Names are never inflected: the name unchanged, then a separator. */
export function buildCardText(payload: MatchEndedPayload, selfId: string, language: Language = uiLanguage(), origin?: string): CardText | null {
  const self = payload.participants.find((p) => p.participantId === selfId);
  if (!self) return null;
  const t = i18n.getFixedT(language);
  const opponents = payload.participants.filter((p) => p.participantId !== selfId);
  const name = self.displayName;
  const room = payload.mode === 'BATTLE_ROOM';
  const sharedFirst = self.placement === 1 && opponents.some((p) => p.placement === 1);
  const url = shareUrl(origin);

  let resultLine: string;
  let shareText: string;
  let rivalScore: string | null = null;
  if (room) {
    const total = payload.participants.length;
    if (self.placement === 1 && !sharedFirst) {
      resultLine = t('share.line.roomWin', { name, total });
      shareText = t('share.text.roomWin', { total });
    } else if (sharedFirst) {
      resultLine = t('share.line.roomJoint', { name, total });
      shareText = t('share.text.roomJoint', { total });
    } else {
      resultLine = t('share.line.roomPlace', { name, place: self.placement, total });
      shareText = t('share.text.roomPlace', { place: self.placement, total });
    }
  } else {
    const rival = opponents.reduce<ResultParticipant | null>((best, p) => (best === null || p.placement < best.placement ? p : best), null);
    const rivalName = rival ? nameOf(rival, t('share.botName')) : '';
    const them = rival?.score ?? 0;
    rivalScore = rival ? formatNumber(them) : null;
    const scores = { rival: rivalName, you: self.score, them };
    if (self.placement !== 1) {
      resultLine = t('share.line.loss', { name, rival: rivalName, score: self.score });
      shareText = t('share.text.loss', scores);
    } else if (sharedFirst) {
      resultLine = t('share.line.draw', { name, rival: rivalName });
      shareText = t('share.text.draw', scores);
    } else {
      resultLine = t('share.line.win', { name, rival: rivalName });
      shareText = t('share.text.win', scores);
    }
  }

  // A private custom-topic name never leaves the app: only a bank topic is named.
  const topicName = payload.questionSource === 'CUSTOM' ? null : (payload.topic?.name ?? null);
  const mode = room ? t('mode.battleRoom.title') : payload.topic && payload.mode === 'TOPIC_DUEL' ? t('mode.topicDuel.title') : t('play.quickMatch');
  const modeLine = topicName && (room || payload.mode === 'TOPIC_DUEL') ? `${mode} · ${topicName}` : mode;

  return {
    language,
    resultLine,
    selfScore: formatNumber(self.score),
    rivalScore,
    modeLine,
    cta: t('share.cta'),
    linkLabel: stripScheme(url),
    url,
    shareText,
  };
}
