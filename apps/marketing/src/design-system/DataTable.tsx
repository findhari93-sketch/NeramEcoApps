import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import { tokens as t } from './tokens';

export interface DataTableProps {
  columns: ReactNode[];
  rows: ReactNode[][];
  /** Accessible caption (visually hidden when `hideCaption`). */
  caption?: ReactNode;
  hideCaption?: boolean;
  /** Column index rendered in muted text (notes). */
  mutedColumn?: number;
}

/**
 * A ruled table: ink rule under the header, hairlines between rows, no
 * zebra fills. Scrolls sideways inside its own box on phones, never the page.
 */
export default function DataTable({ columns, rows, caption, hideCaption, mutedColumn }: DataTableProps) {
  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.9375rem',
          lineHeight: 1.5,
          color: t.ink,
          '& caption': hideCaption
            ? { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
            : { captionSide: 'top', textAlign: 'left', pb: 1, fontWeight: 700 },
          '& th': {
            textAlign: 'left',
            fontWeight: 700,
            fontSize: '0.8125rem',
            color: t.inkMuted,
            py: 1.25,
            pr: 2,
            borderBottom: `1px solid ${t.ink}`,
            whiteSpace: 'nowrap',
          },
          '& td': { py: 1.5, pr: 2, borderBottom: `1px solid ${t.line}`, verticalAlign: 'top' },
          '& td:first-of-type': { fontWeight: 600 },
          ...(mutedColumn != null && { [`& td:nth-of-type(${mutedColumn + 1})`]: { color: t.inkMuted } }),
        }}
      >
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
