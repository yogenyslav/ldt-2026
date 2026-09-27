const Loader = ({ label = 'Загрузка…' }: { label?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 p-10 text-muted">
      <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-line border-t-brand" />
      <span className="small-regular">{label}</span>
    </div>
  )
}

export default Loader
