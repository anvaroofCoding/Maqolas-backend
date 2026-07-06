export const WELCOME_PROMO_BADGE_ICON_IDS = [
  'badge-check',
  'shield-check',
  'star',
  'sparkles',
  'heart',
  'gift',
  'zap',
] as const;

export type WelcomePromoBadgeIconId =
  (typeof WELCOME_PROMO_BADGE_ICON_IDS)[number];

export function isWelcomePromoBadgeIconId(
  value: string,
): value is WelcomePromoBadgeIconId {
  return (WELCOME_PROMO_BADGE_ICON_IDS as readonly string[]).includes(value);
}
