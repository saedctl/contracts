import type { RenderedBlock, Run } from "@/lib/template";

function Runs({ runs, highlight }: { runs: Run[]; highlight: boolean }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        if (r.field && highlight) node = <mark className={r.missing ? "missing" : undefined} title={r.missing ? `No value for {{${r.field}}}` : `{{${r.field}}}`}>{node}</mark>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/** Renders a filled contract as HTML. Same block model as the PDF, so wording is identical. */
export function ContractDocument({ blocks, highlight = false }: { blocks: RenderedBlock[]; highlight?: boolean }) {
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flushList = (key: number) => {
    if (list.length) out.push(<ul key={`ul-${key}`}>{list}</ul>);
    list = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === "li") {
      list.push(<li key={i}><Runs runs={b.runs} highlight={highlight} /></li>);
      return;
    }
    flushList(i);
    if (b.type === "hr") out.push(<hr key={i} />);
    else {
      const Tag = b.type;
      out.push(<Tag key={i}><Runs runs={b.runs} highlight={highlight} /></Tag>);
    }
  });
  flushList(blocks.length);
  return <div className="contract-doc">{out}</div>;
}
