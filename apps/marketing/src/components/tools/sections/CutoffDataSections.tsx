import { Box, Typography } from '@neram/ui';
import { BOARD_CONFIG, convertBoardMarks, type BoardType } from '@neram/tools-core/cutoff';
import { DataTable, Section, tokens as t } from '@/design-system';
import { APP_URL } from '@/lib/seo/constants';
import { loadClosingMarks } from '@/lib/tools/closing-marks';

/** 85% of each board's usual maximum, the worked example in the table. */
const EXAMPLE_PERCENT = 0.85;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

/**
 * Below the calculator on /tools/cutoff-calculator: the answer to "how do I
 * convert my board marks" for every board, then real closing marks from the
 * latest TNEA and KEAM allotments. Server-rendered, so crawlers and AI
 * assistants read the numbers as text.
 */
export default async function CutoffDataSections() {
  const closing = await loadClosingMarks();
  const boards = Object.keys(BOARD_CONFIG) as BoardType[];

  return (
    <>
      <Section
        id="board-conversion"
        tone="white"
        width="article"
        header={{
          eyebrow: 'Board marks',
          title: '12th marks converted to 200, board by board',
          align: 'start',
          size: 'article',
        }}
      >
        <Typography component="p" sx={{ m: 0, color: t.inkMuted, lineHeight: 1.7 }}>
          Your 12th marks count for 200 of the 400. The formula is <strong>marks scored ÷ board maximum × 200</strong>, so
          the same percentage gives the same score on every board. The table shows 85% on each board.
        </Typography>
        <DataTable
          caption="85% in 12th, converted to a score out of 200"
          columns={['Board', 'Usual maximum', '85% is', 'Out of 200']}
          rows={boards.map((b) => {
            const { label, maxMarks } = BOARD_CONFIG[b];
            const scored = Math.round(maxMarks * EXAMPLE_PERCENT);
            return [label, maxMarks, scored, convertBoardMarks(scored, maxMarks)];
          })}
        />
      </Section>

      {(closing.tnea || closing.keam) && (
        <Section
          id="closing-marks"
          tone="light"
          width="article"
          header={{
            eyebrow: 'Real data',
            title: 'Last year’s closing marks for B.Arch',
            align: 'start',
            size: 'article',
          }}
        >
          <Typography component="p" sx={{ m: 0, color: t.inkMuted, lineHeight: 1.7 }}>
            These are the lowest scores that actually got a seat, from the official allotment lists. Compare them with your
            cutoff out of 400. Updated {dateFmt.format(new Date())}.
          </Typography>

          {closing.tnea && (
            <Box>
              <DataTable
                caption={`TNEA B.Arch ${closing.tnea.year}: top colleges by General (OC) closing mark`}
                columns={['College', 'City', 'OC closing mark (of 400)']}
                mutedColumn={1}
                rows={closing.tnea.colleges.map((c) => [c.name, c.city ?? '', c.oc])}
              />
            </Box>
          )}

          {closing.keam && (
            <Box>
              <DataTable
                caption={`KEAM B.Arch ${closing.keam.year}: top colleges by State Merit closing rank`}
                columns={['College', 'Town', 'Closing rank']}
                mutedColumn={1}
                rows={closing.keam.colleges.map((c) => [c.name, c.town ?? '', c.closingRank.toLocaleString('en-IN')])}
              />
            </Box>
          )}

          <Typography component="p" sx={{ m: 0, color: t.inkMuted, lineHeight: 1.7 }}>
            Your community category and the round change what you can get.{' '}
            <Box
              component="a"
              href={`${APP_URL}/ask`}
              sx={{ color: t.gold800, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              Ask aiArchitek
            </Box>{' '}
            with your score to see every college that matches, with its source.
          </Typography>
        </Section>
      )}
    </>
  );
}
