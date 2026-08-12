/**
 * App chrome above and below a page's content box, which a viewport-sized shell
 * has to subtract to fill the rest of the screen exactly.
 *
 * These are the FULL-BLEED numbers, i.e. what the teacher/student/parent
 * layouts leave once a route drops its Container padding. Note the two do not
 * change at the same breakpoint: TopBar grows at sm (52 to 56), BottomNav
 * disappears at md, so sm needs its own value or the page picks up a 4px
 * scrollbar on a landscape phone.
 *   xs: TopBar 52 + BottomNav 64 = 116
 *   sm: TopBar 56 + BottomNav 64 = 120
 *   md: TopBar 56                =  56
 *
 * Lives here, next to the full-bleed route test, because the two always have to
 * agree: these numbers are only correct for routes that dropped their padding.
 * Two shells now read them, the calendar and the question-bank paper workspace,
 * so a second copy would be a second thing to forget.
 */
export const SHELL_CHROME = { xs: 116, sm: 120, md: 56 } as const;

/** The fixed BottomNav. It only exists below md. */
export const BOTTOM_NAV_HEIGHT = 64;
