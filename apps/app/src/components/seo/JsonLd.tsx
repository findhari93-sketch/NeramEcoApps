const LT = /</g;

/** Structured data. `<` is escaped so a value can never close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(LT, '\\u003c') }}
    />
  );
}
