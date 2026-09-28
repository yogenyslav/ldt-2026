/* The heading of a working screen: what it is, how much of it there is, and
   one paragraph on how the work gets here. */
interface WorkHeadProps {
  title: string
  sub?: string
  lead?: string
}

const WorkHead = ({ title, sub, lead }: WorkHeadProps) => {
  return (
    <>
      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="h1-bold text-[23px]">{title}</h1>
        {sub ? <span className="small-regular text-muted">{sub}</span> : null}
      </div>
      {lead ? <p className="mt-2 mb-5 max-w-[860px] base-regular text-ink-2">{lead}</p> : null}
    </>
  )
}

export default WorkHead
