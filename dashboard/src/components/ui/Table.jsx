export default function Table({ className = '', children, ...props }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${className}`} {...props}>
          {children}
        </table>
      </div>
    </div>
  )
}
